/**
 * The organiser this suite signs in as, and the meet they work on.
 *
 * The admin is not a roster the way players, coaches and judges are — there is
 * exactly one, it is created by `Server/scripts/createAdmin.js`, and that script
 * is where these values come from. Restating them here rather than importing
 * them because the two stacks do not share a module system, and the pair is
 * already in the repository in plain sight.
 *
 * WHICH IS WHY THE GUARD BELOW EXISTS. Seating and unseating panels is a
 * destructive, meet-wide act, and `E2E_BASE_URL` will happily point at a
 * deployed environment. Off localhost, the defaults are refused and the
 * credentials have to be passed deliberately.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:5173';

/** True for the dev server on this machine, and nothing else. */
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE_URL);

const required = (name, fallback) => {
  const given = process.env[name];
  if (given) return given;
  if (isLocal) return fallback;
  throw new Error(
    `${name} must be set when E2E_BASE_URL is not localhost (it is "${BASE_URL}").\n` +
    'These specs seat and vacate judging panels across a whole meet; the local ' +
    'defaults from Server/scripts/createAdmin.js are deliberately not used ' +
    'against anything else.'
  );
};

/** The organiser's login. Matches `Server/scripts/createAdmin.js`. */
export const ADMIN = {
  get email() { return required('ADMIN_EMAIL', 'admin@gmail.com'); },
  get password() { return required('ADMIN_PASSWORD', 'Admin@2026'); },
};

/**
 * The platform owner's login. Matches `Server/scripts/createSuperAdmin.js`.
 *
 * Same guard as ADMIN, and for a stronger reason: a super admin can read and
 * edit every meet on the deployment, not just one. The responsive audit signs
 * in as this account to photograph the superadmin screens.
 *
 * Both are GETTERS, so the localhost check runs when a spec actually reaches
 * for a credential rather than when this module is imported — importing it to
 * read `COMPETITION_PLACE` must not throw.
 */
export const SUPERADMIN = {
  get email() { return required('SUPERADMIN_EMAIL', 'Superadmin@gmail.com'); },
  get password() { return required('SUPERADMIN_PASSWORD', 'Superadmin@2026'); },
};

/**
 * Which meet to work on.
 *
 * The seeded meets share a name and a year and differ only by place, so the
 * place is the only thing that identifies one. Defaults to the plan's own meet,
 * which is what the panel scripts on the Server side also use.
 */
export const COMPETITION_PLACE = process.env.COMPETITION_PLACE || null;
