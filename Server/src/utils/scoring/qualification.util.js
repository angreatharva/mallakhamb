/**
 * Who goes from Competition I into the finals — the rules, with no database.
 *
 * Owner, 2026-10-29 (docs/qualification-plan.md). COP names, the owner's
 * numbers:
 *
 *  - Competition III (Apparatus Championship): per gender × age group ×
 *    apparatus, the TOP 10 on that apparatus in Competition I, at most TWO from
 *    one registered team (a team's third player is passed over and the next
 *    player gets the place). No minimum score.
 *  - Competition II (All Round Individual): per gender, ONE final with the TOP 2
 *    of every age group, ranked on the SUM of their Competition I final scores
 *    over every apparatus of their gender (an apparatus not performed counts 0).
 *    No team cap. No minimum score.
 *
 * Ties at the cut line follow the COP tie-break. For III the Competition I
 * standing already carries it (ranking.util + recorded lucky draws), so a tie
 * that the rules leave standing at the cut shows up as two players on one rank;
 * the final then WAITS for the admin to record the draw on that standing. For
 * II the steps run on the sums (base scores, then the average of four judges,
 * then (average + Chief)/2), and a tie they cannot break waits for a draw the
 * admin records on the final itself (`drawOrder`).
 *
 * A withdrawn player is passed over and the next in rank fills the place.
 *
 * @module utils/scoring/qualification.util
 */

const { baseScoreOf, fourJudgeAverageOf, fourJudgeAverageWithChiefOf } = require('./tie-breaker.util');

const APPARATUS_FINAL_SIZE = 10;
const APPARATUS_TEAM_CAP = 2;
const ALL_ROUND_PER_AGE_GROUP = 2;
const EPSILON = 1e-6;

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * Competition III: one apparatus, one age group, one gender.
 *
 * @param {Array<Object>} ranked - the Competition I standing for that
 *   apparatus, already ranked by ranking.util (each row: playerId, teamId,
 *   playerName, finalScore, rank, tieBreakInfo)
 * @param {Object} [options]
 * @param {number} [options.size=10]
 * @param {number} [options.teamCap=2]
 * @param {Set<string>} [options.withdrawn] - player ids passed over
 * @returns {{status: 'ready'|'waiting_draw', qualifiers: Array, skipped: Array, tied: Array}}
 */
function apparatusFinal(ranked, { size = APPARATUS_FINAL_SIZE, teamCap = APPARATUS_TEAM_CAP, withdrawn = new Set() } = {}) {
  const rows = [...(ranked || [])].sort((a, b) => num(a.rank) - num(b.rank));
  const qualifiers = [];
  const skipped = [];
  const perTeam = new Map();

  // The eligible rows, in order: withdrawn and over-cap players are passed over.
  const eligible = [];
  for (const row of rows) {
    const playerId = idOf(row.playerId);
    if (withdrawn.has(playerId)) {
      skipped.push({ playerId, playerName: row.playerName, teamId: idOf(row.teamId), reason: 'withdrawn' });
      continue;
    }
    const team = idOf(row.teamId);
    const count = perTeam.get(team) || 0;
    if (teamCap && count >= teamCap) {
      skipped.push({ playerId, playerName: row.playerName, teamId: team, reason: 'team_cap', rank: row.rank });
      continue;
    }
    perTeam.set(team, count + 1);
    eligible.push(row);
  }

  for (let i = 0; i < eligible.length && qualifiers.length < size; i++) {
    qualifiers.push(eligible[i]);
  }

  // A tie across the cut: the last place in and the first place out share a
  // rank — the rules (and any recorded draw) could not separate them.
  const last = qualifiers[qualifiers.length - 1];
  const firstOut = eligible[qualifiers.length];
  if (last && firstOut && num(last.rank) === num(firstOut.rank)) {
    const tiedRank = num(last.rank);
    const tied = eligible.filter((row) => num(row.rank) === tiedRank);
    return {
      status: 'waiting_draw',
      qualifiers: qualifiers.filter((row) => num(row.rank) < tiedRank).map(toQualifier),
      skipped,
      tied: tied.map(toQualifier),
    };
  }

  return { status: 'ready', qualifiers: qualifiers.map(toQualifier), skipped, tied: [] };
}

