const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * JudgeAccount — the PERSON who judges.
 *
 * `models/Judge.js` is a panel SLOT: one document per
 * (competition x gender x ageGroup x judgeNo), and until now it also carried
 * the person's name, a slot-derived username and a password the admin typed in.
 * That conflation is what this model ends: identity, credentials and profile
 * live here, and a Judge row becomes an assignment pointing back at one of
 * these accounts.
 *
 * Shaped deliberately like models/Coach.js — same email rule, same
 * `select: false` credential handling, same bcrypt cost, same toJSON
 * transform — because a judge account is exactly as much a self-service login
 * as a coach account is, and the two must not drift apart.
 */
const judgeAccountSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  // Not `required` — see the equivalent note in models/Coach.js.
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
   *
   * Keeping them here rather than on the assignment closes the limitation
   * documented in judge.service.persistJudgeLockoutState: a judge used to hold
   * one counter per assignment, so an attacker got the full attempt budget
   * again for every category that judge was on.
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

  // ── Judging credentials (shown to admins when assigning a panel) ──────
  stateUnit: {
    type: String,
    trim: true,
    default: null
  },
  registrationNumber: {
    type: String,
    trim: true,
    default: null
  },
  certificationLevel: {
    type: String,
    enum: ['National', 'State', 'District', 'Club', null],
    default: null
  },

  /**
   * Profile photo as a data URL.
   *
   * Stored inline rather than in object storage on purpose: there is no upload
   * infrastructure in this codebase (no multer, no S3/Cloudinary) and the
   * deployment target's disk is ephemeral, so a file written on one instance
   * would not exist on the next. The client downscales to ~256x256 JPEG before
   * sending; the cap here is the backstop, and sits well inside the 1 MB JSON
   * body limit set in infrastructure/createApp.js.
   *
   * Never included in list projections — only the profile endpoint returns it.
   */
  photo: {
    type: String,
    default: null,
    maxlength: [400000, 'Photo must be smaller than 300 KB']
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
  }
}, {
  /**
   * Named explicitly, because the default pluralisation of the model name
   * ('judgeaccounts') buried the people under an implementation detail. A judge
   * IS a person; `judges` is where you would look for one. The panel-slot model
   * that used to hold this name now says what it actually is, in
   * models/Judge.js — `judgeassignments`.
   *
   * Changing this moves where documents are read and written. Anything already
   * sitting in a `judgeaccounts` collection has to be renamed across with it
   * (`db.judgeaccounts.renameCollection('judges')`) or it silently disappears
   * from the app.
   */
  collection: 'judges',
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

// Backs the admin's "find a registered judge" search. Not unique — `email`
// already carries that.
judgeAccountSchema.index({ firstName: 1, lastName: 1 });

// Hash password before saving
judgeAccountSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
judgeAccountSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('JudgeAccount', judgeAccountSchema);
