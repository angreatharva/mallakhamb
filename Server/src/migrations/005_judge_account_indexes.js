/**
 * 005 — JudgeAccount indexes.
 *
 * Production connects with `autoIndex: false` (infrastructure/database/
 * connection.js), so the indexes declared on the schema are never built by
 * Mongoose. Without them two judges could register the same address and
 * `findByEmail` would return whichever the storage engine happened to reach
 * first.
 *
 * TWO THINGS WERE WRONG WITH THE ORIGINAL VERSION.
 *
 * It asked for `{email: 1}` under the name `judge_account_email_unique`. In
 * DEVELOPMENT autoIndex is on, so Mongoose has already built that key from the
 * schema's `unique: true` — under the name `email_1`. MongoDB refuses a second
 * index on the same key with a different name, the migration threw "Index
 * already exists with a different name: email_1", and the runner rolled the
 * whole batch back. `npm run migrate:up` therefore failed at 005 on every
 * developer machine, and 006 and 007 never ran at all.
 *
 * It also built `{name: 1}` — a field migration 006 REMOVES, splitting it into
 * `firstName`/`lastName`. So 005 created an index, 006 deleted the field under
 * it, and the judge search (which now queries firstName/lastName/email) ran
 * unindexed in exactly the environments this migration exists to serve.
 *
 * Both are fixed by delegating to the index manager, which reconciles against
 * what the schema declares and treats an index that already exists under
 * another name as satisfied.
 */

const JudgeAccount = require('../models/JudgeAccount');
const { reconcileModel } = require('../infrastructure/database/index-manager');

async function up() {
  const result = await reconcileModel(JudgeAccount);

  if (result.failed.length > 0) {
    throw new Error(
      `JudgeAccount index creation failed: ${result.failed.map((f) => f.error).join('; ')}`
    );
  }

  console.log(
    `  JudgeAccount: ${result.created.length} index(es) created, `
    + `${result.satisfied.length} already present.`
  );

  // Leftover from this migration's first version: an index on `name`, which
  // 006 removes. Harmless but misleading, and it costs a write on every insert.
  await JudgeAccount.collection.dropIndex('judge_account_name').catch(() => {});
}

/**
 * Deliberately a no-op for the email index.
 *
 * The schema declares it `unique`, so dropping it here would let a `down`
 * migration open a window in which two accounts can take the same address —
 * and nothing would put that right on the way back up. The `name` index this
 * migration used to create is already gone.
 */
async function down() {
  console.log('  005 down: leaving the JudgeAccount email uniqueness constraint in place.');
}

module.exports = { up, down };
