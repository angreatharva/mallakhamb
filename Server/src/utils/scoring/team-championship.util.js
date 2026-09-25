/**
 * Team Championship — how a squad's athletes add up to one team score.
 *
 * A coach declares the squad size when the team is created (`Team.maxTeamSize`),
 * and the size decides how many scores count:
 *
 *   4-player team → best 3 per apparatus
 *   6-player team → best 5 per apparatus
 *
 * Counted PER APPARATUS, then summed. Pole and Rope are separate events on
 * separate score sheets, so "the best five" across both would let one strong
 * apparatus carry a squad that never fielded five on the other. Each apparatus
 * contributes its own best N, and the team total is the sum of those subtotals.
 *
 * Pure functions over plain data — no repository, no request. The admin
 * rankings and the public board both call this, so the two cannot disagree
 * about which scores were dropped.
 *
 * @module utils/scoring/team-championship.util
 */

const { rankByScore } = require('./ranking.util');
const { apparatusKey } = require('../../config/cop-rules');

/** The squad sizes a coach may declare, and how many scores each counts. */
const TEAM_SIZE_COUNTED = Object.freeze({ 4: 3, 6: 5 });
const TEAM_SIZES = Object.freeze(Object.keys(TEAM_SIZE_COUNTED).map(Number));

/**
 * Teams created before the size existed carry none. Five is what this code
 * base always documented as the team rule ("sum of top 5"), so a legacy team
 * is read as a 6-player squad rather than having every score counted.
 */
const DEFAULT_TEAM_SIZE = 6;

/**
 * @param {*} value - a stored or submitted `maxTeamSize`
 * @returns {boolean}
 */
function isValidTeamSize(value) {
  return TEAM_SIZES.includes(Number(value));
}

/**
 * The declared size, or the legacy default when none was declared.
 * @param {*} maxTeamSize
 * @returns {number}
 */
function effectiveTeamSize(maxTeamSize) {
  return isValidTeamSize(maxTeamSize) ? Number(maxTeamSize) : DEFAULT_TEAM_SIZE;
}

/**
 * How many scores count per apparatus for a squad of this size.
 * @param {*} maxTeamSize
 * @returns {number}
 */
function countedScoresFor(maxTeamSize) {
  return TEAM_SIZE_COUNTED[effectiveTeamSize(maxTeamSize)];
}

/**
 * How many athletes a squad already fields in one category.
 *
 * The squad cap is `maxTeamSize` per gender + age group. The athlete being
 * written is left out, so re-posting someone (a move between age groups goes
 * through the same write) is not blocked by their own existing place.
 *
 * @param {Array<{player?: *, gender?: string, ageGroup?: string}>} entries - `registeredTeams[].players`
 * @param {string} gender
 * @param {string} ageGroup
 * @param {*} [excludePlayerId]
 * @returns {number}
 */
function entriesInCategory(entries, gender, ageGroup, excludePlayerId = null) {
  const exclude = excludePlayerId == null ? null : String(excludePlayerId);
  return (entries || []).filter((entry) =>
    entry.gender === gender
    && entry.ageGroup === ageGroup
    && !(exclude && entry.player && String(entry.player._id || entry.player) === exclude)
  ).length;
}

/**
 * Is there room for one more athlete in this category? A team with no declared
 * size (created before the field existed) is not capped.
 *
 * @param {*} maxTeamSize
 * @param {Object[]} entries
 * @param {string} gender
 * @param {string} ageGroup
 * @param {*} [excludePlayerId]
 * @returns {boolean}
 */
function hasRoomInSquad(maxTeamSize, entries, gender, ageGroup, excludePlayerId = null) {
  if (!isValidTeamSize(maxTeamSize)) return true;
  return entriesInCategory(entries, gender, ageGroup, excludePlayerId) < Number(maxTeamSize);
}

/** Sums carry three decimals, like every final score (COP base scores, e.g. 9.225). */
const round3 = (n) => Number((Number(n) || 0).toFixed(3));

/**
 * One team's championship score.
 *
 * @param {Object} team
 * @param {*} [team.maxTeamSize]
 * @param {Array<{playerId?: *, playerName?: string, apparatus?: string, finalScore?: number}>} team.performances
 * @returns {{
 *   teamSize: number,
 *   countedPerApparatus: number,
 *   totalScore: number,
 *   apparatus: Array<{apparatus: string, subtotal: number, counted: Object[], dropped: Object[]}>
 * }}
 */
function scoreTeam(team) {
  const teamSize = effectiveTeamSize(team?.maxTeamSize);
  const counted = countedScoresFor(teamSize);

  const byApparatus = new Map();
  for (const performance of team?.performances || []) {
    const key = apparatusKey(performance.apparatus);
    if (!byApparatus.has(key)) byApparatus.set(key, []);
    byApparatus.get(key).push({ ...performance, apparatus: key, finalScore: round3(performance.finalScore) });
  }

  const apparatus = [...byApparatus.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, performances]) => {
      const sorted = [...performances].sort((a, b) => b.finalScore - a.finalScore);
      const kept = sorted.slice(0, counted);
      return {
        apparatus: name,
        subtotal: round3(kept.reduce((sum, p) => sum + p.finalScore, 0)),
        counted: kept,
        dropped: sorted.slice(counted),
      };
    });

  return {
    teamSize,
    countedPerApparatus: counted,
    totalScore: round3(apparatus.reduce((sum, a) => sum + a.subtotal, 0)),
    apparatus,
  };
}

/**
 * Score and place every team in one category.
 *
 * Teams level on the total share a placing — the individual tie-break rules
 * describe one athlete's performance and have no team equivalent (see
 * `calculateTeamRankings` in ranking.util.js).
 *
 * @param {Array<{maxTeamSize?: *, performances: Object[]}>} teams - other properties are carried through
 * @returns {Array<Object>} each team plus the `scoreTeam` fields and `rank`, best first
 */
function rankTeamChampionship(teams) {
  const scored = (teams || []).map((team) => ({ ...team, ...scoreTeam(team) }));
  return rankByScore(scored, (team) => team.totalScore);
}

module.exports = {
  TEAM_SIZES,
  TEAM_SIZE_COUNTED,
  DEFAULT_TEAM_SIZE,
  isValidTeamSize,
  effectiveTeamSize,
  countedScoresFor,
  entriesInCategory,
  hasRoomInSquad,
  scoreTeam,
  rankTeamChampionship,
};
