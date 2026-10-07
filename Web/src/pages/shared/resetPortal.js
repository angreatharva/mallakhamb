/**
 * Which sign-in portal a password reset started from.
 *
 * One email can own a player, a coach and a judge account, so the reset has to
 * say which one it is for. Each login page links to `/forgot-password?role=<portal>`,
 * and the role then travels through the reset to pick the account and the login
 * page to return to. Without it, the server falls back to the first account it
 * finds (player → coach → admin → judge).
 */

const PORTALS = ['player', 'coach', 'admin', 'superadmin', 'judge'];

/** @returns {string|null} the portal named by `?role=`, if it is a real one */
export const portalFromSearch = (search) => {
  const role = new URLSearchParams(search).get('role');
  return PORTALS.includes(role) ? role : null;
};

/** Server account type for a portal: a superadmin is an Admin account. */
export const accountTypeFor = (portal) =>
  portal === 'superadmin' ? 'admin' : portal || undefined;

/** Where "Back to login" goes. The home page is the role picker. */
export const loginPathFor = (portal) => (portal ? `/${portal}/login` : '/');

/** Carry the portal on to the next reset page. */
export const withPortal = (path, portal) => (portal ? `${path}?role=${portal}` : path);
