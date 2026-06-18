import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import apiConfig from '@/config/api.config.js';
import { getCompetitionIdFromToken } from '@/utils/auth/tokenUtils.js';
import { secureStorage } from '@/utils/auth/secureStorage.js';
import { apiCache } from '@/utils/data/apiCache.js';
import { logger } from '@/infrastructure/logger.js';
import { dispatchAuthExpired } from '@/utils/auth/authEvents.js';

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
    const response = await axios.post(
      `${apiConfig.getBaseUrl()}/auth/refresh`,
      {},
      { withCredentials: true },
    );
    if (response.data?.success) {
      // The new access_token cookie is set by the server automatically.
      // If the server also returns the token in the body (backward compat),
      // store it for any legacy code that reads from secureStorage.
      const newToken = response.data?.data?.token;
      if (newToken) {
        const currentType = getCurrentUserTypeFromURL();
        if (currentType) {
          secureStorage.setItem(`${currentType}_token`, newToken);
        }
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

api.interceptors.request.use(
  (config) => {
    if (config.method === 'get' && !config.skipCache) {
      const cached = apiCache.get(config.url, config.params);
      if (cached) {
        config.adapter = () => Promise.resolve({
          data: cached,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {}
        });
        return config;
      }
    }

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
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    // --- Token Rotation (X-New-Token header — backward compat) ---
    // The server also sets a new httpOnly cookie, but we sync to
    // secureStorage for any code that still reads from there.
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType) {
        secureStorage.setItem(`${currentType}_token`, newToken);
        logger.log(`🔄 Token rotated for ${currentType}`);
      }
    }

    if (response.config.method === 'get' && !response.config.skipCache) {
      apiCache.set(response.config.url, response.config.params, response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

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
