const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../src/config/cop-rules');
const bcrypt = require('bcryptjs');

const playerSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },
  /**
   * Contact number.
   *
   * The registration form has always collected this and the client has always
   * sent it, but the field was absent from this schema — so Mongoose's default
   * strict mode dropped it on the floor without an error, and every player
   * registered before this was added has no phone number on record. There is
   * nothing to backfill from; the values were never written anywhere.
   *
   * Deliberately NOT `required`. Those existing documents would fail validation
   * on their next save (joining a team, a profile edit), which would break
   * accounts that did nothing wrong. Registration enforces it at the API
   * boundary instead — see playerValidators.createPlayer().
   */
  phone: {
    type: String,
    trim: true,
    default: null
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false // Never loaded unless a query opts in with .select('+password')
  },
  /**
   * Account lockout counters (MED-1). `select: false` keeps them out of every
   * response and every populate; a login lookup must opt in explicitly.
   */
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    default: null,
    select: false
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  ageGroup: {
    type: String,
    enum: AGE_GROUPS,
    default: null
  },
  gender: {
    type: String,
    enum: GENDERS,
    required: [true, 'Gender is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // ── v2 spec additions ──────────────────────────────────────────────
  // State/unit the player belongs to (v2 §2 Player entity).
  stateUnit: {
    type: String,
    trim: true,
    default: null
  },
  // Official MFI registration number.
  registrationNumber: {
    type: String,
    trim: true,
    default: null
  },
  // One-way lock: once a player plays in a higher age group, they can never
  // register in a lower one again (v2 §8, rule 1.8.3.3).
  hasPlayedUpBefore: {
    type: Boolean,
    default: false
  },
  // The age group the player is locked into after playing up.
  lockedAgeGroup: {
    type: String,
    enum: AGE_GROUPS,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
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
playerSchema.pre('save', async function(next) {
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
playerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Calculate age from date of birth
playerSchema.methods.getAge = function() {
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Membership lookups: "who is on this team".
 *
 * Migration 001 built this by hand and no schema declared it, so it existed in
 * production and not in development — the two environments disagreed about
 * whether the query was indexed. Declared here so the index manager builds it
 * everywhere.
 */
playerSchema.index({ team: 1 });

module.exports = mongoose.model('Player', playerSchema);
