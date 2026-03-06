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
    execution: { type: Number, default: 0 },
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
  tieBreakRank: {
    type: Number,
    default: null,
    // Rank after tie-breaker resolution (optional - only for tied players)
  },
  tieBreakNotes: {
    type: String,
    default: '',
    // Notes explaining how tie was resolved (optional)
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
    enum: ['U10', 'U12', 'U14', 'U16', 'U18', 'Above16', 'Above18']
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

// Create indexes for better query performance
scoreSchema.index({ teamId: 1, gender: 1, ageGroup: 1, competition: 1 });
scoreSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Score', scoreSchema);