/**
 * Calculation Service
 * 
 * Handles score calculations including averages, rankings,
 * and final score computations.
 * 
 * Requirements: 1.5, 1.8
 */

const { ValidationError } = require('../../errors');

class CalculationService {
  /**
   * Create a calculation service
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Calculate execution average from judge scores
   * Removes highest and lowest scores from judges 1-4, then averages the remaining two
   * @param {Object} judgeScores - Judge scores object
   * @returns {number} Execution average
   */
  calculateExecutionAverage(judgeScores) {
    try {
      // Get execution judge scores (judge1 through judge4)
      const executionScores = [
        judgeScores.judge1 || 0,
        judgeScores.judge2 || 0,
        judgeScores.judge3 || 0,
        judgeScores.judge4 || 0
      ];

      // Sort scores
      const sorted = [...executionScores].sort((a, b) => a - b);

      // Remove highest and lowest, average the middle two
      const middle = sorted.slice(1, 3);
      const average = middle.reduce((sum, score) => sum + score, 0) / middle.length;

      this.logger.debug('Execution average calculated', {
        executionScores,
        sorted,
        middle,
        average
      });

      return Number(average.toFixed(2));
    } catch (error) {
      this.logger.error('Calculate execution average error', {
        judgeScores,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate final score for a player
   * Final score = averageMarks - deduction - otherDeduction
   * @param {Object} playerScore - Player score object
   * @returns {number} Final score
   */
  calculateFinalScore(playerScore) {
    try {
      const averageMarks = playerScore.averageMarks || 0;
      const deduction = playerScore.deduction || 0;
      const otherDeduction = playerScore.otherDeduction || 0;

      const finalScore = Math.max(0, averageMarks - deduction - otherDeduction);

      this.logger.debug('Final score calculated', {
        averageMarks,
        deduction,
        otherDeduction,
        finalScore
      });

      return Number(finalScore.toFixed(2));
    } catch (error) {
      this.logger.error('Calculate final score error', {
        playerScore,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate rankings for players based on final scores
   * Handles ties by assigning the same rank
   * @param {Array} playerScores - Array of player score objects
   * @returns {Array} Player scores with rank assigned
   */
  calculateRankings(playerScores) {
    try {
      if (!playerScores || playerScores.length === 0) {
        return [];
      }

      // Sort by final score descending
      const sorted = [...playerScores].sort((a, b) => {
        return (b.finalScore || 0) - (a.finalScore || 0);
      });

      // Assign ranks
      let currentRank = 1;
      let previousScore = null;
      let playersWithSameRank = 0;

      const ranked = sorted.map((player, index) => {
        const score = player.finalScore || 0;

        // If score is different from previous, update rank
        if (previousScore !== null && score !== previousScore) {
          currentRank += playersWithSameRank;
          playersWithSameRank = 1;
        } else {
          playersWithSameRank++;
        }

        previousScore = score;

        return {
          ...player,
          rank: currentRank
        };
      });

      this.logger.debug('Rankings calculated', {
        playerCount: playerScores.length,
        rankedCount: ranked.length
      });

      return ranked;
    } catch (error) {
      this.logger.error('Calculate rankings error', {
        playerScoresCount: playerScores?.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate average score for a player across multiple performances
   * @param {Array} scores - Array of score values
   * @returns {number} Average score
   */
  calculateAverage(scores) {
    try {
      if (!scores || scores.length === 0) {
        return 0;
      }

      const validScores = scores.filter(s => typeof s === 'number' && !isNaN(s));
      
      if (validScores.length === 0) {
        return 0;
      }

      const sum = validScores.reduce((acc, score) => acc + score, 0);
      const average = sum / validScores.length;

      return Number(average.toFixed(2));
    } catch (error) {
      this.logger.error('Calculate average error', {
        scores,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate time deduction based on performance time
   * Deduction applies if time exceeds 90 seconds
   * @param {string|number} time - Time in seconds or "MM:SS" format
   * @param {number} maxTime - Maximum allowed time in seconds (default: 90)
   * @param {number} deductionRate - Deduction per second over limit (default: 0.1)
   * @returns {number} Time deduction
   */
  calculateTimeDeduction(time, maxTime = 90, deductionRate = 0.1) {
    try {
      let timeInSeconds = 0;

      // Parse time
      if (typeof time === 'string') {
        // Handle "MM:SS" format
        const parts = time.split(':');
        if (parts.length === 2) {
          const minutes = parseInt(parts[0], 10);
          const seconds = parseInt(parts[1], 10);
          timeInSeconds = minutes * 60 + seconds;
        } else {
          // Try parsing as number string
          timeInSeconds = parseFloat(time);
        }
      } else if (typeof time === 'number') {
        timeInSeconds = time;
      }

      // Calculate deduction
      if (timeInSeconds > maxTime) {
        const overtime = timeInSeconds - maxTime;
        const deduction = overtime * deductionRate;
        
        this.logger.debug('Time deduction calculated', {
          time,
          timeInSeconds,
          maxTime,
          overtime,
          deduction
        });

        return Number(deduction.toFixed(2));
      }

      return 0;
    } catch (error) {
      this.logger.error('Calculate time deduction error', {
        time,
        maxTime,
        deductionRate,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Check if base score should be applied based on tolerance
   * Base score is used when the difference between highest and lowest execution scores exceeds tolerance
   * @param {Object} judgeScores - Judge scores object
   * @param {number} tolerance - Tolerance threshold (default: 0.5)
   * @returns {Object} { shouldApplyBase: boolean, tolerance: number, range: number }
   */
  shouldApplyBaseScore(judgeScores, tolerance = 0.5) {
    try {
      // Get execution judge scores (judge1 through judge4)
      const executionScores = [
        judgeScores.judge1 || 0,
        judgeScores.judge2 || 0,
        judgeScores.judge3 || 0,
        judgeScores.judge4 || 0
      ];

      const max = Math.max(...executionScores);
      const min = Math.min(...executionScores);
      const range = max - min;

      const shouldApplyBase = range > tolerance;

      this.logger.debug('Base score check', {
        executionScores,
        max,
        min,
        range,
        tolerance,
        shouldApplyBase
      });

      return {
        shouldApplyBase,
        tolerance,
        range
      };
    } catch (error) {
      this.logger.error('Should apply base score error', {
        judgeScores,
        tolerance,
        error: error.message
      });
      return {
        shouldApplyBase: false,
        tolerance,
        range: 0
      };
    }
  }

  /**
   * Calculate complete player score with all components
   * @param {Object} playerScoreData - Player score data
   * @param {Object} options - Calculation options
   * @returns {Object} Complete calculated player score
   */
  calculateCompletePlayerScore(playerScoreData, options = {}) {
    try {
      const {
        tolerance = 0.5,
        maxTime = 90,
        timeDeductionRate = 0.1
      } = options;

      const result = { ...playerScoreData };

      // Calculate execution average
      if (result.judgeScores) {
        result.executionAverage = this.calculateExecutionAverage(result.judgeScores);
      }

      // Check if base score should be applied
      if (result.judgeScores) {
        const baseScoreCheck = this.shouldApplyBaseScore(result.judgeScores, tolerance);
        result.baseScoreApplied = baseScoreCheck.shouldApplyBase;
        result.toleranceUsed = tolerance;

        // Set average marks based on whether base score is applied
        if (result.baseScoreApplied && result.baseScore !== undefined) {
          result.averageMarks = result.baseScore;
        } else {
          result.averageMarks = result.executionAverage || 0;
        }
      }

      // Calculate time deduction if time is provided
      if (result.time) {
        result.deduction = this.calculateTimeDeduction(result.time, maxTime, timeDeductionRate);
      }

      // Calculate final score
      result.finalScore = this.calculateFinalScore(result);

      this.logger.debug('Complete player score calculated', {
        playerId: result.playerId,
        executionAverage: result.executionAverage,
        baseScoreApplied: result.baseScoreApplied,
        averageMarks: result.averageMarks,
        deduction: result.deduction,
        finalScore: result.finalScore
      });

      return result;
    } catch (error) {
      this.logger.error('Calculate complete player score error', {
        playerScoreData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate team total score
   * @param {Array} playerScores - Array of player scores
   * @returns {number} Team total score
   */
  calculateTeamTotal(playerScores) {
    try {
      if (!playerScores || playerScores.length === 0) {
        return 0;
      }

      const total = playerScores.reduce((sum, player) => {
        return sum + (player.finalScore || 0);
      }, 0);

      this.logger.debug('Team total calculated', {
        playerCount: playerScores.length,
        total
      });

      return Number(total.toFixed(2));
    } catch (error) {
      this.logger.error('Calculate team total error', {
        playerScoresCount: playerScores?.length,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = CalculationService;
