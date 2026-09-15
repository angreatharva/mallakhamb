import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiConfig from '@/config/api.config.js';
import { getCompetitionIdFromToken } from '@/utils/auth/tokenUtils.js';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { logger } from '@/infrastructure/logger.js';
import { dispatchAuthExpired } from '@/utils/auth/authEvents.js';
import { isCompetitionLockedError, competitionLockedMessage } from '@/utils/scoring/competitionLock.js';

logger.log('🏠 Using API URL:', apiConfig.getBaseUrl());

/**
 * Authenticated API client.
 *
 * Phase 2A changes:
 *  - `withCredentials: true` so the browser sends/receives httpOnly cookies.
 *  - Token is no longer sent via Authorization header; the access_token cookie
 *    is attached automatically by the browser.
 *  - On 401, we attempt a silent refresh via POST /auth/refresh before giving up.
 */
export const api = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
  withCredentials: true, // Phase 2A: send/receive httpOnly cookies
});

export const publicApi = axios.create({
  baseURL: apiConfig.getBaseUrl(),
  headers: apiConfig.getHeaders(),
  withCredentials: true,
});

import { getRoleFromPath } from '@/utils/auth/roleFromPath.js';

const getCurrentUserTypeFromURL = () => getRoleFromPath(window.location.pathname);

// --- Legacy token getter (still used during migration for backward compat) ---
const getToken = (userType) => {
  if (userType) {
    return secureStorage.getItem(`${userType}_token`);
  }
  return secureStorage.getItem('token');
};

// --- Track whether a token refresh is already in progress ---
let isRefreshing = false;
let refreshSubscribers = [];

/**
 * Queue a callback to be executed once the token is refreshed.
 * @param {Function} cb
 */
function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

/**
 * Notify all queued requests that the token has been refreshed.
 */
function onTokenRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

/**
 * Attempt a silent token refresh using the refresh_token httpOnly cookie.
 * @returns {Promise<boolean>} true if refresh succeeded
 */
