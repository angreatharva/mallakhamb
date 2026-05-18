/**
 * Tie-Breaker Utilities
 * 
 * Provides tie-breaking logic for Mallakhamb competitions.
 * Competition I: Higher individual score wins
 * Competition II: Lower deduction wins
 * 
 * Requirements: 1.5, 1.8
 */

/**
 * Apply tie-breaker logic based on competition type
 * 
 * Competition I: If scores are tied, the player with the higher individual score wins
 * Competition II: If scores are tied, the player with the lower deduction wins
 * 
 * @param {Array<Object>} players - Array of player objects with finalScore, individualScore, deduction
 * @param {string} competitionType - Type of competition ('Competition I' or 'Competition II')
 * @returns {Array<Object>} Players sorted with tie-breaker applied
 */
function applyTieBreaker(players, competitionType = 'Competition II') {
  if (!players || players.length === 0) {
    return [];
  }

  const isCompetitionI = competitionType === 'Competition I';

  // Sort players with tie-breaker logic
  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = a.finalScore || 0;
    const scoreB = b.finalScore || 0;
    
    // Primary sort: Higher final score wins
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // Tie-breaker logic
    if (isCompetitionI) {
      // Competition I: Higher individual score wins
      const individualA = a.individualScore || a.averageMarks || 0;
      const individualB = b.individualScore || b.averageMarks || 0;
      
      if (individualB !== individualA) {
        return individualB - individualA; // Higher wins
      }
    } else {
      // Competition II: Lower deduction wins
      const deductionA = a.deduction || 0;
      const deductionB = b.deduction || 0;
      
      if (deductionA !== deductionB) {
        return deductionA - deductionB; // Lower wins
      }
    }

    // If still tied, maintain original order
    return 0;
  });

  return sortedPlayers;
}

/**
 * Compare individual scores for Competition I tie-breaker
 * Higher individual score wins
 * 
 * @param {Object} playerA - First player object
 * @param {Object} playerB - Second player object
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareIndividualScores(playerA, playerB) {
  const scoreA = playerA.individualScore || playerA.averageMarks || 0;
  const scoreB = playerB.individualScore || playerB.averageMarks || 0;

  if (scoreB > scoreA) return 1;  // B wins
  if (scoreB < scoreA) return -1; // A wins
  return 0; // Tie
}

/**
 * Compare deductions for Competition II tie-breaker
 * Lower deduction wins
 * 
 * @param {Object} playerA - First player object
 * @param {Object} playerB - Second player object
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareDeductions(playerA, playerB) {
  const deductionA = playerA.deduction || 0;
  const deductionB = playerB.deduction || 0;

  if (deductionA < deductionB) return -1; // A wins (lower deduction)
  if (deductionA > deductionB) return 1;  // B wins (lower deduction)
  return 0; // Tie
}

/**
 * Determine tie-breaker winner between two players
 * 
 * @param {Object} playerA - First player object
 * @param {Object} playerB - Second player object
 * @param {string} competitionType - Type of competition ('Competition I' or 'Competition II')
 * @returns {Object} Winner object with winner ('A', 'B', or 'tie') and reason
 */
function determineTieBreakerWinner(playerA, playerB, competitionType = 'Competition II') {
  const scoreA = playerA.finalScore || 0;
  const scoreB = playerB.finalScore || 0;

  // Check if scores are actually tied
  if (scoreA !== scoreB) {
    return {
      winner: scoreA > scoreB ? 'A' : 'B',
      reason: 'higher_final_score',
      isTieBreaker: false
    };
  }

  // Apply tie-breaker
  const isCompetitionI = competitionType === 'Competition I';

  if (isCompetitionI) {
    // Competition I: Higher individual score wins
    const comparison = compareIndividualScores(playerA, playerB);
    
    if (comparison < 0) {
      return {
        winner: 'A',
        reason: 'higher_individual_score',
        isTieBreaker: true
      };
    } else if (comparison > 0) {
      return {
        winner: 'B',
        reason: 'higher_individual_score',
        isTieBreaker: true
      };
    }
  } else {
    // Competition II: Lower deduction wins
    const comparison = compareDeductions(playerA, playerB);
    
    if (comparison < 0) {
      return {
        winner: 'A',
        reason: 'lower_deduction',
        isTieBreaker: true
      };
    } else if (comparison > 0) {
      return {
        winner: 'B',
        reason: 'lower_deduction',
        isTieBreaker: true
      };
    }
  }

  // Still tied after tie-breaker
  return {
    winner: 'tie',
    reason: 'exact_tie',
    isTieBreaker: true
  };
}

/**
 * Check if two players are tied
 * 
 * @param {Object} playerA - First player object
 * @param {Object} playerB - Second player object
 * @param {string} competitionType - Type of competition
 * @returns {boolean} True if players are tied after tie-breaker
 */
function areTied(playerA, playerB, competitionType = 'Competition II') {
  const result = determineTieBreakerWinner(playerA, playerB, competitionType);
  return result.winner === 'tie';
}

module.exports = {
  applyTieBreaker,
  compareIndividualScores,
  compareDeductions,
  determineTieBreakerWinner,
  areTied
};
