/**
 * Score Repository
 * 
 * Domain-specific repository for Score model.
 * Provides methods for score data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Score = require('../../models/Score');

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

  /**
   * Find scores by judge
   * @param {string} judgeId - Judge ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of scores entered by the judge
   */
  async findByJudge(judgeId, options = {}) {
    try {
      // Note: The Score model doesn't have a direct judge reference
      // This method would need to be implemented based on how judges are tracked
      // For now, we'll return an empty array as a placeholder
      this.logger.warn('ScoreRepository.findByJudge not fully implemented', { judgeId });
      return [];
    } catch (error) {
      this.logger.error('ScoreRepository.findByJudge error', { 
        judgeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Calculate average scores for a competition
   * @param {string} competitionId - Competition ID
   * @param {Object} filters - Additional filters (gender, ageGroup, competitionType)
   * @returns {Promise<Array>} Array of average scores by player
   */
  async calculateAverages(competitionId, filters = {}) {
    try {
      const criteria = { competition: competitionId, ...filters };
      const scores = await this.find(criteria);

      // Calculate averages per player
      const playerAverages = new Map();

      scores.forEach(scoreDoc => {
        scoreDoc.playerScores.forEach(ps => {
          const playerId = ps.playerId.toString();
          
          if (!playerAverages.has(playerId)) {
            playerAverages.set(playerId, {
              playerId: ps.playerId,
              playerName: ps.playerName,
              scores: [],
              totalScore: 0,
              count: 0
            });
          }

          const playerData = playerAverages.get(playerId);
          playerData.scores.push(ps.finalScore);
          playerData.totalScore += ps.finalScore;
          playerData.count += 1;
        });
      });

      // Calculate averages
      const results = Array.from(playerAverages.values()).map(data => ({
        playerId: data.playerId,
        playerName: data.playerName,
        averageScore: data.count > 0 ? data.totalScore / data.count : 0,
        totalScore: data.totalScore,
        scoreCount: data.count
      }));

      // Sort by average score descending
      results.sort((a, b) => b.averageScore - a.averageScore);

      return results;
    } catch (error) {
      this.logger.error('ScoreRepository.calculateAverages error', { 
        competitionId, 
        filters, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = ScoreRepository;
