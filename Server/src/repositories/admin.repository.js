/**
 * Admin Repository
 * 
 * Domain-specific repository for Admin model.
 * Provides methods for admin data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Admin = require('../models/Admin');

class AdminRepository extends BaseRepository {
  /**
   * Create an admin repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Admin, logger);
  }

  /**
   * Find admin by email
   * @param {string} email - Admin email
   * @param {Object} options - Query options. Login passes { select: '+password' },
   *   which is required because `password` is `select: false` on the schema.
   * @returns {Promise<Object|null>} Admin document or null
   */
  async findByEmail(email, options = {}) {
    try {
      return await this.findOne({ email: email.toLowerCase() }, options);
    } catch (error) {
      this.logger.error('AdminRepository.findByEmail error', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Find active admins
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active admins
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isActive: true }, options);
    } catch (error) {
      this.logger.error('AdminRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if email is already registered
   * @param {string} email - Email to check
   * @param {string} excludeId - Admin ID to exclude from check (optional)
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
      this.logger.error('AdminRepository.isEmailTaken error', { 
        email, 
        excludeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find admins by role
   * @param {string} role - Admin role (admin, superadmin)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of admins with the specified role
   */
  async findByRole(role, options = {}) {
    try {
      return await this.find({ role, isActive: true }, options);
    } catch (error) {
      this.logger.error('AdminRepository.findByRole error', { role, error: error.message });
      throw error;
    }
  }

  /**
   * Remove a competition from every admin's assignment list.
   *
   * The other half of deleting a meet: `Competition.isDeleted` is set on the
   * competition, and this clears the back-reference so a soft-deleted meet
   * stops appearing in the admins' scope. Without it an admin keeps an id that
   * resolves to nothing, and `competition-access.util` still counts it.
   *
   * @param {string} competitionId
   * @returns {Promise<number>} Number of admins whose list changed
   */
  async removeCompetitionFromAll(competitionId) {
    try {
      const result = await this.updateMany(
        { competitions: competitionId },
        { $pull: { competitions: competitionId } },
      );
      return result?.modifiedCount ?? 0;
    } catch (error) {
      this.logger.error('AdminRepository.removeCompetitionFromAll error', {
        competitionId,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = AdminRepository;
