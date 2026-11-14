'use strict';

/**
 * Running order vectors: the category identity, the order of a roster with
 * stored positions, the scoring room ids a change is broadcast to, and the lot
 * draw.
 *
 * The lot draw is random (`crypto.randomInt`), so its result can't be a
 * vector. What can be pinned is the algorithm: given the same random numbers,
 * the same shuffle. `shuffleWith` feeds the draw a recorded list of numbers.
 */

const crypto = require('node:crypto');
const { requireServer } = require('../../lib/server');

const PerformanceOrderService = requireServer('services/competition/performance-order.service');
const rooms = requireServer('utils/data/scoring-room.util');

const service = Object.create(PerformanceOrderService.prototype);

const GENDERS = ['Male', 'Female', '', null, undefined];
const AGE_GROUPS = ['Under12', 'Above18', 'AllAges', '', null];
const TYPES = ['competition_1', 'competition_2', 'competition_3', 'Competition I', 'Competition II', 'Competition III', 'unknown', '', null, undefined];

/** Run the real shuffle with `crypto.randomInt` answering from `numbers`, each reduced into the range asked for. */
function shuffleWith(items, numbers) {
  const original = crypto.randomInt;
  let next = 0;
  crypto.randomInt = (min, max) => min + (numbers[next++] % (max - min));
  try {
    return PerformanceOrderService.secureShuffle(items);
  } finally {
    crypto.randomInt = original;
  }
}

function roster(rng) {
  const names = ['Akash', 'akash', 'Bhakti', 'Zoya', 'aarav', 'Émile', 'Team 10', 'Team 2', 'team 2', '', 'Åsa'];
  return Array.from({ length: rng.int(0, 9) }, (_, i) => {
    const row = { id: `r${i}`, name: rng.pick(names) };
    const kind = rng.int(0, 5);
    if (kind <= 2) row.position = rng.int(1, 6);
    if (kind === 3) row.position = rng.pick([null, '2', undefined]);
    return row;
  });
}

module.exports = {
  engine: 'runningorder',
  functions: [
    {
      name: 'buildIdentity',
      method: 'PerformanceOrderService.buildIdentity',
      fn: (competitionId, filters) => service.buildIdentity(competitionId, filters),
      fixed: [
        ['c1', { gender: 'Male', ageGroup: 'Under12', competitionType: 'Competition I' }],
        ['c1', { gender: 'Male', ageGroup: 'Under12', competitionType: 'competition_3' }],
        ['c1', undefined],
        [null, { gender: 'Male', ageGroup: 'Under12', competitionType: 'competition_1' }],
        ['c1', { gender: 'Male', ageGroup: 'Under12' }],
      ],
      gen: (rng) => {
        const valid = (list, count) => (rng.chance(0.9) ? rng.pick(list.slice(0, count)) : rng.pick(list));
        return [rng.chance(0.9) ? 'c1' : rng.pick(['', null]), { gender: valid(GENDERS, 2), ageGroup: valid(AGE_GROUPS, 3), competitionType: valid(TYPES, 7) }];
      },
    },
    {
      // The real method takes a callback for the fallback key; here it is always the row's `name`.
      name: 'sortByStoredPosition',
      fn: (rows) => service.sortByStoredPosition(rows, (row) => row.name),
      fixed: [[[]], [[{ id: 'a', name: 'B' }, { id: 'b', name: 'A' }, { id: 'c', name: 'C', position: 1 }]]],
      gen: (rng) => [roster(rng)],
    },
    {
      name: 'shuffleWith',
      fn: shuffleWith,
      fixed: [[[], []], [['a'], []], [['a', 'b'], [0]], [['a', 'b'], [1]], [['a', 'b', 'c', 'd'], [0, 0, 0]], [['a', 'b', 'c', 'd'], [3, 2, 1]]],
      gen: (rng) => {
        const items = Array.from({ length: rng.int(0, 12) }, (_, i) => `t${i + 1}`);
        return [items, Array.from({ length: Math.max(0, items.length - 1) }, () => rng.int(0, 1000))];
      },
    },
    {
      name: 'scoringRoomIds',
      fn: rooms.scoringRoomIds,
      fixed: GENDERS.flatMap((gender) => AGE_GROUPS.flatMap((ageGroup) => TYPES.map((type) => [gender, ageGroup, type]))),
    },
    { name: 'normalizeCompetitionType', fn: rooms.normalizeCompetitionType, fixed: TYPES.map((type) => [type]) },
    {
      name: 'alternateRoomId',
      fn: rooms.alternateRoomId,
      fixed: [
        'scoring_Male_Under12_competition_1',
        'scoring_Male_Under12_Competition I',
        'scoring_Female_AllAges_Competition II',
        'scoring_Female_AllAges_Competition III',
        'scoring_Female_AllAges_competition_3',
        'scoring_Male_Under12_unknown',
        'competition_c1',
        'scoring_',
        '',
        null,
        undefined,
        7,
      ].map((roomId) => [roomId]),
    },
    {
      name: 'assignmentCompetitionTypes',
      fn: rooms.assignmentCompetitionTypes,
      fixed: [[undefined], [null], [[]], [['competition_2']], [['Competition I', 'competition_3']], ['competition_1'], [['unknown']]],
    },
  ],
};
