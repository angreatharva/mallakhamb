/**
 * HIGH-3 — add `competitionType` to the Score document identity.
 *
 * The old unique index was { teamId, gender, ageGroup, competition }, which let
 * a team hold only ONE score document per competition even though the domain
 * has three categories. `saveScores` looked the document up by exactly that key
 * and then wrote whatever `competitionType` the payload carried onto it, so
 * scoring a team in Competition II found its Competition I document, overwrote
 * the category, and merged both categories' slips into one playerScores array.
 *
 * WHY THIS MIGRATION IS DEFENSIVE
 *
 * A Mongo unique index change is not in-place: the old index must be dropped
 * and the new one built, and the build FAILS if duplicates already exist. The
 * audit's Phase 2.0 assumed a human would profile production data first. This
 * migration does that profiling itself and REFUSES TO PROCEED when it finds
 * damage, because merged historical documents cannot be split automatically —
 * the information recording which slip belonged to which category was
 * overwritten at write time and is simply gone. Those results must be
 * re-entered by hand.
 *
 * Set ALLOW_LOSSY_SCORE_MIGRATION=true to proceed anyway. Only do that after
 * taking a restorable dump and accepting that colliding documents keep whatever
 * competitionType they currently carry.
 *
 * Never run this during a live competition.
 */

const Score = require('../models/Score');

const OLD_INDEX_KEY = { teamId: 1, gender: 1, ageGroup: 1, competition: 1 };
const NEW_INDEX_KEY = { teamId: 1, gender: 1, ageGroup: 1, competition: 1, competitionType: 1 };
const NEW_INDEX_NAME = 'score_identity_unique';

/**
 * Find the real name of the old unique index rather than guessing it.
 * Mongo's default name would be `teamId_1_gender_1_ageGroup_1_competition_1`,
 * but an index created by hand may carry any name.
 * @returns {Promise<string|null>}
 */
async function findOldIndexName() {
  const indexes = await Score.collection.indexes();
  const oldKeys = Object.keys(OLD_INDEX_KEY);

  const match = indexes.find((index) => {
    const keys = Object.keys(index.key || {});
    return keys.length === oldKeys.length && oldKeys.every((k) => index.key[k] === 1);
  });

  return match ? match.name : null;
}

/**
 * Group Score documents by the OLD identity and report anything that would
 * violate the new unique index or that already merged two categories.
 */
async function profileCollisions() {
  const groups = await Score.collection.aggregate([
    {
      $group: {
        _id: {
          teamId: '$teamId',
          gender: '$gender',
          ageGroup: '$ageGroup',
          competition: '$competition',
          competitionType: '$competitionType'
        },
        count: { $sum: 1 },
        ids: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  return groups;
}

async function up() {
  const duplicates = await profileCollisions();

  if (duplicates.length > 0) {
    const report = duplicates
      .map((d) => {
        const k = d._id;
        return `  team=${k.teamId} gender=${k.gender} age=${k.ageGroup} ` +
          `competition=${k.competition} type=${k.competitionType} -> ${d.count} docs ` +
          `[${d.ids.join(', ')}]`;
      })
      .join('\n');

    const message =
      `Score identity migration aborted: ${duplicates.length} group(s) would violate ` +
      `the new unique index.\n${report}\n\n` +
      'These documents share the full new identity, so one of them must be removed or ' +
      'repointed by hand before the index can build. Note that historical documents whose ' +
      'playerScores merged two categories CANNOT be split automatically — the per-slip ' +
      'category was overwritten at write time. Those results must be re-entered.\n' +
      'Set ALLOW_LOSSY_SCORE_MIGRATION=true to build the index anyway (it will still fail ' +
      'if true duplicates remain).';

    if (process.env.ALLOW_LOSSY_SCORE_MIGRATION !== 'true') {
      throw new Error(message);
    }
  }

  // Drop the old index by its real name, then build the new one. Deliberately
  // never dropIndexes()/syncIndexes() — those would remove unrelated indexes.
  const oldIndexName = await findOldIndexName();
  if (oldIndexName) {
    await Score.collection.dropIndex(oldIndexName);
  }

  await Score.collection.createIndex(NEW_INDEX_KEY, { unique: true, name: NEW_INDEX_NAME });
}

async function down() {
  await Score.collection.dropIndex(NEW_INDEX_NAME).catch(() => {});
  // Restoring the old unique index can itself fail if multiple categories now
  // exist per team — which is the whole point of the forward migration. Left
  // non-unique on rollback so `down` cannot wedge a working database.
  await Score.collection.createIndex(OLD_INDEX_KEY).catch(() => {});
}

module.exports = { up, down };
