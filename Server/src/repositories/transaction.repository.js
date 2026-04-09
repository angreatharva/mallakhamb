/**
 * Transaction Repository
 * 
 * Domain-specific repository for Transaction model.
 * Provides methods for transaction data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Transaction = require('../../models/Transaction');

class TransactionRepository extends BaseRepository {
  /**
   * Create a transaction repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Transaction, logger);
  }

  /**
   * Find transactions by user
   * @param {string} userId - User ID (can be coach, admin, or player)
   * @param {string} userType - User type (coach, admin, player)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of transactions for the user
   */
  async findByUser(userId, userType, options = {}) {
    try {
      const criteria = {};
      
      // Map user type to the appropriate field
      if (userType === 'coach') {
        criteria.coach = userId;
      } else if (userType === 'admin' || userType === 'superadmin') {
        criteria.admin = userId;
      } else if (userType === 'player') {
        criteria.player = userId;
      }

      return await this.find(criteria, { ...options, sort: { createdAt: -1 } });
    } catch (error) {
      this.logger.error('TransactionRepository.findByUser error', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find transactions by status
   * @param {string} status - Payment status (pending, completed, failed)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of transactions with the specified status
   */
  async findByStatus(status, options = {}) {
    try {
      return await this.find({ paymentStatus: status }, options);
    } catch (error) {
      this.logger.error('TransactionRepository.findByStatus error', { 
        status, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find transactions by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of transactions within the date range
   */
  async findByDateRange(startDate, endDate, options = {}) {
    try {
      return await this.find(
        {
          createdAt: {
            $gte: startDate,
            $lte: endDate
          }
        },
        { ...options, sort: { createdAt: -1 } }
      );
    } catch (error) {
      this.logger.error('TransactionRepository.findByDateRange error', { 
        startDate, 
        endDate, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = TransactionRepository;
