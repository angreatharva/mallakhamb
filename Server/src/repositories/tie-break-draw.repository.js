/**
 * TieBreakDraw Repository
 *
 * Data access for recorded lucky draws (COP 1.12.4).
 *
 * @module repositories/tie-break-draw.repository
 */

const BaseRepository = require('./base.repository');
const TieBreakDraw = require('../models/TieBreakDraw');
const { toCompetitionTypeSlug } = require('../config/cop-rules');

class TieBreakDrawRepository extends BaseRepository {
  /**
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(TieBreakDraw, logger);
  }

  /**
   * Every draw recorded for one category, every apparatus — the input
   * `rankPlayerRows` takes as `draws`.
   *
   * A draw belongs to one category, so a feed that was not narrowed to one
   * (gender, age group and competition type all given) gets none: its
   * standings mix categories, and no draw describes them.
   *
   * @param {string} competition - competition id
   * @param {{gender?: string, ageGroup?: string, competitionType?: string}} filters
   *   competitionType in either slug or display form
   * @returns {Promise<Array<Object>>} plain objects
   */
  async findForStanding(competition, { gender, ageGroup, competitionType } = {}) {
    if (!competition || !gender || !ageGroup || !competitionType) {
      return [];
    }
    return this.find({
      competition,
      gender,
      ageGroup,
      competitionType: toCompetitionTypeSlug(competitionType)
    });
  }

  /**
   * Create-or-replace the draw for one tie group, atomically — two admins
   * saving at once land on one document rather than a duplicate-key 500.
   *
   * @param {Object} identity - { competition, gender, ageGroup, competitionType, apparatus, groupKey }
   * @param {Object} updates - Fields to $set
   * @returns {Promise<Object>} the stored document as a plain object
   */
  async upsertByIdentity(identity, updates) {
    try {
      return await this.model.findOneAndUpdate(
        identity,
        { $set: updates, $setOnInsert: identity },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).lean().exec();
    } catch (error) {
      this.logger.error('TieBreakDrawRepository.upsertByIdentity error', {
        identity,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove the draw for one tie group.
   *
   * @param {Object} identity
   * @returns {Promise<boolean>} true when a draw was removed
   */
  async deleteByIdentity(identity) {
    try {
      const result = await this.model.deleteOne(identity).exec();
      return result.deletedCount > 0;
    } catch (error) {
      this.logger.error('TieBreakDrawRepository.deleteByIdentity error', {
        identity,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TieBreakDrawRepository;
