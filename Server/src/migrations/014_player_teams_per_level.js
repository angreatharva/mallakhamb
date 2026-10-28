/**
 * 014 — A player's team per competition level (Player.levelTeams).
 *
 * The rule (owner, 2026-10-28; docs/team-per-level-plan.md): a player's team
 * is final at each level. Until now a player had ONE team for every level, so
 * what each team has already done is read off the competitions themselves:
 *
 * 1. Every squad entry (`registeredTeams[].players[]`) says "team T entered
 *    player P at a meet of level L".
 * 2. Where only ONE team ever entered P at L, T becomes P's team at L.
 * 3. Where TWO or more teams did, nothing is guessed: P is left with no team at
 *    L and a `PlayerTeamConflict` is written for the Super Admin to resolve.
 * 4. Players never entered anywhere get nothing: their old `team` is the
 *    suggestion the next time they choose a team at a level.
 *
 * Only levels a player has no team at are written, so a re-run is harmless and
 * never overrides a choice made since.
 */

const Player = require('../models/Player');
const Competition = require('../models/Competition');
const PlayerTeamConflict = require('../models/PlayerTeamConflict');

const VIA = 'migration-014';

async function up() {
  // (player, level) → team → { competitions, firstEnteredAt }
  const seen = new Map();
  const meets = Competition.collection
    .find({ level: { $type: 'string' } }, { projection: { level: 1, startDate: 1, registeredTeams: 1 } })
    .sort({ startDate: 1, _id: 1 });

  for await (const meet of meets) {
    for (const rt of meet.registeredTeams || []) {
      if (!rt?.team) continue;
      for (const entry of rt.players || []) {
        if (!entry?.player) continue;
        const key = `${entry.player}|${meet.level}`;
        if (!seen.has(key)) seen.set(key, new Map());
        const teams = seen.get(key);
        const teamKey = String(rt.team);
        if (!teams.has(teamKey)) teams.set(teamKey, { team: rt.team, competitions: [], firstEnteredAt: meet.startDate || null });
        teams.get(teamKey).competitions.push(meet._id);
      }
    }
  }

  const players = Player.collection;
  let set = 0;
  let conflicts = 0;
  const writes = [];
  for (const [key, teams] of seen) {
    const [playerId, level] = key.split('|');
    const player = await players.findOne({ _id: toId(playerId) }, { projection: { levelTeams: 1 } });
    if (!player) continue; // an entry for a deleted account
    if ((player.levelTeams || []).some((e) => e.level === level)) continue;

    if (teams.size === 1) {
      const [only] = teams.values();
      writes.push({
        updateOne: {
          filter: { _id: player._id, 'levelTeams.level': { $ne: level } },
          update: { $push: { levelTeams: { level, team: only.team, setAt: new Date(), setBy: null, setByType: 'system', via: VIA } } },
        },
      });
      set += 1;
    } else {
      await PlayerTeamConflict.collection.updateOne(
        { player: player._id, level },
        {
          $setOnInsert: { player: player._id, level, resolved: false, createdAt: new Date() },
          $set: { teams: [...teams.values()], updatedAt: new Date() },
        },
        { upsert: true }
      );
      conflicts += 1;
    }
    if (writes.length >= 500) await players.bulkWrite(writes.splice(0), { ordered: false });
  }
  if (writes.length) await players.bulkWrite(writes, { ordered: false });

  await players.createIndex({ 'levelTeams.team': 1 });
  await PlayerTeamConflict.collection.createIndex({ player: 1, level: 1 }, { unique: true });

  console.log(`014: set ${set} level team(s); ${conflicts} player/level conflict(s) left for the Super Admin`);
}

/** Remove only what this migration wrote. Choices made since are kept. */
async function down() {
  await Player.collection.updateMany(
    { 'levelTeams.via': VIA },
    { $pull: { levelTeams: { via: VIA } } }
  );
  await PlayerTeamConflict.collection.deleteMany({ resolved: false });
}

function toId(value) {
  // mongoose's own driver: a second bson copy is refused by the serializer.
  const { ObjectId } = require('mongoose').Types;
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

module.exports = { up, down };
