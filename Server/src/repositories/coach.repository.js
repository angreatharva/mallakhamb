/**
 * Coach Repository
 * 
 * Domain-specific repository for Coach model.
 * Provides methods for coach data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Coach = require('../../models/Coach');

class CoachRepository extends BaseRepository {
  /**
   * Create a coach repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Coach, logger);
  }

  /**
   * Find coach by email
   * @param {string} email - Coach email
   * @returns {Promise<Object|null>} Coach document or null
   */
  async findByEmail(email) {
    try {
      return await this.findOne({ email: email.toLowerCase() });
    } catch (error) {
      this.logger.error('CoachRepository.findByEmail error', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Find active coaches
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active coaches
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isActive: true }, options);
    } catch (error) {
      this.logger.error('CoachRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if email is already registered
   * @param {string} email - Email to check
   * @param {string} excludeId - Coach ID to exclude from check (optional)
   * @returns {Promise<boolean>} True if email is taken
   */
  async isEmailTaken(email, excludeId = null) {
    try {
      const criteria = { email: email.toLowerCase() };
      if (excludeId) {
        criteria._id = { $ne: excludeId };
      }
      return await this.exists(criteria);
    } catch (error) {
      this.logger.error('CoachRepository.isEmailTaken error', { 
        email, 
        excludeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find coaches with pagination
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} { coaches, total, page, pages }
   */
  async findPaginated(filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const criteria = { ...filters };
      
      const [coaches, total] = await Promise.all([
        this.find(criteria, { skip, limit, sort: { createdAt: -1 } }),
        this.count(criteria)
      ]);
      
      return {
        coaches,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('CoachRepository.findPaginated error', { 
        filters, 
        page, 
        limit, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = CoachRepository;
