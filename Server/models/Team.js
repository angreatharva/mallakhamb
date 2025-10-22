const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    unique: true
  },
  coach: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coach',
    required: [true, 'Team must have a coach']
  },
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
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
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
  }
}, {
  timestamps: true
});

// Virtual for getting players count by age group
teamSchema.virtual('playersByAgeGroup').get(function() {
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

// Method to add player to team
teamSchema.methods.addPlayer = function(playerId, ageGroup, gender) {
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

// Method to remove player from team
teamSchema.methods.removePlayer = function(playerId) {
  this.players = this.players.filter(p => p.player.toString() !== playerId.toString());
  return this.save();
};

module.exports = mongoose.model('Team', teamSchema);
