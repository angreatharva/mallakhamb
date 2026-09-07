/**
 * Scoring Calculation Utilities
 *
 * Provides low-level calculation functions for scoring operations.
 * Pure functions: no repository, no request, no socket. The one import is
 * `config/cop-rules`, which is itself pure data plus lookups over that data.
 *
 * Requirements: 1.5, 1.8, v2 spec additions
 */

const { getTolerance } = require('../../config/cop-rules');

/**
 * Calculate individual player score with base score and tolerance
 * Implements the Mallakhamb scoring algorithm per v2 spec:
 * - Panel size determines the entire scoring path (Section 4)
 * - 3-judge: simple average of all three totals; no Chief, no tolerance/base-score
 * - 4-judge: Sr. Judge=Chief AND fills the vacant 4th evaluation slot, then runs
 *            the 5-judge method (drop high/low, average middle two, tolerance vs Chief)
 * - 5-judge: Standard COP (drop high/low of eval judges, tolerance-check vs Chief)
 *
 * @param {Object} judgeScores - Judge scores object
 * @param {number} judgeScores.seniorJudge - Senior judge score (Chief role for 4/5-judge panels)
 * @param {number} judgeScores.judge1 - Execution judge 1 score
 * @param {number} judgeScores.judge2 - Execution judge 2 score
 * @param {number} judgeScores.judge3 - Execution judge 3 score
 * @param {number} judgeScores.judge4 - Execution judge 4 score
 * @param {number} judgeScores.judge5 - Execution judge 5 score (5-judge panel)
 * @param {number} panelSize - Optional: explicit panel size (3, 4, or 5). If omitted,
 *                              inferred from which judge fields have non-zero scores.
 * @returns {Object} Calculation result with executionAverage, baseScore, baseScoreApplied, toleranceUsed, averageMarks, method
 */
