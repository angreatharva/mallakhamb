const mongoose = require('mongoose');
// Required for its side effect: registering the JudgeAccount schema. Every
// panel query populates `judgeAccount`, and a populate against an unregistered
// model throws MissingSchemaError at request time rather than at startup.
require('./JudgeAccount');

/**
 * Judge — a panel ASSIGNMENT, not a person.
 *
 * One document per slot: (competition x gender x ageGroup x judgeNo). Who
 * fills the slot lives in models/JudgeAccount.js and is referenced by
 * `judgeAccount` below. This document carries NO credentials and no personal
 * details — a seat is not a login, and nothing here identifies a person.
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
  isActive: {
    type: Boolean,
    default: false // True once a registered judge fills the slot
  }
}, {
  timestamps: true
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
// This replaces an index on { username, competition }. That username was
// slot-derived (`J1-M-U14-1`), so two competitions generated the same string
// for two different people and a global lookup could return the wrong
// person's row — which is a large part of why credentials left this document.
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

module.exports = mongoose.model('Judge', judgeSchema);