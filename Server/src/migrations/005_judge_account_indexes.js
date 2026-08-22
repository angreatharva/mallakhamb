/**
 * 005 — JudgeAccount indexes.
 *
 * Production connects with `autoIndex: false` (infrastructure/database/
 * connection.js), so the indexes declared on the schema are never built by
 * Mongoose. Without this migration two judges could register the same address
 * and `findByEmail` would return whichever the storage engine happened to
 * reach first.
 *
 * Safe on an empty or populated collection: both indexes are new. The unique
 * one will refuse to build if duplicate addresses already exist, which is the
 * correct outcome — the duplicates have to be resolved by hand first.
 */

const JudgeAccount = require('../../models/JudgeAccount');

async function up() {
  await JudgeAccount.collection.createIndex(
    { email: 1 },
    { unique: true, name: 'judge_account_email_unique' }
  );

  // Backs the admin's "find a registered judge" search.
  await JudgeAccount.collection.createIndex(
    { name: 1 },
    { name: 'judge_account_name' }
  );
}

async function down() {
  await JudgeAccount.collection.dropIndex('judge_account_email_unique').catch(() => {});
  await JudgeAccount.collection.dropIndex('judge_account_name').catch(() => {});
}

module.exports = { up, down };
