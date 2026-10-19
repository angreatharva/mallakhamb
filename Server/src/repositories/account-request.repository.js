/**
 * Account Request Repository
 *
 * Data access for changes that take more than one request — today an email
 * change waiting for its code (or, for a player with no email, their coach).
 * See models/AccountRequest.
 */

const BaseRepository = require('./base.repository');
const AccountRequest = require('../models/AccountRequest');

class AccountRequestRepository extends BaseRepository {
  /**
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(AccountRequest, logger);
  }

  /**
   * The open request of one kind for an account, if any. Lapsed ones are not
   * open: the caller treats them as absent.
   * @param {string} userId
   * @param {string} userType
   * @param {string} kind
   * @param {Object} [options] - `{ select: '+codeHash' }` to check a code
   * @returns {Promise<Object|null>}
   */
  async findOpen(userId, userType, kind, options = {}) {
    return this.findOne({
      user: userId,
      userType,
      kind,
      status: { $in: AccountRequest.OPEN_STATUSES },
      expiresAt: { $gt: new Date() },
    }, options);
  }

  /**
   * Close every open request of a kind for an account — before opening a new
   * one, so there is never more than one.
   * @returns {Promise<void>}
   */
  async closeOpen(userId, userType, kind, status = 'expired') {
    await this.model.updateMany(
      { user: userId, userType, kind, status: { $in: AccountRequest.OPEN_STATUSES } },
      { $set: { status } }
    );
  }
}

module.exports = AccountRequestRepository;
