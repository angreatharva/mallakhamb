/**
 * 016 — Competition II / III are filled automatically from Competition I
 * (owner, 2026-10-29; docs/qualification-plan.md).
 *
 * 1. A meet that already has a score (of any competition), or whose end date
 *    has passed, is history: `legacyFinals: true`. Its Competition II / III
 *    entries, chosen by coaches, and its scores stay exactly as they are, and
 *    the qualification engine leaves it alone.
 * 2. Every other meet running Competition II or III loses the Competition II /
 *    III apparatus coaches chose on squad entries — from now on only the engine
 *    writes those, once Competition I is locked.
 *
 * Re-running is harmless: a meet marked legacy stays so, and an entry with no
 * Competition II / III keys is left untouched.
 */

const Competition = require('../models/Competition');
const Score = require('../models/Score');

async function up() {
  const competitions = Competition.collection;
  const now = new Date();
  let legacy = 0;
  let cleared = 0;

  const meets = competitions.find({}, { projection: { endDate: 1, competitionTypes: 1, legacyFinals: 1, registeredTeams: 1 } });
  for await (const meet of meets) {
    if (meet.legacyFinals) continue;
    const scored = await Score.collection.countDocuments({ competition: meet._id }, { limit: 1 });
    const ended = meet.endDate && new Date(meet.endDate) < now;
    if (scored || ended) {
      await competitions.updateOne({ _id: meet._id }, { $set: { legacyFinals: true } });
      legacy += 1;
      continue;
    }
    const types = meet.competitionTypes || [];
    if (!types.includes('competition_2') && !types.includes('competition_3')) continue;

    let changed = false;
    const registeredTeams = (meet.registeredTeams || []).map((rt) => ({
      ...rt,
      players: (rt.players || []).map((entry) => {
        const apparatus = entry.apparatus;
        if (apparatus && typeof apparatus === 'object' && !Array.isArray(apparatus)
          && ('competition_2' in apparatus || 'competition_3' in apparatus)) {
          const { competition_2: _ii, competition_3: _iii, ...rest } = apparatus;
          changed = true;
          cleared += 1;
          return { ...entry, apparatus: rest };
        }
        return entry;
      }),
    }));
    if (changed) await competitions.updateOne({ _id: meet._id }, { $set: { registeredTeams } });
  }
  console.log(`016: ${legacy} meet(s) kept as they were (already scored or ended); ${cleared} coach-chosen Competition II/III entr(ies) cleared for the engine`);
}

/** Only the flag can be undone; cleared coach choices are not recoverable (and no longer used). */
async function down() {
  await Competition.collection.updateMany({}, { $unset: { legacyFinals: '' } });
}

module.exports = { up, down };
