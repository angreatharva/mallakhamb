/**
 * Judge Repository
 * 
 * Domain-specific repository for Judge model.
 * Provides methods for judge data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Judge = require('../models/Judge');

class JudgeRepository extends BaseRepository {
  /**
   * Create a judge repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Judge, logger);
  }

  /**
   * Find every seat held by a judge account.
   *
   * This replaces `findByUsername`/`findByEmail`, which authenticated against
   * this collection. They are gone rather than deprecated: the username they
   * looked up was generated from the panel slot, so the lookup could return a
   * different person's row, and after migration 007 the field does not exist.
   * Judge login goes through JudgeAccountRepository.
   *
   * @param {string} judgeAccountId
   * @param {Object} options - Query options
   * @returns {Promise<Array>} The judge's assignments
   */
  async findByAccount(judgeAccountId, options = {}) {
    try {
      return await this.find({ judgeAccount: judgeAccountId, isActive: { $ne: false } }, options);
    } catch (error) {
      this.logger.error('JudgeRepository.findByAccount error', {
        judgeAccountId,
        error: error.message,
      });
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
