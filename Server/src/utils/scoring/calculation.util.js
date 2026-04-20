/**
 * Scoring Calculation Utilities
 * 
 * Provides low-level calculation functions for scoring operations.
 * These utilities are pure functions with no dependencies.
 * 
 * Requirements: 1.5, 1.8
 */

/**
 * Calculate individual player score with base score and tolerance
 * Implements the Mallakhamb scoring algorithm:
 * 1. Remove highest and lowest execution judge scores (outlier removal)
 * 2. Average the remaining middle scores
 * 3. Apply base score if senior judge difference exceeds tolerance
 * 
 * @param {Object} judgeScores - Judge scores object
 * @param {number} judgeScores.seniorJudge - Senior judge score
 * @param {number} judgeScores.judge1 - Execution judge 1 score
 * @param {number} judgeScores.judge2 - Execution judge 2 score
 * @param {number} judgeScores.judge3 - Execution judge 3 score
 * @param {number} judgeScores.judge4 - Execution judge 4 score
 * @returns {Object} Calculation result with executionAverage, baseScore, baseScoreApplied, toleranceUsed, averageMarks
 */
function calculateIndividualScore(judgeScores) {
  if (!judgeScores) {
    return {
      executionAverage: 0,
      baseScore: 0,
      baseScoreApplied: false,
      toleranceUsed: 0,
      averageMarks: 0
    };
  }

  // Extract execution judge scores (judge1-4)
  const executionScores = [
    judgeScores.judge1 || 0,
    judgeScores.judge2 || 0,
    judgeScores.judge3 || 0,
    judgeScores.judge4 || 0
  ].filter(score => score > 0); // Only include scores that have been entered

  // Need at least 2 execution judges for calculation
  if (executionScores.length < 2) {
    return {
      executionAverage: 0,
      baseScore: 0,
      baseScoreApplied: false,
      toleranceUsed: 0,
      averageMarks: 0
    };
  }

  // Sort scores and remove highest and lowest (outlier removal)
  const sortedScores = [...executionScores].sort((a, b) => a - b);
  
  let middleScores;
  if (sortedScores.length === 4) {
    // Remove highest and lowest, keep middle 2
    middleScores = sortedScores.slice(1, 3);
  } else if (sortedScores.length === 3) {
    // Remove highest, keep lowest 2
    middleScores = sortedScores.slice(0, 2);
  } else {
    // Only 2 scores, use both
    middleScores = sortedScores;
  }

  // Calculate execution average from middle scores
  const executionAverage = middleScores.reduce((sum, score) => sum + score, 0) / middleScores.length;

  // Get senior judge score
  const seniorJudgeScore = judgeScores.seniorJudge || 0;

  // Determine tolerance based on execution average
  let tolerance;
  if (executionAverage >= 9.00) tolerance = 0.10;
  else if (executionAverage >= 8.00) tolerance = 0.20;
  else if (executionAverage >= 7.00) tolerance = 0.30;
  else if (executionAverage >= 6.00) tolerance = 0.40;
  else if (executionAverage >= 5.00) tolerance = 0.50;
  else tolerance = 1.00;

  // Check if difference exceeds tolerance
  const difference = Math.abs(executionAverage - seniorJudgeScore);
  let baseScoreApplied = false;
  let averageMarks = executionAverage;

  if (seniorJudgeScore > 0 && difference > tolerance) {
    // Apply base score (average of execution average and senior judge score)
    baseScoreApplied = true;
    averageMarks = (executionAverage + seniorJudgeScore) / 2;
  }

  return {
    executionAverage: parseFloat(executionAverage.toFixed(2)),
    baseScore: baseScoreApplied ? parseFloat(averageMarks.toFixed(2)) : 0,
    baseScoreApplied,
    toleranceUsed: tolerance,
    averageMarks: parseFloat(averageMarks.toFixed(2))
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
