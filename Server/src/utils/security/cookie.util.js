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

/**
 * Cookie names. These are the LEGACY single-session names, still read so a
 * session signed in before per-role cookies keeps working until it next signs
 * in; new sessions are written under `access_token_<role>` (see below).
 */
const COOKIE_NAMES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
};

/*
 * ONE SESSION PER ROLE (bug 2026-11-09).
 *
 * The access/refresh cookies used to be one pair for the whole site. Signing
 * in as a coach in tab 2 therefore replaced the admin's cookie that tab 1 was
 * using, and tab 1 was signed out (401 IDENTITY_MISMATCH, then a failed
 * refresh). Each role now has its own pair — `access_token_admin`,
 * `access_token_coach`, … — and a request reads the pair for ITS role, which
 * the SPA states in `X-User-Type` (from its URL) and the API path implies.
 * Two people of the SAME role in two tabs still share one pair.
 */
const ROLES = Object.freeze(['player', 'coach', 'judge', 'admin', 'superadmin']);

/** @param {string|null} role @returns {string} */
const accessCookieName = (role) => (ROLES.includes(role) ? `${COOKIE_NAMES.ACCESS_TOKEN}_${role}` : COOKIE_NAMES.ACCESS_TOKEN);
/** @param {string|null} role @returns {string} */
const refreshCookieName = (role) => (ROLES.includes(role) ? `${COOKIE_NAMES.REFRESH_TOKEN}_${role}` : COOKIE_NAMES.REFRESH_TOKEN);

/** Is this cookie name one of the session cookies (any role, or legacy)? */
const isAuthCookieName = (name) => name === COOKIE_NAMES.ACCESS_TOKEN || name === COOKIE_NAMES.REFRESH_TOKEN
  || ROLES.some((r) => name === accessCookieName(r) || name === refreshCookieName(r));

/** The `userType` claim of a JWT, read WITHOUT verifying it (naming only). */
function roleOfToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return ROLES.includes(payload?.userType) ? payload.userType : null;
  } catch {
    return null;
  }
}

/** API path prefixes that belong to one role. */
const PATH_ROLES = [
  [/^\/api\/superadmin(\/|$)/, 'superadmin'],
  [/^\/api\/admin(\/|$)/, 'admin'],
  [/^\/api\/coach(es)?(\/|$)/, 'coach'],
  [/^\/api\/judges?(\/|$)/, 'judge'],
  [/^\/api\/players?(\/|$)/, 'player'],
];

/**
 * Which role's session a request is for: the SPA's `X-User-Type` header first
 * (it knows which screen the request came from), then the API path.
 * @param {Object} req
 * @returns {string|null}
 */
function requestRole(req) {
  const header = String(req?.headers?.['x-user-type'] || '').trim().toLowerCase();
  if (ROLES.includes(header)) return header;
  const path = String(req?.originalUrl || req?.url || '').split('?')[0];
  const hit = PATH_ROLES.find(([re]) => re.test(path));
  return hit ? hit[1] : null;
}

/** Parse a raw Cookie header into { name: value } (sockets have no cookie-parser). */
function parseCookieHeader(raw) {
  const out = {};
  String(raw || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) {
      const name = part.slice(0, i).trim();
      try { out[name] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[name] = part.slice(i + 1).trim(); }
    }
  });
  return out;
}

/**
 * Pick one session cookie from a cookie jar for a role.
 *  - role known: that role's cookie, else the legacy one;
 *  - role unknown: the only role cookie present, else the legacy one. With
 *    several roles signed in and nothing naming the role, none is guessed.
 */
function pickSessionCookie(cookies, role, nameOf, legacyName) {
  const jar = cookies || {};
  if (role) return jar[nameOf(role)] || jar[legacyName] || null;
  const present = ROLES.map((r) => jar[nameOf(r)]).filter(Boolean);
  if (present.length === 1) return present[0];
  if (present.length > 1) return null;
  return jar[legacyName] || null;
}

/** The access-token cookie this request should authenticate with, if any. */
function readAccessCookie(req, cookies = req?.cookies) {
  const role = requestRole(req);
  const token = pickSessionCookie(cookies, role, accessCookieName, COOKIE_NAMES.ACCESS_TOKEN);
  // A legacy (pre-per-role) cookie of ANOTHER role is not this request's.
  if (token && role && cookies?.[accessCookieName(role)] !== token) {
    const own = roleOfToken(token);
    if (own && own !== role) return null;
  }
  return token;
}

/** The refresh-token cookie for this request's role, if any. */
function readRefreshCookie(req, cookies = req?.cookies) {
  return pickSessionCookie(cookies, requestRole(req), refreshCookieName, COOKIE_NAMES.REFRESH_TOKEN);
}

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
  // Named after the role IN the token, so every caller writes the right one.
  res.cookie(accessCookieName(roleOfToken(token)), token, baseCookieOptions(isProduction, {
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
function setRefreshTokenCookie(res, token, isProduction, maxAgeMs = 7 * 24 * 60 * 60 * 1000, role = null) {
  res.cookie(refreshCookieName(role), token, baseCookieOptions(isProduction, {
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
function clearAuthCookies(res, isProduction, role = null) {
  // One role signs out; the other roles' sessions in other tabs stay. The
  // legacy pair goes too — it can only be this browser's older session.
  const names = role ? [role] : ROLES;
  for (const r of names) {
    res.clearCookie(accessCookieName(r), baseCookieOptions(isProduction));
    res.clearCookie(refreshCookieName(r), baseCookieOptions(isProduction, { path: '/api/auth/refresh' }));
  }
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, baseCookieOptions(isProduction));
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, baseCookieOptions(isProduction, {
    path: '/api/auth/refresh',
  }));
}

module.exports = {
  COOKIE_NAMES,
  ROLES,
  accessCookieName,
  refreshCookieName,
  isAuthCookieName,
  roleOfToken,
  requestRole,
  parseCookieHeader,
  readAccessCookie,
  readRefreshCookie,
  isProductionLike,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
  baseCookieOptions,
  crossSiteCookiePolicy,
};
