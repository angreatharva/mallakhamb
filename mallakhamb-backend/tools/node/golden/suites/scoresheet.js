'use strict';

/**
 * Score sheet vectors: the row-level rules around the panel calculation.
 * Final score from average and deductions, the time deduction from a time
 * string, a complete row, rows filled in for display, the slip a judge
 * submits, which slip belongs to which judge, and which rows are published.
 */

const { requireServer } = require('../../lib/server');
const scoring = require('./scoring');

const CalculationService = requireServer('services/scoring/calculation.service');
const playerRow = requireServer('utils/scoring/player-row.util');
const slip = requireServer('utils/scoring/judge-slip.util');
const published = requireServer('utils/scoring/published-score.util');
const tie = requireServer('utils/scoring/tie-breaker.util');

const service = new CalculationService({ debug() {}, error() {} });
const { judgeScores } = scoring.helpers;

const SEAT_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer', 'Time Keeper', 'Chief', undefined];
const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
const TIMES = ['1:05', '1:30', '1:31', '1:35', '1:40', '0:55', '0:59', '65', '95', 95, 91.5, 60, 59, 0, '', null, undefined, '1:xx', 'abc', '1:02:03', '01:33'];
const DEDUCTIONS = [0, 0, 0, 0.2, 0.3, 0.5, '0.2', null, undefined, 'abc', -0.1];
const SUBMITTED_AT = '2026-12-12T10:00:00.000Z';

function row(rng) {
  const size = rng.pick([3, 4, 5]);
  const out = {
    playerId: `p${rng.int(1, 30)}`,
    playerName: 'Athlete',
    apparatus: rng.pick(APPARATUS),
    judgeScores: judgeScores(rng, size),
    time: rng.pick(TIMES),
    deduction: rng.pick(DEDUCTIONS),
    otherDeduction: rng.pick(DEDUCTIONS),
  };
  if (rng.chance(0.7)) out.panelSize = size;
  const twist = rng.int(0, 14);
  if (twist === 0) delete out.judgeScores;
  if (twist === 1) out.judgeScores = {};
  if (twist === 2) out.finalScore = rng.grid(5, 10, 0.005, 3);
  if (twist === 3) {
    out.finalScore = rng.grid(5, 10, 0.005, 3);
    out.averageMarks = rng.grid(5, 10, 0.005, 3);
  }
  if (twist === 4) out.finalScore = rng.pick([0, null, '9.1', -1]);
  if (twist === 5) delete out.time;
  return out;
}

function finalScoreInput(rng) {
  return {
    averageMarks: rng.pick([rng.grid(0, 10, 0.005, 3), rng.grid(0, 10, 0.005, 3), 0, null, undefined]),
    deduction: rng.pick([...DEDUCTIONS, rng.grid(0, 1, 0.1, 1)]),
    otherDeduction: rng.pick([...DEDUCTIONS, rng.grid(0, 12, 0.5, 1)]),
  };
}

function slipBreakdown(rng) {
  if (rng.chance(0.1)) return rng.pick([null, undefined, {}]);
  const out = {
    difficulty: { aClass: rng.int(0, 4), bClass: rng.int(0, 6), cClass: rng.int(0, 2), total: rng.grid(0, 3.8, 0.2, 1) },
    combination: { checked: {}, total: rng.grid(0, 1.6, 0.1, 1) },
    execution: rng.grid(0.1, 4.4, 0.05),
    bonus: rng.pick([0, 0.2, 0.2, 0.1, '0.2', 0.20000000000000001]),
  };
  if (rng.chance(0.15)) {
    out.originality = out.bonus;
    delete out.bonus;
  }
  if (rng.chance(0.1)) delete out.difficulty;
  if (rng.chance(0.1)) out.execution = 0;
  return out;
}

function slipInput(rng) {
  const out = {
    judgeType: rng.pick(SEAT_TYPES),
    playerId: `p${rng.int(1, 30)}`,
    playerName: 'Athlete',
    apparatus: rng.pick([...APPARATUS, '', null, undefined]),
    score: rng.grid(0.1, 10, 0.05),
    breakdown: slipBreakdown(rng),
    submittedAt: SUBMITTED_AT, // always given: Node defaults it to "now"
  };
  return [out];
}

