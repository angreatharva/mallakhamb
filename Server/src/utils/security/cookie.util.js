/**
 * Cookie Utility
 *
 * Centralised helpers for setting and clearing authentication cookies.
 * All auth tokens (access and refresh) are stored as httpOnly, Secure,
 * SameSite=Strict cookies to prevent XSS-based token theft.
 *
 * Requirements: HIGH-3 (move tokens out of localStorage — Phase 2A, Item 2.1)
 */

/** Cookie names */
const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
};

/**
 * Build common cookie options.
 * @param {boolean} isProduction - Whether the app is running in production
 * @param {Object} [overrides] - Additional or overriding cookie options
 * @returns {Object} Cookie options
 */
function baseCookieOptions(isProduction, overrides = {}) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
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
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  baseCookieOptions,
};
