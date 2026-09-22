/**
 * PerformanceOrder Repository
 *
 * Data access for the per-category running order (lot draw + drag sequence).
 *
 * @module repositories/performance-order.repository
 */

const BaseRepository = require('./base.repository');
const PerformanceOrder = require('../models/PerformanceOrder');

class PerformanceOrderRepository extends BaseRepository {
  /**
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(PerformanceOrder, logger);
  }

  /**
   * Fetch the order document for one category.
   *
   * @param {Object} identity - { competition, gender, ageGroup, competitionType }
   * @returns {Promise<Object|null>} Plain object (BaseRepository uses .lean()), or null
   */
  async findByCategory(identity) {
    return this.findOne(identity);
  }

  /**
   * Create-or-update the order document for one category, atomically.
   *
   * `upsert` rather than read-then-write on purpose: two admins pressing
   * "Draw Lots" simultaneously would otherwise both find nothing, both insert,
   * and one would hit the unique index with a 500. Here the second write lands
   * on the document the first created.
   *
   * @param {Object} identity - { competition, gender, ageGroup, competitionType }
   * @param {Object} updates - Fields to $set
   * @returns {Promise<Object>} The stored document as a plain object
   */
  async upsertByCategory(identity, updates) {
    try {
      const doc = await this.model.findOneAndUpdate(
        identity,
        { $set: updates, $setOnInsert: identity },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean().exec();

      return doc;
    } catch (error) {
      this.logger.error('PerformanceOrderRepository.upsertByCategory error', {
        identity,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = PerformanceOrderRepository;
