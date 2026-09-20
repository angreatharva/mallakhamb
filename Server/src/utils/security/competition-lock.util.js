/**
 * When a meet stops accepting changes.
 *
 * At 23:59 UTC on its `endDate` a competition FREEZES. From that instant no
 * admin, no judge, no coach and no player may write anything belonging to it —
 * not a score, not a slip revision, not a running order, not a roster entry, not
 * a payment, not the competition record itself. Results become read-only and
 * stay that way.
 *
 * The one exception is the SUPER ADMIN, who keeps every write. Somebody has to
 * be able to correct a transcription error found the morning after, or to push
 * `endDate` out when an event overruns, and that authority is deliberately held
 * by one role rather than spread across the admins and judges running the meet.
 * `/api/superadmin/*` is therefore the unlocked door, and the guard never
 * fronts it.
 *
 * ── Why the boundary is the fee window's boundary ──────────────────────────
 *
 * `endOfUtcDay(endDate)` is the same instant `resolveFeeWindow` calls
 * `closesAt` (see `config/payment.config.js`), and both read it from
 * `utils/data/day-boundary.util` so they cannot drift. If the lock landed even a
 * millisecond after payment closed there would be a window where a coach's money
 * moves into a meet nobody can then record it against; if it landed before,
 * registration would 423 while still advertising itself as open.
 *
 * ── Why a missing endDate does not lock ────────────────────────────────────
 *
 * `endDate` is `required` on the schema, so in practice every competition has
 * one. A document that somehow does not — a fixture, a partial seed, a record
 * predating the field — reads as UNLOCKED rather than locked. Failing open is
 * the right default here and only here: this rule is about time passing, not
 * about identity, and a competition frozen because of a missing field would be
 * indistinguishable from one frozen on purpose and could only be rescued by the
 * superadmin. Every access rule in `competition-access.util` still applies
 * underneath, so "unlocked" never means "unguarded".
 *
 * @module utils/security/competition-lock
 */

const { toDate, endOfUtcDay } = require('../data/day-boundary.util');
const { isSuperAdmin } = require('./competition-access.util');

/**
 * HTTP status for a refusal by this rule.
 *
 * 423 Locked, not 403. The distinction is load-bearing on the client: the web
 * api-client already treats a 403 whose message mentions a competition as "your
 * competition context is stale" and bounces the user back to competition
 * selection (`Web/src/services/api-client.js`). A lock refusal reusing 403 would
 * trip that redirect and log an admin out of a meet they are legitimately
 * reading. 423 says what this is — the resource is fine, the caller is fine, the
 * resource is frozen — and no interceptor claims it.
 */
const LOCKED_STATUS = 423;

/** The `error.code` clients match on. */
const LOCKED_CODE = 'COMPETITION_LOCKED';

/**
 * The instant a competition freezes, or null when it never does.
 *
 * @param {Object} competition - competition document or plain object
 * @returns {Date | null} 23:59:59.999 UTC on `endDate`
 */
function lockInstant(competition) {
  const endDate = toDate(competition?.endDate);
  return endDate ? endOfUtcDay(endDate) : null;
}

/**
 * Has this competition frozen?
 *
 * Strictly after, so the final millisecond of the end date is still writable —
 * "up to and including 23:59 on the end date", the same comparison
 * `resolveFeeWindow` makes against `closesAt`.
 *
 * @param {Object} competition
 * @param {Date} [at] - the instant to judge, defaults to now
 * @returns {boolean}
 */
function isCompetitionLocked(competition, at = new Date()) {
  const locksAt = lockInstant(competition);
  if (!locksAt) return false;
  const now = toDate(at) || new Date();
  return now > locksAt;
}

/**
 * May this principal write to a frozen meet?
 *
 * Superadmins only — see the module header. Takes the same
 * `(user, userType)` pair as `mayActOnCompetition` and answers it with the same
 * predicate, so the two spellings of the role (`superadmin` / `super_admin`) and
 * the two places it is carried (the token claim and `user.role`) are handled
 * identically in both rules.
 *
 * @param {Object} user - principal document (`req.user`)
 * @param {string} [userType] - token `userType` claim
 * @returns {boolean}
 */
function mayBypassCompetitionLock(user, userType) {
  return isSuperAdmin(user, userType);
}

/**
 * The lock as a whole answer, for a caller that has to render or log it.
 *
 * @param {Object} competition
 * @param {Date} [at]
 * @returns {{locked: boolean, locksAt: Date | null, message: string | null}}
 */
function describeCompetitionLock(competition, at = new Date()) {
  const locksAt = lockInstant(competition);
  const locked = isCompetitionLocked(competition, at);

  return {
    locked,
    locksAt,
    message: locked ? lockedMessage(competition, locksAt) : null,
  };
}

/**
 * What the user is told.
 *
 * Names the meet and the day it closed, because the commonest way to see this
 * message is to have the wrong competition selected — an admin working a live
 * meet with last season's still in the switcher. A bare "this competition is
 * locked" leaves them with no way to tell those two situations apart.
 *
 * The day is rendered in UTC for the same reason the boundary is computed in
 * UTC: it has to name the date that was actually picked.
 *
 * @param {Object} competition
 * @param {Date | null} locksAt
 * @returns {string}
 */
function lockedMessage(competition, locksAt) {
  const name = competition?.name ? `"${competition.name}"` : 'This competition';
  const day = locksAt ? locksAt.toISOString().slice(0, 10) : null;

  return day
    ? `${name} closed at the end of ${day} and is now locked. Only a super admin can make further changes.`
    : `${name} is locked. Only a super admin can make further changes.`;
}

module.exports = {
  LOCKED_STATUS,
  LOCKED_CODE,
  lockInstant,
  isCompetitionLocked,
  mayBypassCompetitionLock,
  describeCompetitionLock,
  lockedMessage,
};
