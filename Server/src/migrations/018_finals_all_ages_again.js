/**
 * 018 — Competition II is ONE "All ages" final per gender again: the top 2 of
 * every age group, no team cap (owner, 2026-11-17). 017 had made it a final per
 * gender AND age group (14 Nov), with a top 10 / 2 per team (15 Nov).
 *
 * For every meet running automatic Competition II (`legacyFinals` meets and
 * meets already on All ages — `allAgesFinals` — are left alone):
 *
 *  - a per-age-group Competition II final has STARTED (a Competition II score
 *    exists outside All ages, or a list is frozen): history.
 *    `perAgeGroupFinals: true` keeps that meet on one final per age group for
 *    good, so its scores, panels and results stay readable.
 *  - not started: the per-age-group Competition II lists are deleted (the
 *    engine computes the All-ages one on the next Competition I change, admin
 *    Recompute or Finalize all). If one was finalized, every finalist's
 *    Competition II entry is cleared, so nobody stays entered in a final that
 *    no longer exists — the admin finalizes the All-ages final again.
 *    Competition-II-only judge seats filed under an age group are moved to All
 *    ages (one panel per gender × apparatus; where two age groups seated the
 *    same slot, the first one found wins), then the per-age ones removed.
 *    Seats that also judge Competition I or III are not touched.
 *
 * Judge-seat indexes stay as 017 left them (they include competitionTypes).
 * Re-running is harmless.
 */

const Competition = require('../models/Competition');
const Judge = require('../models/Judge');
const Qualification = require('../models/Qualification');
const Score = require('../models/Score');

const ALL_AGES = 'AllAges';

/** Move a meet's Competition-II-only age-group seats to All ages. */
async function moveSeatsToAllAges(meet) {
  const seats = await Judge.collection.find({
    competition: meet._id,
    ageGroup: { $ne: ALL_AGES },
    competitionTypes: ['competition_2'],
  }).toArray();
  let moved = 0;
  for (const seat of seats) {
    const { _id, ...rest } = seat;
    try {
      await Judge.collection.insertOne({ ...rest, ageGroup: ALL_AGES, createdAt: new Date(), updatedAt: new Date() });
      moved += 1;
    } catch (error) {
      // All ages already has a seat in this slot: it stays.
      if (error.code !== 11000) throw error;
    }
  }
  if (seats.length) await Judge.collection.deleteMany({ _id: { $in: seats.map((s) => s._id) } });
  return moved;
}

/** Clear every squad entry's Competition II apparatus on a meet. */
async function clearCompetitionTwoEntries(meet) {
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

async function up() {
  let kept = 0;
  let moved = 0;
  let seats = 0;
  const meets = Competition.collection.find(
    { competitionTypes: 'competition_2', legacyFinals: { $ne: true }, allAgesFinals: { $ne: true } },
    { projection: { registeredTeams: 1, perAgeGroupFinals: 1 } }
  );
  for await (const meet of meets) {
    if (meet.perAgeGroupFinals) continue;
    const finals = await Qualification.collection.find({
      competition: meet._id, competitionType: 'competition_2', ageGroup: { $ne: ALL_AGES },
    }).toArray();
    const scored = await Score.collection.countDocuments(
      { competition: meet._id, competitionType: 'Competition II', ageGroup: { $ne: ALL_AGES } }, { limit: 1 }
    );
    if (scored || finals.some((f) => f.frozenAt)) {
      await Competition.collection.updateOne({ _id: meet._id }, { $set: { perAgeGroupFinals: true } });
      kept += 1;
      continue;
    }
    if (finals.some((f) => f.finalizedAt)) await clearCompetitionTwoEntries(meet);
    if (finals.length) {
      await Qualification.collection.deleteMany({ _id: { $in: finals.map((f) => f._id) } });
      moved += 1;
    }
    seats += await moveSeatsToAllAges(meet);
  }
  console.log(`018: ${kept} meet(s) keep their started per-age-group Competition II; ${moved} meet(s) go back to one All-ages Competition II final per gender; ${seats} judge seat(s) moved to All ages`);
}

/**
 * Drops the flag only. Deleted lists are not restored (the engine recomputes
 * whatever the code it runs with expects) and moved seats stay under All ages.
 */
async function down() {
  await Competition.collection.updateMany({}, { $unset: { perAgeGroupFinals: '' } });
}

module.exports = { up, down };
