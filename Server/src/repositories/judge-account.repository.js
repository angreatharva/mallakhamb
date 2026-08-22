/**
 * Judge Account Repository
 *
 * Domain-specific repository for the JudgeAccount model — the judge as a
 * person, as opposed to JudgeRepository, which serves panel assignments.
 */

const BaseRepository = require('./base.repository');
const JudgeAccount = require('../../models/JudgeAccount');

/** Fields safe to return from the admin's judge search. */
const ASSIGNABLE_FIELDS = '_id name email stateUnit certificationLevel isPlaceholderEmail';

class JudgeAccountRepository extends BaseRepository {
  /**
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(JudgeAccount, logger);
  }

  /**
   * Find a judge account by email.
   * @param {string} email
   * @param {Object} options - Query options. Login passes { select: '+password' },
   *   which is required because `password` is `select: false` on the schema.
   * @returns {Promise<Object|null>}
   */
  async findByEmail(email, options = {}) {
    try {
      return await this.findOne({ email: String(email).toLowerCase() }, options);
    } catch (error) {
      this.logger.error('JudgeAccountRepository.findByEmail error', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Check if an email is already registered.
   * @param {string} email
   * @param {string} [excludeId] - Account to exclude (for profile updates)
   * @returns {Promise<boolean>}
   */
  async isEmailTaken(email, excludeId = null) {
    try {
      const criteria = { email: String(email).toLowerCase() };
      if (excludeId) {
        criteria._id = { $ne: excludeId };
      }
      return await this.exists(criteria);
    } catch (error) {
      this.logger.error('JudgeAccountRepository.isEmailTaken error', {
        email,
        excludeId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Search accounts an admin may put on a panel.
   *
   * Matches name OR email, case-insensitively, anchored at a word start so a
   * three-letter query does not scan the whole collection for substrings.
   * Placeholder-email accounts ARE returned: they are real judges migrated
   * from the old credential rows, and the admin screen shows them with a badge
   * so the address can be corrected.
   *
   * @param {string} query - Free-text search term
   * @param {number} [limit=20]
   * @returns {Promise<Array>}
   */
  async searchAssignable(query, limit = 20) {
    try {
      const term = String(query || '').trim();
      if (term.length < 2) return [];

      // Escape the term: an admin typing "a+b" must not compile to a quantifier.
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|\\s)${escaped}`, 'i');

      return await this.find(
        {
          isActive: true,
          $or: [{ name: pattern }, { email: pattern }],
        },
        { select: ASSIGNABLE_FIELDS, sort: { name: 1 }, limit }
      );
    } catch (error) {
      this.logger.error('JudgeAccountRepository.searchAssignable error', {
        query,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = JudgeAccountRepository;
module.exports.ASSIGNABLE_FIELDS = ASSIGNABLE_FIELDS;
