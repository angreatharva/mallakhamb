/**
 * Published Score Utilities
 *
 * The ONE definition of "this mark is public". A result is published only after
 * both signoffs, in order:
 *
 *   1. the Senior Judge's Final Submit, which sets `isFinalized` on that
 *      athlete's row, and
 *   2. the Scorer's "Save & Lock" for that APPARATUS (`lockedApparatus`), or
 *      the admin's whole-sheet freeze (`isLocked`).
 *
 * The public results board and the profile stats both read through here, so a
 * graph can never show a mark the results page is still holding back — a panel
 * mid-event must not leak into anyone's chart.
 */

const { apparatusKey } = require('../../config/cop-rules');

/**
 * The document-level half of the rule, as a Mongo filter.
 *
 * `lockedApparatus.0` rather than `$ne: []`: on a document written before the
 * field existed the path is missing, and `$ne: []` would count that as
 * non-empty and publish an unlocked sheet.
 *
 * @param {Object} [criteria] - further conditions, ANDed in
 * @returns {Object}
 */
function publishedScoreQuery(criteria = {}) {
  const gate = { $or: [{ isLocked: true }, { 'lockedApparatus.0': { $exists: true } }] };
  if (!criteria.$or) return { ...criteria, ...gate };
  const { $and = [], ...rest } = criteria;
  return { ...rest, $and: [...$and, gate] };
}

/**
 * The row-level half: the athlete rows of one score document that are public.
 *
 * Applied per row, not per document. A document qualifies because SOMETHING in
 * it is locked; this decides which rows that was. Without it the Scorer locking
 * Pole would publish the Rope marks sitting unfinished in the same document.
 *
 * @param {Object} scoreDoc - a Score document (lean or hydrated)
 * @returns {Array<Object>} the published `playerScores` entries
 */
function publishedPlayerScores(scoreDoc) {
  if (!scoreDoc) return [];
  const rows = (scoreDoc.playerScores || []).filter((ps) => ps && ps.isFinalized === true);
  if (scoreDoc.isLocked) return rows;
  const published = new Set((scoreDoc.lockedApparatus || []).map(apparatusKey));
  return rows.filter((ps) => published.has(apparatusKey(ps.apparatus)));
}

module.exports = {
  publishedScoreQuery,
  publishedPlayerScores,
};