function calculateIndividualScore(judgeScores, panelSize) {
  if (!judgeScores) {
    return {
      executionAverage: 0, baseScore: 0, baseScoreApplied: false,
      toleranceUsed: 0, averageMarks: 0, method: null
    };
  }

  // Extract all judge scores and count non-zero entries
  const allScores = [
    judgeScores.seniorJudge || 0,
    judgeScores.judge1 || 0,
    judgeScores.judge2 || 0,
    judgeScores.judge3 || 0,
    judgeScores.judge4 || 0,
    judgeScores.judge5 || 0
  ];

  // Infer panel size if not provided
  if (panelSize === undefined) {
    const nonZeroCount = allScores.filter(s => s > 0).length;
    // Map: 3 scores = 3-judge panel, 4 scores = 4-judge panel, 5+ = 5-judge panel
    panelSize = nonZeroCount === 3 ? 3 : nonZeroCount >= 4 ? 4 : 0;
  }

  // 3-judge panel: simple average of all submitted totals (no Chief/tolerance).
  // Include seniorJudge — live panels often assign Senior + J1 + J2 as the three slips.
  if (panelSize === 3) {
    const totals = [
      judgeScores.seniorJudge || 0,
      judgeScores.judge1 || 0,
      judgeScores.judge2 || 0,
      judgeScores.judge3 || 0,
      judgeScores.judge4 || 0,
      judgeScores.judge5 || 0
    ].filter(s => s > 0);
    if (totals.length < 3) {
      return {
        executionAverage: 0, baseScore: 0, baseScoreApplied: false,
        toleranceUsed: 0, averageMarks: 0, method: null
      };
    }
    const avgScore = totals.reduce((sum, s) => sum + s, 0) / totals.length;
    return {
      executionAverage: parseFloat(avgScore.toFixed(3)),
      baseScore: 0,
      baseScoreApplied: false,
      toleranceUsed: 0,
      averageMarks: parseFloat(avgScore.toFixed(3)),
      method: '3_JUDGE_SIMPLE_AVERAGE'
    };
  }

  // For 4/5-judge panels: Sr. Judge acts as Chief for 4-judge, regular Chief for 5-judge
  const seniorJudgeScore = judgeScores.seniorJudge || 0;
  const evalScores = [
    judgeScores.judge1 || 0,
    judgeScores.judge2 || 0,
    judgeScores.judge3 || 0,
    judgeScores.judge4 || 0,
    judgeScores.judge5 || 0
  ].filter(s => s > 0);

  // Determine if this is 4-judge panel (Sr. Judge + 3 eval judges)
  // or 5-judge panel (Chief + 4 eval judges)
  const is4JudgePanel = (seniorJudgeScore > 0 && evalScores.length === 3);
  const is5JudgePanel = (seniorJudgeScore > 0 && evalScores.length === 4);

  if (!seniorJudgeScore || (!is4JudgePanel && !is5JudgePanel)) {
    return { executionAverage: 0, baseScore: 0, baseScoreApplied: false, toleranceUsed: 0, averageMarks: 0, method: null };
  }

  let middleScores, avgScore, method;

  if (is5JudgePanel) {
    // Standard 5-judge COP: drop high/low of 4 eval judges, average middle two
    const sortedScores = [...evalScores].sort((a, b) => a - b);
    if (sortedScores.length !== 4) {
      return { executionAverage: 0, baseScore: 0, baseScoreApplied: false, toleranceUsed: 0, averageMarks: 0, method: null };
    }
    middleScores = sortedScores.slice(1, 3);
    method = '5_JUDGE_STANDARD_COP';
  } else {
    /*
     * 4-judge panel: the Chief's mark fills the vacant fourth evaluation slot,
     * and the panel then runs the 5-judge method unchanged — sort four marks,
     * drop the highest and the lowest, average the middle two.
     *
     * This is a deliberate departure from the archived spec
     * ("Mallakhamb Judging Software v2.md" §4.3, `git show 238ef76:...`), which
     * called for the mean of all three evaluation judges with no drop, on the
     * grounds that three marks are not enough to drop from. The rule was
     * changed on the competition side: a 4-judge panel is to behave exactly
     * like a 5-judge one, with the Sr. Judge counted twice — once here as the
     * fourth evaluator, and again below as the Chief the tolerance is measured
     * against.
     *
     * Two consequences worth knowing when reading a result:
     *   - one genuine evaluation mark is always discarded, because the drop
     *     removes two of the four and only three of them came from evaluators;
     *   - when the Chief's mark is neither the highest nor the lowest it sits
     *     inside the average it is then compared against, which narrows the
     *     gap the tolerance check sees.
     */
    const pool = [...evalScores, seniorJudgeScore].sort((a, b) => a - b);
    middleScores = pool.slice(1, 3);
    method = '4_JUDGE_AS_5_JUDGE_EQUIVALENT';
  }

  avgScore = middleScores.reduce((sum, s) => sum + s, 0) / middleScores.length;

  /*
   * Tolerance check (only for 4/5-judge panels).
   *
   * The tier table is COP §3.4 data and lives in `config/cop-rules`, which is
   * also what `GET /api/public/cop-rules` serves to the judge client. This used
   * to be an if-ladder written out here as well — so the table the server
   * PUBLISHED and the ladder the server SCORED WITH were two separate
   * statements of one rule, and a COP revision applied to the table alone would
   * have changed what the client displayed without changing a single result.
   */
  const tolerance = getTolerance(avgScore);

  const difference = Math.abs(avgScore - seniorJudgeScore);
  let baseScoreApplied = false;
  let averageMarks = avgScore;

  if (difference > tolerance) {
    baseScoreApplied = true;
    averageMarks = (avgScore + seniorJudgeScore) / 2;
  }

  return {
    executionAverage: parseFloat(avgScore.toFixed(3)),
    baseScore: baseScoreApplied ? parseFloat(averageMarks.toFixed(3)) : 0,
    baseScoreApplied,
    toleranceUsed: tolerance,
    averageMarks: parseFloat(averageMarks.toFixed(3)),
    method
  };
}

/*
 * `calculateTeamScore`, `isScoreValid`, `calculateAverageScore` and
 * `aggregateJudgeScores` are gone.
 *
 * None had a caller. `calculateTeamScore` (sum of the top five finals) was
 * reached only from `CalculationService.recalculateAllScores`, itself unused;
 * the other three were imported by that service and never referenced. The live
 * team total is computed in `ScoringService.getTeamScores`, which sums every
 * entered athlete rather than the top five — so restoring the helper without
 * reconciling those two definitions would reintroduce exactly the kind of
 * "two answers to one question" this pass removed.
 */

module.exports = {
  calculateIndividualScore,
};
