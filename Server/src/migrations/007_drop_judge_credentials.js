/**
 * 007 — remove the credentials from panel seats.
 *
 * After 006 every seat points at a JudgeAccount, and nothing reads `name`,
 * `username`, `password` or `mustResetPassword` off a Judge document any more:
 * the display name comes from the populated account, and authentication never
 * touches this collection. Leaving bcrypt hashes lying in a collection that is
 * read by judge-facing endpoints is a standing liability, so they go.
 *
 * RUN THIS ONLY AFTER 006 HAS BEEN VERIFIED IN THE TARGET ENVIRONMENT — the
 * hashes are the only copy of the migrated judges' passwords, and `down()`
 * cannot bring them back. Seats that 006 could not link (no username) are
 * refused below rather than silently stripped.
 */

const Judge = require('../../models/Judge');

async function up() {
  const orphans = await Judge.collection.countDocuments({
    username: { $nin: [null, ''] },
    $or: [{ judgeAccount: null }, { judgeAccount: { $exists: false } }],
  });

  if (orphans > 0) {
    throw new Error(
      `${orphans} judge seat(s) still carry a username but no account. ` +
      'Run 006_judge_accounts_backfill first — dropping the credentials now would lose them.'
    );
  }

  const result = await Judge.collection.updateMany(
    {},
    { $unset: { name: '', username: '', password: '', mustResetPassword: '' } }
  );

  // The lookup index on the old username, if this database ever built it.
  await Judge.collection.dropIndex('username_1_competition_1').catch(() => {});

  console.log(`  Cleared legacy credentials from ${result.modifiedCount ?? 0} judge seat(s).`);
}

async function down() {
  // Deliberately a no-op. The fields can be re-declared on the schema, but the
  // values are gone; pretending otherwise would be worse than saying so.
  console.log('  007 is not reversible: the legacy judge credentials were deleted, not archived.');
}

module.exports = { up, down };
