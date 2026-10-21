/**
 * WalkInRegistration Repository — the walk-in desk's drafts.
 *
 * @module repositories/walk-in-registration.repository
 */

const BaseRepository = require('./base.repository');
const WalkInRegistration = require('../models/WalkInRegistration');

class WalkInRegistrationRepository extends BaseRepository {
  constructor(logger) {
    super(WalkInRegistration, logger);
  }

  /**
   * Take the submit lock, or return null when another submit holds it. A lock
   * older than `staleMs` is treated as abandoned (the request died).
   */
  async acquireSubmitLock(id, staleMs = 2 * 60 * 1000) {
    const stale = new Date(Date.now() - staleMs);
    return this.model.findOneAndUpdate(
      { _id: id, $or: [{ submitLockedAt: null }, { submitLockedAt: { $lt: stale } }] },
      { $set: { submitLockedAt: new Date() } },
      { new: true }
    ).lean();
  }

  async releaseSubmitLock(id) {
    await this.model.updateOne({ _id: id }, { $set: { submitLockedAt: null } });
  }

  /** Record one row's progress without touching the others. */
  async updateRow(id, rowId, fields) {
    const set = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`rows.$.${key}`, value]));
    await this.model.updateOne({ _id: id, 'rows._id': rowId }, { $set: set });
  }
}

module.exports = WalkInRegistrationRepository;
