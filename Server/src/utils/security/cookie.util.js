/**
 * Cookie Utility
 *
 * Centralised helpers for setting and clearing authentication cookies.
 * All auth tokens (access and refresh) are stored as httpOnly, Secure cookies to
 * prevent XSS-based token theft. The SameSite value is topology-dependent — see
 * `crossSiteCookiePolicy` below.
 *
 * Requirements: HIGH-3 (move tokens out of localStorage — Phase 2A, Item 2.1)
 */

/** Cookie names */
const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
};

/**
 * The `secure` / `sameSite` pair, which is decided by DEPLOYMENT TOPOLOGY rather
 * than by preference.
 *
 * In production the SPA and the API are two separate Render services —
 * `mallakhamb-web.onrender.com` and `mallakhamb.onrender.com` (see render.yaml).
 * `onrender.com` is on the Public Suffix List, so those are two different
 * registrable domains and every SPA→API call is **cross-site**.
 *
 * This used to be `sameSite: 'strict'`, which a browser will not return on a
 * cross-site request. The consequences were silent:
 *   - the httpOnly access/refresh cookies were stored and then never sent, so
 *     cookie auth, `POST /auth/refresh` and `GET /auth/me` were all inert and the
 *     app ran entirely on the backward-compat Bearer token in sessionStorage;
 *   - the CSRF double-submit cookie could not come back either, so once CSRF was
 *     enabled every login (a POST with no Bearer token yet, hence not exempt)
 *     would have been rejected with 403 CSRF_TOKEN_MISSING.
 *
 * `SameSite=None` is what actually permits a cross-site cookie, and browsers only
 * honour it together with `Secure` — which is why these two values are returned as
 * a pair and must not be set independently. Dropping the CSRF check while sending
 * cookies cross-site would be the unsafe combination, so `CSRF_ENABLED` must stay on.
 *
 * Development stays `lax` + insecure: `localhost:5173 → localhost:5000` is
 * same-site, and `Secure` cookies would not survive plain HTTP.
 *
 * @param {boolean} isProduction - Whether the app is running in production
 * @returns {{secure: boolean, sameSite: string}} Cookie transport policy
 */
function crossSiteCookiePolicy(isProduction) {
  return isProduction
    ? { secure: true, sameSite: 'none' }
    : { secure: false, sameSite: 'lax' };
}

/**
 * Is this a deployed environment, for cookie-security purposes?
 *
 * "Production-like" means production OR staging: staging is internet-reachable
 * and cross-site in exactly the way `crossSiteCookiePolicy` cares about, so it
 * must get `Secure` + `SameSite=None` too.
 *
 * Every login controller computed this same expression inline — six controllers
 * plus the auth middleware, all feeding the answer into the cookie helpers
 * below. Optional-chained so a partially-stubbed config in a test resolves to
 * `false` rather than throwing.
 *
 * @param {Object} config - the ConfigManager (or anything with `.get`)
 * @returns {boolean}
 */
function isProductionLike(config) {
  const env = config?.get?.('server.nodeEnv');
  return env === 'production' || env === 'staging';
}

/**
 * Build common cookie options.
 * @param {boolean} isProduction - Whether the app is running in production
 * @param {Object} [overrides] - Additional or overriding cookie options
 * @returns {Object} Cookie options
 */
function baseCookieOptions(isProduction, overrides = {}) {
  return {
    httpOnly: true,
    ...crossSiteCookiePolicy(isProduction),
    path: '/',
    ...overrides,
  };
}

/**
 * Set the access token cookie on the response.
 *
 * @param {Object} res - Express response
 * @param {string} token - JWT access token
 * @param {boolean} isProduction
 * @param {number} [maxAgeMs] - Cookie max-age in milliseconds (default: 15 min)
 */
function setAccessTokenCookie(res, token, isProduction, maxAgeMs = 15 * 60 * 1000) {
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, token, baseCookieOptions(isProduction, {
    maxAge: maxAgeMs,
  }));
}

/**
 * Set the refresh token cookie on the response.
 *
 * @param {Object} res - Express response
 * @param {string} token - Refresh token string
 * @param {boolean} isProduction
 * @param {number} [maxAgeMs] - Cookie max-age in milliseconds (default: 7 days)
 */
function setRefreshTokenCookie(res, token, isProduction, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, token, baseCookieOptions(isProduction, {
    maxAge: maxAgeMs,
    // Refresh token cookie is scoped to the refresh endpoint only
    path: '/api/auth/refresh',
  }));
}

/**
 * Clear all authentication cookies.
 *
 * @param {Object} res - Express response
 * @param {boolean} isProduction
 */
function clearAuthCookies(res, isProduction) {
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, baseCookieOptions(isProduction));
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, baseCookieOptions(isProduction, {
    path: '/api/auth/refresh',
  }));
}

module.exports = {
  COOKIE_NAMES,
  isProductionLike,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  baseCookieOptions,
  crossSiteCookiePolicy,
};
