/**
 * 011 — unique index on Transaction.metadata.razorpay_payment_id.
 *
 * `PaymentService.reconcileWebhook` had no delivery-id tracking of its own:
 * Razorpay redelivers a webhook until it gets a 200, the registration-side
 * write is a `$set` and so is naturally idempotent under a retry, but the
 * Transaction record was a plain `create()` on every reconciliation — a
 * redelivered event for an already-processed payment inserted a SECOND,
 * duplicate Transaction row rather than being recognised as the same event.
 *
 * This migration is the same shape as 003 for the same reason: a unique
 * index build FAILS if duplicates already exist, and any duplicates this
 * bug already produced in a live database cannot be told apart automatically
 * from a legitimate re-run — unlike 003's Score documents, though, two
 * Transaction rows for the same `razorpay_payment_id` genuinely are the same
 * event recorded twice (the webhook payload that produced them is
 * identical), so cleanup here is a plain de-duplication, not a lossy merge.
 *
 * Sparse because only webhook-reconciled transactions carry
 * `metadata.razorpay_payment_id` at all — a coach's direct verify-and-submit
 * or a superadmin player-add transaction has no such field, and a
 * non-sparse unique index would refuse a second transaction of either kind
 * on the grounds that both are missing the same "value".
 *
 * Set ALLOW_LOSSY_TRANSACTION_DEDUP=true to let this migration delete the
 * duplicate rows it finds (keeping the earliest-created one per payment id)
 * before building the index. Without it, the migration reports what it found
 * and refuses to proceed, so nothing is ever deleted silently.
 */

const Transaction = require('../models/Transaction');

const INDEX_NAME = 'metadata_razorpay_payment_id_unique';

/**
 * Group Transaction documents by `metadata.razorpay_payment_id`, ignoring
 * ones where it is unset, and report any id shared by more than one row.
 */
async function profileDuplicates() {
  return Transaction.collection.aggregate([
    { $match: { 'metadata.razorpay_payment_id': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$metadata.razorpay_payment_id',
        count: { $sum: 1 },
        // Oldest first, so the survivor is the transaction the FIRST
        // successful delivery produced, not whichever the aggregation
        // happened to return first.
        ids: { $push: { id: '$_id', createdAt: '$createdAt' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
}

async function up() {
  const duplicates = await profileDuplicates();

  if (duplicates.length > 0) {
    const report = duplicates
      .map((d) => `  razorpay_payment_id=${d._id} -> ${d.count} rows [${d.ids.map((x) => x.id).join(', ')}]`)
      .join('\n');

    const message =
      `Transaction webhook-idempotency migration aborted: ${duplicates.length} ` +
      `payment id(s) have more than one Transaction row.\n${report}\n\n` +
      'These are duplicate webhook deliveries recorded before this fix existed — safe to ' +
      'collapse to one row per payment id, keeping the earliest.\n' +
      'Set ALLOW_LOSSY_TRANSACTION_DEDUP=true to delete the extra rows and build the index.';

    if (process.env.ALLOW_LOSSY_TRANSACTION_DEDUP !== 'true') {
      throw new Error(message);
    }

    for (const group of duplicates) {
      const sorted = [...group.ids].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const [, ...extras] = sorted;
      await Transaction.collection.deleteMany({ _id: { $in: extras.map((x) => x.id) } });
    }
  }

  await Transaction.collection.createIndex(
    { 'metadata.razorpay_payment_id': 1 },
    { unique: true, sparse: true, name: INDEX_NAME }
  );
}

async function down() {
  await Transaction.collection.dropIndex(INDEX_NAME).catch(() => {});
}

module.exports = { up, down };
