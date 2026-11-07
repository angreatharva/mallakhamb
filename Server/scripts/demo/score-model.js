/**
 * The demo score model: what an athlete actually performed, and what each
 * judge wrote down.
 *
 * Everything stays inside the COP rules the server checks — the D/C/E ceilings,
 * the element mix and its C→B→A cascade, the combination checklist, the time
 * table — because the slips go through the real endpoints and a slip the app
 * would refuse is a seed that stops halfway.
 *
 * Judges AGREE on D and C (they are facts: which elements, which checklist
 * items) and differ on Execution, which is the subjective mark. A judge's
 * Execution = the truth + their strictness + their lean toward a club + a
 * little noise, rounded half-down to 0.1 the way the slip rounds it.
 *
 * @module scripts/demo/score-model
 */

const {
  getDifficultyRequirement,
  resolveDifficultyValue,
  getCombinationChecklist,
  POINT_CEILINGS,
} = require('../../src/config/cop-rules');
const { createRng } = require('./rng');

const round2 = (x) => Number(x.toFixed(2));
/** Half-down to 0.1: 3.25 → 3.2, 3.26 → 3.3. */
const roundExecution = (x) => Math.ceil(Number((x * 10).toFixed(6)) - 0.5) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * The performance itself.
 *
 * @param {object} cast
 * @param {object} athlete
 * @param {object} meet
 * @param {string} apparatus
 * @param {string} competitionType
 */
function performance(cast, athlete, meet, apparatus, competitionType) {
  const rng = createRng(`${cast.seed}|perf|${athlete.key}|${meet.place}|${apparatus}|${competitionType}`);

  // Meets this athlete has already had this season → growth.
  const before = cast.meets.filter((m) => m.order < meet.order
    && m.entries.some((e) => e.athletes.includes(athlete.key))).length;
  const quality = clamp(
    athlete.ability + (athlete.affinity[apparatus] || 0) + athlete.growth * before
      + rng.normal(competitionType === 'competition_1' ? 0.14 : 0.18),
    5.6, 9.75
  );

  // D — the element mix. Strong routines carry the full mix; weaker ones drop
  // an element or two (an A first, then a B); a weak-on-difficulty athlete
  // drops one more.
  const required = getDifficultyRequirement(competitionType);
  const counts = { ...required };
  let missing = quality >= 8.6 ? 0 : quality >= 7.9 ? rng.int(0, 1) : quality >= 7.2 ? rng.int(1, 2) : rng.int(2, 3);
  if (athlete.weak === 'difficulty' && quality < 8.8) missing += 1;
  for (let i = 0; i < missing; i += 1) {
    if (counts.A > 0 && rng.chance(0.6)) counts.A -= 1;
    else if (counts.B > 0) counts.B -= 1;
    else if (counts.A > 0) counts.A -= 1;
  }
  const difficulty = resolveDifficultyValue(counts, required);
  const D = round2(difficulty.total);

  // C — the combination checklist; cheaper items are missed first.
  const checklist = getCombinationChecklist(apparatus);
  let misses = quality >= 8.8 ? 0 : quality >= 8.0 ? (rng.chance(0.35) ? 1 : 0) : rng.int(1, 2);
  if (athlete.weak === 'combination' && quality < 9.0) misses += 1;
  const byPenalty = [...checklist].sort((a, b) => a.penalty - b.penalty);
  const unmet = rng.shuffle(byPenalty.slice(0, Math.min(byPenalty.length, misses + 2)))
    .slice(0, misses).map((item) => item.id);
  const C = round2(POINT_CEILINGS.combination
    - checklist.filter((i) => unmet.includes(i.id)).reduce((s, i) => s + i.penalty, 0));

  // E — what is left of the quality, within the 4.40 ceiling.
  let E = quality - D - C;
  if (athlete.weak === 'execution') E -= 0.25;
  E = roundExecution(clamp(E, 1.8, POINT_CEILINGS.execution));

  // Time — mostly inside 60–90 s; about one in twelve runs short or long.
  let time = rng.int(64, 88);
  if (rng.chance(0.08)) time = rng.chance(0.5) ? rng.int(52, 59) : rng.int(91, 99);

  return { counts, D, unmet, C, E, time };
}

/**
 * One judge's Execution for a performance.
 *
 * @param {object} cast
 * @param {object} judge
 * @param {object} perf
 * @param {{clubId: string, athleteKey: string, place: string, apparatus: string, type: string, isChief: boolean, exact: boolean}} ctx
 */
function judgeExecution(cast, judge, perf, ctx) {
  if (ctx.exact) return perf.E;
  const rng = createRng(`${cast.seed}|slip|${judge.key}|${ctx.athleteKey}|${ctx.place}|${ctx.apparatus}|${ctx.type}`);
  // The chief marks closest to the truth: his mark anchors the tolerance check.
  const noise = rng.normal(ctx.isChief ? 0.04 : 0.08);
  const lean = judge.bias[ctx.clubId] || 0;
  const strict = ctx.isChief ? 0 : judge.strictness;
  return roundExecution(clamp(perf.E + strict + lean + noise, 0, POINT_CEILINGS.execution));
}

/** The slip body the judge screen posts. */
function slipBody(competitionType, apparatus, perf, execution, unmet = perf.unmet) {
  const checklist = getCombinationChecklist(apparatus);
  const checked = {};
  let penalties = 0;
  for (const item of checklist) {
    const met = !unmet.includes(item.id);
    checked[item.id] = met;
    if (!met) penalties += item.penalty;
  }
  const combination = { checked, total: round2(Math.max(0, POINT_CEILINGS.combination - penalties)) };
  const difficulty = {
    aClass: perf.counts.A,
    bClass: perf.counts.B,
    cClass: perf.counts.C,
    total: perf.D,
  };
  return {
    score: round2(difficulty.total + combination.total + execution),
    breakdown: { difficulty, combination, execution, bonus: 0 },
  };
}

module.exports = { performance, judgeExecution, slipBody, roundExecution };
