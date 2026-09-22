/**
 * 010 — let a category hold one panel per APPARATUS.
 *
 * `Judge`'s two unique keys were `{gender, ageGroup, judgeNo, competition}` and
 * `{gender, ageGroup, judgeType, competition}`. Neither carried `apparatus`, so
 * a meet held exactly ONE panel per (gender, age group) however many apparatus
 * it ran — and Manage Judges could not offer an apparatus step, because seating
 * a second panel in the same category collided on `judgeNo` with the first.
 *
 * The schema now declares both keys with `apparatus` in them (src/models/Judge.js).
 * `index-manager` creates those on startup, but it NEVER drops an index it did
 * not expect — deliberately, so it cannot silently remove something a live
 * query depends on. The old pair therefore survives alongside the new one and
 * goes on enforcing the old rule. Dropping it is this migration's whole job.
 *
 * Until it has run, the symptom is a duplicate-key error on the SECOND
 * apparatus of a category, from a screen that has just offered the choice.
 *
 * NOT A DATA MIGRATION. Existing seats keep `apparatus: null`, which every
 * apparatus query matches (`{ $in: [apparatus, null, ''] }`) — a panel seated
 * before the rung existed goes on judging every apparatus in its category.
 * Backfilling them to a named apparatus would do the opposite: it would strand
 * the athletes entered for the other two.
 *
 * 001 is left alone rather than edited — it built the narrow pair, and an
 * applied migration is a historical record. On a fresh database 001 builds them
 * and 010 drops them again moments later, which is correct and cheap.
 *
 * `down()` restores the narrow pair and drops the wide one, so the schema and
 * the database disagree again — which is what reverting this means. Revert the
 * code alongside it. It FAILS with a duplicate-key error if the meet has
 * already been seated per apparatus, and that is the correct outcome: the
 * narrow rule and a category holding three panels cannot both be true, and
 * reverting has to be a decision about those panels, not a silent one.
 */

const Judge = require('../models/Judge');

/** The pair that made a category single-panel. Default mongoose names. */
const NARROW = [
  'gender_1_ageGroup_1_judgeNo_1_competition_1',
  'gender_1_ageGroup_1_judgeType_1_competition_1',
];

/** The pair that replaces them, keyed with `apparatus`. */
const WIDE = [
  { key: { gender: 1, ageGroup: 1, apparatus: 1, judgeNo: 1, competition: 1 } },
  { key: { gender: 1, ageGroup: 1, apparatus: 1, judgeType: 1, competition: 1 } },
];

/**
 * Drop an index that may not be there.
 *
 * IndexNotFound (27) is the normal case for a database built from the schema
 * alone, which never had the narrow pair. Anything else is real.
 *
 * @param {string} name
 */
async function dropIfPresent(name) {
  try {
    await Judge.collection.dropIndex(name);
    console.log(`  Dropped ${name}.`);
  } catch (error) {
    if (error.code === 27 || /index not found/i.test(error.message)) {
      console.log(`  ${name} was not present; nothing to drop.`);
      return;
    }
    throw error;
  }
}

async function up() {
  // Build the replacements FIRST. Dropping a unique index before its
  // replacement exists leaves a window with no uniqueness at all on panel
  // slots, and `createIndex` is idempotent when index-manager has already
  // built them.
  for (const { key } of WIDE) {
    await Judge.collection.createIndex(key, { unique: true });
  }
  console.log('  Ensured the apparatus-keyed unique indexes.');

  for (const name of NARROW) {
    await dropIfPresent(name);
  }
}

async function down() {
  // The reverse order, for the same reason: a category must never be without
  // a uniqueness rule on its slots.
  await Judge.collection.createIndex(
    { gender: 1, ageGroup: 1, judgeNo: 1, competition: 1 },
    { unique: true }
  );
  await Judge.collection.createIndex(
    { gender: 1, ageGroup: 1, judgeType: 1, competition: 1 },
    { unique: true }
  );
  console.log('  Rebuilt the narrow unique indexes.');

  for (const { key } of WIDE) {
    const name = Object.entries(key).map(([field, dir]) => `${field}_${dir}`).join('_');
    await dropIfPresent(name);
  }
}

module.exports = { up, down };
