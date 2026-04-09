/**
 * Player Repository
 * 
 * Domain-specific repository for Player model.
 * Provides methods for player data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5, 16.3
 */

const BaseRepository = require('./base.repository');
const Player = require('../../models/Player');

class PlayerRepository extends BaseRepository {
  /**
   * Create a player repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Player, logger);
  }

  /**
   * Find player by email
   * @param {string} email - Player email
   * @returns {Promise<Object|null>} Player document or null
   */
  async findByEmail(email) {
    try {
      return await this.findOne({ email: email.toLowerCase() });
    } catch (error) {
      this.logger.error('PlayerRepository.findByEmail error', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Find active players
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active players
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isActive: true }, options);
    } catch (error) {
      this.logger.error('PlayerRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find players by team
   * @param {string} teamId - Team ID
   * @returns {Promise<Array>} Array of players in the team
   */
  async findByTeam(teamId) {
    try {
      return await this.find({ team: teamId, isActive: true });
    } catch (error) {
      this.logger.error('PlayerRepository.findByTeam error', { teamId, error: error.message });
      throw error;
    }
  }

  /**
   * Find players by age group and gender
   * @param {string} ageGroup - Age group (Under10, Under12, etc.)
   * @param {string} gender - Gender (Male, Female)
   * @returns {Promise<Array>} Array of players matching criteria
   */
  async findByAgeGroupAndGender(ageGroup, gender) {
    try {
      return await this.find({ ageGroup, gender, isActive: true });
    } catch (error) {
      this.logger.error('PlayerRepository.findByAgeGroupAndGender error', { 
        ageGroup, 
        gender, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update player team
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID (or null to remove from team)
   * @returns {Promise<Object|null>} Updated player document
   */
  async updateTeam(playerId, teamId) {
    try {
      return await this.updateById(playerId, { team: teamId });
    } catch (error) {
      this.logger.error('PlayerRepository.updateTeam error', { 
        playerId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if email is already registered
   * @param {string} email - Email to check
   * @param {string} excludeId - Player ID to exclude from check (optional)
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
      this.logger.error('PlayerRepository.isEmailTaken error', { 
        email, 
        excludeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find players with pagination
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} { players, total, page, pages }
   */
  async findPaginated(filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;
      const criteria = { ...filters };
      
      const [players, total] = await Promise.all([
        this.find(criteria, { skip, limit, sort: { createdAt: -1 } }),
        this.count(criteria)
      ]);
      
      return {
        players,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('PlayerRepository.findPaginated error', { 
        filters, 
        page, 
        limit, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = PlayerRepository;
