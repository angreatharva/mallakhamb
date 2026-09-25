const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../config/cop-rules');
const { TEAM_SIZES } = require('../utils/scoring/team-championship.util');

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
  /*
   * The squad size the coach declared: 4 or 6 athletes per category. It caps
   * how many a coach may enter in one gender + age group, and decides how many
   * scores count toward the Team Championship (4 → best 3, 6 → best 5, per
   * apparatus) — see utils/scoring/team-championship.util.
   *
   * Required on CREATE (coach.service / team.service), not here: teams created
   * before the field existed have none and must still load and save. They are
   * read as 6-player squads.
   */
  maxTeamSize: {
    type: Number,
    enum: {
      values: TEAM_SIZES,
      message: `Max team size must be one of: ${TEAM_SIZES.join(', ')}`
    }
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

module.exports = mongoose.model('Team', teamSchema);
