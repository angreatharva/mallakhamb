const mongoose = require('mongoose');
const { AGE_GROUPS, GENDERS, APPARATUS } = require('../config/cop-rules');

/**
 * WalkInRegistration — one paper form being turned into entries at the desk.
 *
 * The coach, their team and the meet registration are created BEFORE a draft
 * exists (the coach types their own password at the desk, and it is never
 * stored here). The draft holds only what was read off the paper and what the
 * admin corrected, plus how far submission got: `rows[].player` is written the
 * moment each account exists and `rows[].entered` the moment it is in the
 * meet, so a submit cut short by a failover or a closed laptop resumes where it
 * stopped instead of creating the same child twice. MongoDB transactions are
 * not an option here (BaseRepository ignores sessions).
 *
 * Photos are NOT stored. Only the text read from them is.
 */
const rowSchema = new mongoose.Schema({
  source: { type: String, enum: ['ocr', 'manual'], default: 'manual' },
  page: { type: Number },
  rowNo: { type: Number },
  firstName: { type: String, trim: true, default: '' },
  lastName: { type: String, trim: true, default: '' },
  /** YYYY-MM-DD, or '' while unreadable. A string so no time zone can move it. */
  dateOfBirth: { type: String, trim: true, default: '' },
  /** What the OCR saw in the DD MM YYYY boxes, kept when it did not make a date. */
  dobRaw: { type: String, trim: true, default: '' },
  gender: { type: String, enum: [...GENDERS, null], default: null },
  /** The section the coach wrote the player in. */
  writtenAgeGroup: { type: String, enum: [...AGE_GROUPS, null], default: null },
  /** The group the admin chose; starts as `writtenAgeGroup`. */
  ageGroup: { type: String, enum: [...AGE_GROUPS, null], default: null },
  apparatus: [{ type: String, enum: APPARATUS }],
  confidence: {
    firstName: Number,
    lastName: Number,
    dateOfBirth: Number,
  },
  /** The admin saw the "same name and date of birth" warning and went ahead. */
  confirmDuplicate: { type: Boolean, default: false },
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  loginId: { type: String, default: null },
  entered: { type: Boolean, default: false },
}, { _id: true });

const walkInRegistrationSchema = new mongoose.Schema({
  competition: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'paid', 'cancelled'],
    default: 'draft',
  },
  /** The coach confirmed every under-18 player's guardian agreed (DPDP Act). */
  guardianConsent: { type: Boolean, default: false },
  rows: { type: [rowSchema], default: [] },
  scans: [{
    page: Number,
    pages: Number,
    at: { type: Date, default: Date.now },
    seconds: Number,
    _id: false,
  }],
  /** Set while a submit is running, so two clicks cannot create a child twice. */
  submitLockedAt: { type: Date, default: null },
  submittedAt: { type: Date },
  paidAt: { type: Date },
}, { timestamps: true });

walkInRegistrationSchema.index({ competition: 1, status: 1, updatedAt: -1 });
walkInRegistrationSchema.index({ coach: 1, competition: 1 });

module.exports = mongoose.model('WalkInRegistration', walkInRegistrationSchema);
