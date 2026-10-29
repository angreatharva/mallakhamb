const mongoose = require('mongoose');
const { JUDGE_SEAT_TYPES, MAX_SEAT_NO } = require('../config/judge-seats');
const { CATEGORY_AGE_GROUPS, GENDERS } = require('../config/cop-rules');
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
    enum: GENDERS,
    required: [true, 'Gender is required']
  },
  ageGroup: {
    type: String,
    enum: CATEGORY_AGE_GROUPS,
    required: [true, 'Age group is required']
  },
  /**
   * The apparatus this seat judges.
   *
   * Part of the seat's IDENTITY, not a label on it — see the two unique
   * indexes below. A meet holds one panel per (gender, age group, apparatus),
   * so Pole and Rope in the same category are staffed separately and may be
   * different sizes.
   *
   * `null` is the LEGACY shape and still means "every apparatus in this
   * category". Manage Judges no longer writes it — every seat created through
   * the screen or either seeder names one — but seats written before the
   * apparatus rung existed are matched by every apparatus query
   * (`{ $in: [apparatus, null, ''] }`), so an old meet keeps scoring.
   */
  apparatus: {
    type: String,
    trim: true,
    default: null
  },
  judgeNo: {
    type: Number,
    required: [true, 'Judge number is required'],
    min: 1,
    max: MAX_SEAT_NO // 7 = Time Keeper (see config/judge-seats)
  },
  judgeType: {
    type: String,
    enum: [...JUDGE_SEAT_TYPES],
    required: [true, 'Judge type is required']
  },
  isActive: {
    type: Boolean,
    default: false // True once a registered judge fills the slot
  }
}, {
  /**
   * `judgeassignments`, not the default `judges`.
   *
   * The header above is not a disclaimer — this really is one document per
   * panel SEAT, and the person filling it lives in models/JudgeAccount.js.
   * Leaving this collection called `judges` meant the obvious name pointed at
   * the rows that are not people, and anyone opening the database looking for a
   * judge found empty slots. `judges` now holds the accounts.
   *
   * Renaming a collection does not migrate it: an existing `judges` collection
   * of assignments must be renamed across
   * (`db.judges.renameCollection('judgeassignments')`) BEFORE the accounts move
   * in, or the two end up interleaved in one collection.
   */
  collection: 'judgeassignments',
  timestamps: true
});

/*
 * ONE PANEL PER (gender, age group, APPARATUS) PER MEET.
 *
 * `apparatus` was not in either key, and that single omission was the whole
 * reason Manage Judges could not ask which apparatus a panel was for: the
 * second panel in a category — Rope, after Pole — collided with the first on
 * `judgeNo`, and the admin got a duplicate-key error rather than a second
 * panel. Widening both keys is what makes the question answerable.
 *
 * Both are still needed, and they say different things. The first forbids two
 * people in slot 3; the second forbids two Judge 2s. `judgeNo` and `judgeType`
 * are a fixed pairing everywhere in the app, so in practice one implies the
 * other — but a seat written with a mismatched pair would otherwise slip past
 * whichever key it agreed with.
 *
 * A legacy `apparatus: null` seat indexes under null and so still occupies one
 * slot per category, which is exactly right: it judges every apparatus, so
 * nothing else may take that slot.
 *
 * The narrower pair (no `apparatus`) is dropped by migration 010. Until that
 * runs, the old index is still in the database enforcing the old rule —
 * `index-manager` reports it as undeclared drift and never drops an index on
 * its own.
 */
judgeSchema.index({ gender: 1, ageGroup: 1, apparatus: 1, judgeNo: 1, competition: 1 }, { unique: true });
judgeSchema.index({ gender: 1, ageGroup: 1, apparatus: 1, judgeType: 1, competition: 1 }, { unique: true });
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
//
// `sparse: true` used to be declared alongside the partial filter. MongoDB does
// not accept both on one index and builds it with the filter alone, so the
// schema was asking for something the database would never report back — which
// the index reconciler (infrastructure/database/index-manager.js) correctly
// flagged as a permanent, unfixable conflict on every startup. The partial
// filter already does the job `sparse` was there for: an unfilled seat has
// `judgeAccount: null`, and `$type: 'objectId'` excludes it.
judgeSchema.index({ judgeAccount: 1, competition: 1 }, {
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