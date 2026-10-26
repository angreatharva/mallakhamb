/**
 * Slip Breakdown Utilities
 *
 * Which judge slips a published Difficulty / Combination / Execution breakdown
 * is averaged over. This is the server twin of `averageSlipBreakdown` in
 * Web/src/utils/scoring/copRules.js, which the public results board and the
 * performance panel render; Web/src/utils/scoring/slipBreakdownSync.test.js
 * feeds both the same slips and requires the same answer, so a profile graph
 * and the results page can never disagree about an athlete's sections.
 *
 * The rule (user-dictated, 2026-09-26):
 *   - 3 judges: all three slips (Senior Judge, Judge 1, Judge 2).
 *   - 5 judges: Senior Judge excluded; of Judges 1–4 drop the highest and the
 *     lowest slip BY TOTAL and average the middle two.
 *   - 4 judges: the Senior Judge's slip fills the fourth seat, then the same
 *     drop-high/low → middle two.
 * Chosen by total so the four sections sum to the panel average.
 */

const { JUDGE_ROLE_MAP } = require('./judge-slip.util');

/** `SR_JUDGE` → `Senior Judge`, `J1` → `Judge 1`, … */
const SEAT_BY_ROLE = Object.freeze(
  Object.fromEntries(Object.entries(JUDGE_ROLE_MAP).map(([seat, { role }]) => [role, seat]))
);

const EVALUATOR_SEATS = Object.freeze(['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);

const num = (value) => Number(value) || 0;

/**
 * The panel slips of one performance, keyed by seat. A slip whose role is not a
 * panel seat (`CHIEF`, `J5`) is ignored, exactly as the web twin does.
 *
 * @param {Array<Object>} slips - `playerScores[].judgeSlips`
 * @returns {Object<string, Object>} seat → { seat, role, difficulty, combination, execution, bonus, total, slip }
 */
function slipsBySeat(slips = []) {
  const bySeat = {};
  (slips || []).forEach((s) => {
    const seat = SEAT_BY_ROLE[s?.judgeRole];
    if (!seat) return;
    bySeat[seat] = {
      seat,
      role: s.judgeRole,
      difficulty: num(s.difficultyScore),
      combination: num(s.combinationScore),
      execution: num(s.executionScore),
      bonus: num(s.bonusScore),
      total: num(s.total),
      slip: s,
    };
  });
  return bySeat;
}

/**
 * The published breakdown of one performance.
 *
 * @param {Array<Object>} slips
 * @param {number} [panelSize] - 3, 4 or 5; inferred from the slips when absent
 * @returns {null|{difficulty:number, combination:number, execution:number, bonus:number,
 *   used:number, panelSize:number, countedSeats:string[]}}
 */
function averageSlipBreakdown(slips = [], panelSize) {
  const bySeat = slipsBySeat(slips);
  const senior = bySeat['Senior Judge'];
  const evaluators = EVALUATOR_SEATS.map((seat) => bySeat[seat]).filter(Boolean);
  const seated = [3, 4, 5].includes(Number(panelSize))
    ? Number(panelSize)
    : Object.keys(bySeat).length;

  let counted;
  if (seated >= 4) {
    const pool = seated === 4 && senior ? [...evaluators, senior] : evaluators;
    // A stable sort, so on equal totals the earlier seat is the one dropped low.
    counted = pool.length >= 3
      ? [...pool].sort((a, b) => a.total - b.total).slice(1, -1)
      : pool;
  } else {
    counted = [senior, ...evaluators].filter(Boolean);
  }
  if (counted.length === 0) return null;

  const mean = (key) => counted.reduce((sum, s) => sum + s[key], 0) / counted.length;
  return {
    difficulty: mean('difficulty'),
    combination: mean('combination'),
    execution: mean('execution'),
    bonus: mean('bonus'),
    used: counted.length,
    panelSize: seated,
    countedSeats: counted.map((s) => s.seat),
  };
}

module.exports = {
  SEAT_BY_ROLE,
  EVALUATOR_SEATS,
  slipsBySeat,
  averageSlipBreakdown,
};