/**
 * Competition II: one age group's top two by the sum over every apparatus.
 *
 * @param {Object<string, Array<Object>>} rowsByApparatus - published
 *   Competition I rows of this gender + age group, keyed by apparatus
 * @param {Object} [options]
 * @param {number} [options.size=2]
 * @param {Set<string>} [options.withdrawn]
 * @param {Array<string>} [options.drawOrder] - player ids in the order the
 *   admin drew them, for a tie the rules cannot break
 * @returns {{status: 'ready'|'waiting_draw', qualifiers: Array, skipped: Array, tied: Array, standing: Array}}
 */
function allRoundAgeGroup(rowsByApparatus, { size = ALL_ROUND_PER_AGE_GROUP, withdrawn = new Set(), drawOrder = [] } = {}) {
  const players = new Map();
  for (const [apparatus, rows] of Object.entries(rowsByApparatus || {})) {
    for (const row of rows || []) {
      const playerId = idOf(row.playerId);
      if (!playerId) continue;
      if (!players.has(playerId)) {
        players.set(playerId, {
          playerId, playerName: row.playerName, teamId: idOf(row.teamId),
          total: 0, base: 0, avg4: 0, avg4Chief: 0, apparatus: {},
        });
      }
      const p = players.get(playerId);
      const panel = row.panelSize;
      p.total += num(row.finalScore);
      p.base += num(baseScoreOf(row, panel));
      p.avg4 += num(fourJudgeAverageOf(row, panel));
      p.avg4Chief += num(fourJudgeAverageWithChiefOf(row, panel));
      p.apparatus[apparatus] = num(row.finalScore);
    }
  }

  const drawn = new Map((drawOrder || []).map((id, i) => [String(id), i]));
  const cmp = (a, b) => {
    for (const key of ['total', 'base', 'avg4', 'avg4Chief']) {
      const diff = b[key] - a[key];
      if (Math.abs(diff) > EPSILON) return diff;
    }
    if (drawn.has(a.playerId) && drawn.has(b.playerId)) return drawn.get(a.playerId) - drawn.get(b.playerId);
    return 0;
  };
  const standing = [...players.values()].sort((a, b) => cmp(a, b) || a.playerId.localeCompare(b.playerId));
  // Ranks: equal only when every step (and the draw) left them level.
  standing.forEach((p, i) => {
    p.rank = i > 0 && cmp(standing[i - 1], p) === 0 ? standing[i - 1].rank : i + 1;
  });

  const skipped = [];
  const eligible = standing.filter((p) => {
    if (withdrawn.has(p.playerId)) {
      skipped.push({ playerId: p.playerId, playerName: p.playerName, teamId: p.teamId, reason: 'withdrawn' });
      return false;
    }
    return true;
  });
  const qualifiers = eligible.slice(0, size);
  const last = qualifiers[qualifiers.length - 1];
  const firstOut = eligible[qualifiers.length];
  const asRow = (p) => ({ playerId: p.playerId, playerName: p.playerName, teamId: p.teamId, rank: p.rank, score: round(p.total), apparatus: p.apparatus });
  if (last && firstOut && last.rank === firstOut.rank) {
    const tied = eligible.filter((p) => p.rank === last.rank);
    return {
      status: 'waiting_draw',
      qualifiers: qualifiers.filter((p) => p.rank < last.rank).map(asRow),
      skipped,
      tied: tied.map(asRow),
      standing: standing.map(asRow),
    };
  }
  return { status: 'ready', qualifiers: qualifiers.map(asRow), skipped, tied: [], standing: standing.map(asRow) };
}

function toQualifier(row) {
  return {
    playerId: idOf(row.playerId),
    playerName: row.playerName,
    teamId: idOf(row.teamId),
    rank: num(row.rank),
    score: round(num(row.finalScore)),
  };
}

const round = (value) => Math.round(num(value) * 1000) / 1000;

/** Same people, same order? (Used to tell a real change from a recompute.) */
function sameQualifiers(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((q, i) => String(q.playerId) === String(b[i].playerId));
}

module.exports = {
  apparatusFinal,
  allRoundAgeGroup,
  sameQualifiers,
  APPARATUS_FINAL_SIZE,
  APPARATUS_TEAM_CAP,
  ALL_ROUND_PER_AGE_GROUP,
};
