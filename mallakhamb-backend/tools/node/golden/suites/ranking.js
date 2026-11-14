'use strict';

/**
 * Ranking and tie-break engine vectors: placement, the panel-size tie-break
 * cascade (COP 1.12), recorded lucky draws, and per-apparatus standings.
 *
 * Random standings are built from small pools of scores, marks and times, so
 * ties happen at every step of the cascade instead of almost never.
 */

const { requireServer } = require('../../lib/server');

const tie = requireServer('utils/scoring/tie-breaker.util');
const ranking = requireServer('utils/scoring/ranking.util');

const TYPES = ['Competition I', 'Competition II', 'Competition III'];
const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
const TIMES = ['1:05', '65', 65, '01:05', '1:10', '70', 70.5, '0:59', ' 1:05 ', '', null, undefined, '1:', 'abc', '1:02:03', '1:2:3:4', '1:xx'];

const mark = (rng) => rng.grid(7, 9.8, 0.05);

/** A few mark sets that share some tie-break values and differ in others. */
function markPool(rng, size) {
  const chief = mark(rng);
  const evaluators = Array.from({ length: size - 1 }, () => mark(rng));
  const base = { seniorJudge: chief };
  evaluators.forEach((value, i) => {
    base[`judge${i + 1}`] = value;
  });
  const pool = [base];
  // Same marks in another seat order: every tie-break value is equal.
  const shuffled = rng.shuffle(evaluators);
  const reordered = { seniorJudge: chief };
  shuffled.forEach((value, i) => {
    reordered[`judge${i + 1}`] = value;
  });
  pool.push(reordered);
  // Same middle two, different extremes: equal base score, different four-judge average.
  const sorted = [...evaluators].sort((a, b) => a - b);
  if (sorted.length >= 3) {
    const widened = [...sorted];
    widened[0] = Number(Math.max(0.05, sorted[0] - 0.1).toFixed(2));
    const variant = { seniorJudge: chief };
    widened.forEach((value, i) => {
      variant[`judge${i + 1}`] = value;
    });
    pool.push(variant);
  }
  // Level on the base score and on the four-judge average, apart only on the Chief (COP 1.12.3).
  const m = rng.grid(8, 9.2, 0.05);
  const at = (delta) => Number((m + delta).toFixed(2));
  if (size === 5) {
    pool.push({ seniorJudge: m, judge1: at(-0.2), judge2: m, judge3: m, judge4: at(0.2) });
    pool.push({ seniorJudge: at(0.1), judge1: at(-0.4), judge2: at(-0.1), judge3: at(-0.1), judge4: at(0.6) });
  }
  if (size === 4) {
    pool.push({ seniorJudge: m, judge1: at(-0.2), judge2: m, judge3: at(0.2) });
    pool.push({ seniorJudge: at(0.1), judge1: at(-0.3), judge2: at(-0.3), judge3: at(0.5) });
  }
  // Something unrelated.
  const other = { seniorJudge: mark(rng) };
  evaluators.forEach((_, i) => {
    other[`judge${i + 1}`] = mark(rng);
  });
  pool.push(other);
  return pool;
}

function standing(rng, { apparatusMix = false } = {}) {
  const count = rng.pick([0, 1, 2, 2, 3, 4, 5, 6, 8]);
  const size = rng.pick([3, 4, 5]);
  const mixedPanels = rng.chance(0.1);
  const finals = Array.from({ length: rng.pick([1, 1, 2, 3]) }, () => rng.grid(7, 9.8, 0.005, 3));
  const pools = { 3: markPool(rng, 3), 4: markPool(rng, 4), 5: markPool(rng, 5) };
  const times = rng.sample(TIMES, rng.pick([1, 2, 3]));

  return Array.from({ length: count }, (_, i) => {
    const ownSize = mixedPanels ? rng.pick([3, 4, 5]) : size;
    const id = `p${String(i + 1).padStart(2, '0')}`;
    const player = {
      playerId: rng.chance(0.05) ? { _id: id } : id,
      playerName: `Player ${i + 1}`,
      finalScore: rng.pick(finals),
      judgeScores: { ...rng.pick(pools[ownSize]) },
      time: rng.pick(times),
    };
    if (!rng.chance(0.15)) player.panelSize = ownSize;
    if (apparatusMix) player.apparatus = rng.pick([...APPARATUS, 'pole', undefined]);
    const twist = rng.int(0, 39);
    if (twist === 0) delete player.judgeScores;
    if (twist === 1) player.judgeScores.judge1 = 0;
    if (twist === 2) player.finalScore = rng.pick([null, undefined, '9.1', Number.NaN]);
    if (twist === 3) delete player.playerId;
    return player;
  });
}

