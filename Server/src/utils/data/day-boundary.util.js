/**
 * Calendar-day edges, in UTC.
 *
 * Two separate rules in this codebase are written as "the end of the day the
 * super admin picked": the fee window closes at 23:59 on `endDate`
 * (`config/payment.config.js`), and the competition LOCKS at the same instant
 * (`utils/security/competition-lock.util.js`). They are the same boundary and
 * must stay the same boundary — a lock that opens a millisecond before or after
 * payment closes is a window in which money moves into a frozen meet.
 *
 * So the arithmetic lives here once and both import it.
 *
 * UTC, not local, because that is how these dates are STORED: an
 * `<input type="date">` sends `YYYY-MM-DD`, which both `express-validator`'s
 * `.toDate()` and `new Date()` read as UTC midnight, and `scripts/` writes
 * `Date.UTC(...)` outright. Reading the day back in the server's zone would
 * shift the boundary off the day that was actually picked — and would move it
 * again whenever the process is deployed to a host in another region.
 *
 * `Web/src/utils/scoring/competitionFee.js` and
 * `Web/src/utils/scoring/competitionLock.js` mirror these three functions for
 * the browser. The mirror is deliberate (the client has to show the deadline
 * before it asks the server about it) but the copies must move together.
 *
 * @module utils/data/day-boundary.util
 */

/**
 * Coerce anything date-shaped to a Date, or null.
 *
 * Null rather than throwing, because every caller treats "no date" as "this
 * edge does not exist" — a competition with no `feeDueDate` never charges a
 * late fee, one with no `endDate` never locks.
 *
 * @param {unknown} value
 * @returns {Date | null}
 */
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The last millisecond of the calendar day a date falls on — "23:59 on the End
 * Date", to the letter.
 *
 * @param {Date} date
 * @returns {Date}
 */
function endOfUtcDay(date) {
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Midnight opening the calendar day a date falls on.
 *
 * @param {Date} date
 * @returns {Date}
 */
function startOfUtcDay(date) {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

module.exports = {
  toDate,
  endOfUtcDay,
  startOfUtcDay,
};
