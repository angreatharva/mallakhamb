/**
 * CSRF Protection Middleware
 *
 * Implements the Double-Submit Cookie pattern for stateless APIs.
 *
 * How it works:
 *  1. GET /api/csrf-token  → server generates a random token, sets it as a
 *     cookie (csrf-token, HttpOnly=false so JS can read it) and also returns
 *     it in the JSON body.
 *  2. For every state-changing request (POST / PUT / PATCH / DELETE) the
 *     client must include the same token in the X-CSRF-Token request header.
 *  3. The middleware compares the header value against the cookie value.
 *     If they match the request is allowed; otherwise 403 is returned.
 *
 * Exemptions:
 *  - Requests that carry a Bearer token in the Authorization header are
 *    exempt because CSRF attacks cannot set arbitrary request headers.
 *    This keeps the API fully backward-compatible for all existing clients
 *    that use JWT authentication.
 *  - Safe HTTP methods (GET, HEAD, OPTIONS) are always exempt.
 *
 * Requirements: 17.3
 */

const crypto = require('crypto');

/** Cookie name used to store the CSRF token */
const CSRF_COOKIE_NAME = 'csrf-token';

/** Header name the client must send the token in */
const CSRF_HEADER_NAME = 'x-csrf-token';

/** Token length in bytes (produces a 64-char hex string) */
const TOKEN_BYTES = 32;

/** Safe HTTP methods that do not need CSRF protection */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Generate a cryptographically random CSRF token.
 * @returns {string} Hex-encoded random token
 */
function generateCsrfToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express route handler that issues a CSRF token.
 * Mount at GET /api/csrf-token.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function csrfTokenHandler(req, res) {
  const token = generateCsrfToken();

  // Set cookie (readable by JS so the SPA can pick it up)
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,          // Must be readable by client-side JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  return res.json({ success: true, csrfToken: token });
}

/**
 * CSRF protection middleware factory.
 *
 * @param {Object} [options]
 * @param {boolean} [options.skipBearerAuth=true]  Skip check when Bearer token present
 * @returns {Function} Express middleware
 */
function createCsrfMiddleware(options = {}) {
  const { skipBearerAuth = true } = options;

  return function csrfMiddleware(req, res, next) {
    // Safe methods never need CSRF protection
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // Bearer-token authenticated requests are inherently CSRF-safe because
    // a cross-origin attacker cannot set the Authorization header.
    if (skipBearerAuth) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        return next();
      }
    }

    // Read the token from the cookie
    const cookieToken = req.cookies && req.cookies[CSRF_COOKIE_NAME];

    // Read the token from the request header
    const headerToken = req.headers[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'CSRF token missing',
          code: 'CSRF_TOKEN_MISSING'
        }
      });
    }

    if (!safeCompare(cookieToken, headerToken)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'CSRF token invalid',
          code: 'CSRF_TOKEN_INVALID'
        }
      });
    }

    return next();
  };
}

module.exports = {
  csrfTokenHandler,
  createCsrfMiddleware,
  generateCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
