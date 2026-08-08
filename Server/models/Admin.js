const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\S+@\S+\.\S+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false // Never loaded unless a query opts in with .select('+password')
  },
  role: {
    type: String,
    enum: ['admin', 'superadmin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  competitions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition'
  }]
}, {
  timestamps: true,
  toJSON: {
    // Defence in depth: strip credentials from any document that is serialised
    // directly (res.json(doc), JSON.stringify(doc)). Note this does NOT apply to
    // .toObject() or to .lean() results.
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.resetPasswordToken;
      delete ret.resetPasswordExpires;
      return ret;
    }
  }
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12); // Increased from 10 to 12 for better security
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if admin has access to a specific competition
adminSchema.methods.hasAccessToCompetition = function(competitionId) {
  if (this.role === 'superadmin') {
    return true; // Super admins have access to all competitions
  }
  return this.competitions.some(comp => comp.toString() === competitionId.toString());
};

// Get all assigned competitions
adminSchema.methods.getAssignedCompetitions = async function() {
  await this.populate('competitions');
  return this.competitions;
};

module.exports = mongoose.model('Admin', adminSchema);