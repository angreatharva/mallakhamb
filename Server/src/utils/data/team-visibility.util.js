/**
 * Registration visibility rules.
 *
 * ONE definition of "this team has finished registering", shared by every
 * surface that must not show a coach's work-in-progress roster: the judge and
 * scorer team lists, the lot draw, and the anonymous public pages.
 *
 * A coach builds a squad over several sittings. Adding a player writes
 * `Player.team` immediately and drops an entry into
 * `Competition.registeredTeams[].players`, so a half-built roster is fully
 * present in the database long before the coach commits to it. What separates
 * a draft from an entry is `isSubmitted`, and the ONLY writer of
 * `isSubmitted: true` is the Razorpay verification step in
 * `coach.service.verifyPaymentAndSubmitTeam`, which sets it in the same `$set`
 * as `paymentStatus: 'completed'`. So "submitted" already means "final submit
 * AND fees paid" — there is no path that produces one without the other.
 *
 * These helpers are the reason that stays true everywhere. A caller that
 * hand-rolls `rt.isSubmitted` is a caller that will eventually forget
 * `isActive`, or check nothing at all on the path where the competition lookup
 * fails.
 *
 * @module utils/data/team-visibility.util
 */

/**
 * Whether one `registeredTeams[]` entry may be shown to anyone outside the
 * coach who owns it.
 *
 * `isActive` defaults to true in the schema, so `!== false` (not `=== true`)
 * is deliberate: pre-existing documents written before that field was added
 * have it undefined and must not be hidden. `isSubmitted` gets the opposite
 * treatment — strictly `=== true`, so a missing or truthy-but-not-boolean
 * value fails closed.
 *
 * @param {Object|null|undefined} registration - a `Competition.registeredTeams[]` entry
 * @returns {boolean}
 */
function isSubmittedRegistration(registration) {
  if (!registration) return false;
  return registration.isSubmitted === true && registration.isActive !== false;
}

/** @param {*} id @returns {string} */
const idStr = (id) => (id == null ? '' : String(id._id ?? id));

/**
 * Find the SUBMITTED registration for a team inside a competition.
 *
 * Returns null both when the team is not registered at all and when it is
 * registered but still a draft — callers cannot tell the two apart, and must
 * not: "not submitted yet" and "no such team" look identical from outside, so
 * an unsubmitted roster cannot be probed for.
 *
 * @param {Object|null|undefined} competition - a Competition document or lean object
 * @param {string} teamId
 * @returns {Object|null}
 */
function findSubmittedRegistration(competition, teamId) {
  if (!competition || !teamId) return null;

  const target = idStr(teamId);
  const registration = (competition.registeredTeams || []).find(
    (rt) => idStr(rt.team) === target
  );

  return isSubmittedRegistration(registration) ? registration : null;
}

/**
 * The athlete ids a coach actually entered for a competition, as strings.
 *
 * Needed because `Player.team` is a roster membership, not a competition
 * entry. A coach can keep twenty athletes on a team and enter six; querying
 * `Player.find({ team })` returns all twenty. Only the six belong on a judge's
 * screen.
 *
 * @param {Object|null|undefined} registration - a `registeredTeams[]` entry
 * @returns {Set<string>}
 */
function registeredPlayerIds(registration) {
  const ids = new Set();
  for (const entry of registration?.players || []) {
    const id = idStr(entry?.player);
    if (id) ids.add(id);
  }
  return ids;
}

module.exports = {
  isSubmittedRegistration,
  findSubmittedRegistration,
  registeredPlayerIds,
};