async function attemptSilentRefresh() {
  try {
    // Raw axios on purpose: going through `api` would re-enter the response
    // interceptor and recurse on a failed refresh.
    //
    // But that also skips the REQUEST interceptor, so the CSRF header has to be
    // attached by hand. Without it this POST is a cookie-only state-changing
    // request, which CSRF rejects with 403 — silently breaking token refresh
    // for exactly the cookie-only client MED-W1 exists to support. Caught by
    // running the app in a browser; no unit test covered this path.
    const csrf = await ensureCsrfToken();
    const response = await axios.post(
      `${apiConfig.getBaseUrl()}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      },
    );
    if (response.data?.success) {
      // The new access_token cookie is set by the server automatically.
      return true;
    }
    return false;
  } catch {
    return false;
  }
}


/* -------------------------------------------------------------------------- */
/* CSRF (CRIT-3)                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The server issues a double-submit CSRF token: it sets a `csrf-token` cookie
 * AND returns the same value in the response body.
 *
 * We deliberately read it from the BODY, not from `document.cookie`. The SPA is
 * deployed as a static site on a different origin from the API (render.yaml
 * defines two services), and JavaScript can only read cookies for its own
 * origin — so `document.cookie` would always be empty here. The body works
 * regardless of topology.
 *
 * Held in memory only: it is not a credential, it just has to match the cookie
 * the browser sends back, and keeping it out of storage avoids yet another
 * thing for XSS to read.
 */
let csrfToken = null;
let csrfRequest = null;

/** Methods that mutate state and therefore need the CSRF header. */
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Fetch a CSRF token once, coalescing concurrent callers.
 * Failure is non-fatal: if CSRF is disabled server-side the header is simply
 * unnecessary, and if it is enabled the request will 403 and surface properly.
 * @returns {Promise<string|null>}
 */
export async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfRequest) return csrfRequest;

  csrfRequest = publicApi
    .get('/csrf-token')
    .then((res) => {
      csrfToken = res?.data?.csrfToken || null;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
}

/** Drop the cached token so the next unsafe request fetches a fresh one. */
export function resetCsrfToken() {
  csrfToken = null;
}

api.interceptors.request.use(
  async (config) => {
    // --- Backward compat: still send Authorization header if we have a token ---
    // This ensures mobile clients / Postman / tests that don't use cookies
    // continue to work during migration.
    const currentType = getCurrentUserTypeFromURL();
    let token = getToken(currentType);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;

      const competitionId = getCompetitionIdFromToken(token);
      if (competitionId) {
        config.headers['x-competition-id'] = competitionId;
      }
    }

    // CRIT-3: cookie-authenticated writes need the double-submit header.
    // The server exempts requests carrying a Bearer token, so this only
    // actually matters when storage is empty but the cookie is still valid —
    // a fresh tab, or storage that was evicted. Attached whenever it is
    // available so behaviour does not depend on that distinction.
    if (UNSAFE_METHODS.has(String(config.method || '').toLowerCase())) {
      const csrf = await ensureCsrfToken();
      if (csrf) {
        config.headers['X-CSRF-Token'] = csrf;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    // The server also sets a new httpOnly cookie.
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType) {
        logger.log(`🔄 Token rotated for ${currentType}`);
      }
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // --- Stale CSRF token (CRIT-3) ---
    // Tokens live 24h, so a long-lived tab will eventually present an expired
    // one. Fetch a fresh token and retry once rather than surfacing a 403 the
    // user cannot act on. Guarded by its own flag so it cannot loop.
    const csrfCode = error.response?.data?.error?.code;
    if (
      error.response?.status === 403 &&
      (csrfCode === 'CSRF_TOKEN_INVALID' || csrfCode === 'CSRF_TOKEN_MISSING') &&
      originalRequest &&
      !originalRequest._csrfRetry
    ) {
      originalRequest._csrfRetry = true;
      resetCsrfToken();
      const fresh = await ensureCsrfToken();
      if (fresh) {
        originalRequest.headers = { ...originalRequest.headers, 'X-CSRF-Token': fresh };
        return api(originalRequest);
      }
    }

    /*
     * --- The meet has closed (423 COMPETITION_LOCKED) ---
     *
     * Not retried, not redirected, not refreshed — there is nothing the client
     * can do to make this succeed, and the session is perfectly valid. It is
     * annotated and re-thrown so every existing catch block, which already
     * shows `error.response.data.message`, says the right thing without being
     * touched.
     *
     * `isCompetitionLocked` is put on the error as well so a caller can branch
     * on it (flip a screen to read-only, drop a queued autosave) without
     * re-deriving the status and code. See `utils/scoring/competitionLock.js`.
     */
    if (isCompetitionLockedError(error)) {
      error.isCompetitionLocked = true;
      error.competitionLockedMessage = competitionLockedMessage(error);
      logger.warn('Write refused: competition is locked', {
        url: originalRequest?.url,
        method: originalRequest?.method,
      });
      return Promise.reject(error);
    }

    // --- Silent refresh on 401 (Phase 2A) ---
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        const refreshed = await attemptSilentRefresh();
        isRefreshing = false;

        if (refreshed) {
          onTokenRefreshed();
          // Retry the original request (cookie is now fresh)
          return api(originalRequest);
        }

        // Refresh failed — full auth expired flow
        const currentType = getCurrentUserTypeFromURL();
        if (currentType) {
          secureStorage.removeItem(`${currentType}_token`);
          secureStorage.removeItem(`${currentType}_user`);
        }
        secureStorage.removeItem('token');
        secureStorage.removeItem('user');
        secureStorage.removeItem('userType');

        dispatchAuthExpired({ userType: currentType, reason: 'refresh_failed' });
        return Promise.reject(error);
      }

      // Another request is already refreshing — queue this one
      return new Promise((resolve) => {
        subscribeTokenRefresh(() => {
          resolve(api(originalRequest));
        });
      });
    }

    if (error.response?.status === 403) {
      const errorMessage = error.response?.data?.message || '';

      if (errorMessage.includes('competition') || errorMessage.includes('Competition')) {
        const currentType = getCurrentUserTypeFromURL();

        if (currentType) {
          const token = getToken(currentType);

          let isSuperAdmin = false;
          if (token) {
            try {
              const decoded = jwtDecode(token);
              isSuperAdmin = decoded.role === 'superadmin';
            } catch (err) {
              logger.error('Error decoding token:', err);
            }
          }

          if (!isSuperAdmin) {
            logger.warn('Competition context invalid, redirecting non-superadmin user to competition selection');
            dispatchAuthExpired({ userType: currentType, reason: 'competition_context_invalid' });
          } else {
            logger.warn('Competition context error for superadmin, but not redirecting');
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
