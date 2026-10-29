/**
 * 015 — Ages are measured on 31 December of the year the competition is held,
 * always (owner, 2026-10-29): every meet in 2026 counts ages on 31 Dec 2026,
 * every meet in 2027 on 31 Dec 2027, whatever the month.
 *
 * The Super Admin's per-meet "Age cut-off year" (which could move a
 * January–March meet to the previous year) is gone from the code; this removes
 * any value already saved, so no document says otherwise.
 */

const Competition = require('../models/Competition');

async function up() {
  const result = await Competition.collection.updateMany(
    { ageCutoffYear: { $exists: true } },
    { $unset: { ageCutoffYear: '' } }
  );
  console.log(`015: cleared the age cut-off override on ${result.modifiedCount} competition(s)`);
}

/** Nothing to put back: the values were overrides the rule no longer allows. */
async function down() {}

module.exports = { up, down };
