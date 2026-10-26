/**
 * Judge Lean Statistics
 *
 * Pure arithmetic behind "Marking insights" (a judge's own profile) and the
 * admin "Judge fairness" board. Nothing here reads the database.
 *
 * The method is designed to be FAIR to judges before it is useful against them:
 *
 *  1. Deviation. For every performance a judge marked, their mark minus the
 *     MEDIAN of the OTHER judges on that panel (leave-one-out, so a judge can
 *     never pull the reference toward themself). A median, so one wild
 *     colleague cannot make everyone else look biased.
 *  2. Strictness. A judge's average deviation over everything they marked.
 *     Some judges are simply strict or generous with everyone; that is a
 *     style, not partiality, and it is shown as such.
 *  3. Lean toward a team. Their average deviation on that team MINUS their
 *     average deviation on every other team. Strictness cancels out, so what
 *     is left is "this judge treats this team differently from the rest".
 *  4. Flagged only when it is real: at least MIN_PERFORMANCES of that team,
 *     a lean of at least MIN_LEAN points, and a 90 % confidence interval that
 *     does not include zero. Anything less is reported as "not enough to say",
 *     never coloured as a lean.
 */

const THRESHOLDS = Object.freeze({
  minPerformances: 6,
  minLean: 0.30,
  confidence: 0.90,
  /** A deviation needs at least this many OTHER judges' marks to compare against. */
  minOtherJudges: 2,
});

const SECTIONS = Object.freeze(['total', 'difficulty', 'combination', 'execution']);

const round3 = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null);

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sample variance (n − 1). Null below two values. */
function variance(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/*
 * Student's t, upper 5 % point (two-sided 90 % interval), by degrees of
 * freedom. Past 30 the normal value is close enough for a flag threshold.
 */
const T_95 = [
  null, 6.314, 2.920, 2.353, 2.132, 2.015, 1.943, 1.895, 1.860, 1.833, 1.812,
  1.796, 1.782, 1.771, 1.761, 1.753, 1.746, 1.740, 1.734, 1.729, 1.725,
  1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697,
];
function tCritical(df) {
  if (!Number.isFinite(df) || df < 1) return null;
  return df < T_95.length ? T_95[Math.floor(df)] : 1.645;
}

/**
 * One judge's deviation from the rest of the panel on one performance.
 *
 * @param {string} ownSeat - the seat whose slip is being measured
 * @param {Object<string, Object>} bySeat - slip-breakdown.util `slipsBySeat` output
 * @returns {null|{total:number, difficulty:number, combination:number, execution:number, others:number}}
 */
function panelDeviation(ownSeat, bySeat) {
  const own = bySeat[ownSeat];
  if (!own) return null;
  const others = Object.values(bySeat).filter((s) => s.seat !== ownSeat);
  if (others.length < THRESHOLDS.minOtherJudges) return null;
  const result = { others: others.length };
  for (const key of SECTIONS) {
    result[key] = own[key] - median(others.map((s) => s[key]));
  }
  return result;
}

/**
 * Average and spread of a list of deviations.
 * @param {number[]} values
 * @returns {{n:number, mean:number|null, meanAbs:number|null, ci:[number,number]|null}}
 */
function describe(values) {
  const n = values.length;
  const m = mean(values);
  const v = variance(values);
  const t = tCritical(n - 1);
  const half = v !== null && t !== null ? t * Math.sqrt(v / n) : null;
  return {
    n,
    mean: round3(m),
    meanAbs: round3(mean(values.map(Math.abs))),
    ci: half === null ? null : [round3(m - half), round3(m + half)],
  };
}

/**
 * How differently a judge marks one group (a team, or their home-state teams)
 * compared with everyone else they marked.
 *
 * @param {number[]} inGroup - deviations on the group's performances
 * @param {number[]} outGroup - deviations on every other performance
 * @returns {{n:number, others:number, lean:number|null, ci:[number,number]|null,
 *   enough:boolean, flagged:boolean, groupMean:number|null, othersMean:number|null}}
 */
function compareGroups(inGroup, outGroup) {
  const nIn = inGroup.length;
  const nOut = outGroup.length;
  const inMean = mean(inGroup);
  const outMean = mean(outGroup);
  const base = {
    n: nIn,
    others: nOut,
    groupMean: round3(inMean),
    othersMean: round3(outMean),
  };

  if (nIn === 0 || nOut === 0) {
    return { ...base, lean: null, ci: null, enough: false, flagged: false };
  }

  const lean = inMean - outMean;
  const vIn = variance(inGroup);
  const vOut = variance(outGroup);
  const t = tCritical(Math.min(nIn, nOut) - 1);
  const se = vIn !== null && vOut !== null ? Math.sqrt(vIn / nIn + vOut / nOut) : null;
  const ci = se !== null && t !== null ? [lean - t * se, lean + t * se] : null;

  const enough = nIn >= THRESHOLDS.minPerformances && ci !== null;
  const excludesZero = ci !== null && (ci[0] > 0 || ci[1] < 0);
  // A hair of tolerance on the size test so 0.30 measured as 0.2999999 counts.
  const flagged = enough && Math.abs(lean) >= THRESHOLDS.minLean - 1e-9 && excludesZero;

  return {
    ...base,
    lean: round3(lean),
    ci: ci ? [round3(ci[0]), round3(ci[1])] : null,
    enough,
    flagged,
  };
}

/** A state unit as a comparable key: trimmed, case-folded, empty → null. */
function stateKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return key || null;
}

module.exports = {
  THRESHOLDS,
  SECTIONS,
  round3,
  mean,
  median,
  tCritical,
  panelDeviation,
  describe,
  compareGroups,
  stateKey,
};
