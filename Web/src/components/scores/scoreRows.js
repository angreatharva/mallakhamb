/**
 * Score row adapters.
 *
 * Three routes render the same results board — `/scores`,
 * `/admin/dashboard/scores` and `/superadmin/dashboard/scores` — from two
 * different feeds:
 *
 *   `/public/scores`             → score DOCUMENTS, each a team holding its
 *                                  published athletes
 *   `/{admin}/scores/individual` → ATHLETES, each holding their performances
 *
 * Neither is the board's shape, so both are flattened here into one row per
 * performance. The two feeds are deliberately NOT the same rows: the public one
 * is gated on the Scorer's lock and the Senior Judge's final submit, while an
 * admin has to be able to watch scoring in progress. What must match is the
 * shape, the fields, and the server-assigned `rank` / `tieBreakInfo` — so every
 * board orders placings the same way and explains ties the same way.
 */

/**
 * @param {Array<Object>} scoreDocs - payload of GET /public/scores
 * @returns {Array<Object>} one row per performance
 */
export const rowsFromPublicScores = (scoreDocs = []) =>
  scoreDocs.flatMap((doc) =>
    (doc.playerScores || []).map((performance) => ({
      ...performance,
      teamName: performance.teamName || doc.teamName,
      // The same athlete can appear under more than one document across a
      // meet, so the row key has to include the document it came from.
      uid: `${doc._id}-${performance.playerId}-${performance.apparatus || ''}`,
    }))
  );

/**
 * @param {Array<Object>} players - payload of GET /{admin}/scores/individual
 * @returns {Array<Object>} one row per performance
 */
export const rowsFromIndividualScores = (players = []) =>
  players.flatMap((player) =>
    (player.scores || []).map((performance) => ({
      ...performance,
      playerId: player.playerId || performance.playerId,
      playerName: player.playerName || performance.playerName,
      teamName: performance.teamName || 'Unknown Team',
      uid: `${player.playerId}-${performance.apparatus || ''}-${performance._id || ''}`,
    }))
  );

/**
 * Order rows for display.
 *
 * `rank` is assigned by the server, which is the only place the panel-size
 * tie-break rules live. Rows without one — an older payload, or a feed that
 * does not rank — fall back to final score, so the board never renders in
 * arbitrary order.
 *
 * @param {Array<Object>} rows
 * @returns {Array<Object>} a sorted copy
 */
export const sortByRank = (rows = []) =>
  [...rows].sort((a, b) => {
    const rankA = Number.isFinite(a.rank) ? a.rank : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isFinite(b.rank) ? b.rank : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return (b.finalScore || 0) - (a.finalScore || 0);
  });

/**
 * Match rows against the board's search box.
 *
 * @param {Array<Object>} rows
 * @param {string} searchTerm
 * @returns {Array<Object>}
 */
export const filterRows = (rows = [], searchTerm = '') => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) =>
    row.playerName?.toLowerCase().includes(term) ||
    row.teamName?.toLowerCase().includes(term) ||
    row.coach?.toLowerCase().includes(term)
  );
};
