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
    default: ''
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
  averageMarks: {
    type: Number,
    default: 0
  },
  deduction: {
    type: Number,
    default: 0,
    min: 0
  },
  otherDeduction: {
    type: Number,
    default: 0,
    min: 0
  },
  finalScore: {
    type: Number,
    default: 0,
    min: 0
  }
});

const scoreSchema = new mongoose.Schema({
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
scoreSchema.index({ teamId: 1, gender: 1, ageGroup: 1 });
scoreSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Score', scoreSchema);