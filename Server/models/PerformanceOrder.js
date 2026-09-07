const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../src/config/cop-rules');

/**
 * PerformanceOrder Model
 *
 * The running order for one competition category — which team performs first,
 * second, third, and in which order that team's athletes go up.
 *
 * Two roles write it and they write DIFFERENT halves of the same document:
 *
 *  - Admin / SuperAdmin **draw the lots** (`drawLots`): a random shuffle that
 *    stamps `lotNo` on every team, and optionally on every athlete. This is the
 *    official draw and is what `lotsDrawnAt` / `lotsDrawnBy` record.
 *  - The Senior Judge and the Scorer of the panel **re-sequence** by dragging
 *    (`teamOrder` / `playerOrders` position rewrite). A re-sequence changes
 *    `position` only and deliberately leaves `lotNo` alone, so the drawn lot
 *    number stays visible next to a team that has been moved.
 *
 * Identity is (competition, gender, ageGroup, competitionType) — deliberately
 * NOT apparatus. A category holds ONE order that every apparatus view filters
 * down from, so a team dragged above another keeps that relative position on
 * the Pole, Hanging and Rope screens instead of needing three separate draws.
 *
 * `competitionType` is stored in SLUG form (`competition_1`), matching the
 * Judge/Competition models and the judge client's session — not the display
 * form the Score model uses. `toCompetitionTypeSlug` (config/cop-rules.js)
 * normalizes either input to this form; the service calls it on every path in
 * and out, so a caller passing "Competition I" cannot create a second document.
 */

const orderedTeamSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  // Number drawn in the official lot draw. Null when the order was only ever
  // hand-sequenced and no draw has happened.
  lotNo: {
    type: Number,
    default: null
  },
  // Zero-based running order. This is what the judge screens sort on.
  position: {
    type: Number,
    required: true
  }
}, { _id: false });

const orderedPlayerSchema = new mongoose.Schema({
  player: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  lotNo: {
    type: Number,
    default: null
  },
  position: {
    type: Number,
    required: true
  }
}, { _id: false });

const teamPlayerOrderSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  players: [orderedPlayerSchema]
}, { _id: false });

const performanceOrderSchema = new mongoose.Schema({
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
    enum: AGE_GROUPS,
    required: [true, 'Age group is required']
  },
  competitionType: {
    type: String,
    enum: ['competition_1', 'competition_2', 'competition_3'],
    required: [true, 'Competition type is required']
  },
  teamOrder: [orderedTeamSchema],
  playerOrders: [teamPlayerOrderSchema],

  // ── Audit ──────────────────────────────────────────────────────────────
  // `updatedBy` is intentionally an un-ref'd ObjectId: the writer is an Admin
  // document for a lot draw and a Judge document for a re-sequence, so a single
  // `ref` would be wrong half the time. Nothing populates it; `updatedByRole`
  // and `updatedByName` carry what the UI actually displays.
  lotsDrawnAt: { type: Date, default: null },
  lotsDrawnBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  lotsDrawnByName: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  updatedByRole: { type: String, default: '' },
  updatedByName: { type: String, default: '' }
}, {
  timestamps: true
});

// One running order per category. Unique so two admins hitting "Draw Lots" at
// the same moment cannot leave the panel with two competing orders — the loser
// gets E11000 and the service retries onto the winning document.
performanceOrderSchema.index(
  { competition: 1, gender: 1, ageGroup: 1, competitionType: 1 },
  { unique: true, name: 'performance_order_identity_unique' }
);

module.exports = mongoose.model('PerformanceOrder', performanceOrderSchema);
