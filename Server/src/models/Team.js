const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../config/cop-rules');

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
  /**
   * Co-coaches (docs/superadmin-control-plan.md, Phase 4, D5): coaches who
   * work AS the main coach for this team (utils/auth/team-coach.util). Set
   * when the Super Admin changes the coach and keeps the old one; removed by
   * the main coach or the Super Admin.
   */
  coCoaches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coach'
  }],
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
    enum: GENDERS,
    default: null
  },
  // Age group bracket (v2 §2 Team entity).
  teamAgeGroup: {
    type: String,
    enum: AGE_GROUPS,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
// Unique team name per coach
teamSchema.index({ name: 1, coach: 1 }, { unique: true });
teamSchema.index({ coach: 1 });
// "Which team does this co-coach work for?" — read on every coach request.
teamSchema.index({ coCoaches: 1 });

module.exports = mongoose.model('Team', teamSchema);
