/**
 * PlayerTeamConflict Repository — players migration 014 found on two teams at
 * one level, waiting for the Super Admin. See models/PlayerTeamConflict.
 *
 * @module repositories/player-team-conflict.repository
 */

const BaseRepository = require('./base.repository');
const PlayerTeamConflict = require('../models/PlayerTeamConflict');

class PlayerTeamConflictRepository extends BaseRepository {
  constructor(logger) {
    super(PlayerTeamConflict, logger);
  }
}

module.exports = PlayerTeamConflictRepository;
