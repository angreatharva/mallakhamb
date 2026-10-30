/**
 * One final's qualifiers: who moved from Competition I into a Competition II or
 * III final (docs/qualification-plan.md). Written only by
 * services/scoring/qualification.service.
 *
 *  - Competition III: one document per gender × age group × apparatus.
 *  - Competition II: one document per gender, age group `AllAges`, with a
 *    `slices` entry per age group (each age group's top two join as soon as
 *    that age group's Competition I is locked).
 *
 * `frozenAt` is set the moment the final's first score exists: after that a
 * Competition I correction no longer changes the list, it only sets
 * `staleSince` so the admin is warned.
 *
 * @module models/Qualification
 */

const mongoose = require('mongoose');
const { CATEGORY_AGE_GROUPS, AGE_GROUPS, GENDERS, APPARATUS } = require('../config/cop-rules');

const person = {
  _id: false,
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  playerName: { type: String, default: '' },
  rank: { type: Number, default: null },
  score: { type: Number, default: null },
  sourceAgeGroup: { type: String, enum: [...AGE_GROUPS, null], default: null },
};

const qualificationSchema = new mongoose.Schema({
  competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
  competitionType: { type: String, enum: ['competition_2', 'competition_3'], required: true },
  gender: { type: String, enum: GENDERS, required: true },
  ageGroup: { type: String, enum: CATEGORY_AGE_GROUPS, required: true },
  apparatus: { type: String, enum: [...APPARATUS, null], default: null },

  status: { type: String, enum: ['waiting', 'waiting_draw', 'set'], default: 'waiting' },
  qualifiers: [{ ...person, replacement: { type: Boolean, default: false } }],
  tied: [person],
  skipped: [{ ...person, reason: { type: String, enum: ['team_cap', 'withdrawn'], required: true } }],
  /** Competition II: each age group's part of the final. */
  slices: [{
    _id: false,
    ageGroup: { type: String, enum: AGE_GROUPS, required: true },
    status: { type: String, enum: ['waiting', 'waiting_draw', 'set'], default: 'waiting' },
    waitingFor: [String],
  }],
  waitingFor: [String],
  withdrawn: [{
    _id: false,
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: { type: String, default: '' },
  }],
  /** Competition II only: a tie the rules cannot break, drawn by the admin. */
  drawOrders: [{
    _id: false,
    ageGroup: { type: String, enum: AGE_GROUPS, required: true },
    order: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    by: { type: mongoose.Schema.Types.ObjectId, default: null },
    at: { type: Date, default: Date.now },
  }],
  computedAt: { type: Date, default: null },
  /** Entered only once an Admin or Super Admin finalizes it (owner, 2026-10-30). */
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  frozenAt: { type: Date, default: null },
  staleSince: { type: Date, default: null },
  staleNote: { type: String, default: '' },
}, { timestamps: true });

qualificationSchema.index(
  { competition: 1, competitionType: 1, gender: 1, ageGroup: 1, apparatus: 1 },
  { unique: true }
);
qualificationSchema.index({ 'qualifiers.player': 1 });

module.exports = mongoose.model('Qualification', qualificationSchema);