/** A stored player score, in the shapes `breakdownForJudge` has to read. */
function storedScore(rng) {
  if (rng.chance(0.05)) return rng.pick([null, undefined, {}]);
  const roles = rng.sample(['SR_JUDGE', 'J1', 'J2', 'J3', 'J4'], rng.int(0, 4));
  const fields = rng.sample(['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'], rng.int(0, 3));
  const out = {
    judgeScores: Object.fromEntries(fields.map((field) => [field, rng.pick([rng.grid(5, 10, 0.05), 0, null])])),
    judgeSlips: roles.map((judgeRole) => ({
      judgeRole,
      difficultyScore: rng.pick([rng.grid(0, 3.8, 0.2, 1), '3.6', null]),
      combinationScore: rng.grid(0, 1.6, 0.1, 1),
      executionScore: rng.grid(0.1, 4.4, 0.05),
      bonusScore: rng.pick([0, 0.2]),
      breakdown: rng.pick([undefined, {}, null, slipBreakdown(rng)]),
    })),
  };
  if (rng.chance(0.6)) out.breakdown = slipBreakdown(rng);
  if (rng.chance(0.05)) out.judgeSlips.push(null);
  if (rng.chance(0.05)) delete out.judgeSlips;
  return out;
}

function scoreDoc(rng) {
  if (rng.chance(0.05)) return rng.pick([null, undefined, {}]);
  const out = {
    isLocked: rng.pick([true, false, false, undefined]),
    lockedApparatus: rng.pick([[], rng.sample(APPARATUS, rng.int(1, 3)), ['pole'], undefined]),
    playerScores: Array.from({ length: rng.int(0, 8) }, (_, i) =>
      rng.chance(0.05) ? null : { playerId: `p${i}`, apparatus: rng.pick([...APPARATUS, 'rope', undefined]), isFinalized: rng.pick([true, true, false, undefined, 'true']) },
    ),
  };
  if (rng.chance(0.05)) delete out.playerScores;
  return out;
}

function rankRows(rng) {
  const finals = Array.from({ length: 2 }, () => rng.grid(7, 9.8, 0.005, 3));
  const size = rng.pick([3, 4, 5]);
  const shared = judgeScores(rng, size);
  const rows = Array.from({ length: rng.int(0, 7) }, (_, i) => ({
    playerId: `p${String(i + 1).padStart(2, '0')}`,
    apparatus: rng.pick([APPARATUS[0], APPARATUS[0], APPARATUS[1], undefined]),
    finalScore: rng.pick(finals),
    panelSize: size,
    judgeScores: rng.chance(0.6) ? { ...shared } : judgeScores(rng, size),
    time: rng.pick(['1:05', '65', '1:10', '']),
  }));
  const type = rng.pick(['Competition I', 'Competition II', 'Competition III']);
  if (rng.chance(0.4)) return [rows, type];
  const draws = [];
  const seen = new Set();
  for (const ranked of tie.applyTieBreaker(rows.filter((r) => (r.apparatus || APPARATUS[0]) === APPARATUS[0]), type)) {
    const info = ranked.tieBreakInfo;
    if (info && info.awaitingLuckyDraw && !seen.has(info.tieGroupKey)) {
      seen.add(info.tieGroupKey);
      draws.push({ apparatus: APPARATUS[0], order: rng.shuffle(info.tieGroupKey.split(',')) });
    }
  }
  return [rows, type, { draws }];
}

