/**
 * Judge Repository
 * 
 * Domain-specific repository for Judge model.
 * Provides methods for judge data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Judge = require('../../models/Judge');

class JudgeRepository extends BaseRepository {
  /**
   * Create a judge repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Judge, logger);
  }

  /**
   * Find judge by email (username). Prefers active accounts when duplicates exist.
   * @param {string} email - Judge username/email
   * @returns {Promise<Object|null>} Judge document or null
   */
  async findByEmail(email) {
    return this.findByUsername(email);
  }

  /**
   * Find judge by username (case-insensitive).
   * Prefers an active account when the same username exists across competitions.
   * @param {string} username - Judge username
   * @returns {Promise<Object|null>} Judge document or null
   */
  async findByUsername(username) {
    try {
      const normalized = username.toLowerCase();
      const activeMatches = await this.find(
        { username: normalized, isActive: true },
        { sort: { updatedAt: -1, createdAt: -1 }, limit: 1 }
      );
      if (activeMatches?.length) {
        return activeMatches[0];
      }
      return await this.findOne({ username: normalized });
    } catch (error) {
      this.logger.error('JudgeRepository.findByUsername error', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Find active judges
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active judges
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isActive: true }, options);
    } catch (error) {
      this.logger.error('JudgeRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find judges by competition
   * @param {string} competitionId - Competition ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of judges for the competition
   */
  async findByCompetition(competitionId, options = {}) {
    try {
      return await this.find({ competition: competitionId }, options);
    } catch (error) {
      this.logger.error('JudgeRepository.findByCompetition error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = JudgeRepository;
