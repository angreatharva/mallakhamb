/**
 * 017 — Competition II is a final per gender AND age group (owner, 2026-11-14:
 * "finals must not be on gender, but on gender + age group"), and its judges
 * are a panel of their own, seated once the finals are confirmed.
 *
 * 1. Judge seats: the two unique slot keys gain `competitionTypes`
 *    (src/models/Judge.js), so an age group's Competition II panel can sit
 *    beside its Competition I / III panel on the same apparatus. The new keys
 *    are built FIRST, then the old pair dropped — a category is never without
 *    a uniqueness rule on its slots (same order as 010).
 *
 * 2. Meets still on the old one "All ages" final per gender:
 *    - its All-ages Competition II final has STARTED (a score exists, or the
 *      list is frozen): history. `allAgesFinals: true` keeps that meet on the
 *      old rule for good, so its scores, panels and results stay readable.
 *    - not started: the All-ages qualification documents are deleted (the
 *      engine computes one per age group on the next Competition I change,
 *      admin Recompute or Finalize all). If one was finalized, its finalists'
 *      Competition II entries are cleared too, so nobody stays entered in a
 *      final that no longer exists — the admin finalizes the per-age finals
 *      again. Any All-ages Competition II judge seats are re-filed under each
 *      of the gender's age groups (the panel the admin chose now judges every
 *      age group's final), then the All-ages ones removed.
 *
 * Meets marked `legacyFinals` (016) are left alone. Re-running is harmless.
 */

const Competition = require('../models/Competition');
const Judge = require('../models/Judge');
const Qualification = require('../models/Qualification');
const Score = require('../models/Score');

const ALL_AGES = 'AllAges';

/** The pair 017 replaces (default mongoose names of 010's keys). */
const APPARATUS_KEYED = [
  'gender_1_ageGroup_1_apparatus_1_judgeNo_1_competition_1',
  'gender_1_ageGroup_1_apparatus_1_judgeType_1_competition_1',
];

/** The pair that replaces them. */
const TYPE_KEYED = [
  { gender: 1, ageGroup: 1, apparatus: 1, judgeNo: 1, competition: 1, competitionTypes: 1 },
  { gender: 1, ageGroup: 1, apparatus: 1, judgeType: 1, competition: 1, competitionTypes: 1 },
];

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

async function upIndexes() {
  for (const key of TYPE_KEYED) {
    await Judge.collection.createIndex(key, { unique: true });
  }
  console.log('  Ensured the competition-type-keyed unique indexes.');
  for (const name of APPARATUS_KEYED) await dropIfPresent(name);
}

/** Re-file a meet's All-ages Competition II seats under each age group of the gender. */
async function refileAllAgesSeats(meet) {
  const seats = await Judge.collection.find({ competition: meet._id, ageGroup: ALL_AGES }).toArray();
  let filed = 0;
  for (const seat of seats) {
    const groups = (meet.ageGroups || []).filter((g) => g.gender === seat.gender).map((g) => g.ageGroup);
    for (const ageGroup of groups) {
      const { _id, ...rest } = seat;
      const copy = { ...rest, ageGroup, createdAt: new Date(), updatedAt: new Date() };
      try {
        await Judge.collection.insertOne(copy);
        filed += 1;
      } catch (error) {
        // That age group already has a Competition II seat in this slot: the
        // admin's own choice there wins.
        if (error.code !== 11000) throw error;
      }
    }
  }
  if (seats.length) await Judge.collection.deleteMany({ competition: meet._id, ageGroup: ALL_AGES });
  return filed;
}

async function upFinals() {
  let kept = 0;
  let moved = 0;
  let seatsFiled = 0;
  const meets = Competition.collection.find(
    { competitionTypes: 'competition_2', legacyFinals: { $ne: true } },
    { projection: { ageGroups: 1, registeredTeams: 1, allAgesFinals: 1 } }
  );
  for await (const meet of meets) {
    if (meet.allAgesFinals) continue;
    const finals = await Qualification.collection.find({
      competition: meet._id, competitionType: 'competition_2', ageGroup: ALL_AGES,
    }).toArray();
    const scored = await Score.collection.countDocuments(
      { competition: meet._id, competitionType: 'Competition II', ageGroup: ALL_AGES }, { limit: 1 }
    );
    if (scored || finals.some((f) => f.frozenAt)) {
      await Competition.collection.updateOne({ _id: meet._id }, { $set: { allAgesFinals: true } });
      kept += 1;
      continue;
    }

    if (finals.some((f) => f.finalizedAt)) {
      let changed = false;
      const registeredTeams = (meet.registeredTeams || []).map((rt) => ({
        ...rt,
        players: (rt.players || []).map((entry) => {
          const apparatus = entry.apparatus;
          if (apparatus && typeof apparatus === 'object' && !Array.isArray(apparatus) && 'competition_2' in apparatus) {
            const { competition_2: _ii, ...rest } = apparatus;
            changed = true;
            return { ...entry, apparatus: rest };
          }
          return entry;
        }),
      }));
      if (changed) await Competition.collection.updateOne({ _id: meet._id }, { $set: { registeredTeams } });
    }
    if (finals.length) {
      await Qualification.collection.deleteMany({ _id: { $in: finals.map((f) => f._id) } });
      moved += 1;
    }
    seatsFiled += await refileAllAgesSeats(meet);
  }
  console.log(`017: ${kept} meet(s) keep their started All-ages Competition II; ${moved} meet(s) move to one Competition II final per age group; ${seatsFiled} All-ages judge seat(s) re-filed per age group`);
}

async function up() {
  await upIndexes();
  await upFinals();
}

/**
 * Restores 010's keys (fails with a duplicate-key error once an age group has a
 * separate Competition II panel — reverting has to be a decision about those
 * seats) and drops the flag. Deleted All-ages lists are not restored: the
 * engine recomputes whatever the code it runs with expects.
 */
async function down() {
  await Judge.collection.createIndex({ gender: 1, ageGroup: 1, apparatus: 1, judgeNo: 1, competition: 1 }, { unique: true });
  await Judge.collection.createIndex({ gender: 1, ageGroup: 1, apparatus: 1, judgeType: 1, competition: 1 }, { unique: true });
  for (const key of TYPE_KEYED) {
    await dropIfPresent(Object.entries(key).map(([field, dir]) => `${field}_${dir}`).join('_'));
  }
  await Competition.collection.updateMany({}, { $unset: { allAgesFinals: '' } });
}

module.exports = { up, down };
