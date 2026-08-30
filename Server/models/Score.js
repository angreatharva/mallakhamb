const mongoose = require('mongoose');

const playerScoreSchema = new mongoose.Schema({
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  playerName: {
    type: String,
    required: true
  },
  time: {
    type: String,
    default: '',
    // Time in format "MM:SS" or seconds - used for time deductions and 3-judge tie-breaker
    // Required context: Must be present when time deductions are applied or for 3-judge tie-breaker
  },
  apparatus: {
    type: String,
    enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'],
    default: 'Pole Mallakhamb'
  },
  judgeScores: {
    seniorJudge: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },
    judge1: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },
    judge2: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },
    judge3: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    },
    judge4: {
      type: Number,
      default: 0,
      min: 0,
      max: 10
    }
  },
  // Detailed score breakdown
  scoreBreakdown: {
    difficulty: {
      aClass: { type: Number, default: 0 },
      bClass: { type: Number, default: 0 },
      cClass: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    combination: {
      fullApparatusUtilization: { type: Boolean, default: true },
      rightLeftExecution: { type: Boolean, default: true },
      forwardBackwardFlexibility: { type: Boolean, default: true },
      minimumElementCount: { type: Boolean, default: true },
      total: { type: Number, default: 1.60 }
    },
    execution: {
      type: Number,
      default: 0,
      min: 0,
      max: 4.40,
      validate: {
        validator: function(v) {
          // Must be a multiple of 0.05 (0.00, 0.05, 0.10, ..., 4.40)
          if (v === 0) return true;
          return Math.round(v * 20) / 20 === v;
        },
        message: props => `${props.value} is not a valid execution score. Must be in multiples of 0.05.`
      }
    },
    originality: { type: Number, default: 0 }
  },
  executionAverage: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 10,
    // Calculated from execution judges (J1-J4) after removing highest/lowest
  },
  baseScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 10,
    // Required when baseScoreApplied is true
    required: function() {
      return this.baseScoreApplied === true;
    }
  },
  baseScoreApplied: {
    type: Boolean,
    default: false,
    required: true,
    // Indicates whether base score was used due to tolerance exceeded
  },
  toleranceUsed: {
    type: Number,
    default: 0,
    // The tolerance value that was applied for this score calculation
  },
  averageMarks: {
    type: Number,
    default: 0,
    // Either executionAverage or baseScore depending on baseScoreApplied
  },
  deduction: {
    type: Number,
    default: 0,
    min: 0,
    // Time deduction for exceeding 90 seconds
  },
  otherDeduction: {
    type: Number,
    default: 0,
    min: 0,
    // Other deductions (attire, behavior, etc.)
  },
  finalScore: {
    type: Number,
    default: 0,
    min: 0,
    // Final score = averageMarks - deduction - otherDeduction
  },
  // Set when Senior Judge completes Final Submit for this player (panel locked).
  isFinalized: {
    type: Boolean,
    default: false
  },
  finalizedAt: {
    type: Date,
    default: null
  },
  tieBreakRank: {
    type: Number,
    default: null,
    // Rank after tie-breaker resolution (optional - only for tied players)
  },
  tieBreakNotes: {
    type: String,
    default: '',
    // Notes explaining how tie was resolved (optional)
  },
  // ── v2 spec additions ──────────────────────────────────────────────
  // Panel size that was used for this performance (v2 §4.1).
  // When null the calculation util infers it from which judge fields are non-zero.
  panelSize: {
    type: Number,
    enum: [3, 4, 5],
    default: null
  },
  // Per-judge detailed slip (v2 §2 JudgeSlip entity).
  // Each entry records one judge's breakdown rather than just a final total.
  judgeSlips: [{
    judgeRole: {
      type: String,
      enum: ['CHIEF', 'SR_JUDGE', 'J1', 'J2', 'J3', 'J4', 'J5'],
      required: true
    },
    difficultyScore: { type: Number, min: 0, max: 3.80, default: 0 },
    combinationScore: { type: Number, min: 0, max: 1.60, default: 0 },
    executionScore: {
      type: Number,
      min: 0,
      max: 4.40,
      default: 0,
      validate: {
        validator: function(v) {
          // Must be a multiple of 0.05 (0.00, 0.05, 0.10, ..., 4.40)
          if (v === 0) return true;
          return Math.round(v * 20) / 20 === v;
        },
        message: props => `${props.value} is not a valid execution score. Must be in multiples of 0.05.`
      }
    },
    bonusScore: { type: Number, enum: [0, 0.20], default: 0 },
    total: { type: Number, min: 0, max: 10.00, default: 0 },
    // Full breakdown for this judge (A/B/C element counts, combination
    // checklist state) so re-opening this slip for edit can restore the exact
    // selections rather than just the section totals.
    breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    submittedAt: { type: Date, default: null },
    isChiefPrefilled: { type: Boolean, default: false }
  }],
  // Elements selected for the difficulty composition (v2 §2 ElementSelection).
  elementSelections: [{
    apparatus: {
      type: String,
      enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']
    },
    phase: {
      type: String,
      enum: ['MOUNT', 'HOLD', 'ACROBATIC', 'CATCH', 'DISMOUNT']
    },
    elementName: { type: String },
    class: { type: String, enum: ['A', 'B', 'C'] },
    value: { type: Number, enum: [0.20, 0.40, 0.60] }
  }],
  // Bonus tracking (v2 §2 Performance entity).
  bonusAwarded: { type: Boolean, default: false },
  bonusElementRef: { type: String, default: null },
  // Ordering metadata.
  chestNo: { type: Number, default: null },
  sequenceNo: { type: Number, default: null },
  // Tie-break resolution audit trail (v2 §7).
  tieBreakResolution: {
    step: { type: Number, default: null },       // 1-4
    method: { type: String, default: null },      // e.g. 'base_score', 'avg_eval_judges', 'avg_plus_chief', 'lucky_draw'
    resolvedAt: { type: Date, default: null }
  }
});

const scoreSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: [true, 'Competition is required']
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female']
  },
  ageGroup: {
    type: String,
    required: true,
    enum: ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18']
  },
  competitionType: {
    type: String,
    required: true,
    enum: ['Competition I', 'Competition II', 'Competition III'],
    default: 'Competition I'
  },
  timeKeeper: {
    type: String,
    default: ''
  },
  scorer: {
    type: String,
    default: ''
  },
  remarks: {
    type: String,
    default: ''
  },
  isLocked: {
    type: Boolean,
    default: false,
    required: true
  },
  // Panel / scorer metadata written by the save + lock/unlock/recalculate flows.
  // Declared explicitly so Mongoose strict mode persists them (previously they
  // were written by admin.service but silently stripped).
  judgeDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  lockedAt: { type: Date, default: null },
  unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  unlockedAt: { type: Date, default: null },
  recalculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  recalculatedAt: { type: Date, default: null },
  playerScores: [playerScoreSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
scoreSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for better query performance.
//
// HIGH-3: `competitionType` is part of the identity. Without it a team could
// hold only ONE score document per competition, even though the domain has
// three categories (Competition I Team, II Individual, III Apparatus) — so
// scoring a team in Competition II found and overwrote its Competition I
// document, merging both categories' slips into one playerScores array.
//
// This key is the upsert identity in admin.service.saveScores, so it must be
// unique. Changing it is NOT in-place: migration 003 drops the old index and
// builds this one, and aborts first if colliding documents exist.
scoreSchema.index(
  { teamId: 1, gender: 1, ageGroup: 1, competition: 1, competitionType: 1 },
  { unique: true, name: 'score_identity_unique' }
);
scoreSchema.index({ createdAt: -1 });

/**
 * The two category reads, declared on the schema rather than left to a
 * migration.
 *
 * Migration 001 built `{competition, gender, ageGroup}` and
 * `{competition, competitionType}` by hand. Neither is declared here, so in
 * DEVELOPMENT — where autoIndex builds the schema's indexes and the migrations
 * have often not been run — those queries had no index at all, and the two
 * environments disagreed about which. Declaring them makes the schema the one
 * source of truth; the index manager reconciles whatever names already exist.
 *
 * One compound key serves both, because a prefix of a compound index is usable
 * on its own: {competition}, {competition, gender}, {competition, gender,
 * ageGroup} and the whole thing all use this.
 *
 * Read by `AdminService.getSubmittedTeams` (the judge dashboard, polled
 * throughout an event) and `ScoringService.getIndividualScores`.
 */
scoreSchema.index({ competition: 1, gender: 1, ageGroup: 1, competitionType: 1 });

/**
 * The published-results read: `{isLocked: true, competition, ...}`
 * (PublicService.getPublicScores). `isLocked` second because `competition` is
 * the selective half — a meet has thousands of score documents and only two
 * values of `isLocked`.
 */
scoreSchema.index({ competition: 1, isLocked: 1 });

/**
 * "Every score this athlete appears in" — `ScoreRepository.findByPlayer` and
 * `AdminService.getPlayerDetails`. A multikey index on the embedded array;
 * without it that query is a collection scan of every score document in every
 * competition.
 *
 * Built by migration 001 and declared by no schema, so it existed in production
 * and not in a fresh development database.
 */
scoreSchema.index({ 'playerScores.playerId': 1 });

module.exports = mongoose.model('Score', scoreSchema);