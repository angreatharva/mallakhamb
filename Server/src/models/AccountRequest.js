const mongoose = require('mongoose');

/**
 * A change to an account that cannot happen in one request.
 *
 * Today that is an email change: the new address has to prove it works (a code
 * sent to it) before it replaces the old one. A player registered with no
 * email also needs their coach to approve the address they add — the
 * `awaiting-coach` state, which the coach's approval flow (plan Part C)
 * resolves. That flow adds coach-verified password resets as a second `kind`.
 *
 * One open request per account and kind: a new one replaces the old.
 */
const KINDS = ['email-change'];
const STATUSES = ['awaiting-code', 'awaiting-coach', 'done', 'rejected', 'expired'];
const USER_TYPES = ['player', 'coach', 'admin', 'judge'];

const accountRequestSchema = new mongoose.Schema({
  kind: { type: String, enum: KINDS, required: true },
  userType: { type: String, enum: USER_TYPES, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: STATUSES, default: 'awaiting-code' },

  /** The address being added, lower-case. */
  newEmail: { type: String, trim: true, lowercase: true, required: true },
  /** A player's choice for it: their own, or a guardian's. Null for other roles. */
  newEmailType: { type: String, enum: ['self', 'guardian', null], default: null },

  /** sha256 of the code mailed to `newEmail`; the code itself is never stored. */
  codeHash: { type: String, select: false, default: null },
  codeExpiresAt: { type: Date, default: null },
  /** Wrong guesses against the code; at the cap the request is dropped. */
  attempts: { type: Number, default: 0 },
  verifiedAt: { type: Date, default: null },

  /** When the request lapses if nobody finishes it. */
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

/** The open request for an account — what "one open request per kind" looks up. */
accountRequestSchema.index({ user: 1, userType: 1, kind: 1, status: 1 });

const AccountRequest = mongoose.model('AccountRequest', accountRequestSchema);
AccountRequest.KINDS = KINDS;
AccountRequest.STATUSES = STATUSES;
AccountRequest.OPEN_STATUSES = ['awaiting-code', 'awaiting-coach'];

module.exports = AccountRequest;
