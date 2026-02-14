const mongoose = require('mongoose');

/**
 * CompetitionTeam Model
 * Represents a team's registration in a specific competition
 * This allows the same team to participate in multiple competitions
 * with different players and settings for each competition
 */
const competitionTeamSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: [true, 'Team reference is required']
  },
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: [true, 'Competition reference is required']
  },
  coach: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coach',
    required: [true, 'Coach reference is required']
  },
  // Competition-specific players (can differ from other competitions)
  players: [{
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player'
    },
    ageGroup: {
      type: String,
      enum: ['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16']
    },
    gender: {
      type: String,
      enum: ['Male', 'Female']
    }
  }],
  isSubmitted: {
    type: Boolean,
    default: false
  },
  submittedAt: {
    type: Date
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  paymentAmount: {
    type: Number
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
// Ensure a team can only be registered once per competition
competitionTeamSchema.index({ team: 1, competition: 1 }, { unique: true });
competitionTeamSchema.index({ competition: 1, coach: 1 });
competitionTeamSchema.index({ coach: 1 });

// Virtual for getting players count by age group
competitionTeamSchema.virtual('playersByAgeGroup').get(function() {
  const groups = {};
  this.players.forEach(player => {
    const key = `${player.gender}_${player.ageGroup}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(player.player);
  });
  return groups;
});

// Method to add player to competition team
competitionTeamSchema.methods.addPlayer = function(playerId, ageGroup, gender) {
  const existingPlayer = this.players.find(p => p.player.toString() === playerId.toString());
  
  if (existingPlayer) {
    // Update existing player's age group
    existingPlayer.ageGroup = ageGroup;
    existingPlayer.gender = gender;
  } else {
    // Add new player
    this.players.push({
      player: playerId,
      ageGroup: ageGroup,
      gender: gender
    });
  }
  
  return this.save();
};

// Method to remove player from competition team
competitionTeamSchema.methods.removePlayer = function(playerId) {
  this.players = this.players.filter(p => p.player.toString() !== playerId.toString());
  return this.save();
};

module.exports = mongoose.model('CompetitionTeam', competitionTeamSchema);
