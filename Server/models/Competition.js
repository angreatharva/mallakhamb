const mongoose = require('mongoose');

const competitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Competition name is required'],
    trim: true
  },
  level: {
    type: String,
    required: [true, 'Competition level is required'],
    enum: {
      values: ['state', 'national', 'international'],
      message: 'Level must be state, national, or international'
    }
  },
  competitionTypes: [{
    type: String,
    enum: {
      values: ['competition_1', 'competition_2', 'competition_3'],
      message: 'Competition type must be competition_1, competition_2, or competition_3'
    }
  }],
  place: {
    type: String,
    required: [true, 'Competition place is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Competition year is required'],
    min: [2000, 'Year must be 2000 or later'],
    max: [2100, 'Year must be 2100 or earlier']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return !this.startDate || value >= this.startDate;
      },
      message: 'End date cannot be before start date'
    }
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: {
      values: ['upcoming', 'ongoing', 'completed'],
      message: 'Status must be upcoming, ongoing, or completed'
    },
    default: 'upcoming'
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }],
  teams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompetitionTeam'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  ageGroups: [{
    gender: {
      type: String,
      enum: ['Male', 'Female'],
      required: true
    },
    ageGroup: {
      type: String,
      enum: ['Under8', 'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above18'],
      required: true
    }
  }],
  startedAgeGroups: [{
    gender: {
      type: String,
      enum: ['Male', 'Female'],
      required: true
    },
    ageGroup: {
      type: String,
      enum: ['U10', 'U12', 'U14', 'U16', 'U18', 'Above18', 'Above16'],
      required: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
competitionSchema.index({ name: 1, year: 1, place: 1 }, { unique: true });
competitionSchema.index({ status: 1, startDate: 1 });
competitionSchema.index({ year: 1 });
competitionSchema.index({ admins: 1 });
competitionSchema.index({ competitionTypes: 1 });
competitionSchema.index({ 'ageGroups.gender': 1, 'ageGroups.ageGroup': 1 });
competitionSchema.index({ 'startedAgeGroups.gender': 1, 'startedAgeGroups.ageGroup': 1 });

// Method to add admin to competition
competitionSchema.methods.addAdmin = function(adminId) {
  // Check if admin already exists
  const adminExists = this.admins.some(admin => admin.toString() === adminId.toString());
  
  if (!adminExists) {
    this.admins.push(adminId);
  }
  
  return this.save();
};

// Method to remove admin from competition
competitionSchema.methods.removeAdmin = function(adminId) {
  this.admins = this.admins.filter(admin => admin.toString() !== adminId.toString());
  return this.save();
};

// Method to set initial status based on start date
competitionSchema.methods.setInitialStatus = function() {
  const now = new Date();
  
  if (now < this.startDate) {
    this.status = 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = 'ongoing';
  } else {
    this.status = 'completed';
  }
  
  return this;
};

// Method to update competition status with validation
competitionSchema.methods.updateCompetitionStatus = function(newStatus) {
  const now = new Date();
  
  // Validate status transitions based on dates
  if (newStatus === 'ongoing') {
    if (now < this.startDate) {
      throw new Error('Cannot set status to ongoing before start date');
    }
  } else if (newStatus === 'completed') {
    if (now <= this.endDate) {
      throw new Error('Cannot set status to completed before end date');
    }
  }
  
  this.status = newStatus;
  return this.save();
};

// Legacy method for backward compatibility - auto-updates status based on dates
competitionSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (now < this.startDate) {
    this.status = 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = 'ongoing';
  } else {
    this.status = 'completed';
  }
  
  return this.save();
};

// Method to check if competition is active
competitionSchema.methods.isActive = function() {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate && this.status === 'ongoing';
};

// Method to get competition type labels
competitionSchema.methods.getCompetitionTypeLabels = function() {
  const labels = {
    'competition_1': 'Competition I',
    'competition_2': 'Competition II',
    'competition_3': 'Competition III'
  };
  return this.competitionTypes.map(type => labels[type] || 'Unknown').join(', ');
};

// Static method to get all competition type labels
competitionSchema.statics.getCompetitionTypeLabels = function() {
  return {
    'competition_1': 'Competition I - Team Championship & Qualifier',
    'competition_2': 'Competition II - All Round Individual Final',
    'competition_3': 'Competition III - Apparatus Championship'
  };
};

module.exports = mongoose.model('Competition', competitionSchema);
