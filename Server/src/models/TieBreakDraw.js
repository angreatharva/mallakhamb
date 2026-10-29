const mongoose = require('mongoose');
const { CATEGORY_AGE_GROUPS, GENDERS } = require('../config/cop-rules');

/**
 * TieBreakDraw Model
 *
 * The result of a physical lucky draw (COP Mallakhamb 1.12.4, and the 3-judge
 * "same time" rule) for ONE group of tied athletes in ONE standing.
 *
 * The draw itself happens at the venue; the admin records the order it gave.
 * The ranking engine (utils/scoring/tie-breaker.util.js) places the group in
 * `order` — but only while the rules still cannot separate exactly these
 * athletes. `groupKey` is the sorted, comma-joined player ids of the group;
 * if a score changes and the group changes, no draw matches the new key and
 * the board asks for a new draw.
 *
 * Identity is (competition, gender, ageGroup, competitionType, apparatus,
 * groupKey). One standing can hold several tie groups (level at 3rd and
 * level at 7th), each with its own draw. Recording again for the same group
 * replaces the earlier result.
 *
 * `competitionType` is stored in SLUG form (`competition_1`), as in
 * PerformanceOrder.
 */

const tieBreakDrawSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: [true, 'Competition is required']
  },
  gender: {
    type: String,
    enum: GENDERS,
    required: [true, 'Gender is required']
  },
  ageGroup: {
    type: String,
    enum: CATEGORY_AGE_GROUPS,
    required: [true, 'Age group is required']
  },
  competitionType: {
    type: String,
    enum: ['competition_1', 'competition_2', 'competition_3'],
    required: [true, 'Competition type is required']
  },
  apparatus: {
    type: String,
    enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'],
    required: [true, 'Apparatus is required']
  },
  groupKey: {
    type: String,
    required: true
  },
  // The drawn order, first place first.
  order: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  }],
  // The score the group was level on when the draw was recorded (audit only).
  tiedScore: { type: Number, default: null },
  notes: { type: String, default: '', maxlength: 500 },

  // ── Audit ──────────────────────────────────────────────────────────────
  // Un-ref'd for the same reason as PerformanceOrder.updatedBy: an Admin or a
  // SuperAdmin records it, and nothing populates it.
  recordedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  recordedByName: { type: String, default: '' },
  recordedByRole: { type: String, default: '' },
  recordedAt: { type: Date, default: null }
}, {
  timestamps: true
});

tieBreakDrawSchema.index(
  { competition: 1, gender: 1, ageGroup: 1, competitionType: 1, apparatus: 1, groupKey: 1 },
  { unique: true, name: 'tie_break_draw_identity_unique' }
);

module.exports = mongoose.model('TieBreakDraw', tieBreakDrawSchema);
