/**
 * Judge Account Repository
 *
 * Domain-specific repository for the JudgeAccount model — the judge as a
 * person, as opposed to JudgeRepository, which serves panel assignments.
 */

const BaseRepository = require('./base.repository');
const JudgeAccount = require('../models/JudgeAccount');
const { fullName } = require('../utils/data/user-projection.util');

/**
 * Fields safe to return from the admin's judge search.
 *
 * `name` used to be in this list and is not a path on JudgeAccount — migration
 * 006 split it into `firstName`/`lastName`. The picker in AdminJudges.jsx still
 * renders `judge.name`, so it is composed from the two halves below rather than
 * selected.
 */
const ASSIGNABLE_FIELDS = '_id firstName lastName email stateUnit certificationLevel';

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
   * Matches first name, last name or e-mail, case-insensitively, anchored at a
   * word start so a two-letter query does not scan the whole collection for
   * substrings.
   *
   * It used to match `{ name: pattern }` — a field that has not existed since
   * migration 006 split it — so in practice only the e-mail branch ever fired.
   * Searching a judge's actual name returned nothing, and since admins cannot
   * create judge logins, this search is the ONLY way a panel seat gets filled:
   * the seat looked unfillable unless the admin happened to know the address.
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

      const accounts = await this.find(
        {
          isActive: true,
          $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }],
        },
        // Sorted by the halves that exist. `{ name: 1 }` sorted on the same
        // missing field, so results came back in natural order.
        { select: ASSIGNABLE_FIELDS, sort: { lastName: 1, firstName: 1 }, limit }
      );

      // The admin picker renders `judge.name`; compose it rather than making
      // every consumer join the halves. `.lean()` results carry no virtuals,
      // which is why this is a map and not a schema virtual.
      return accounts.map((account) => ({ ...account, name: fullName(account) }));
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
