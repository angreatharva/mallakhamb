/**
 * 006 — split `name` into `firstName` + `lastName` for coaches and judges.
 *
 * Both models stored one `name` string; the registration forms now ask for the
 * two halves separately, the way Player always has. Existing coaches have to be
 * carried across, because nothing else in the app can reconstruct their names
 * once the field stops being written.
 *
 * The split is the only one available from a single string: everything before
 * the first space is the first name, the remainder is the last name. That gets
 * "Anita Deshpande" right and "Anita Rajeshwari Deshpande" defensibly, and it
 * leaves a one-word name with an EMPTY last name rather than inventing one —
 * which is exactly why `lastName` is not `required` on either schema. A coach
 * who wants it different can fix it themselves; guessing harder here would be
 * worse, because the guesses would be silent.
 *
 * Idempotent: only documents that still carry `name` are touched, and `name` is
 * unset as they are. Running it twice is a no-op.
 */

const Coach = require('../models/Coach');
const JudgeAccount = require('../models/JudgeAccount');

/**
 * @param {string} name
 * @returns {{firstName: string, lastName: string}}
 */
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * @param {import('mongoose').Model} model
 * @param {string} label
 * @returns {Promise<number>} documents migrated
 */
async function splitCollection(model, label) {
  const pending = await model.collection
    .find({ name: { $exists: true } }, { projection: { name: 1 } })
    .toArray();

  let migrated = 0;
  for (const doc of pending) {
    const { firstName, lastName } = splitName(doc.name);

    // A document with a blank name cannot produce a valid first name. Leave it
    // alone and say so, rather than writing an empty required field.
    if (!firstName) {
      console.log(`  ! ${label} ${doc._id} has an empty name — skipped, fix by hand`);
      continue;
    }

    await model.collection.updateOne(
      { _id: doc._id },
      { $set: { firstName, lastName }, $unset: { name: '' } }
    );
    migrated += 1;
  }

  console.log(`  ${label}: ${migrated} of ${pending.length} split into first/last name.`);
  return migrated;
}

async function up() {
  await splitCollection(Coach, 'Coach');
  await splitCollection(JudgeAccount, 'JudgeAccount');
}

/**
 * Recombine the halves back into `name`.
 *
 * Lossless for anything this migration produced: `firstName + ' ' + lastName`
 * is the string it was split from. A name entered as two fields AFTER the
 * migration also recombines cleanly — there is simply no separator to lose.
 */
async function down() {
  for (const [model, label] of [[Coach, 'Coach'], [JudgeAccount, 'JudgeAccount']]) {
    const docs = await model.collection
      .find({ firstName: { $exists: true } }, { projection: { firstName: 1, lastName: 1 } })
      .toArray();

    for (const doc of docs) {
      const name = [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
      await model.collection.updateOne(
        { _id: doc._id },
        { $set: { name }, $unset: { firstName: '', lastName: '' } }
      );
    }
    console.log(`  ${label}: ${docs.length} recombined into a single name.`);
  }
}

module.exports = { up, down, splitName };
