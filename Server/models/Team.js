const mongoose = require('mongoose');

/**
 * Team Model
 * Represents a team created by a coach
 * A team can participate in multiple competitions
 * Competition-specific data (players, submission status) is stored in CompetitionTeam model
 */
const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true
  },
  coach: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coach',
    required: [true, 'Team must have a coach']
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // ── v2 spec additions ──────────────────────────────────────────────
  // State/unit this team represents (v2 §2 Team entity).
  stateUnit: {
    type: String,
    trim: true,
    default: null
  },
  // Sex category (v2 §2 Team entity).
  sex: {
    type: String,
    enum: ['Male', 'Female'],
    default: null
  },
  // Age group bracket (v2 §2 Team entity).
  teamAgeGroup: {
    type: String,
    enum: ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'],
    default: null
  }
}, {
  timestamps: true
});

// Indexes
// Unique team name per coach
teamSchema.index({ name: 1, coach: 1 }, { unique: true });
teamSchema.index({ coach: 1 });

module.exports = mongoose.model('Team', teamSchema);
