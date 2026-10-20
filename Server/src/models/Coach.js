const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const coachSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  /**
   * Deliberately NOT `required`, for the same reason Player.phone is not.
   *
   * Coaches registered before the name split have a single `name` string, and
   * migration 008 gives a one-word name an empty last name — a `required`
   * String rejects '', so those accounts would fail validation on their next
   * save (a profile edit, a team change) for something they did nothing wrong
   * about. Registration enforces both halves at the API boundary instead, in
   * coach.routes.js.
   */
  lastName: {
    type: String,
    trim: true,
    default: ''
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
   * Contact number. Same defect as Player.phone: the coach registration form
   * collects it, the client sends it, and strict mode silently discarded it
   * because the field was not declared here. Optional for the same reason —
   * existing coaches have no phone and must not fail validation on save.
   */
  phone: {
    type: String,
    trim: true,
    default: null
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
  isActive: {
    type: Boolean,
    default: true
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  // Wrong OTP guesses against the current code. At the cap the code is
  // discarded, so a 6-digit code can't be brute-forced from many IPs.
  resetPasswordAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  /**
   * The password every player this coach registers starts with
   * (CoachPlayerService). ENCRYPTED, not hashed — the coach views it to hand it
   * out — see utils/security/data-encryption.util. A player's own copy is
   * hashed like any password the moment the account is created, so changing
   * this later never touches existing players.
   */
  playerDefaultPassword: {
    type: String,
    default: null,
    select: false
  },
  playerDefaultPasswordSetAt: {
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
      delete ret.playerDefaultPassword;
      return ret;
    }
  }
});

// Hash password before saving
coachSchema.pre('save', async function(next) {
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
coachSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * The coach's team. Read whenever a coach's squad is resolved, and built by
 * migration 001 without any schema declaring it.
 */
coachSchema.index({ team: 1 });

module.exports = mongoose.model('Coach', coachSchema);
