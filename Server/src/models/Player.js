const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS } = require('../config/cop-rules');
const bcrypt = require('bcryptjs');
const { baseLoginId, nextFreeLoginId, siblingsPattern } = require('../utils/data/player-login-id.util');

const EMAIL_TYPES = ['self', 'guardian', 'none'];
const PLAYER_LOGIN_ID_INDEX = 'player_login_id_unique';
const PLAYER_SELF_EMAIL_INDEX = 'player_self_email_unique';

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
  /**
   * The Player ID — `firstname.lastname.ddmmyy`, `.2`/`.3` for a duplicate.
   * Assigned by the pre-validate hook below and never recomputed; see
   * utils/data/player-login-id.util. Every player can sign in with it, and for
   * a player without an email of their own it is the only login.
   */
  loginId: {
    type: String,
    trim: true,
    lowercase: true,
    default: undefined
  },
  /**
   * Whose address `email` is, chosen on the first registration screen:
   *   self     — the player's own; unique, and it signs in like today
   *   guardian — a parent's or guardian's; siblings may share it, so it is a
   *              contact address only and never a login
   *   none     — no address at all; password resets go through the coach
   * Accounts from before the choice existed are `self`.
   */
  emailType: {
    type: String,
    enum: EMAIL_TYPES,
    default: 'self'
  },
  email: {
    type: String,
    // Uniqueness is the partial index below, over `self` addresses only.
    required: [function() { return this.emailType !== 'none'; }, 'Email is required'],
    lowercase: true,
    trim: true,
    default: undefined,
    validate: {
      validator: function(v) {
        return v == null || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
  },
  /**
   * The responsible adult, for a player using a guardian's email or none.
   * Required for those two at the API boundary (playerValidators.createPlayer),
   * not here, so the `self` accounts that never had one still save.
   */
  guardian: {
    name: { type: String, trim: true, default: null },
    relation: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null }
  },
  /**
   * The coach who registered this player (CoachPlayerService), or null for a
   * player who registered themselves or was added by a super admin. Their
   * account requests (resets, email additions) go to that coach only.
   * Players registered before this field read the same through
   * `isCoachRegistered` (utils/data/player-login-id.util), from the guardian
   * relation "Coach" that only the coach path writes.
   */
  registeredByCoach: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coach',
    default: null
  },
  /** When a guardian confirmed consent for a player under 18 (DPDP Act). */
  consentAt: {
    type: Date,
    default: null
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
  },
  // Wrong OTP guesses against the current code. At the cap the code is
  // discarded, so a 6-digit code can't be brute-forced from many IPs.
  resetPasswordAttempts: {
    type: Number,
    default: 0,
    select: false
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

/**
 * Give a new player (or a legacy one on its next save) a Player ID.
 *
 * Here rather than in the registration service so every path that creates a
 * player — registration, the super admin's add-player, the seeders, the tests —
 * gets one. The suffix is chosen against the IDs already stored; two
 * registrations racing for the same one are settled by the unique index and
 * retried by PlayerRepository.create.
 */
playerSchema.pre('validate', async function(next) {
  try {
    if (this.emailType === 'none') this.email = undefined;
    if (this.loginId || !this.dateOfBirth) return next();
    const base = baseLoginId(this.firstName, this.lastName, this.dateOfBirth);
    if (!base) return next();
    const taken = await this.constructor
      .find({ loginId: siblingsPattern(base) }, { loginId: 1 })
      .session(this.$session() || null)
      .lean();
    this.loginId = nextFreeLoginId(base, taken.map((p) => p.loginId));
    next();
  } catch (error) {
    next(error);
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

/**
 * One account per Player ID. Partial so the accounts from before the field
 * existed (no `loginId` until migration 012 or their next save) don't all
 * collide on "missing".
 */
playerSchema.index(
  { loginId: 1 },
  { unique: true, partialFilterExpression: { loginId: { $type: 'string' } }, name: PLAYER_LOGIN_ID_INDEX }
);

/**
 * An email is unique only as a player's OWN address — that is the one that
 * signs in. A guardian's address is shared by siblings, and `none` has none.
 * Replaces the old `email_1` unique index; migration 012 drops that one, which
 * the index manager would otherwise report as a conflict and leave in place.
 */
playerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { emailType: 'self', email: { $type: 'string' } }, name: PLAYER_SELF_EMAIL_INDEX }
);

/** "Which players use this guardian address" — the Player ID reminder. */
playerSchema.index({ email: 1, emailType: 1 });

const Player = mongoose.model('Player', playerSchema);
Player.EMAIL_TYPES = EMAIL_TYPES;
Player.PLAYER_LOGIN_ID_INDEX = PLAYER_LOGIN_ID_INDEX;
Player.PLAYER_SELF_EMAIL_INDEX = PLAYER_SELF_EMAIL_INDEX;

module.exports = Player;
