/**
 * The Admin / Super Admin scoring sheet: one ROW per athlete × apparatus.
 *
 * A score document holds a row per athlete PER APPARATUS — somebody entered
 * for Pole, Hanging and Rope has three results. This sheet used to build one
 * row per athlete and save without an apparatus, and the server files a row
 * with no apparatus under Pole: on a multi-apparatus sheet each athlete's Pole
 * result was overwritten with the marks of whichever apparatus loaded last,
 * and only Pole stayed locked, so Hanging and Rope fell off the public results
 * (found by the lifecycle check, deploy/oci/E2E-COVERAGE.md).
 *
 * So every row here is keyed `playerId|apparatus`, loads the stored row with
 * that same key, and is posted with its apparatus.
 *
 * @module utils/scoring/adminSheet
 */

import { apparatusFor, entryGender } from './apparatus';
import { ageMatches } from '@/hooks/useAgeGroups';

/** What the server assumes for a row without one — kept identical on purpose. */
export const DEFAULT_APPARATUS = 'Pole Mallakhamb';

/** The key of one row: an athlete on one apparatus. */
export const rowKey = (playerId, apparatus) => `${String(playerId)}|${apparatus || DEFAULT_APPARATUS}`;

/** "Pole Mallakhamb" → "Pole", for the row label. */
export const apparatusLabel = (apparatus) => String(apparatus || DEFAULT_APPARATUS).replace(/\s*Mallakhamb$/i, '');

/**
 * The sheet's rows for one team in one category and competition type.
 *
 * @param {{_id: string, name: string, players: Array}} team - the submitted team (location state)
 * @param {string} gender
 * @param {string} ageGroup
 * @param {string} competitionType - slug or display form; apparatusFor accepts either
 * @returns {Array<{id: string, playerId: string, apparatus: string, name: string,
 *   athleteName: string, gender: string, ageGroup: string, teamId: string, teamName: string}>}
 */
export function sheetRows(team, gender, ageGroup, competitionType) {
  const rows = [];
  for (const entry of team?.players || []) {
    if (!entry?.player || entryGender(entry) !== gender || !ageMatches(entry.ageGroup, ageGroup)) continue;
    const athleteName = `${entry.player.firstName || ''} ${entry.player.lastName || ''}`.trim();
    const registered = apparatusFor(entry, competitionType);
    // An entry that names no apparatus at all is Pole, as on the server; one
    // that names apparatus for OTHER competition types is not in this one.
    const raw = entry.apparatus;
    const namesNone = !raw || (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0);
    if (!registered.length && !namesNone) continue;
    for (const apparatus of (registered.length ? registered : [DEFAULT_APPARATUS])) {
      rows.push({
        id: rowKey(entry.player._id, apparatus),
        playerId: String(entry.player._id),
        apparatus,
        name: `${athleteName} · ${apparatusLabel(apparatus)}`,
        athleteName,
        gender: entry.player.gender,
        ageGroup: entry.ageGroup,
        teamId: team._id,
        teamName: team.name,
      });
    }
  }
  return rows;
}

/**
 * The row a stored player score belongs to: same athlete AND same apparatus.
 * A stored row without an apparatus is Pole (that is how the server filed it);
 * when the athlete has no Pole row it goes to their only row, if they have
 * exactly one — never to "any row of that athlete".
 *
 * @param {Array} rows - from sheetRows
 * @param {{playerId: *, apparatus?: string}} stored
 * @returns {string|null} the row id
 */
export function rowFor(rows, stored) {
  const pid = String(stored?.playerId ?? '');
  const exact = rows.find((r) => r.id === rowKey(pid, stored?.apparatus));
  if (exact) return exact.id;
  if (!stored?.apparatus) {
    const theirs = rows.filter((r) => r.playerId === pid);
    if (theirs.length === 1) return theirs[0].id;
  }
  return null;
}

/**
 * The `playerScores` the save posts: every row, with its apparatus.
 *
 * @param {Array} rows - from sheetRows
 * @param {Object} scores - the sheet's inputs, keyed by row id
 * @param {(inputs: Object) => {executionAvg, baseScore, baseScoreApplied, tolerance, average}} average
 * @param {(inputs: Object) => string|number} finalScore
 * @returns {Array<Object>}
 */
export function playerScoresFor(rows, scores, average, finalScore) {
  return rows.map((row) => {
    const inputs = scores[row.id] || {};
    const r = average(inputs);
    const mark = (field) => parseFloat(inputs[field]) || 0;
    return {
      playerId: row.playerId,
      playerName: row.athleteName,
      apparatus: row.apparatus,
      time: inputs.time,
      judgeScores: {
        seniorJudge: mark('seniorJudge'),
        judge1: mark('judge1'),
        judge2: mark('judge2'),
        judge3: mark('judge3'),
        judge4: mark('judge4'),
      },
      executionAverage: r.executionAvg,
      baseScore: r.baseScore,
      baseScoreApplied: r.baseScoreApplied,
      toleranceUsed: r.tolerance,
      averageMarks: r.average,
      deduction: mark('deduction'),
      otherDeduction: mark('otherDeduction'),
      finalScore: parseFloat(finalScore(inputs)),
    };
  });
}
