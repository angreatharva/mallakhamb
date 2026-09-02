/**
 * Player Row Utilities
 *
 * One athlete's performance, shaped the same way whichever feed it came from.
 *
 * The results board is rendered from three routes — the public page, the admin
 * scores page and the superadmin scores page — and they must show the same
 * athlete the same way. They do NOT read the same rows: the public feed is
 * gated on `isLocked` and `isFinalized`, while an admin watches scoring in
 * progress. What is shared is the shape of a row and the ranking applied to it,
 * which is what lives here.
 */

const { calculateIndividualScore } = require('./calculation.util');
const { calculateIndividualRankingsByApparatus } = require('./ranking.util');

/**
 * Fill in the COP average and final score when the stored values are still 0
 * but judges have marked the slip.
 *
 * A panel that is mid-scoring has judge marks and no computed total, because
 * the total is written when the sheet is saved. Without this the board shows a
 * row of marks against a final score of 0.00 and ranks it last.
 *
 * @param {Object} playerScore - a Score.playerScores entry (lean or hydrated)
 * @returns {Object} a plain copy, with the computed fields filled in
 */
function enrichPlayerScore(playerScore) {
  const row = { ...(typeof playerScore?.toObject === 'function' ? playerScore.toObject() : playerScore) };

  const hasJudges = row.judgeScores && Object.values(row.judgeScores).some((mark) => Number(mark) > 0);
  if (!hasJudges) {
    return row;
  }

  if (row.finalScore > 0 && row.averageMarks > 0) {
    return row;
  }

  const calculated = calculateIndividualScore(row.judgeScores, row.panelSize || undefined);
  if (calculated.averageMarks > 0) {
    row.executionAverage = calculated.executionAverage;
    row.baseScore = calculated.baseScore;
    row.baseScoreApplied = calculated.baseScoreApplied;
    row.toleranceUsed = calculated.toleranceUsed;
    row.averageMarks = calculated.averageMarks;

    if (!(row.finalScore > 0)) {
      const deduction = Number(row.deduction) || 0;
      const other = Number(row.otherDeduction) || 0;
      row.finalScore = Math.max(0, Number((calculated.averageMarks - deduction - other).toFixed(3)));
    }
  }

  return row;
}

/**
 * Write `rank` and `tieBreakInfo` onto rows that are already in memory.
 *
 * Ranking happens per apparatus — Pole competes against Pole — and applies the
 * panel-size tie-break rules in tie-breaker.util.js. The rows are mutated in
 * place and returned, so a caller holding them inside a larger structure (a
 * score document's `playerScores`, say) does not have to stitch the ranks back
 * on by hand.
 *
 * @param {Array<Object>} rows - player rows carrying finalScore, apparatus,
 *   panelSize, judgeScores and time
 * @param {string} [competitionType]
 * @returns {Array<Object>} the same row objects, now ranked
 */
function rankPlayerRows(rows, competitionType = 'Competition II') {
  if (!rows || rows.length === 0) {
    return rows || [];
  }

  // The ranking utilities copy their input, so match each result back to the
  // row it came from by identity.
  const ranked = calculateIndividualRankingsByApparatus(
    rows.map((row, index) => ({ ...row, __rowIndex: index })),
    competitionType
  );

  for (const result of ranked) {
    const row = rows[result.__rowIndex];
    if (!row) continue;
    row.rank = result.rank;
    row.tieBreakInfo = result.tieBreakInfo || null;
  }

  return rows;
}

module.exports = {
  enrichPlayerScore,
  rankPlayerRows
};
