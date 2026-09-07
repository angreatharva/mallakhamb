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
  rankByScore,
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

  /*
   * `calculateExecutionAverage` is gone.
   *
   * It averaged the middle two of `[judge1..judge4]` with `|| 0` on each, so a
   * judge who did not sit entered the calculation as a mark of 0.00. On a
   * 3-judge panel scoring 8.5 / 8.6 / 8.4 it returned 8.45 — the phantom zero
   * sorts to the bottom and displaces the real low mark — where the COP answer
   * is 8.50. It also skipped the tolerance check against the Chief entirely.
   *
   * That is the worst shape a scoring bug can take: a believable number
   * produced the wrong way. It had no callers left, but it had an inviting
   * name, and the live path already computes this correctly —
   * `calculateIndividualScore` (utils/scoring/calculation.util), reached
   * through `calculateCompletePlayerScore` below, which selects the method from
   * the panel size and applies the COP tiered tolerance.
   */

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
      // The loop itself is `rankByScore` in utils/scoring/ranking.util — the
      // same standard-competition-ranking logic `calculateTeamRankings` uses.
      // It was written out twice, identically, reading a different property
      // each time.
      const ranked = rankByScore(playerScores, (player) => player.finalScore);

      this.logger.debug('Rankings calculated', {
        // Optional: `rankByScore` accepts null/empty and returns [], which the
        // early return this replaced used to short-circuit before the log.
        playerCount: playerScores?.length ?? 0,
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

  /*
   * `shouldApplyBaseScore` is gone, for the same reason and with the same
   * `|| 0` flaw as `calculateExecutionAverage` above.
   *
   * It answered a different question from the one COP asks. COP §3.4 compares
   * the EXECUTION AVERAGE against the Chief's mark and picks the tolerance from
   * a tiered table keyed on that average (0.10 at 9.00+, rising to 1.00 below
   * 5.00). This compared the raw J1–J4 RANGE against a flat 0.5 and never
   * looked at the Chief at all — so it disagreed with the real rule in both
   * directions, and had no caller to notice.
   *
   * `calculateIndividualScore` (utils/scoring/calculation.util) owns this
   * decision, and `getTolerance` (config/cop-rules) owns the table.
   */

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
   * Get team rankings.
   *
   * Despite the name, no tie-break rule runs here: Team Championship places on
   * the summed team total, and teams level on that total share a placing. The
   * per-panel rules (time, senior judge, panel mean) describe one athlete's
   * performance and have no team-level equivalent.
   *
   * @param {Array<Object>} teams - Array of team objects
   * @param {string} competitionType - Type of competition
   * @returns {Array<Object>} Ranked teams
   */
  getTeamRankingsWithTieBreaker(teams, competitionType = 'Competition II') {
    try {
      const rankedTeams = calculateTeamRankings(teams, competitionType);

      this.logger.debug('Team rankings calculated', {
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
