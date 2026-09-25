const mongoose = require('mongoose');

/**
 * Transaction Model
 * Records financial actions that are always competition-specific.
 * Examples:
 * - Coach submits team payment for a competition
 * - Super Admin adds a player for a team in a competition
 */
const transactionSchema = new mongoose.Schema(
  {
    competition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Competition',
      required: [true, 'Competition reference is required'],
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    coach: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coach',
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
    },
    // Who initiated the transaction (for filtering)
    source: {
      type: String,
      enum: ['coach', 'superadmin'],
      required: [true, 'Transaction source is required'],
    },
    // What kind of transaction this is
    type: {
      type: String,
      enum: ['team_submission', 'player_add', 'other'],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
    },
    description: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Object,
    },
  },
  {
    timestamps: true,
  }
);

// Helpful indexes for competition-scoped queries
transactionSchema.index({ competition: 1, createdAt: -1 });
transactionSchema.index({ competition: 1, source: 1, type: 1 });

/*
 * Webhook idempotency. Razorpay retries a webhook delivery until it gets a
 * 200, and `PaymentService.reconcileWebhook` has no delivery-id tracking of
 * its own — the registration-side write is a `$set` and so is naturally
 * idempotent under a retry, but a plain `create()` on every reconciliation
 * was not, and a redelivered event inserted a second, duplicate Transaction
 * for the same payment. Sparse because only webhook-reconciled transactions
 * carry `metadata.razorpay_payment_id` at all — a coach's direct
 * verify-and-submit or a superadmin player-add transaction has no such
 * field, and those must not collide with each other or with a missing value.
 */
transactionSchema.index(
  { 'metadata.razorpay_payment_id': 1 },
  { unique: true, sparse: true, name: 'metadata_razorpay_payment_id_unique' }
);

module.exports = mongoose.model('Transaction', transactionSchema);