/** Recorded lucky draws for the groups the rules leave tied, plus a few that must not apply. */
function drawsFor(rng, players, competitionType, apparatusOf) {
  const draws = [];
  const seen = new Set();
  for (const row of tie.applyTieBreaker(players, competitionType)) {
    const info = row.tieBreakInfo;
    if (!info || !info.tieGroupKey || seen.has(info.tieGroupKey)) continue;
    seen.add(info.tieGroupKey);
    const ids = info.tieGroupKey.split(',');
    const kind = rng.int(0, 9);
    if (kind <= 5) draws.push({ order: rng.shuffle(ids) });
    else if (kind === 6) draws.push({ order: ids.slice(0, -1) }); // names fewer athletes than are tied
    else if (kind === 7) draws.push({ order: [...ids.slice(1), ids[1] || ids[0]] }); // names one athlete twice
    else if (kind === 8) draws.push({ order: [...rng.shuffle(ids), 'p99'] }); // names an athlete who is not tied
  }
  if (rng.chance(0.1)) draws.push({ order: ['p98', 'p99'] });
  if (rng.chance(0.05)) draws.push(rng.pick([null, {}, { order: null }]));
  if (apparatusOf) for (const draw of draws) if (draw) draw.apparatus = apparatusOf();
  return rng.shuffle(draws);
}

function standingCall(rng, options) {
  const players = standing(rng, options);
  const type = rng.pick(TYPES);
  const shape = rng.int(0, 9);
  if (shape === 0) return [players, type];
  if (shape === 1) return [players];
  const apparatusOf = options && options.apparatusMix ? () => rng.pick(APPARATUS) : null;
  return [players, type, { draws: drawsFor(rng, players, type, apparatusOf) }];
}

/** Draws for a mixed-apparatus standing have to be found per apparatus group. */
function byApparatusCall(rng) {
  const players = standing(rng, { apparatusMix: true });
  const type = rng.pick(TYPES);
  if (rng.chance(0.15)) return [players, type];
  const draws = [];
  for (const row of ranking.calculateIndividualRankingsByApparatus(players, type)) {
    const info = row.tieBreakInfo;
    if (info && info.tieGroupKey && info.awaitingLuckyDraw && rng.chance(0.4)) {
      draws.push({ apparatus: rng.chance(0.85) ? row.apparatus : rng.pick(APPARATUS), order: rng.shuffle(info.tieGroupKey.split(',')) });
    }
  }
  return [players, type, { draws }];
}

const pair = (rng) => {
  const players = standing(rng).slice(0, 2);
  while (players.length < 2) players.push(rng.pick([null, undefined, {}, { finalScore: 9 }]));
  return [players[0], players[1], rng.pick(TYPES)];
};

const onePlayer = (rng) => standing(rng)[0] || rng.pick([null, undefined, {}]);

function teams(rng) {
  const totals = Array.from({ length: rng.pick([1, 2, 3]) }, () => rng.grid(80, 140, 0.005, 3));
  const list = Array.from({ length: rng.int(0, 7) }, (_, i) => ({
    teamId: `t${i + 1}`,
    teamName: `Team ${i + 1}`,
    totalScore: rng.chance(0.05) ? rng.pick([null, undefined, 0, Number.NaN]) : rng.pick(totals),
  }));
  return [list, rng.pick(TYPES)];
}

const FOUR = { playerId: 'a', finalScore: 9, panelSize: 4, judgeScores: { seniorJudge: 9, judge1: 9.1, judge2: 8.9, judge3: 9 } };
const FIVE = { playerId: 'b', finalScore: 9, panelSize: 5, judgeScores: { seniorJudge: 9, judge1: 9.1, judge2: 8.9, judge3: 9, judge4: 9.05 } };
const THREE = (id, time) => ({ playerId: id, finalScore: 9, panelSize: 3, judgeScores: { seniorJudge: 9, judge1: 9, judge2: 9 }, time });

