/**
 * CSRF Protection Middleware
 *
 * Implements the Double-Submit Cookie pattern for stateless APIs.
 *
 * How it works:
 *  1. GET /api/csrf-token  → server generates a signed token, sets it as a
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
 * Cookieless browsers (iPhone / Safari ITP):
 *  The SPA and this API are different sites (render.yaml; `onrender.com` is on
 *  the Public Suffix List), so the `csrf-token` cookie is a THIRD-PARTY cookie.
 *  WebKit blocks those outright by default — and every browser on iOS is
 *  WebKit, Chrome included. Chrome Incognito and Firefox/Brave strict modes do
 *  the same. The cookie is never stored, so the double-submit comparison could
 *  never pass, and login and registration (POSTs with no Bearer token yet)
 *  answered 403 CSRF_TOKEN_MISSING on every iPhone.
 *
 *  Tokens are therefore HMAC-signed and time-limited. When a request carries
 *  NO cookies that matter — no csrf-token and no auth cookie — a validly signed
 *  header is accepted on its own. That is safe because CSRF is the abuse of
 *  AMBIENT credentials, and such a request has none to abuse; the header itself
 *  still proves a CORS-approved origin sent it, since an HTML form cannot set a
 *  custom header and a cross-origin script needs a preflight the CORS whitelist
 *  refuses. Any request that DOES carry an auth cookie still needs the full
 *  double-submit match, exactly as before.
 *
 * Requirements: 17.3
 */

const crypto = require('crypto');
const { crossSiteCookiePolicy, COOKIE_NAMES } = require('../utils/security/cookie.util');

/** Cookie name used to store the CSRF token */
const CSRF_COOKIE_NAME = 'csrf-token';

/** Header name the client must send the token in */
const CSRF_HEADER_NAME = 'x-csrf-token';

/** Nonce length in bytes (produces a 64-char hex string) */
const TOKEN_BYTES = 32;

/** How long a token — and the cookie carrying it — stays valid. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Safe HTTP methods that do not need CSRF protection */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookies that authenticate a request by themselves. If the browser sends any
 * of these, the request is riding on ambient credentials and must pass the
 * full double-submit check — a signed header alone is not enough.
 */
const AMBIENT_AUTH_COOKIES = [COOKIE_NAMES.ACCESS_TOKEN, COOKIE_NAMES.REFRESH_TOKEN];

/**
 * Per-process fallback for the signing secret. Only reached when JWT_SECRET is
 * absent, which config-manager refuses at boot — so in practice, tests.
 */
const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

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
 * The HMAC key tokens are signed with.
 *
 * Derived from JWT_SECRET under its own label rather than BEING JWT_SECRET, so
 * a CSRF signature can never be mistaken for, or help forge, anything else
 * signed with that secret. Every instance shares JWT_SECRET, so a token issued
 * by one instance verifies on another.
 *
 * @returns {Buffer}
 */
function signingKey() {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || FALLBACK_SECRET)
    .update('mallakhamb-csrf-v1')
    .digest();
}

/**
 * @param {string} payload
 * @returns {string} base64url HMAC-SHA256 of the payload
 */
function sign(payload) {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/**
 * Generate a signed, time-limited CSRF token: `<nonce>.<expiresAt>.<signature>`.
 *
 * The client treats it as opaque and the double-submit comparison is a plain
 * string match, so the format is invisible to both. The signature is what lets
 * a cookieless browser use it — see the header comment.
 *
 * @param {number} [now=Date.now()]
 * @returns {string}
 */
function generateCsrfToken(now = Date.now()) {
  const nonce = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const payload = `${nonce}.${(now + TOKEN_TTL_MS).toString(36)}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Was this token issued by this server, and is it still in date?
 *
 * @param {string} token
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
function verifySignedToken(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiresAt36, signature] = parts;
  if (!/^[0-9a-f]{64}$/.test(nonce)) return false;

  const expiresAt = parseInt(expiresAt36, 36);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  return safeCompare(signature, sign(`${nonce}.${expiresAt36}`));
}

/**
 * Does this request carry a cookie that authenticates it on its own?
 * @param {Object} req
 * @returns {boolean}
 */
function hasAmbientAuthCookie(req) {
  const cookies = req.cookies || {};
  return AMBIENT_AUTH_COOKIES.some((name) => Boolean(cookies[name]));
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

  // The secure/sameSite pair comes from the shared cookie policy rather than a
  // literal here. This cookie is one half of a double-submit check, so if it is
  // not returned on a cross-site request the header can never match it and every
  // cookie-only POST — login above all — fails with 403. Keeping the policy in one
  // place means the CSRF cookie and the auth cookies cannot drift apart, which is
  // exactly how this broke: the auth cookies and this one each declared their own
  // `sameSite: 'strict'`.
  //
  // Browsers that refuse third-party cookies altogether (iPhone) drop this
  // cookie whatever its attributes; they get by on the body copy, which is
  // signed — see the header comment.
  res.cookie(CSRF_COOKIE_NAME, token, {
    ...crossSiteCookiePolicy(process.env.NODE_ENV === 'production'),
    httpOnly: false,          // Must be readable by client-side JS
    maxAge: TOKEN_TTL_MS
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

  const reject = (res, code, message) => res.status(403).json({
    success: false,
    error: { message, code }
  });

  return function csrfMiddleware(req, res, next) {
    // Safe methods never need CSRF protection
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // Bearer-token authenticated requests are inherently CSRF-safe because
    // a cross-origin attacker cannot set the Authorization header.
    // Cookie-based auth (Phase 2A) IS vulnerable to CSRF, so we only skip
    // CSRF checks when we detect an explicit Bearer header.
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

    if (!headerToken) {
      return reject(res, 'CSRF_TOKEN_MISSING', 'CSRF token missing');
    }

    // The browser returned the cookie: classic double-submit, unchanged.
    if (cookieToken) {
      return safeCompare(cookieToken, headerToken)
        ? next()
        : reject(res, 'CSRF_TOKEN_INVALID', 'CSRF token invalid');
    }

    // No csrf cookie, yet an auth cookie arrived. This request rides on ambient
    // credentials, so the header alone must not carry it — the same answer as
    // before. A real client recovers: its retry re-fetches the token, which
    // sets the cookie again.
    if (hasAmbientAuthCookie(req)) {
      return reject(res, 'CSRF_TOKEN_MISSING', 'CSRF token missing');
    }

    // No cookies at all — a browser that blocks third-party cookies, which is
    // every iPhone. There are no ambient credentials to forge a request with,
    // so a token this server signed, still in date, is sufficient.
    return verifySignedToken(headerToken)
      ? next()
      : reject(res, 'CSRF_TOKEN_INVALID', 'CSRF token invalid');
  };
}

module.exports = {
  csrfTokenHandler,
  createCsrfMiddleware,
  generateCsrfToken,
  verifySignedToken,
  TOKEN_TTL_MS,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
