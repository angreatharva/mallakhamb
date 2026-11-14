'use strict';

/**
 * Scoring engine vectors: the panel calculation, the COP lookups it reads, the
 * slip checks and the published slip average.
 */

const { requireServer } = require('../../lib/server');

const cop = requireServer('config/cop-rules');
const { calculateIndividualScore } = requireServer('utils/scoring/calculation.util');
const { averageSlipBreakdown } = requireServer('utils/scoring/slip-breakdown.util');

const SEATS = ['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4', 'judge5'];
const ROLES = ['SR_JUDGE', 'J1', 'J2', 'J3', 'J4'];

/** Marks close to one another, so the tolerance check lands on both sides of every tier. */
function clusteredMarks(rng, count) {
  const base = rng.grid(3, 10, 0.05);
  const spread = rng.pick([1, 2, 4, 8, 12, 30]);
  return Array.from({ length: count }, () => {
    const mark = base + rng.int(-spread, spread) * 0.05;
    return Number(Math.min(10, Math.max(0.05, mark)).toFixed(2));
  });
}

/** `{ seniorJudge, judge1… }` for a panel of the given size, sometimes with gaps or odd values. */
function judgeScores(rng, size) {
  const marks = clusteredMarks(rng, 6);
  const scores = {};
  // A 5-judge panel has a Chief and four evaluators; a 4-judge panel a Chief and three; a 3-judge panel any three.
  const filled = size === 5 ? SEATS.slice(0, 5) : size === 4 ? SEATS.slice(0, 4) : rng.pick([SEATS.slice(0, 3), ['judge1', 'judge2', 'judge3']]);
  filled.forEach((seat, i) => {
    scores[seat] = marks[i];
  });
  const twist = rng.int(0, 19);
  if (twist === 0) scores[rng.pick(filled)] = 0; // a missing slip
  if (twist === 1) delete scores[rng.pick(filled)];
  if (twist === 2) scores[rng.pick(filled)] = null;
  if (twist === 3) scores.judge5 = marks[5]; // an extra mark
  if (twist === 4) scores[rng.pick(filled)] = Number((rng.next() * 10).toFixed(3)); // off the grid
  if (twist === 5) for (const seat of filled) scores[seat] = marks[0]; // every judge agrees
  return scores;
}

function breakdown(rng) {
  const shape = rng.int(0, 11);
  if (shape === 0) return rng.pick([null, undefined, {}, 'text', 7]);
  const out = {
    difficulty: { total: rng.grid(0, 4.2, 0.2, 1) },
    combination: { total: rng.grid(0, 1.8, 0.1, 1) },
    execution: rng.grid(0, 4.6, 0.05),
    bonus: rng.pick([0, 0.2, 0.2, 0, 0.1, 0.20000000001]),
  };
  if (shape === 1) delete out.difficulty;
  if (shape === 2) delete out.combination;
  if (shape === 3) delete out.execution;
  if (shape === 4) {
    out.originality = out.bonus;
    delete out.bonus;
  }
  if (shape === 5) out.execution = rng.pick(['4.4', '', null, 'abc', 0.1, 0.09, 0.095, 0.105]);
  if (shape === 6) out.execution = Number((rng.next() * 0.2).toFixed(3));
  return out;
}

function slips(rng) {
  const size = rng.pick([3, 4, 5]);
  const roles = rng.chance(0.85) ? ROLES.slice(0, size) : rng.sample(ROLES, rng.int(0, 5));
  const list = roles.map((judgeRole) => {
    const slip = {
      judgeRole,
      difficultyScore: rng.grid(0, 3.8, 0.2, 1),
      combinationScore: rng.grid(0, 1.6, 0.1, 1),
      executionScore: rng.grid(0.1, 4.4, 0.05),
      bonusScore: rng.pick([0, 0.2]),
    };
    slip.total = Number((slip.difficultyScore + slip.combinationScore + slip.executionScore + slip.bonusScore).toFixed(2));
    return slip;
  });
  if (rng.chance(0.1)) list.push({ judgeRole: rng.pick(['CHIEF', 'J5', 'Scorer']), total: 9 });
  if (rng.chance(0.1) && list.length > 0) list[0].total = list[list.length - 1].total; // equal totals: the sort must be stable
  return [rng.shuffle(list), rng.pick([size, size, size, undefined, null, 0, 6, '4'])];
}

const TEXT_APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb', 'pole', 'ROPE', 'hanging', 'Hang', 'rope mallakhamb ', '', null, undefined, 'Unknown', 7, 'Pole Rope'];
const TEXT_TYPES = ['competition_1', 'competition_2', 'competition_3', 'Competition I', 'Competition II', 'Competition III', 'competition i', 'Competition 1', 'COMPETITION_1', '', null, undefined, 'competition_4', 'Competition IV'];
const TEXT_GENDERS = ['Male', 'Female', 'male', 'female', 'F', 'f', 'M', '', null, undefined, 'Other'];

