/**
 * Scoring Utilities for Mallakhamb Competition
 * Handles score calculations, tie-breaking, and ranking logic
 */

/**
 * Calculate score from judge scores using base score and tolerance system
 * @param {Object} judgeScores - Object with seniorJudge, judge1, judge2, judge3, judge4
 * @returns {Object} - Calculation result with averageMarks, baseScore, tolerance, etc.
 */
const calculateScore = (judgeScores) => {
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

  // Sort scores and remove highest and lowest
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
    // Apply base score
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
};

/**
 * Calculate final score with deductions
 * @param {Number} averageMarks - Average marks from judges
 * @param {Number} deduction - Time deduction amount
 * @param {Number} otherDeduction - Other deduction amount
 * @returns {Number} - Final score after deductions
 */
const calculateFinalScore = (averageMarks, deduction = 0, otherDeduction = 0) => {
  const finalScore = averageMarks - deduction - otherDeduction;
  return parseFloat(Math.max(0, finalScore).toFixed(2)); // Ensure non-negative
};

/**
 * Apply tie-breaker logic based on competition type
 * @param {Array} players - Array of player objects with scores
 * @param {String} competitionType - Type of competition ('Competition I' or 'Competition II')
 * @returns {Array} - Ranked players with tie-breaker applied
 */
const applyTieBreaker = (players, competitionType = 'Competition II') => {
  if (!players || players.length === 0) {
    return [];
  }

  // Sort players by final score (descending)
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = a.finalScore || 0;
    const scoreB = b.finalScore || 0;
    
    if (scoreB !== scoreA) {
      return scoreB - scoreA; // Higher score first
    }

    // Tie-breaker logic: lower deduction wins for both competition types
    const deductionA = a.deduction || 0;
    const deductionB = b.deduction || 0;
    
    if (deductionA !== deductionB) {
      return deductionA - deductionB; // Lower deduction wins
    }

    // If still tied, maintain original order
    return 0;
  });

  // Assign ranks with tie handling
  let currentRank = 1;
  let previousScore = null;
  let previousDeduction = null;

  return sortedPlayers.map((player, index) => {
    const currentScore = player.finalScore || 0;
    const currentDeduction = player.deduction || 0;

    // Check if this player has the same score and deduction as previous
    if (
      previousScore !== null &&
      currentScore === previousScore &&
      currentDeduction === previousDeduction
    ) {
      // Same rank as previous player (tie)
    } else {
      // Different score or deduction, update rank
      currentRank = index + 1;
    }

    previousScore = currentScore;
    previousDeduction = currentDeduction;

    return {
      ...player,
      rank: currentRank
    };
  });
};

/**
 * Calculate team scores from individual player scores
 * @param {Array} teamPlayers - Array of players in the team
 * @returns {Object} - Team score details
 */
const calculateTeamScore = (teamPlayers) => {
  if (!teamPlayers || teamPlayers.length === 0) {
    return {
      totalScore: 0,
      averageScore: 0,
      playerCount: 0
    };
  }

  const totalScore = teamPlayers.reduce((sum, player) => {
    return sum + (player.finalScore || 0);
  }, 0);

  const averageScore = totalScore / teamPlayers.length;

  return {
    totalScore: parseFloat(totalScore.toFixed(2)),
    averageScore: parseFloat(averageScore.toFixed(2)),
    playerCount: teamPlayers.length
  };
};

/**
 * Validate judge scores
 * @param {Array} judgeScores - Array of judge score objects
 * @param {Number} minJudges - Minimum number of judges required
 * @param {Number} maxMarks - Maximum marks allowed
 * @returns {Object} - Validation result
 */
const validateJudgeScores = (judgeScores, minJudges = 3, maxMarks = 100) => {
  const errors = [];

  if (!judgeScores || judgeScores.length === 0) {
    errors.push('No judge scores provided');
  } else {
    if (judgeScores.length < minJudges) {
      errors.push(`Minimum ${minJudges} judges required, only ${judgeScores.length} provided`);
    }

    judgeScores.forEach((js, index) => {
      if (typeof js.marks !== 'number') {
        errors.push(`Judge ${index + 1}: Invalid marks type`);
      } else if (js.marks < 0 || js.marks > maxMarks) {
        errors.push(`Judge ${index + 1}: Marks must be between 0 and ${maxMarks}`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  calculateScore,
  calculateFinalScore,
  applyTieBreaker,
  calculateTeamScore,
  validateJudgeScores
};