module.exports = {
  engine: 'ranking',
  functions: [
    {
      name: 'determineTieBreakerWinner',
      fn: tie.determineTieBreakerWinner,
      fixed: [
        [{ finalScore: 9.1 }, { finalScore: 9 }],
        [{ finalScore: 9 }, { finalScore: 9.0000001 }],
        [THREE('a', '1:05'), THREE('b', '1:06')],
        [THREE('a', '1:05'), THREE('b', '65')],
        [THREE('a', ''), THREE('b', '65')],
        [FOUR, { ...FOUR, playerId: 'c' }],
        [FIVE, { ...FIVE, playerId: 'c', judgeScores: { ...FIVE.judgeScores, judge1: 9.2 } }],
        [FOUR, FIVE],
        [THREE('a', '1:05'), FIVE],
        [null, undefined],
      ],
      gen: pair,
    },
    { name: 'areTied', fn: tie.areTied, fixed: [[THREE('a', '1:05'), THREE('b', '65')], [FOUR, FIVE]], gen: pair },
    {
      name: 'applyTieBreaker',
      fn: tie.applyTieBreaker,
      fixed: [
        [[]],
        [null],
        [undefined, 'Competition I', { draws: [] }],
        [[THREE('a', '1:05'), THREE('b', '65'), THREE('c', '1:05')], 'Competition I'],
        [[THREE('a', '1:05'), THREE('b', '65'), THREE('c', '1:05')], 'Competition I', { draws: [{ order: ['c', 'a', 'b'] }] }],
        [[THREE('a', '1:05'), THREE('b', '65'), THREE('c', '1:05')], 'Competition I', { draws: [{ order: ['c', 'a'] }] }],
        [[THREE('a', ''), THREE('b', '')], 'Competition I', { draws: [{ order: ['b', 'a'] }] }],
      ],
      gen: standingCall,
    },
    { name: 'calculateIndividualRankings', fn: ranking.calculateIndividualRankings, fixed: [[[]], [null]], gen: standingCall },
    { name: 'calculateIndividualRankingsByApparatus', fn: ranking.calculateIndividualRankingsByApparatus, fixed: [[[]], [null]], gen: byApparatusCall },
    { name: 'calculateTeamRankings', fn: ranking.calculateTeamRankings, fixed: [[[]], [null], [[{ teamId: 'a', totalScore: 10 }, { teamId: 'b', totalScore: 10 }, { teamId: 'c', totalScore: 9 }]]], gen: teams },
    { name: 'panelSizeOf', fn: tie.panelSizeOf, fixed: [[null], [{}], [{ panelSize: '4' }], [{ panelSize: 6 }], [FOUR], [FIVE]], gen: (rng) => [onePlayer(rng)] },
    { name: 'seniorScoreOf', fn: tie.seniorScoreOf, fixed: [[null], [{ seniorJudgeScore: 8 }], [{ chiefScore: 7 }], [{ judgeScores: { seniorJudge: '9' }, chiefScore: 7 }]], gen: (rng) => [onePlayer(rng)] },
    { name: 'baseScoreOf', fn: tie.baseScoreOf, fixed: [[FOUR, 4], [FIVE, 5], [FIVE, undefined], [THREE('a', '1:05'), 3], [null, 5]], gen: (rng) => [onePlayer(rng), rng.pick([undefined, 3, 4, 5])] },
    { name: 'fourJudgeAverageOf', fn: tie.fourJudgeAverageOf, fixed: [[FOUR, 4], [FIVE, 5], [THREE('a', '1:05'), 3]], gen: (rng) => [onePlayer(rng), rng.pick([undefined, 3, 4, 5])] },
    { name: 'fourJudgeAverageWithChiefOf', fn: tie.fourJudgeAverageWithChiefOf, fixed: [[FOUR, 4], [FIVE, 5]], gen: (rng) => [onePlayer(rng), rng.pick([undefined, 3, 4, 5])] },
    {
      name: 'timeInSeconds',
      fn: tie.timeInSeconds,
      fixed: [...TIMES, 0, -5, Number.NaN, Infinity, '0', '00:00', '2:30', '90.5', '1:30.5', '1e2', ' ', ':30', '0x10', true, {}].map((time) => [{ time }]).concat([[null], [undefined]]),
      gen: (rng) => [{ time: rng.pick([`${rng.int(0, 3)}:${String(rng.int(0, 75)).padStart(rng.pick([1, 2]), '0')}`, String(rng.int(0, 200)), rng.int(0, 200), rng.grid(40, 120, 0.1, 1)]) }],
    },
    { name: 'tieGroupKey', fn: tie.tieGroupKey, fixed: [[['b', 'a', 'c']], [[]], [['p10', 'p2', 'p1']], [[2, 10, 1]]] },
    { name: 'playerKeyOf', fn: tie.playerKeyOf, fixed: [[null], [{}], [{ playerId: 'a' }], [{ playerId: { _id: 'a' } }], [{ playerId: null }], [{ playerId: 7 }]] },
  ],
};
