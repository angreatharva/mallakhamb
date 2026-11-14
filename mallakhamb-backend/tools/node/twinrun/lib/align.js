'use strict';

/**
 * Operations whose result is random by design (04 §2, point 5).
 *
 * Their response can't be compared for equality, and everything after them
 * depends on what they drew. So each one is handled in two steps:
 *
 *   check   the replay's result obeys the rule the random step must obey
 *   align   the replay's database is given the recorded result, so every later
 *           request is answered from the same state on both sides
 *
 * This needs no shared random source between Node and Java. The shuffle
 * algorithm itself is pinned by the golden vector `runningorder/shuffleWith`.
 */

const { mongodb } = require('./local');
const { withDatabase } = require('./snapshot');

const ids = (list) => (list || []).map((item) => String(item._id));
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

const ALIGNERS = {
  /**
   * The lot draw: a random running order for one category.
   * Rule: the same teams, and within each team the same athletes, each exactly once, numbered 1..N.
   */
  async 'lot-draw'({ recorded, replayed, comparison, database }) {
    const diffs = [];
    const a = recorded.data;
    const b = replayed.data;
    if (!a || !b || !Array.isArray(a.teams) || !Array.isArray(b.teams)) return ['lot draw: no teams in the response'];

    const mapped = (id) => comparison.rewrite(id);
    if (!sameSet(ids(a.teams).map(mapped), ids(b.teams))) diffs.push('lot draw: the replay drew a different set of teams');
    const lots = b.teams.map((team) => team.lotNo).sort((x, y) => x - y);
    if (lots.some((lot, i) => lot !== i + 1)) diffs.push(`lot draw: team lot numbers are not 1..${b.teams.length}`);
    for (const team of a.teams) {
      const other = b.teams.find((candidate) => String(candidate._id) === mapped(String(team._id)));
      if (other && !sameSet(ids(team.players).map(mapped), ids(other.players))) diffs.push(`lot draw: team ${team.name} has different athletes in the replay`);
    }
    for (const key of ['competition', 'gender', 'ageGroup', 'competitionType', 'lotsDrawnByName', 'updatedByRole', 'hasOrder']) {
      if (mapped(String(a[key])) !== String(b[key])) diffs.push(`lot draw: ${key} ${a[key]} vs ${b[key]}`);
    }
    if (diffs.length > 0) return diffs;

    // Give the replay's database the recorded order.
    const { ObjectId } = mongodb();
    const oid = (id) => new ObjectId(mapped(String(id)));
    const teamOrder = a.teams.map((team) => ({ team: oid(team._id), lotNo: team.lotNo, position: team.position }));
    const playerOrders = a.teams
      .filter((team) => (team.players || []).length > 0)
      .map((team) => ({ team: oid(team._id), players: team.players.map((player) => ({ player: oid(player._id), lotNo: player.lotNo, position: player.position })) }));
    const result = await withDatabase(database, (db) =>
      db.collection('performanceorders').updateOne(
        { competition: oid(a.competition), gender: a.gender, ageGroup: a.ageGroup, competitionType: a.competitionType },
        { $set: { teamOrder, playerOrders } },
      ),
    );
    return result.matchedCount === 1 ? [] : ['lot draw: the replay stored no running order to align'];
  },
};

/**
 * Check and align one random operation.
 * @returns {Promise<string[]>} differences; empty when the rule holds and the state is aligned
 */
async function align(name, context) {
  const aligner = ALIGNERS[name];
  if (!aligner) throw new Error(`twinrun: invariants.json names an unknown aligner "${name}"`);
  return aligner(context);
}

module.exports = { align };
