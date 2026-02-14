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
  place: {
    type: String,
    required: [true, 'Competition place is required'],
    trim: true
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
  }
}, {
  timestamps: true
});

// Indexes
competitionSchema.index({ name: 1 }, { unique: true });
competitionSchema.index({ status: 1, startDate: 1 });
competitionSchema.index({ admins: 1 });

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

module.exports = mongoose.model('Competition', competitionSchema);
