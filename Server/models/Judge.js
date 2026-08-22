const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// Required for its side effect: registering the JudgeAccount schema. Every
// panel query populates `judgeAccount`, and a populate against an unregistered
// model throws MissingSchemaError at request time rather than at startup.
require('./JudgeAccount');

/**
 * Judge — a panel ASSIGNMENT, not a person.
 *
 * One document per slot: (competition x gender x ageGroup x judgeNo). Who
 * fills the slot lives in models/JudgeAccount.js and is referenced by
 * `judgeAccount` below. The `name`, `username` and `password` fields are
 * leftovers from when this document was also the login; they are written by
 * nothing and read by nothing after migration 006, and migration 007 removes
 * them.
 */
const judgeSchema = new mongoose.Schema({
  /**
   * The registered judge filling this slot.
   *
   * Null means an empty slot — the panel exists but nobody has been assigned.
   * Nothing about the slot grants access; access is granted by an account
   * pointing at it, which is why `isActive` now simply tracks whether this is
   * set.
   */
  judgeAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JudgeAccount',
    default: null,
    index: true
  },
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: [true, 'Competition is required']
  },
  competitionTypes: [{
    type: String,
    enum: ['competition_1', 'competition_2', 'competition_3'],
    required: true
  }],
  gender: {
    type: String,
    enum: ['Male', 'Female'],
    required: [true, 'Gender is required']
  },
  ageGroup: {
    type: String,
    enum: ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'],
    required: [true, 'Age group is required']
  },
  apparatus: {
    type: String,
    trim: true,
    default: null
  },
  judgeNo: {
    type: Number,
    required: [true, 'Judge number is required'],
    min: 1,
    max: 7 // 7 allowed for legacy Scorer docs created before Time Keeper was removed
  },
  judgeType: {
    type: String,
    enum: ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'],
    required: [true, 'Judge type is required']
  },
  name: {
    type: String,
    default: '',
    trim: true
  },
  username: {
    type: String,
    default: '',
    trim: true,
    lowercase: true,
    sparse: true // This allows multiple empty values while maintaining uniqueness for non-empty values
  },
  password: {
    type: String,
    default: '',
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
  mustResetPassword: {
    type: Boolean,
    default: false,
    // Flag to enforce password change at first login (set when temporary password is generated)
  },
  isActive: {
    type: Boolean,
    default: false // Default to false, will be set to true when judge has data
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

// Compound index to ensure unique judge assignments per gender/age group/competition
judgeSchema.index({ gender: 1, ageGroup: 1, judgeNo: 1, competition: 1 }, { unique: true });
judgeSchema.index({ gender: 1, ageGroup: 1, judgeType: 1, competition: 1 }, { unique: true });
judgeSchema.index({ competitionTypes: 1 });

// "Which panels does this judge sit on at this meet?" — the lookup behind
// login, the socket room auto-join and the running-order permission check.
//
// NOT unique, and it must never become unique: one person legitimately holds
// several assignments at one meet (Senior Judge in Under14, Judge 2 in
// Under16). The two compound indexes above are what enforce "one judge per
// slot per category".
//
// This replaces an index on { username, competition }. The username it keyed
// was slot-derived (`J1-M-U14-1`), so two competitions generated the same
// string for two different people, and the global `findByUsername` lookup
// could return the wrong person's row.
judgeSchema.index({ judgeAccount: 1, competition: 1 }, {
  sparse: true,
  partialFilterExpression: { judgeAccount: { $type: 'objectId' } }
});

// Normalize legacy Scorer records created when Time Keeper occupied slot 6 (judgeNo 7)
judgeSchema.pre('validate', function(next) {
  if (this.judgeType === 'Scorer' && Number(this.judgeNo) === 7) {
    this.judgeNo = 6;
  }
  next();
});

// Pre-save hook to hash password
judgeSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  // Don't hash if password is empty
  if (!this.password || this.password === '') {
    return next();
  }

  // Skip hashing if password is already hashed (bcrypt format check)
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$') || this.password.startsWith('$2y$')) {
    if (this.password.length >= 59 && this.password.length <= 60) {
      // Already hashed, skip
      return next();
    }
  }

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12); // Increased from 10 to 12 for better security
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
judgeSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Judge', judgeSchema);