/**
 * Who may act on which meet.
 *
 * A competition is an ACCESS BOUNDARY for admins and for nobody else, and that
 * asymmetry is the whole point of this module:
 *
 * - **admin** — scoped. `Admin.competitions[]` is the authoritative list, as
 *   `scripts/createCompetitions.js` documents: a competition that names an
 *   admin in `Competition.admins` but is absent from `Admin.competitions` is a
 *   meet the admin cannot open. Two dead copies of this rule already existed
 *   (`AdminService.hasAccessToCompetition`, `Admin.hasAccessToCompetition`);
 *   this is the one that is wired up.
 * - **superadmin** — every meet, by role.
 * - **judge** — scoped, but not from the account document. A seat lives in the
 *   separate `judgeassignments` collection (see `src/models/JudgeAccount.js`), so
 *   only `JudgeService.setCompetitionContext` can answer it, and it does.
 * - **coach / player** — NOT scoped. A coach registers a squad for a meet they
 *   have no relationship to yet, and a player joins a team before appearing on
 *   any roster; requiring prior membership would make first registration
 *   impossible. What protects them is per-resource ownership downstream — a
 *   coach only ever reaches their own teams — not the competition id.
 *
 * @module utils/security/competition-access
 */

/** Role values that mean "every meet". Both spellings are in the data. */
const SUPERADMIN_ROLES = Object.freeze(['superadmin', 'super_admin']);

/** User types whose competition id is an authorization decision. */
const SCOPED_USER_TYPES = Object.freeze(['admin', 'superadmin', 'super_admin']);

/**
 * @param {Object} user - Principal document (`req.user`, or a repository read)
 * @param {string} [userType] - Token `userType` claim
 * @returns {boolean} True when the principal is a superadmin
 */
function isSuperAdmin(user, userType) {
  const type = String(userType || '').toLowerCase();
  const role = String(user?.role || '').toLowerCase();
  return SUPERADMIN_ROLES.includes(type) || SUPERADMIN_ROLES.includes(role);
}

/**
 * Whether the competition id carries an access decision for this user type.
 * When false, the id is context, not permission — see the module header.
 *
 * @param {string} userType - Token `userType` claim
 * @returns {boolean}
 */
function isCompetitionScoped(userType) {
  return SCOPED_USER_TYPES.includes(String(userType || '').toLowerCase());
}

/**
 * May this admin act on this meet?
 *
 * Only meaningful when {@link isCompetitionScoped} is true for `userType`;
 * callers must not read a `true` here as clearance for a judge, whose seats
 * live in another collection entirely.
 *
 * @param {Object} user - Principal document, with `role` and `competitions`
 * @param {string} userType - Token `userType` claim
 * @param {string|Object} competitionId - The meet being acted on
 * @returns {boolean}
 */
function mayActOnCompetition(user, userType, competitionId) {
  if (!isCompetitionScoped(userType)) return true;
  if (isSuperAdmin(user, userType)) return true;
  if (!competitionId) return false;

  const wanted = String(competitionId);
  return (user?.competitions || []).some((id) => String(id) === wanted);
}

module.exports = {
  SUPERADMIN_ROLES,
  SCOPED_USER_TYPES,
  isSuperAdmin,
  isCompetitionScoped,
  mayActOnCompetition,
};
