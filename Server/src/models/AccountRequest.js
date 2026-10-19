const mongoose = require('mongoose');

/**
 * A change to an account that cannot happen in one request.
 *
 *   email-change    the new address has to prove it works (a code sent to it)
 *                   before it replaces the old one. A player registered with no
 *                   email then also needs their coach: `awaiting-coach`.
 *   password-reset  a player with no email has nowhere to receive a reset
 *                   code, so their coach checks it is really them and the
 *                   system gives the COACH a one-time code to hand over
 *                   (`awaiting-coach` → `approved` → `done`).
 *
 * The coach is the coach of the player's team at the moment of approval —
 * never stored here, so a player who changes team is approved by the new one.
 * A super admin can decide any request (a player on no team, or a coach who
 * cannot be reached).
 *
 * One open request per account and kind.
 */
const KINDS = ['email-change', 'password-reset'];
const STATUSES = ['awaiting-code', 'awaiting-coach', 'approved', 'done', 'rejected', 'expired'];
const USER_TYPES = ['player', 'coach', 'admin', 'judge'];

const accountRequestSchema = new mongoose.Schema({
  kind: { type: String, enum: KINDS, required: true },
  userType: { type: String, enum: USER_TYPES, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: STATUSES, default: 'awaiting-code' },

  /** The address being added, lower-case (email-change only). */
  newEmail: {
    type: String, trim: true, lowercase: true, default: null,
    required: [function() { return this.kind === 'email-change'; }, 'newEmail is required'],
  },
  /** A player's choice for it: their own, or a guardian's. Null for other roles. */
  newEmailType: { type: String, enum: ['self', 'guardian', null], default: null },

  /**
   * sha256 of the one-time code: mailed to `newEmail` for an email change,
   * shown to the approving coach for a password reset. Never stored as typed.
   */
  codeHash: { type: String, select: false, default: null },
  codeExpiresAt: { type: Date, default: null },
  /** Wrong guesses against the code; at the cap the request is dropped. */
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null },

  /** Who approved or rejected it, and when (also written to the audit log). */
  decidedBy: {
    user: { type: mongoose.Schema.Types.ObjectId, default: null },
    userType: { type: String, enum: ['coach', 'superadmin', null], default: null },
  },
  decidedAt: { type: Date, default: null },

  /** When the request lapses if nobody finishes it. */
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

/** The open request for an account — what "one open request per kind" looks up. */
accountRequestSchema.index({ user: 1, userType: 1, kind: 1, status: 1 });
/** What waits on a coach or a super admin. */
accountRequestSchema.index({ status: 1, createdAt: -1 });

const AccountRequest = mongoose.model('AccountRequest', accountRequestSchema);
AccountRequest.KINDS = KINDS;
AccountRequest.STATUSES = STATUSES;
AccountRequest.OPEN_STATUSES = ['awaiting-code', 'awaiting-coach', 'approved'];

module.exports = AccountRequest;
