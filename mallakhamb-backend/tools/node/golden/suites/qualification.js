'use strict';

/**
 * Finals qualification vectors: who goes through to the apparatus final
 * (Competition III: top 10, at most 2 per team) and the all-round final
 * (Competition II: top 2 of each age group), with withdrawals, ties at the
 * cut-off, and a recorded draw.
 *
 * Player ids are lower-case letters and digits, like the hex ids Node sees.
 * `allRoundAgeGroup` orders level athletes with `localeCompare`; for such ids
 * that is plain character order, which is what Java must use.
 */

const { requireServer } = require('../../lib/server');
const scoring = require('./scoring');

const qualification = requireServer('utils/scoring/qualification.util');
const { judgeScores } = scoring.helpers;

const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
const pid = (i) => `p${String(i).padStart(2, '0')}`;

/** A ranked standing: ranks rise, with shared placings, as the ranking engine returns them. */
function rankedRows(rng) {
  const count = rng.int(0, 18);
  const teams = rng.int(1, 6);
  const rows = [];
  let rank = 1;
  for (let i = 0; i < count; i++) {
    if (i > 0 && !rng.chance(0.4)) rank = i + 1;
    rows.push({
      playerId: rng.chance(0.05) ? { _id: pid(i + 1) } : pid(i + 1),
      playerName: `Player ${i + 1}`,
      teamId: rng.chance(0.03) ? null : `t${rng.int(1, teams)}`,
      rank,
      finalScore: Number((9.9 - rank * 0.05).toFixed(3)),
    });
  }
  const twist = rng.int(0, 19);
  if (twist === 0 && rows.length > 0) delete rows[rng.int(0, rows.length - 1)].rank;
  return rng.chance(0.2) ? rng.shuffle(rows) : rows;
}

function finalOptions(rng, rows) {
  if (rng.chance(0.25)) return undefined;
  const options = {};
  if (rng.chance(0.7)) options.size = rng.pick([10, 8, 5, 3, 2, 1, 0]);
  if (rng.chance(0.4)) options.teamCap = rng.pick([2, 1, 3, 0]);
  if (rng.chance(0.4)) options.withdrawn = new Set(rng.sample(rows.map((_, i) => pid(i + 1)), Math.min(rows.length, rng.int(0, 3))));
  return options;
}

function allRound(rng) {
  const players = rng.int(0, 7);
  const size = rng.pick([3, 4, 5]);
  const finals = Array.from({ length: 2 }, () => rng.grid(8, 9.6, 0.05));
  const marks = Array.from({ length: 2 }, () => judgeScores(rng, size));
  const rowsByApparatus = {};
  for (const apparatus of rng.sample(APPARATUS, rng.int(1, 3))) {
    rowsByApparatus[apparatus] = Array.from({ length: players }, (_, i) => {
      if (rng.chance(0.08)) return null; // an athlete with no mark on this apparatus
      return {
        playerId: pid(i + 1),
        playerName: `Player ${i + 1}`,
        teamId: `t${(i % 3) + 1}`,
        finalScore: rng.pick(finals),
        panelSize: rng.chance(0.9) ? size : undefined,
        judgeScores: { ...rng.pick(marks) },
      };
    }).filter(Boolean);
  }
  if (rng.chance(0.05)) rowsByApparatus[APPARATUS[0]] = null;
  if (rng.chance(0.2)) return [rowsByApparatus];
  const options = {};
  if (rng.chance(0.4)) options.size = rng.pick([2, 1, 3]);
  if (rng.chance(0.3)) options.withdrawn = new Set(rng.sample(Array.from({ length: players }, (_, i) => pid(i + 1)), Math.min(players, rng.int(0, 2))));
  if (rng.chance(0.5)) options.drawOrder = rng.shuffle(Array.from({ length: players }, (_, i) => pid(i + 1))).slice(0, rng.int(0, players));
  return [rowsByApparatus, options];
}

const qualifiers = (rng) => Array.from({ length: rng.int(0, 5) }, () => ({ playerId: pid(rng.int(1, 4)) }));

module.exports = {
  engine: 'qualification',
  functions: [
    {
      name: 'apparatusFinal',
      fn: qualification.apparatusFinal,
      fixed: [
        [null],
        [[]],
        // Three from one team: the third is skipped by the team cap.
        [[1, 2, 3, 4].map((rank) => ({ playerId: pid(rank), playerName: `P${rank}`, teamId: rank < 4 ? 't1' : 't2', rank, finalScore: 10 - rank }))],
        // A tie across the last place: the final waits for a draw.
        [[1, 2, 2].map((rank, i) => ({ playerId: pid(i + 1), playerName: `P${i}`, teamId: `t${i}`, rank, finalScore: 9 })), { size: 2 }],
        [[1, 2].map((rank, i) => ({ playerId: pid(i + 1), playerName: `P${i}`, teamId: `t${i}`, rank, finalScore: 9 })), { withdrawn: new Set([pid(1)]) }],
      ],
      gen: (rng) => {
        const rows = rankedRows(rng);
        return [rows, finalOptions(rng, rows)];
      },
    },
    { name: 'allRoundAgeGroup', fn: qualification.allRoundAgeGroup, fixed: [[null], [{}], [{ 'Pole Mallakhamb': [] }, {}]], gen: allRound },
    {
      name: 'sameQualifiers',
      fn: qualification.sameQualifiers,
      fixed: [[undefined, undefined], [[], []], [[{ playerId: 'a' }], [{ playerId: 'a' }]], [[{ playerId: 'a' }], [{ playerId: 'b' }]], [[{ playerId: 'a' }], []], [[{ playerId: 1 }], [{ playerId: '1' }]]],
      gen: (rng) => {
        const a = qualifiers(rng);
        return [a, rng.chance(0.4) ? a.map((q) => ({ ...q })) : qualifiers(rng)];
      },
    },
  ],
};
