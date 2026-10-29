/**
 * Qualification Repository — the finals' qualifier lists.
 * @module repositories/qualification.repository
 */

const BaseRepository = require('./base.repository');
const Qualification = require('../models/Qualification');

class QualificationRepository extends BaseRepository {
  constructor(logger) {
    super(Qualification, logger);
  }

  /** Create or replace one final's document, by its identity. */
  async upsertFinal(identity, fields) {
    return this.model.findOneAndUpdate(identity, { $set: { ...identity, ...fields } }, { new: true, upsert: true }).lean();
  }
}

module.exports = QualificationRepository;
