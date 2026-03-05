/**
 * Scoring Utilities for Mallakhamb Competition
 * Handles score calculations, tie-breaking, and ranking logic
 */

/**
 * Calculate score from judge scores
 * @param {Array} judgeScores - Array of judge score objects
 * @returns {Object} - Calculation result with averageMarks and other details
 */
const calculateScore = (judgeScores) => {
  if (!judgeScores || judgeScores.length === 0) {
    return {
      averageMarks: 0,
      totalMarks: 0,
      judgeCount: 0,
      scores: []
    };
  }

  // Extract marks from judge scores
  const marks = judgeScores.map(js => js.marks || 0);
  
  // Calculate total and average
  const totalMarks = marks.reduce((sum, mark) => sum + mark, 0);
  const averageMarks = marks.length > 0 ? totalMarks / marks.length : 0;

  return {
    averageMarks: parseFloat(averageMarks.toFixed(2)),
    totalMarks: parseFloat(totalMarks.toFixed(2)),
    judgeCount: marks.length,
    scores: marks
  };
};

/**
 * Calculate final score with deductions
 * @param {Number} averageMarks - Average marks from judges
 * @param {Number} deduction - Deduction amount
 * @returns {Number} - Final score after deduction
 */
const calculateFinalScore = (averageMarks, deduction = 0) => {
  const finalScore = averageMarks - deduction;
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
