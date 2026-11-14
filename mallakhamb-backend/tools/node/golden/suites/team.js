'use strict';

/** Team championship vectors: squad sizes, counted scores per apparatus, team totals and placing. */

const { requireServer } = require('../../lib/server');

const team = requireServer('utils/scoring/team-championship.util');

const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb', 'pole', 'rope', undefined];
const SIZES = [4, 6, 4, 6, '4', '6', undefined, null, 5, 0, 'six'];
const GENDERS = ['Male', 'Female'];
const AGE_GROUPS = ['Under12', 'Under14', 'Above18'];

function oneTeam(rng, index = 0) {
  const scores = Array.from({ length: 3 }, () => rng.grid(7, 9.8, 0.005, 3));
  const performances = Array.from({ length: rng.int(0, 14) }, (_, i) => ({
    playerId: `t${index}p${i + 1}`,
    playerName: `Player ${i + 1}`,
    apparatus: rng.pick(APPARATUS),
    // Repeated scores make the "which equal score is dropped" order matter.
    finalScore: rng.pick([rng.pick(scores), rng.grid(6, 10, 0.005, 3), rng.grid(6, 10, 0.005, 3), rng.next() * 10, null, undefined, '8.5', 0]),
  }));
  const out = { teamId: `t${index}`, teamName: `Team ${index}`, maxTeamSize: rng.pick(SIZES), performances };
  if (rng.chance(0.05)) delete out.performances;
  return out;
}

function entries(rng) {
  const list = Array.from({ length: rng.int(0, 9) }, (_, i) => ({
    player: rng.pick([`p${i}`, { _id: `p${i}` }, null, undefined]),
    gender: rng.pick(GENDERS),
    ageGroup: rng.pick(AGE_GROUPS),
  }));
  return [rng.pick(SIZES), list, rng.pick(GENDERS), rng.pick(AGE_GROUPS), rng.pick([null, undefined, `p${rng.int(0, 9)}`, 'nobody'])];
}

module.exports = {
  engine: 'team',
  functions: [
    { name: 'isValidTeamSize', fn: team.isValidTeamSize, fixed: SIZES.map((v) => [v]) },
    { name: 'effectiveTeamSize', fn: team.effectiveTeamSize, fixed: SIZES.map((v) => [v]) },
    { name: 'countedScoresFor', fn: team.countedScoresFor, fixed: SIZES.map((v) => [v]) },
    { name: 'entriesInCategory', fn: team.entriesInCategory, fixed: [[null, 'Male', 'Under12'], [[], 'Male', 'Under12', 'p1']], gen: (rng) => entries(rng).slice(1) },
    { name: 'hasRoomInSquad', fn: team.hasRoomInSquad, fixed: [[4, [], 'Male', 'Under12'], [undefined, null, 'Male', 'Under12']], gen: entries },
    {
      name: 'scoreTeam',
      fn: team.scoreTeam,
      fixed: [
        [null],
        [{}],
        [{ maxTeamSize: 4, performances: [9.1, 9.2, 9.3, 9.4].map((finalScore, i) => ({ playerId: `p${i}`, apparatus: 'Pole Mallakhamb', finalScore })) }],
        [{ maxTeamSize: 6, performances: [9.1, 9.2, 9.3, 9.4, 9.5, 9.6].map((finalScore, i) => ({ playerId: `p${i}`, apparatus: 'Rope Mallakhamb', finalScore })) }],
        [{ performances: [9.225, 9.225, 9.225, 9.225, 9.225, 9.225].map((finalScore, i) => ({ playerId: `p${i}`, apparatus: 'Pole Mallakhamb', finalScore })) }],
      ],
      gen: (rng) => [oneTeam(rng)],
    },
    {
      name: 'rankTeamChampionship',
      fn: team.rankTeamChampionship,
      fixed: [[null], [[]]],
      gen: (rng) => {
        const list = Array.from({ length: rng.int(0, 6) }, (_, i) => oneTeam(rng, i));
        // A copy of a team under another id: two teams level on the total.
        if (list.length > 1 && rng.chance(0.3)) list.push({ ...list[0], teamId: 'copy', teamName: 'Copy' });
        return [list];
      },
    },
  ],
};
