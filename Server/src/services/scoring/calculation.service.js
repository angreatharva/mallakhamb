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
  calculateIndividualRankingsByApparatus,
  getTopTeams,
  getTopPlayers
} = require('../../utils/scoring/ranking.util');
const {
  TIME_LIMIT_SECONDS,
  getTimeDeduction
} = require('../../config/cop-rules');

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
   * @deprecated The live scoring path now uses calculateIndividualScore
   *   (utils/scoring/calculation.util) via calculateCompletePlayerScore, which
   *   filters unsubmitted judges and applies the COP tiered tolerance. Retained
   *   for backward compatibility only. Note: this method counts missing judges
   *   as 0, which is NOT COP-correct for partial panels.
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
   * The final score: the panel's average, less the deductions the Scorer records.
   *
   *     finalScore = averageMarks − deduction − otherDeduction
   *
   * This used to be `finalScore = averageMarks`, on the reading of COP v2 §2
   * that every deduction is folded into each judge's execution mark. Two things
   * are wrong with that in practice, and both cost real marks:
   *
   *   - the TIME deduction (§3.5) is derived from the stopwatch, not from any
   *     judge's slip. Nobody can fold in a penalty for a routine that has not
   *     finished yet;
   *   - a Senior Judge's ruling that the slip has no field for — a penalty
   *     called after the marks are in — reaches the sheet only through the
   *     Scorer's "other deduction".
   *
   * So the Scorer's sheet is the last word, and what it shows is what gets
   * stored. Before this, the Scorer was shown 8.13 and the database kept 8.633,
   * and the published ranking used the second one.
   *
   * @param {Object} playerScore - with averageMarks, deduction, otherDeduction
   * @returns {number} Final score, never below zero
   */
  calculateFinalScore(playerScore) {
    try {
      const averageMarks = playerScore.averageMarks || 0;
      const deduction = Number(playerScore.deduction) || 0;
      const otherDeduction = Number(playerScore.otherDeduction) || 0;

      const finalScore = Math.max(0, averageMarks - deduction - otherDeduction);

      this.logger.debug('Final score calculated', {
        averageMarks,
        deduction,
        otherDeduction,
        finalScore
      });

      // 3 decimals to preserve COP base scores (e.g. 9.225).
      return Number(finalScore.toFixed(3));
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
   * Calculate time deduction reference — judges apply this within their own
   * Execution score per v2 §3.5. This is NOT a system-level deduction step.
   * Time overage penalty table is shown to judges as reference table only.
   * @param {string|number} time - Time in seconds or "MM:SS" format
   * @param {number} maxTime - Maximum allowed time in seconds (default: 90)
   * @returns {number} Time deduction value (for UI reference)
   */
  calculateTimeDeduction(time, maxTime = TIME_LIMIT_SECONDS) {
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

      const overtime = timeInSeconds - maxTime;
      const deduction = getTimeDeduction(overtime);

      if (deduction > 0) {
        this.logger.debug('Time deduction calculated', {
          time,
          timeInSeconds,
          maxTime,
          overtime,
          deduction
        });
      }

      return deduction;
    } catch (error) {
      this.logger.error('Calculate time deduction error', {
        time,
        maxTime,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Check if base score should be applied based on tolerance
   * Base score is used when the difference between highest and lowest execution scores exceeds tolerance
   * @deprecated Superseded by the COP tiered-tolerance logic in
   *   calculateIndividualScore (utils/scoring/calculation.util), which compares
   *   the execution average against the Senior (Chief) judge — not the raw J1–J4
   *   range against a flat 0.5. Retained for backward compatibility only.
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
      const { maxTime = TIME_LIMIT_SECONDS } = options;

      const result = { ...playerScoreData };

      // COP §2.1.3 / §3.4 — aggregate the 4+1 panel: drop the highest and lowest
      // of the 4 execution judges, average the middle two, then apply the tiered
      // tolerance check against the Senior (Chief) judge. When the Chief's slip
      // differs from the execution average by more than the allowed tolerance,
      // the base score = (executionAverage + chief) / 2 is used instead.
      // Single source of truth: calculateIndividualScore (utils/scoring).
      if (result.judgeScores) {
        const cop = calculateIndividualScore(
          result.judgeScores,
          result.panelSize || options.panelSize
        );
        result.executionAverage = cop.executionAverage;
        result.baseScore = cop.baseScore;
        result.baseScoreApplied = cop.baseScoreApplied;
        result.toleranceUsed = cop.toleranceUsed;
        result.averageMarks = cop.averageMarks;
      }

      // Calculate time deduction reference (for UI display only; v2 §3.5 says judges apply it)
      if (result.time) {
        result.deductionReference = this.calculateTimeDeduction(result.time, maxTime);
      }

      // Calculate final score (v2 §2: all deductions folded into judge's Execution score)
      const computedFinal = this.calculateFinalScore(result);
      // Prefer a positive client-provided final when recalculation still yields 0
      // (guards incomplete panel-size inference during finalize).
      if (computedFinal > 0) {
        result.finalScore = computedFinal;
      } else if (typeof playerScoreData.finalScore === 'number' && playerScoreData.finalScore > 0) {
        /*
         * Rounded like every other branch.
         *
         * This one took the client's number verbatim, and the client computes
         * it as `average - deduction` in binary floating point — so a value
         * like 9.200000000000001 would be stored exactly as sent.
         *
         * Not the cause of the artifacts seen in the seeded meet (those came
         * from the merge in scoring.service.saveScores, which had the same gap),
         * but the same hole in a less-travelled branch.
         */
        result.finalScore = Number(playerScoreData.finalScore.toFixed(3));
        if (!result.averageMarks) result.averageMarks = result.finalScore;
      } else {
        result.finalScore = computedFinal;
      }

      this.logger.debug('Complete player score calculated (v2)', {
        playerId: result.playerId,
        executionAverage: result.executionAverage,
        baseScoreApplied: result.baseScoreApplied,
        averageMarks: result.averageMarks,
        deductionReference: result.deductionReference,
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

        // The Scorer's deductions are part of the final score — see
        // calculateFinalScore for why the time penalty cannot come off a slip.
        const finalScore = Math.max(
          0,
          scoreResult.averageMarks
            - (Number(playerData.deduction) || 0)
            - (Number(playerData.otherDeduction) || 0)
        );

        return {
          ...playerData,
          ...scoreResult,
          finalScore: parseFloat(finalScore.toFixed(3))
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

      // Individual rankings, one standing per apparatus — Pole competes
      // against Pole, Rope against Rope. An athlete entered for several holds
      // a rank in each.
      const rankedPlayers = calculateIndividualRankingsByApparatus(playerScores, competitionType);

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
      // Per apparatus, for the reason given at the other call site: Pole and
      // Rope are different events and do not share a standing.
      const rankedPlayers = calculateIndividualRankingsByApparatus(players, competitionType);

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
