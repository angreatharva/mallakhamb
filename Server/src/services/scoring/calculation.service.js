/**
 * Calculation Service
 * 
 * Handles score calculations including averages, rankings,
 * and final score computations.
 * 
 * Requirements: 1.5, 1.8
 */

const { ValidationError } = require('../../errors');
const {
  calculateIndividualScore,
  calculateTeamScore,
  isScoreValid,
  calculateAverageScore,
  aggregateJudgeScores
} = require('../../utils/scoring/calculation.util');
const {
  applyTieBreaker,
  determineTieBreakerWinner
} = require('../../utils/scoring/tie-breaker.util');
const {
  calculateTeamRankings,
  calculateIndividualRankings,
  getTopTeams,
  getTopPlayers
} = require('../../utils/scoring/ranking.util');

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

  /**
   * Calculate final scores for all players in a competition
   * Aggregates judge scores with tolerance checking
   * 
   * @param {Array<Object>} playerScoreData - Array of player score data with judge scores
   * @param {Object} options - Calculation options
   * @returns {Array<Object>} Array of calculated player scores
   */
  calculateFinalScores(playerScoreData, options = {}) {
    try {
      if (!playerScoreData || playerScoreData.length === 0) {
        return [];
      }

      const calculatedScores = playerScoreData.map(playerData => {
        // Calculate individual score with tolerance
        const scoreResult = calculateIndividualScore(playerData.judgeScores);

        // Calculate final score with deductions
        const finalScore = Math.max(
          0,
          scoreResult.averageMarks - (playerData.deduction || 0) - (playerData.otherDeduction || 0)
        );

        return {
          ...playerData,
          ...scoreResult,
          finalScore: parseFloat(finalScore.toFixed(2))
        };
      });

      this.logger.debug('Final scores calculated', {
        playerCount: calculatedScores.length
      });

      return calculatedScores;
    } catch (error) {
      this.logger.error('Calculate final scores error', {
        playerScoreDataCount: playerScoreData?.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Recalculate all scores for a competition
   * Useful when scoring rules change or data needs to be refreshed
   * 
   * @param {Array<Object>} allScores - All score data for the competition
   * @param {Object} options - Calculation options
   * @returns {Object} Recalculated scores with player and team rankings
   */
  recalculateAllScores(allScores, options = {}) {
    try {
      const { competitionType = 'Competition II' } = options;

      // Calculate final scores for all players
      const playerScores = this.calculateFinalScores(allScores, options);

      // Calculate individual rankings
      const rankedPlayers = calculateIndividualRankings(playerScores, competitionType);

      // Group players by team
      const teamGroups = rankedPlayers.reduce((groups, player) => {
        const teamId = player.teamId || player.team;
        if (teamId) {
          if (!groups[teamId]) {
            groups[teamId] = [];
          }
          groups[teamId].push(player);
        }
        return groups;
      }, {});

      // Calculate team scores
      const teamScores = Object.entries(teamGroups).map(([teamId, players]) => {
        const teamScoreResult = calculateTeamScore(players);
        return {
          teamId,
          ...teamScoreResult,
          players
        };
      });

      // Calculate team rankings
      const rankedTeams = calculateTeamRankings(teamScores, competitionType);

      this.logger.info('All scores recalculated', {
        playerCount: rankedPlayers.length,
        teamCount: rankedTeams.length,
        competitionType
      });

      return {
        players: rankedPlayers,
        teams: rankedTeams
      };
    } catch (error) {
      this.logger.error('Recalculate all scores error', {
        allScoresCount: allScores?.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get team rankings with tie-breaker applied
   * 
   * @param {Array<Object>} teams - Array of team objects
   * @param {string} competitionType - Type of competition
   * @returns {Array<Object>} Ranked teams with tie-breaker
   */
  getTeamRankingsWithTieBreaker(teams, competitionType = 'Competition II') {
    try {
      const rankedTeams = calculateTeamRankings(teams, competitionType);

      this.logger.debug('Team rankings with tie-breaker calculated', {
        teamCount: rankedTeams.length,
        competitionType
      });

      return rankedTeams;
    } catch (error) {
      this.logger.error('Get team rankings with tie-breaker error', {
        teamsCount: teams?.length,
        competitionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get individual rankings with tie-breaker applied
   * 
   * @param {Array<Object>} players - Array of player objects
   * @param {string} competitionType - Type of competition
   * @returns {Array<Object>} Ranked players with tie-breaker
   */
  getIndividualRankingsWithTieBreaker(players, competitionType = 'Competition II') {
    try {
      const rankedPlayers = calculateIndividualRankings(players, competitionType);

      this.logger.debug('Individual rankings with tie-breaker calculated', {
        playerCount: rankedPlayers.length,
        competitionType
      });

      return rankedPlayers;
    } catch (error) {
      this.logger.error('Get individual rankings with tie-breaker error', {
        playersCount: players?.length,
        competitionType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get top teams from competition
   * 
   * @param {Array<Object>} rankedTeams - Ranked teams
   * @param {number} n - Number of top teams
   * @returns {Array<Object>} Top N teams
   */
  getTopTeams(rankedTeams, n = 3) {
    try {
      return getTopTeams(rankedTeams, n);
    } catch (error) {
      this.logger.error('Get top teams error', {
        rankedTeamsCount: rankedTeams?.length,
        n,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get top players from competition
   * 
   * @param {Array<Object>} rankedPlayers - Ranked players
   * @param {number} n - Number of top players
   * @returns {Array<Object>} Top N players
   */
  getTopPlayers(rankedPlayers, n = 10) {
    try {
      return getTopPlayers(rankedPlayers, n);
    } catch (error) {
      this.logger.error('Get top players error', {
        rankedPlayersCount: rankedPlayers?.length,
        n,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = CalculationService;
