const mongoose = require('mongoose');

/**
 * Transaction Model
 * Records financial actions that are always competition-specific.
 * Examples:
 * - Coach submits team payment for a competition
 * - Super Admin adds a player for a team in a competition
 */
const transactionSchema = new mongoose.Schema(
  {
    competition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition reference is required'],
    },
    competitionTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompetitionTeam',
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    coach: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coach',
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
    },
    // Who initiated the transaction (for filtering)
    source: {
      type: String,
      enum: ['coach', 'superadmin'],
      required: [true, 'Transaction source is required'],
    },
    // What kind of transaction this is
    type: {
      type: String,
      enum: ['team_submission', 'player_add', 'other'],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Object,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful indexes for competition-scoped queries
transactionSchema.index({ competition: 1, createdAt: -1 });
transactionSchema.index({ competition: 1, source: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);