module.exports = {
  engine: 'scoring',
  functions: [
    {
      name: 'calculateIndividualScore',
      fn: calculateIndividualScore,
      fixed: [
        [null, undefined],
        [undefined, 5],
        [{}, undefined],
        [{}, 3],
        // 3 judges: the plain average.
        [{ seniorJudge: 8.5, judge1: 8.4, judge2: 8.6 }, 3],
        [{ judge1: 7.35, judge2: 7.4, judge3: 7.45 }, 3],
        [{ seniorJudge: 8.5, judge1: 8.4 }, 3],
        // 4 judges: the Chief fills the fourth slot.
        [{ seniorJudge: 8.5, judge1: 8.4, judge2: 8.6, judge3: 8.2 }, 4],
        [{ seniorJudge: 9.5, judge1: 8.4, judge2: 8.6, judge3: 8.2 }, 4],
        // 5 judges: drop high and low, tolerance against the Chief.
        [{ seniorJudge: 9.0, judge1: 9.1, judge2: 9.2, judge3: 9.0, judge4: 9.3 }, 5],
        [{ seniorJudge: 8.5, judge1: 9.1, judge2: 9.2, judge3: 9.0, judge4: 9.3 }, 5],
        [{ seniorJudge: 9.25, judge1: 9.1, judge2: 9.2, judge3: 9.0, judge4: 9.3 }, 5],
        // Exactly on a tolerance edge, each tier.
        [{ seniorJudge: 9.1, judge1: 9.0, judge2: 9.0, judge3: 9.0, judge4: 9.0 }, 5],
        [{ seniorJudge: 8.2, judge1: 8.0, judge2: 8.0, judge3: 8.0, judge4: 8.0 }, 5],
        [{ seniorJudge: 7.3, judge1: 7.0, judge2: 7.0, judge3: 7.0, judge4: 7.0 }, 5],
        [{ seniorJudge: 6.4, judge1: 6.0, judge2: 6.0, judge3: 6.0, judge4: 6.0 }, 5],
        [{ seniorJudge: 5.5, judge1: 5.0, judge2: 5.0, judge3: 5.0, judge4: 5.0 }, 5],
        [{ seniorJudge: 5.0, judge1: 4.0, judge2: 4.0, judge3: 4.0, judge4: 4.0 }, 5],
        // Panel size inferred from the marks present.
        [{ seniorJudge: 8.5, judge1: 8.4, judge2: 8.6 }, undefined],
        [{ seniorJudge: 8.5, judge1: 8.4, judge2: 8.6, judge3: 8.2 }, undefined],
        [{ seniorJudge: 9.0, judge1: 9.1, judge2: 9.2, judge3: 9.0, judge4: 9.3 }, undefined],
        [{ seniorJudge: 9.0, judge1: 9.1 }, undefined],
        // No Chief on a 5-judge panel.
        [{ judge1: 9.1, judge2: 9.2, judge3: 9.0, judge4: 9.3 }, 5],
      ],
      // The worked examples printed in the Code of Points (Server/docs/COP Mallakhamb.pdf).
      cop: [
        // §2.1.2: the Chief is not counted; the average of the two middle scores of the four judges is 8.10.
        { from: 'COP §2.1.2', args: [{ seniorJudge: 8.3, judge1: 7.5, judge2: 7.9, judge3: 8.3, judge4: 8.4 }, 5] },
        // §2.1.3: middle average 9.05, Chief 9.40, difference 0.35 > tolerance 0.10, so the base score (9.05 + 9.40) / 2 = 9.225 applies.
        { from: 'COP §2.1.3', args: [{ seniorJudge: 9.4, judge1: 8.9, judge2: 9.1, judge3: 9.0, judge4: 9.5 }, 5] },
      ],
      gen: (rng) => {
        const size = rng.pick([3, 4, 5]);
        const declared = rng.pick([size, size, size, size, undefined, undefined, rng.pick([3, 4, 5]), rng.pick([0, 6, null])]);
        return [judgeScores(rng, size), declared];
      },
    },
    {
      name: 'getTolerance',
      fn: cop.getTolerance,
      fixed: [
        ...[10, 9, 8.995, 8.994999, 8.99, 8, 7.995, 7, 6.995, 6, 5.995, 5, 4.995, 4.99, 0, -1].map((v) => [v]),
        ...[null, undefined, '', '8.5', 'abc', Number.NaN, Infinity].map((v) => [v]),
      ],
      gen: (rng) => {
        const edge = rng.pick([5, 6, 7, 8, 9]);
        return [rng.pick([rng.grid(0, 10, 0.005, 3), edge + rng.int(-20, 20) * 0.0005, edge - rng.next() * 0.02, rng.next() * 10])];
      },
    },
    {
      name: 'getTimeDeduction',
      fn: cop.getTimeDeduction,
      fixed: [...[-5, 0, 0.5, 1, 3, 3.5, 4, 5, 5.01, 6, 9, 9.5, 10, 60].map((v) => [v]), ...[null, undefined, '', '4', 'abc', Number.NaN].map((v) => [v])],
      gen: (rng) => [rng.pick([rng.int(-3, 30), rng.grid(0, 12, 0.5, 1), rng.next() * 12])],
    },
    {
      name: 'getTimeDeductionForTime',
      fn: cop.getTimeDeductionForTime,
      fixed: [...[0, -10, 1, 50, 51, 54, 55, 56, 57, 59, 59.5, 60, 75, 90, 90.5, 91, 93, 94, 95, 96, 99, 100, 300].map((v) => [v]), ...[null, undefined, '', '95', 'abc'].map((v) => [v])],
      gen: (rng) => [rng.pick([rng.int(0, 130), rng.grid(40, 110, 0.5, 1), rng.next() * 130])],
    },
    { name: 'getDifficultyRequirement', fn: cop.getDifficultyRequirement, fixed: TEXT_TYPES.map((v) => [v]) },
    {
      name: 'resolveDifficultyValue',
      fn: cop.resolveDifficultyValue,
      fixed: [
        [{ A: 4, B: 6, C: 1 }, { A: 4, B: 6, C: 1 }],
        [{ A: 1, B: 6, C: 2 }, { A: 1, B: 6, C: 2 }],
        [{}, { A: 4, B: 6, C: 1 }],
        [{ C: 11 }, { A: 4, B: 6, C: 1 }],
        [{ A: 20 }, { A: 1, B: 6, C: 2 }],
        [{ A: 4, B: 6, C: 1 }, {}],
      ],
      gen: (rng) => {
        const counts = { A: rng.int(0, 12), B: rng.int(0, 12), C: rng.int(0, 6) };
        if (rng.chance(0.15)) delete counts[rng.pick(['A', 'B', 'C'])];
        return [counts, rng.pick([cop.DIFFICULTY_REQUIREMENTS.COMPETITION_I, cop.DIFFICULTY_REQUIREMENTS.COMPETITION_II_III])];
      },
    },
    {
      name: 'validateSlipBreakdown',
      fn: cop.validateSlipBreakdown,
      fixed: [
        [{ difficulty: { total: 3.8 }, combination: { total: 1.6 }, execution: 4.4, bonus: 0.2 }],
        [{ difficulty: { total: 3.8 }, combination: { total: 1.6 }, execution: 4.4, bonus: 0 }],
        [{ difficulty: { total: 4 }, combination: { total: 1.6 }, execution: 4.4 }],
        [{ difficulty: { total: 3.8 }, combination: { total: 1.7 }, execution: 4.4 }],
        [{ difficulty: { total: 3.8 }, combination: { total: 1.6 }, execution: 4.45 }],
        [{ execution: 4.4, bonus: 0.1 }],
      ],
      gen: (rng) => [breakdown(rng)],
    },
    {
      name: 'validateExecutionFloor',
      fn: cop.validateExecutionFloor,
      fixed: [...[0.1, 0.09, 0.095, 0.0949, 0.105, 0, -1, 4.4, '0.1', '', null, undefined, 'abc', Number.NaN].map((v) => [{ execution: v }]), [null], [undefined], [{}]],
      gen: (rng) => [breakdown(rng)],
    },
    { name: 'averageSlipBreakdown', fn: averageSlipBreakdown, fixed: [[[], 3], [undefined, undefined], [null, 5]], gen: slips },
    { name: 'normalizeApparatus', fn: cop.normalizeApparatus, fixed: TEXT_APPARATUS.map((v) => [v]) },
    { name: 'apparatusKey', fn: cop.apparatusKey, fixed: TEXT_APPARATUS.map((v) => [v]) },
    { name: 'getCombinationChecklist', fn: cop.getCombinationChecklist, fixed: TEXT_APPARATUS.map((v) => [v]) },
    { name: 'toCompetitionTypeDisplay', fn: cop.toCompetitionTypeDisplay, fixed: TEXT_TYPES.map((v) => [v]) },
    { name: 'toCompetitionTypeSlug', fn: cop.toCompetitionTypeSlug, fixed: TEXT_TYPES.map((v) => [v]) },
    {
      name: 'isApparatusAllowedForGender',
      fn: cop.isApparatusAllowedForGender,
      fixed: TEXT_APPARATUS.flatMap((apparatus) => TEXT_GENDERS.map((gender) => [apparatus, gender])),
    },
    { name: 'getCopRulesData', fn: cop.getCopRulesData, fixed: [[]] },
  ],
  helpers: { clusteredMarks, judgeScores, SEATS },
};
