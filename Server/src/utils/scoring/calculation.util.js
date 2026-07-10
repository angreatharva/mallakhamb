/**
 * Scoring Calculation Utilities
 *
 * Provides low-level calculation functions for scoring operations.
 * These utilities are pure functions with no dependencies.
 *
 * Requirements: 1.5, 1.8, v2 spec additions
 */

/**
 * Calculate individual player score with base score and tolerance
 * Implements the Mallakhamb scoring algorithm per v2 spec:
 * - Panel size determines the entire scoring path (Section 4)
 * - 3-judge: simple average, no Chief Judge, no tolerance/base-score
 * - 4-judge: Sr. Judge=Chief, average all 3 eval judges (no high/low drop)
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

  // 3-judge panel: simple average of all 3 totals (no Chief, no high/low drop)
  if (panelSize === 3) {
    const evalScores = [
      judgeScores.judge1 || 0,
      judgeScores.judge2 || 0,
      judgeScores.judge3 || 0
    ].filter(s => s > 0);
    if (evalScores.length < 3) return { executionAverage: 0, baseScore: 0, baseScoreApplied: false, toleranceUsed: 0, averageMarks: 0, method: null };
    const avgScore = evalScores.reduce((sum, s) => sum + s, 0) / evalScores.length;
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
  const sortedScores = [...evalScores].sort((a, b) => a - b);

  if (is5JudgePanel) {
    // Standard 5-judge COP: drop high/low of 4 eval judges, average middle two
    if (sortedScores.length !== 4) {
      return { executionAverage: 0, baseScore: 0, baseScoreApplied: false, toleranceUsed: 0, averageMarks: 0, method: null };
    }
    middleScores = sortedScores.slice(1, 3);
    method = '5_JUDGE_STANDARD_COP';
  } else {
    // 4-judge panel: average all 3 eval judges (no drop)
    middleScores = sortedScores;
    method = '4_JUDGE_AS_5_JUDGE_EQUIVALENT';
  }

  avgScore = middleScores.reduce((sum, s) => sum + s, 0) / middleScores.length;

  // Tolerance check (only for 4/5-judge panels)
  let tolerance;
  if (avgScore >= 9.00) tolerance = 0.10;
  else if (avgScore >= 8.00) tolerance = 0.20;
  else if (avgScore >= 7.00) tolerance = 0.30;
  else if (avgScore >= 6.00) tolerance = 0.40;
  else if (avgScore >= 5.00) tolerance = 0.50;
  else tolerance = 1.00;

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

/**
 * Calculate team score from player scores
 * Team score is the sum of the top 5 player scores
 * 
 * @param {Array<Object>} playerScores - Array of player score objects with finalScore property
 * @returns {Object} Team score details with totalScore, topPlayersCount, allPlayersCount
 */
function calculateTeamScore(playerScores) {
  if (!playerScores || playerScores.length === 0) {
    return {
      totalScore: 0,
      topPlayersCount: 0,
      allPlayersCount: 0
    };
  }

  // Sort players by final score descending
  const sortedPlayers = [...playerScores]
    .filter(player => typeof player.finalScore === 'number')
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

  // Take top 5 players
  const topPlayers = sortedPlayers.slice(0, 5);

  // Calculate total score
  const totalScore = topPlayers.reduce((sum, player) => sum + (player.finalScore || 0), 0);

  return {
    totalScore: parseFloat(totalScore.toFixed(2)),
    topPlayersCount: topPlayers.length,
    allPlayersCount: playerScores.length
  };
}

/**
 * Check if a score is valid based on tolerance
 * Validates that the difference between execution average and senior judge score is within tolerance
 * 
 * @param {number} executionAverage - Execution average score
 * @param {number} seniorJudgeScore - Senior judge score
 * @param {number} tolerance - Tolerance threshold
 * @returns {boolean} True if score is valid (within tolerance)
 */
function isScoreValid(executionAverage, seniorJudgeScore, tolerance) {
  if (typeof executionAverage !== 'number' || typeof seniorJudgeScore !== 'number') {
    return false;
  }

  if (seniorJudgeScore === 0) {
    return true; // No senior judge score to validate against
  }

  const difference = Math.abs(executionAverage - seniorJudgeScore);
  return difference <= tolerance;
}

/**
 * Calculate average score from an array of scores
 * 
 * @param {Array<number>} scores - Array of score values
 * @returns {number} Average score
 */
function calculateAverageScore(scores) {
  if (!scores || scores.length === 0) {
    return 0;
  }

  const validScores = scores.filter(score => typeof score === 'number' && !isNaN(score));
  
  if (validScores.length === 0) {
    return 0;
  }

  const sum = validScores.reduce((acc, score) => acc + score, 0);
  const average = sum / validScores.length;

  return parseFloat(average.toFixed(2));
}

/**
 * Aggregate judge scores into a single score object
 * Combines multiple judge score entries into a unified format
 * 
 * @param {Array<Object>} judgeScoreEntries - Array of judge score entries
 * @returns {Object} Aggregated judge scores with seniorJudge, judge1, judge2, judge3, judge4
 */
function aggregateJudgeScores(judgeScoreEntries) {
  if (!judgeScoreEntries || judgeScoreEntries.length === 0) {
    return {
      seniorJudge: 0,
      judge1: 0,
      judge2: 0,
      judge3: 0,
      judge4: 0
    };
  }

  const aggregated = {
    seniorJudge: 0,
    judge1: 0,
    judge2: 0,
    judge3: 0,
    judge4: 0
  };

  // Aggregate scores by judge role
  judgeScoreEntries.forEach(entry => {
    if (entry.judgeRole && typeof entry.score === 'number') {
      const role = entry.judgeRole.toLowerCase();
      
      if (role === 'senior' || role === 'seniorjudge') {
        aggregated.seniorJudge = entry.score;
      } else if (role === 'judge1') {
        aggregated.judge1 = entry.score;
      } else if (role === 'judge2') {
        aggregated.judge2 = entry.score;
      } else if (role === 'judge3') {
        aggregated.judge3 = entry.score;
      } else if (role === 'judge4') {
        aggregated.judge4 = entry.score;
      }
    }
  });

  return aggregated;
}

module.exports = {
  calculateIndividualScore,
  calculateTeamScore,
  isScoreValid,
  calculateAverageScore,
  aggregateJudgeScores
};