module.exports = {
  engine: 'scoresheet',
  functions: [
    {
      name: 'calculateFinalScore',
      method: 'CalculationService.calculateFinalScore',
      fn: (playerScore) => service.calculateFinalScore(playerScore),
      fixed: [
        [{ averageMarks: 9.225, deduction: 0.2, otherDeduction: 0 }],
        [{ averageMarks: 9.225, deduction: 0.2, otherDeduction: 0.5 }],
        [{ averageMarks: 0.3, deduction: 0.5 }],
        [{ averageMarks: 8.1, deduction: 0.1, otherDeduction: 0.2 }],
        [{}],
        [null],
      ],
      gen: (rng) => [finalScoreInput(rng)],
    },
    {
      name: 'calculateTimeDeduction',
      method: 'CalculationService.calculateTimeDeduction',
      fn: (time, maxTime) => service.calculateTimeDeduction(time, maxTime),
      fixed: TIMES.map((time) => [time, undefined]).concat([['1:35', 120], [130, 120], ['2:05', 120]]),
      gen: (rng) => [rng.pick([`${rng.pick([0, 1, 1, 1, 2])}:${String(rng.int(0, 59)).padStart(2, '0')}`, String(rng.int(45, 105)), rng.int(45, 105), rng.grid(45, 105, 0.5, 1)]), rng.pick([undefined, undefined, undefined, 90, 120])],
    },
    {
      name: 'calculateCompletePlayerScore',
      method: 'CalculationService.calculateCompletePlayerScore',
      fn: (data, options) => service.calculateCompletePlayerScore(data, options),
      fixed: [
        [{ judgeScores: { seniorJudge: 9, judge1: 9.1, judge2: 9.2, judge3: 9, judge4: 9.3 }, panelSize: 5, time: '1:35', deduction: 0.3 }, undefined],
        [{ judgeScores: { seniorJudge: 8.5, judge1: 8.4, judge2: 8.6 }, time: '1:05' }, { panelSize: 3 }],
        [{ finalScore: 8.75 }, undefined],
        [{}, {}],
      ],
      gen: (rng) => [row(rng), rng.pick([undefined, {}, { panelSize: rng.pick([3, 4, 5]) }, { maxTime: 120 }])],
    },
    {
      name: 'calculateRankings',
      method: 'CalculationService.calculateRankings',
      fn: (rows) => service.calculateRankings(rows),
      fixed: [[[]], [null], [[{ id: 'a', finalScore: 9 }, { id: 'b', finalScore: 9 }, { id: 'c', finalScore: 8 }, { id: 'd' }]]],
      gen: (rng) => {
        const finals = Array.from({ length: 3 }, () => rng.grid(7, 9.8, 0.005, 3));
        return [Array.from({ length: rng.int(0, 8) }, (_, i) => ({ id: `p${i}`, finalScore: rng.pick([...finals, ...finals, null, undefined, 0]) }))];
      },
    },
    { name: 'enrichPlayerScore', fn: playerRow.enrichPlayerScore, fixed: [[null], [{}], [{ judgeScores: {} }]], gen: (rng) => [row(rng)] },
    { name: 'rankPlayerRows', fn: playerRow.rankPlayerRows, fixed: [[[]], [null], [undefined]], gen: rankRows },
    {
      name: 'buildJudgeSlipPlayerScore',
      deterministic: (args) => Boolean(args[0] && args[0].submittedAt),
      fn: slip.buildJudgeSlipPlayerScore,
      fixed: [
        [{ judgeType: 'Senior Judge', playerId: 'p1', playerName: 'A', apparatus: 'Rope Mallakhamb', score: 9.1, breakdown: { difficulty: { total: 3.8 }, combination: { total: 1.5 }, execution: 3.6, bonus: 0.2 }, submittedAt: SUBMITTED_AT }],
        [{ judgeType: 'Judge 2', playerId: 'p1', playerName: 'A', score: 8, submittedAt: SUBMITTED_AT }],
        [{ judgeType: 'Scorer', playerId: 'p1', playerName: 'A', score: 8, breakdown: { originality: 0.2 }, submittedAt: SUBMITTED_AT }],
      ],
      gen: slipInput,
    },
    {
      name: 'breakdownForJudge',
      fn: slip.breakdownForJudge,
      fixed: [[null, 'Judge 1'], [{}, 'Judge 1'], [{ judgeScores: { judge1: 9 }, breakdown: { execution: 4 } }, 'Judge 1'], [{ judgeScores: { judge1: 9, judge2: 8 }, breakdown: { execution: 4 } }, 'Judge 1'], [{ judgeScores: { judge1: 9 } }, 'Scorer']],
      gen: (rng) => [storedScore(rng), rng.chance(0.85) ? rng.pick(SEAT_TYPES.slice(0, 5)) : rng.pick(SEAT_TYPES)],
    },
    { name: 'publishedPlayerScores', fn: published.publishedPlayerScores, fixed: [[null], [{}], [{ isLocked: true }]], gen: (rng) => [scoreDoc(rng)] },
    {
      name: 'publishedScoreQuery',
      fn: published.publishedScoreQuery,
      fixed: [[undefined], [{}], [{ competition: 'c1' }], [{ $or: [{ a: 1 }, { b: 2 }] }], [{ competition: 'c1', $or: [{ a: 1 }], $and: [{ c: 3 }] }]],
    },
  ],
};
