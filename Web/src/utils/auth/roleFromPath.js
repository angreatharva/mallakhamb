/**
 * Role-from-Path Utility — Centralized URL-to-role resolution
 *
 * Provides a single source of truth for mapping URL path prefixes to
 * user roles. Used by App.jsx, api-client.js, protected-route.jsx,
 * and authEvents.js to avoid duplicating the prefix→role mapping.
 *
 * @module utils/auth/roleFromPath
 */

/**
 * Ordered role prefixes. Order matters — '/superadmin' must be checked
 * before '/admin' to avoid a false match.
 *
 * Each entry maps a URL path prefix to its corresponding role string
 * and login path.
 */
export const ROLE_PREFIXES = [
  { prefix: '/player',     role: 'player',     loginPath: '/player/login' },
  { prefix: '/coach',      role: 'coach',      loginPath: '/coach/login' },
  { prefix: '/judge',      role: 'judge',      loginPath: '/judge/login' },
  { prefix: '/superadmin', role: 'superadmin',  loginPath: '/superadmin/login' },
  { prefix: '/admin',      role: 'admin',       loginPath: '/admin/login' },
];

/**
 * Resolve the user role from a URL pathname.
 *
 * @param {string} pathname - The URL pathname (e.g. window.location.pathname
 *   or React Router's location.pathname)
 * @returns {string|null} The role string (e.g. 'admin') or null if no prefix matches
 */
export function getRoleFromPath(pathname) {
  if (!pathname) return null;
  const entry = ROLE_PREFIXES.find((e) => pathname.startsWith(e.prefix));
  return entry ? entry.role : null;
}

/**
 * Resolve the login path for a given URL pathname.
 *
 * @param {string} pathname - The URL pathname
 * @returns {string} The login path (e.g. '/admin/login') or '/' if unknown
 */
export function getLoginPathFromPath(pathname) {
  if (!pathname) return '/';
  const entry = ROLE_PREFIXES.find((e) => pathname.startsWith(e.prefix));
  return entry ? entry.loginPath : '/';
}

/**
 * Resolve the login path for a given role string.
 *
 * @param {string} role - The user role (e.g. 'admin')
 * @returns {string} The login path (e.g. '/admin/login') or '/' if unknown
 */
export function getLoginPathForRole(role) {
  if (!role) return '/';
  const entry = ROLE_PREFIXES.find((e) => e.role === role);
  return entry ? entry.loginPath : '/';
}
