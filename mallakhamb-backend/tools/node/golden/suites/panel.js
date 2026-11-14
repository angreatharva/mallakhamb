'use strict';

/**
 * Panel engine vectors: which seats a panel of each size has, the seat → score
 * field mapping, which seats one person may share, the seated panel size, and
 * which assignment covers a category.
 */

const path = require('node:path');
const { requireServer, SERVER_ROOT } = require('../../lib/server');

const plan = require(path.join(SERVER_ROOT, 'scripts', 'lib', 'panel-plan.js'));
const seats = requireServer('config/judge-seats');
const slip = requireServer('utils/scoring/judge-slip.util');
const { seatedPanelSize } = requireServer('utils/scoring/seated-panel.util');
const assignment = requireServer('utils/data/judge-assignment.util');

const SEAT_TYPES = [...seats.JUDGE_SEAT_TYPES];
const ODD_SEATS = ['Judge 5', 'Chief', '', null, undefined, 'senior judge'];
const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
const GENDERS = ['Male', 'Female'];
const AGE_GROUPS = ['Under12', 'Under14', 'AllAges'];
const TYPES = ['competition_1', 'competition_2', 'competition_3'];
const TYPE_FORMS = [...TYPES, 'Competition I', 'Competition II', 'Competition III', 'unknown'];

const MEET = {
  place: 'Sample',
  panels: [
    { gender: 'Male', ageGroup: 'Under12', size: 3 },
    { gender: 'Male', ageGroup: 'Under14', size: 5 },
    { gender: 'Female', ageGroup: 'Under12', size: 4 },
    { gender: 'Female', ageGroup: 'Under16', size: 3 },
  ],
};

function seatList(rng) {
  if (rng.chance(0.05)) return rng.pick([null, undefined, 'text', {}]);
  return Array.from({ length: rng.int(0, 9) }, () => {
    if (rng.chance(0.05)) return rng.pick([null, undefined, {}]);
    const seat = { judgeType: rng.pick([...SEAT_TYPES, ...SEAT_TYPES, ...ODD_SEATS]) };
    if (rng.chance(0.5)) seat.apparatus = rng.pick(APPARATUS);
    return seat;
  });
}

function oneAssignment(rng, i) {
  const out = {
    _id: `a${i}`,
    competition: rng.pick(['c1', 'c1', 'c2']),
    gender: rng.pick(GENDERS),
    ageGroup: rng.pick(AGE_GROUPS),
    competitionTypes: rng.pick([[], rng.sample(TYPES, rng.int(1, 3)), ['Competition I'], undefined]),
    judgeType: rng.pick(SEAT_TYPES),
    judgeNo: rng.pick([1, 2, 3, 4, 5, 6, 7, undefined, '2']),
  };
  if (rng.chance(0.5)) out.apparatus = rng.pick(APPARATUS);
  return out;
}

function category(rng) {
  const out = {};
  if (rng.chance(0.8)) out.competition = rng.pick(['c1', 'c2']);
  if (rng.chance(0.8)) out.gender = rng.pick(GENDERS);
  if (rng.chance(0.8)) out.ageGroup = rng.pick(AGE_GROUPS);
  if (rng.chance(0.7)) out.competitionType = rng.pick(TYPE_FORMS);
  if (rng.chance(0.5)) out.apparatus = rng.pick(APPARATUS);
  return out;
}

const assignments = (rng) => Array.from({ length: rng.int(0, 6) }, (_, i) => oneAssignment(rng, i));

module.exports = {
  engine: 'panel',
  functions: [
    { name: 'seatsFor', fn: plan.seatsFor, fixed: [3, 4, 5, 0, 2, 6].map((v) => [v]) },
    { name: 'evaluatorSeats', fn: plan.evaluatorSeats, fixed: [3, 4, 5, 0, 2, 6].map((v) => [v]) },
    {
      name: 'withTimeKeeper',
      fn: plan.withTimeKeeper,
      fixed: [[{ Scorer: 's@x' }], [{ Scorer: 's@x', 'Time Keeper': 't@x' }], [{ 'Senior Judge': 'a@x' }], [null], [undefined]],
    },
    {
      name: 'sizeFor',
      fn: plan.sizeFor,
      fixed: GENDERS.flatMap((gender) => ['Under12', 'Under14', 'Under16', 'AllAges'].map((ageGroup) => [MEET, gender, ageGroup])),
    },
    { name: 'panelsForType', fn: plan.panelsForType, fixed: TYPES.map((type) => [MEET, type]) },
    { name: 'getJudgeRoleMapping', fn: slip.getJudgeRoleMapping, fixed: [...SEAT_TYPES, ...ODD_SEATS].map((v) => [v]) },
    { name: 'isPanelJudgeType', fn: slip.isPanelJudgeType, fixed: [...SEAT_TYPES, ...ODD_SEATS, 'toString', 'constructor'].map((v) => [v]) },
    {
      name: 'maySeatTogether',
      fn: seats.maySeatTogether,
      fixed: [...SEAT_TYPES, 'Chief'].flatMap((a) => [...SEAT_TYPES, 'Chief'].map((b) => [a, b])),
    },
    {
      name: 'seatedPanelSize',
      fn: seatedPanelSize,
      fixed: [
        [[], null],
        [null, null],
        [SEAT_TYPES.slice(0, 3).map((judgeType) => ({ judgeType })), null],
        [SEAT_TYPES.slice(0, 5).map((judgeType) => ({ judgeType })), null],
        [SEAT_TYPES.map((judgeType) => ({ judgeType })), 'Pole Mallakhamb'],
        [SEAT_TYPES.slice(0, 2).map((judgeType) => ({ judgeType })), null],
      ],
      gen: (rng) => [seatList(rng), rng.pick([null, undefined, ...APPARATUS])],
    },
    {
      name: 'assignmentCoversCategory',
      fn: assignment.assignmentCoversCategory,
      fixed: [[null, {}], [{ competition: 'c1', gender: 'Male', ageGroup: 'Under12' }, undefined]],
      gen: (rng) => [oneAssignment(rng, 0), category(rng)],
    },
    {
      name: 'resolveAssignment',
      fn: assignment.resolveAssignment,
      fixed: [[null, {}], [[], {}]],
      gen: (rng) => [assignments(rng), category(rng)],
    },
    {
      name: 'hasAnyRole',
      fn: assignment.hasAnyRole,
      fixed: [[null, ['Scorer']], [[], assignment.SEQUENCE_JUDGE_TYPES]],
      gen: (rng) => [assignments(rng), rng.pick([assignment.SEQUENCE_JUDGE_TYPES, assignment.MINIMUM_PANEL_SEATS, slip.PANEL_JUDGE_TYPES, []])],
    },
    { name: 'competitionsFor', fn: assignment.competitionsFor, fixed: [[null], [[]]], gen: (rng) => [assignments(rng)] },
  ],
};
