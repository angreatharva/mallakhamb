/**
 * 009 — drop the `registeredTeams.paymentStatus` index.
 *
 * Migration 001 built it. Nothing has ever queried it: no repository, service,
 * controller, script or aggregation filters or sorts on
 * `registeredTeams.paymentStatus`, and it is not declared on the schema either,
 * so `index-manager` reports it as undeclared on every startup and leaves it
 * alone.
 *
 * It is not free. `registeredTeams` is an array, so this is a MULTIKEY index:
 * every entry in the array produces an index key, and every write that touches
 * the array — a squad edit, a payment, a submission, a withdrawal — pays to
 * maintain all of them. On the document `docs/api-performance.md` measures at
 * 2.87 MB and 10,000 athletes, that is the most write-amplifying index on the
 * collection and it answers no query.
 *
 * Payment state IS queried, but through `Transaction` (which has its own
 * `paymentStatus_1`, kept) and through `paymentOrderId` on the registration
 * (which has its own sparse index, also kept).
 *
 * Reversible: `down()` rebuilds it exactly as 001 did.
 *
 * 001 is left alone rather than edited. On a fresh database that means 001
 * builds this index and 009 drops it again a few seconds later, which is a
 * little wasteful and entirely correct — an applied migration is a historical
 * record, and rewriting one silently desynchronises every database that has
 * already run it from the file that claims to describe them.
 */

const Competition = require('../../models/Competition');

const INDEX_NAME = 'registeredTeams.paymentStatus_1';

async function up() {
  try {
    await Competition.collection.dropIndex(INDEX_NAME);
    console.log(`  Dropped ${INDEX_NAME}.`);
  } catch (error) {
    // IndexNotFound (27) — a database built from the schema alone never had it,
    // which is the normal case for a fresh install. Anything else is real.
    if (error.code === 27 || /index not found/i.test(error.message)) {
      console.log(`  ${INDEX_NAME} was not present; nothing to drop.`);
      return;
    }
    throw error;
  }
}

async function down() {
  await Competition.collection.createIndex({ 'registeredTeams.paymentStatus': 1 });
  console.log(`  Rebuilt ${INDEX_NAME}.`);
}

module.exports = { up, down };
