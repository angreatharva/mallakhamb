/**
 * A player found on two (or more) teams at ONE competition level when the
 * team-per-level rule was introduced (migration 014). The rule says a team is
 * final per level, so one of them has to go — and only a person can say which.
 * Nothing is guessed: the player is left with no team at that level until the
 * Super Admin resolves the conflict.
 *
 * @module models/PlayerTeamConflict
 */

const mongoose = require('mongoose');
const { COMPETITION_LEVELS } = require('../config/competition-levels');

const playerTeamConflictSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  level: { type: String, enum: COMPETITION_LEVELS, required: true },
  /** Every team that entered the player at this level, with the meets it did so in. */
  teams: [{
    _id: false,
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    competitions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competition' }],
    firstEnteredAt: { type: Date, default: null },
  }],
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  resolvedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
}, { timestamps: true });

playerTeamConflictSchema.index({ player: 1, level: 1 }, { unique: true });
playerTeamConflictSchema.index({ resolved: 1, level: 1 });

module.exports = mongoose.model('PlayerTeamConflict', playerTeamConflictSchema);
