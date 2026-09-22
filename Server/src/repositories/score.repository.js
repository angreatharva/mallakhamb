/**
 * Score Repository
 * 
 * Domain-specific repository for Score model.
 * Provides methods for score data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Score = require('../models/Score');

class ScoreRepository extends BaseRepository {
  /**
   * Create a score repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Score, logger);
  }

  /**
   * Find scores by competition
   * @param {string} competitionId - Competition ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of scores for the competition
   */
  async findByCompetition(competitionId, options = {}) {
    try {
      return await this.find({ competition: competitionId }, options);
    } catch (error) {
      this.logger.error('ScoreRepository.findByCompetition error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find scores by player
   * @param {string} playerId - Player ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of scores for the player
   */
  async findByPlayer(playerId, options = {}) {
    try {
      return await this.find(
        { 'playerScores.playerId': playerId },
        options
      );
    } catch (error) {
      this.logger.error('ScoreRepository.findByPlayer error', { 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }

  /*
   * `findByJudge` and `calculateAverages` are gone.
   *
   * `findByJudge` returned [] with a "not fully implemented" warning — a Score
   * document has no judge reference to query, because a judge's contribution
   * lives in `playerScores[].judgeSlips[].judgeRole`, which is a panel SEAT and
   * not an account id. `calculateAverages` averaged an athlete's finalScore
   * across score documents, which is not a figure this competition format has:
   * placings are per apparatus, per category.
   *
   * Neither had a caller anywhere in src, tests or scripts.
   */

}

module.exports = ScoreRepository;
