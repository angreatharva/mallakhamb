/**
 * When a meet stops accepting changes, mirroring
 * `Server/src/utils/security/competition-lock.util.js`.
 *
 * At 23:59 UTC on its end date a competition freezes: no admin, judge, coach or
 * player may write anything belonging to it again. Only a super admin can.
 *
 * The SERVER is what enforces that — every write is refused there with a 423
 * whatever this file says. This mirror exists so the UI can say so BEFORE the
 * user fills in a score sheet and presses save, which is the difference between
 * "results are final" and "something went wrong". Same reasoning as the fee
 * window and the COP tables; same obligation to move together. `competitionLockSync.test.js`
 * feeds both implementations the same instants and requires identical answers.
 *
 * Never use this to decide whether a write is ALLOWED — only whether to show
 * the read-only state. The browser does not get a vote on that.
 */

/** HTTP status the server refuses a locked write with. */
export const LOCKED_STATUS = 423;

/** The `error.code` that status carries. */
export const LOCKED_CODE = 'COMPETITION_LOCKED';

/** @param {unknown} value @returns {Date | null} */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The last millisecond of the calendar day a date falls on.
 *
 * UTC, because that is how the dates are stored — an `<input type="date">`
 * sends `YYYY-MM-DD`, read as UTC midnight on both stacks. Using the browser's
 * local day would move the deadline for anyone not on UTC, and the server would
 * disagree.
 *
 * @param {Date} date @returns {Date}
 */
function endOfUtcDay(date) {
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * The instant a competition freezes, or null when it never does.
 * @param {Object} competition @returns {Date | null}
 */
export function lockInstant(competition) {
  const endDate = toDate(competition?.endDate);
  return endDate ? endOfUtcDay(endDate) : null;
}

/**
 * Has this competition frozen?
 *
 * Strictly after, so the final millisecond of the end date is still writable.
 * A competition with no `endDate` never locks — see the server module for why
 * that fails open.
 *
 * @param {Object} competition @param {Date} [at] @returns {boolean}
 */
export function isCompetitionLocked(competition, at = new Date()) {
  const locksAt = lockInstant(competition);
  if (!locksAt) return false;
  const now = toDate(at) || new Date();
  return now > locksAt;
}

/**
 * May this user still write to a frozen meet?
 *
 * Super admins only. `userType` is what the SPA knows about itself — it is
 * derived from the URL (`utils/auth/roleFromPath`) and carried in the token —
 * so both spellings are accepted here exactly as the server accepts them.
 *
 * @param {string} [userType] @returns {boolean}
 */
export function mayBypassCompetitionLock(userType) {
  return ['superadmin', 'super_admin'].includes(String(userType || '').toLowerCase());
}

/**
 * Should the UI render read-only for this user, on this meet?
 *
 * The single question every screen asks. Keeping the role check in here rather
 * than at each call site is what stops a screen from hiding the superadmin's
 * own controls.
 *
 * @param {Object} competition
 * @param {string} [userType]
 * @param {Date} [at]
 * @returns {boolean}
 */
export function isLockedFor(competition, userType, at = new Date()) {
  if (mayBypassCompetitionLock(userType)) return false;
  return isCompetitionLocked(competition, at);
}

/**
 * The lock as a whole answer, for rendering.
 *
 * @param {Object} competition
 * @param {string} [userType]
 * @param {Date} [at]
 * @returns {{locked: boolean, locksAt: Date | null, closedOn: string | null}}
 */
export function describeCompetitionLock(competition, userType, at = new Date()) {
  const locksAt = lockInstant(competition);
  return {
    locked: isLockedFor(competition, userType, at),
    locksAt,
    closedOn: locksAt ? formatLockDate(locksAt) : null,
  };
}

/**
 * The end date as a readable day.
 *
 * Read back in UTC so the label names the day that was picked, not the day it
 * happens to be where the browser is standing — the same rule
 * `formatFeeWindowDate` follows.
 *
 * @param {unknown} value @returns {string}
 */
export function formatLockDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Is this the server refusing a write because the meet has closed?
 *
 * Matches on the CODE, not the status alone: 423 is unusual enough that
 * nothing else in this API uses it today, but the code is the contract.
 *
 * @param {unknown} error - an axios error
 * @returns {boolean}
 */
export function isCompetitionLockedError(error) {
  const response = error?.response;
  if (!response) return false;
  return response.status === LOCKED_STATUS || response.data?.error?.code === LOCKED_CODE;
}

/**
 * What to show the user when a write was refused.
 * @param {unknown} error @returns {string}
 */
export function competitionLockedMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    'This competition has closed and is locked. Only a super admin can make further changes.'
  );
}
