/**
 * 007 — repair finalized athlete rows left with a 0.00 final score.
 *
 * An older three-judge calculation (Senior + J1 + J2) could finalize a row
 * without writing `finalScore`, `averageMarks` and the execution figures that
 * go with it. The stored number was 0.00 while the slips it should have been
 * computed from were sitting in the same document.
 *
 * `AdminService.getSubmittedTeams` used to paper over this ON READ: when it met
 * such a row it recomputed the values and wrote them back, mid-GET. That fixed
 * the number on screen, but it made a read endpoint take a write lock — and it
 * is the endpoint the judge dashboard polls throughout an event, so the writes
 * landed at exactly the busiest moment. It also only ever repaired the rows
 * somebody happened to look at; a category nobody opened stayed wrong, and a
 * report generated from the database rather than the API read 0.00.
 *
 * Doing it once, here, fixes every affected row whether or not it is viewed,
 * and takes the write off the read path for good.
 *
 * Only FINALIZED rows are touched. A row still being scored legitimately has no
 * final yet, and writing one would publish a result the Senior Judge never
 * signed off — the display fallback in getSubmittedTeams still shows a live
 * figure for those, which is what it is for.
 *
 * Idempotent: a row that already carries a non-zero `finalScore` is skipped, so
 * a second run reports zero repairs.
 */

const Score = require('../models/Score');
const { calculateIndividualScore } = require('../utils/scoring/calculation.util');

/**
 * Is this row finalized but missing the numbers that should go with it?
 * @param {Object} playerScore
 * @returns {boolean}
 */
function needsRepair(playerScore) {
  if (!playerScore?.isFinalized) return false;
  const final = Number(playerScore.finalScore) || 0;
  if (final > 0) return false;
  // Nothing to recompute from — leave it alone rather than write a zero back.
  return !!playerScore.judgeScores
    && Object.values(playerScore.judgeScores).some((mark) => Number(mark) > 0);
}

/**
 * Recompute one row from its judge marks.
 * @param {Object} playerScore
 * @returns {Object|null} the fields to set, or null when it cannot be resolved
 */
function repairedFields(playerScore) {
  const recomputed = calculateIndividualScore(playerScore.judgeScores, playerScore.panelSize);
  if (!(recomputed.averageMarks > 0)) return null;

  // The Scorer's deductions are not recoverable from the slips — the time
  // penalty comes off a stopwatch — so they are read from the stored row and
  // applied, exactly as the read-path fallback did. Dropping them would hand
  // the athlete back marks they lost.
  const deduction = Number(playerScore.deduction) || 0;
  const other = Number(playerScore.otherDeduction) || 0;

  return {
    finalScore: Math.max(0, Number((recomputed.averageMarks - deduction - other).toFixed(3))),
    averageMarks: recomputed.averageMarks,
    executionAverage: recomputed.executionAverage,
    baseScore: recomputed.baseScore,
    baseScoreApplied: recomputed.baseScoreApplied,
    toleranceUsed: recomputed.toleranceUsed,
  };
}

async function up() {
  // Only documents that actually contain a candidate row, so a database with
  // none does one indexed-ish scan and stops.
  const candidates = await Score.collection
    .find(
      { 'playerScores.isFinalized': true },
      { projection: { playerScores: 1 } }
    )
    .toArray();

  let documentsTouched = 0;
  let rowsRepaired = 0;
  let unresolved = 0;

  for (const doc of candidates) {
    const rows = doc.playerScores || [];
    let changed = false;

    for (const row of rows) {
      if (!needsRepair(row)) continue;
      const fields = repairedFields(row);
      if (!fields) {
        unresolved += 1;
        continue;
      }
      Object.assign(row, fields);
      changed = true;
      rowsRepaired += 1;
    }

    if (changed) {
      await Score.collection.updateOne({ _id: doc._id }, { $set: { playerScores: rows } });
      documentsTouched += 1;
    }
  }

  console.log(
    `  Scores: ${rowsRepaired} finalized row(s) repaired across ${documentsTouched} document(s)`
    + `${unresolved > 0 ? `; ${unresolved} could not be resolved from their slips` : ''}.`
  );
}

/**
 * Not reversible, deliberately.
 *
 * The previous value was 0.00 — an absence, not a result. Restoring it would
 * re-break the rows this fixed, and there is nothing to gain: the recomputed
 * figure is derived from the judges' own marks, which are untouched.
 */
async function down() {
  console.log('  007 is not reversible: it replaced missing finals with values derived from the stored slips.');
}

module.exports = { up, down, needsRepair, repairedFields };
