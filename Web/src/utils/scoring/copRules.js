/**
 * Code of Points (COP) rules — frontend mirror.
 *
 * Source: MFI Code of Points, November 2022 Edition. This mirrors the backend
 * Server/src/config/cop-rules.js so the judge slip renders apparatus-specific
 * combination checklists and validates the same ceilings the server enforces.
 *
 * Keep this in sync with the backend copy until both are unified behind a
 * served endpoint (see plan follow-ups). Values here drive display + client
 * validation only; the server remains the source of truth for saved scores.
 */

export const COP_EDITION = 'COP Nov 2022';

// §3.3 — universal point distribution.
export const POINT_CEILINGS = Object.freeze({
  difficulty: 3.80,
  combination: 1.60,
  execution: 4.40,
  bonus: 0.20,
  total: 10.00,
});

// §3.1 — element class values.
export const ELEMENT_CLASS_VALUES = Object.freeze({ A: 0.20, B: 0.40, C: 0.60 });

// §3.2 — required A/B/C difficulty mix per competition type.
export const DIFFICULTY_REQUIREMENTS = Object.freeze({
  COMPETITION_I: Object.freeze({ A: 4, B: 6, C: 1 }),
  COMPETITION_II_III: Object.freeze({ A: 1, B: 6, C: 2 }),
});

/**
 * Required A/B/C difficulty mix for a competition type.
 * Accepts slugs (competition_1/2/3) or display form (Competition I/II/III).
 */
export function getDifficultyRequirement(competitionType) {
  const t = String(competitionType || '').toLowerCase();
  const isCompI = t === 'competition_1' || t === 'competition i' || t === 'competition 1';
  return isCompI ? DIFFICULTY_REQUIREMENTS.COMPETITION_I : DIFFICULTY_REQUIREMENTS.COMPETITION_II_III;
}

// §3.4 — tolerance limit table (display/reference only on the client).
export function getTolerance(avgScore) {
  const s = Number(avgScore) || 0;
  if (s >= 9.00) return 0.10;
  if (s >= 8.00) return 0.20;
  if (s >= 7.00) return 0.30;
  if (s >= 6.00) return 0.40;
  if (s >= 5.00) return 0.50;
  return 1.00;
}

// §3.5 — time limit + deduction table.
export const TIME_LIMIT_SECONDS = 90;
export function getTimeDeduction(overageSeconds) {
  const over = Number(overageSeconds) || 0;
  if (over <= 0) return 0;
  if (over <= 3) return 0.20;
  if (over <= 5) return 0.30;
  if (over <= 9) return 0.40;
  return 0.50;
}

// §5.1–5.3 — per-apparatus combination checklists. Penalties sum to 1.60.
export const COMBINATION_CHECKLISTS = Object.freeze({
  'Pole Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of pole utilized', penalty: 0.10 },
    { id: 2, rule: "One 'B' acrobatic element from both sides", penalty: 0.20 },
    { id: 3, rule: "3 continuous acrobatic elements (≥1 'B')", penalty: 0.20 },
    { id: 4, rule: '1 Vertical Hold part', penalty: 0.20 },
    { id: 5, rule: '1 Horizontal Hold part', penalty: 0.20 },
    { id: 6, rule: 'Backbone flexibility hold', penalty: 0.10 },
    { id: 7, rule: '1 B-class mount', penalty: 0.10 },
    { id: 8, rule: '1 C-class dismount', penalty: 0.20 },
    { id: 9, rule: '2 transitions between hold positions', penalty: 0.20 },
    { id: 10, rule: 'Minimum 16 elements', penalty: 0.10 },
  ]),
  'Hanging Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of Hanging Mallakhamb utilized', penalty: 0.10 },
    { id: 2, rule: "'A' acrobatic element from both sides", penalty: 0.20 },
    { id: 3, rule: "3 continuous acrobatic elements (≥1 'B')", penalty: 0.20 },
    { id: 4, rule: '1 Vertical Hold part', penalty: 0.20 },
    { id: 5, rule: '1 Horizontal Hold part', penalty: 0.20 },
    { id: 6, rule: 'Backbone flexibility hold', penalty: 0.10 },
    { id: 7, rule: '1 B-class mount', penalty: 0.10 },
    { id: 8, rule: '1 C-class dismount', penalty: 0.20 },
    { id: 9, rule: '1 transition between hold positions', penalty: 0.20 },
    { id: 10, rule: 'Minimum 14 elements', penalty: 0.10 },
  ]),
  'Rope Mallakhamb': Object.freeze([
    { id: 1, rule: 'Rope held in legs at 4m height, at least once', penalty: 0.20 },
    { id: 2, rule: '2 holds showing forward + backward flexibility', penalty: 0.30 },
    { id: 3, rule: '1 Vertical AND ≥1 Horizontal hold part', penalty: 0.30 },
    { id: 4, rule: '1 B-class mount', penalty: 0.20 },
    { id: 5, rule: '1 C-class dismount', penalty: 0.20 },
    { id: 6, rule: '1 Strength part', penalty: 0.20 },
    { id: 7, rule: 'Minimum 18 elements', penalty: 0.20 },
  ]),
});

/** Canonical apparatus key from a short/long label; null if unrecognized. */
export function normalizeApparatus(apparatus) {
  const a = String(apparatus || '').toLowerCase();
  if (a.includes('pole')) return 'Pole Mallakhamb';
  if (a.includes('hang')) return 'Hanging Mallakhamb';
  if (a.includes('rope')) return 'Rope Mallakhamb';
  return null;
}

/** Combination checklist for an apparatus (defaults to Pole if unknown). */
export function getCombinationChecklist(apparatus) {
  const key = normalizeApparatus(apparatus) || 'Pole Mallakhamb';
  return COMBINATION_CHECKLISTS[key];
}

/** Women's competitions do not include Hanging Mallakhamb (§11 / rule 1.8.2). */
export function isApparatusAllowedForGender(apparatus, gender) {
  const key = normalizeApparatus(apparatus);
  const isFemale = String(gender || '').toLowerCase().startsWith('f');
  if (isFemale && key === 'Hanging Mallakhamb') return false;
  return true;
}

/**
 * Combination total = 1.60 minus the summed penalties of failed (unchecked)
 * items. `checkedById` maps item id → boolean (true = requirement met).
 */
export function computeCombinationTotal(apparatus, checkedById) {
  const checklist = getCombinationChecklist(apparatus);
  const penalties = checklist.reduce(
    (sum, item) => (checkedById?.[item.id] ? sum : sum + item.penalty),
    0
  );
  return Math.max(0, Number((POINT_CEILINGS.combination - penalties).toFixed(2)));
}

/**
 * Resolve difficulty point value using strict C→B→A cascade (v2 §3.2.1).
 *
 * When element counts differ from requirements, excess higher-class elements
 * cascade downward to fill lower-class slots. Crucially, each element retains
 * its ORIGINAL class value — a C element filling a B slot still scores 0.60,
 * not 0.40. The cascade priority follows the hierarchy: C → B → A.
 */
export function resolveDifficultyValue(counts, required) {
  const cCount = counts?.C || 0;
  const bCount = counts?.B || 0;
  const aCount = counts?.A || 0;
  const cReq = required?.C || 0;
  const bReq = required?.B || 0;
  const aReq = required?.A || 0;

  // Step 1: Fill C slots with C elements
  const cInC = Math.min(cCount, cReq);
  let cExcess = cCount - cInC;

  // Step 2: Fill B slots — original B first, then excess C (keeps C value)
  const bInB = Math.min(bCount, bReq);
  const bSlotsLeft = bReq - bInB;
  const cInB = Math.min(cExcess, bSlotsLeft);
  cExcess -= cInB;
  const bExcess = bCount - bInB;          // original B that didn't fit

  // Step 3: Fill A slots — original A first, then excess C, then excess B
  const aInA = Math.min(aCount, aReq);
  let aSlotsLeft = aReq - aInA;
  const cInA = Math.min(cExcess, aSlotsLeft);
  aSlotsLeft -= cInA;
  const bInA = Math.min(bExcess, aSlotsLeft);

  // Points — each element scored at its ORIGINAL class value
  const cPoints = (cInC + cInB + cInA) * ELEMENT_CLASS_VALUES.C;
  const bPoints = (bInB + bInA) * ELEMENT_CLASS_VALUES.B;
  const aPoints = aInA * ELEMENT_CLASS_VALUES.A;

  const bSlotsFilled = bInB + cInB;
  const aSlotsFilled = aInA + cInA + bInA;

  return {
    C: Number(cPoints.toFixed(2)),
    B: Number(bPoints.toFixed(2)),
    A: Number(aPoints.toFixed(2)),
    total: Math.min(Number((cPoints + bPoints + aPoints).toFixed(2)), POINT_CEILINGS.difficulty),
    shortfallFlag: (cInC < cReq) || (bSlotsFilled < bReq) || (aSlotsFilled < aReq),
    counts: { C: cInC + cInB + cInA, B: bInB + bInA, A: aInA }
  };
}

const JUDGE_TYPE_TO_FIELD = Object.freeze({
  'Senior Judge': 'seniorJudge',
  'Judge 1': 'judge1',
  'Judge 2': 'judge2',
  'Judge 3': 'judge3',
  'Judge 4': 'judge4',
});

/** Panel slots in display order: Senior Judge first, then Judge 1…4. */
export const JUDGE_ORDER = Object.freeze(Object.keys(JUDGE_TYPE_TO_FIELD));

/** Map panel review entries → { seniorJudge, judge1…judge4 } totals. */
export function panelScoresToJudgeFields(panelScores) {
  const fields = { seniorJudge: 0, judge1: 0, judge2: 0, judge3: 0, judge4: 0 };
  Object.values(panelScores || {}).forEach((entry) => {
    const field = JUDGE_TYPE_TO_FIELD[entry.judgeType];
    if (field) fields[field] = parseFloat(entry.score) || 0;
  });
  return fields;
}

/**
 * Panel average with COP tolerance (mirrors Server calculation.util).
 * @param {Object} judgeScores - { seniorJudge, judge1…judge4 }
 * @param {number} [panelSize] - 3 | 4 | 5; inferred from non-zero counts if omitted
 */
export function calculateAverageMarks(playerScores, panelSize) {
  const judgeScores = playerScores?.seniorJudge !== undefined || playerScores?.judge1 !== undefined
    ? playerScores
    : panelScoresToJudgeFields(playerScores);

  const seniorJudge = parseFloat(judgeScores.seniorJudge) || 0;
  const evalScores = [
    parseFloat(judgeScores.judge1) || 0,
    parseFloat(judgeScores.judge2) || 0,
    parseFloat(judgeScores.judge3) || 0,
    parseFloat(judgeScores.judge4) || 0,
  ].filter((s) => s > 0);

  const nonZeroCount = (seniorJudge > 0 ? 1 : 0) + evalScores.length;
  const size = panelSize || (nonZeroCount === 3 ? 3 : nonZeroCount >= 5 ? 5 : nonZeroCount === 4 ? 4 : 0);

  if (size === 3) {
    if (evalScores.length < 3 && nonZeroCount < 3) {
      return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0, tolerance: 0, difference: 0, method: null };
    }
    // Only judge slip totals — never include time/deduction/other fields
    const totals = [
      seniorJudge,
      parseFloat(judgeScores.judge1) || 0,
      parseFloat(judgeScores.judge2) || 0,
      parseFloat(judgeScores.judge3) || 0,
      parseFloat(judgeScores.judge4) || 0,
    ].filter((s) => s > 0);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    return {
      average: parseFloat(avg.toFixed(2)),
      baseScoreApplied: false,
      executionAvg: parseFloat(avg.toFixed(2)),
      baseScore: 0,
      tolerance: 0,
      difference: 0,
      method: '3_JUDGE_SIMPLE_AVERAGE',
    };
  }

  if (evalScores.length === 0) {
    return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0, tolerance: 0, difference: 0, method: null };
  }

  const sorted = [...evalScores].sort((a, b) => a - b);
  let executionAverage;
  let method;
  if (size === 5 || sorted.length === 4) {
    const middle = sorted.slice(1, -1);
    executionAverage = middle.reduce((a, b) => a + b, 0) / middle.length;
    method = '5_JUDGE_STANDARD_COP';
  } else {
    // 4-judge: average all 3 eval judges (no drop)
    executionAverage = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    method = '4_JUDGE_AS_5_JUDGE_EQUIVALENT';
  }

  const tolerance = getTolerance(executionAverage);
  if (seniorJudge === 0) {
    return {
      average: parseFloat(executionAverage.toFixed(2)),
      baseScoreApplied: false,
      executionAvg: parseFloat(executionAverage.toFixed(2)),
      baseScore: 0,
      tolerance,
      difference: 0,
      method,
    };
  }

  const difference = Math.abs(executionAverage - seniorJudge);
  if (difference <= tolerance) {
    return {
      average: parseFloat(executionAverage.toFixed(2)),
      baseScoreApplied: false,
      executionAvg: parseFloat(executionAverage.toFixed(2)),
      baseScore: 0,
      tolerance,
      difference: parseFloat(difference.toFixed(2)),
      method,
    };
  }

  const baseScore = (executionAverage + seniorJudge) / 2;
  return {
    average: parseFloat(baseScore.toFixed(2)),
    baseScoreApplied: true,
    executionAvg: parseFloat(executionAverage.toFixed(2)),
    baseScore: parseFloat(baseScore.toFixed(2)),
    tolerance,
    difference: parseFloat(difference.toFixed(2)),
    method,
  };
}

/**
 * Cross-judge panel mismatch checks for Panel Review.
 * Combination/Difficulty compare the actual selections (checklist / A-B-C counts),
 * not only the section totals — two slips can share a total while disagreeing on why.
 * Tolerance mismatch applies only to 4/5-judge panels (not 3).
 *
 * @param {Object} panelScores - { [judgeType]: { judgeType, score, breakdown } }
 * @param {number} panelSize - Expected panel size (3, 4, or 5)
 */
export function analyzePanelMismatches(panelScores, panelSize) {
  // Iterate in panel order (Senior Judge, Judge 1…4) so every list this
  // produces reads in the same sequence the panel is numbered in.
  const slips = JUDGE_ORDER
    .map((jt) => panelScores?.[jt])
    .filter((e) => e && (e.breakdown || e.score != null));
  const nearlyEqual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

  const difficultyValues = slips
    .map((s) => s.breakdown?.difficulty?.total)
    .filter((v) => v !== undefined && v !== null);
  const combinationValues = slips
    .map((s) => s.breakdown?.combination?.total)
    .filter((v) => v !== undefined && v !== null);

  // Slips reloaded from the server carry only the section totals — the element
  // counts and checklist selections are not persisted per judge and come back
  // as zeros. Comparing those against a slip that does have the detail would
  // report a mismatch that no judge actually entered, so restrict the
  // element-level comparisons to slips that carry real detail.
  const detailedSlips = slips.filter((s) => s.breakdown?.detailed !== false);

  // Difficulty: totals OR A/B/C element counts must agree across judges
  const difficultyMixKeys = detailedSlips.map((s) => {
    const d = s.breakdown?.difficulty || {};
    return `${d.aClass ?? 0}|${d.bClass ?? 0}|${d.cClass ?? 0}`;
  });
  const difficultyTotalMismatch =
    difficultyValues.length >= 2 && !difficultyValues.every((v) => nearlyEqual(v, difficultyValues[0]));
  const difficultyMixMismatch =
    difficultyMixKeys.length >= 2 && !difficultyMixKeys.every((k) => k === difficultyMixKeys[0]);
  const difficultyMismatch = difficultyTotalMismatch || difficultyMixMismatch;

  // Combination: totals OR checklist selections must agree across judges
  const allComboIds = new Set();
  detailedSlips.forEach((s) => {
    Object.keys(s.breakdown?.combination?.checked || {}).forEach((id) => allComboIds.add(Number(id)));
  });
  const sortedComboIds = [...allComboIds].sort((a, b) => a - b);
  const combinationFingerprints = detailedSlips.map((s) => {
    const checked = s.breakdown?.combination?.checked || {};
    // Missing key treated as unmet (same as false) so selections compare consistently
    return sortedComboIds.map((id) => `${id}:${checked[id] ? 1 : 0}`).join(',');
  });
  const combinationTotalMismatch =
    combinationValues.length >= 2 && !combinationValues.every((v) => nearlyEqual(v, combinationValues[0]));
  const combinationSelectionMismatch =
    combinationFingerprints.length >= 2 &&
    !combinationFingerprints.every((fp) => fp === combinationFingerprints[0]);
  const combinationMismatch = combinationTotalMismatch || combinationSelectionMismatch;

  // The Senior Judge's slip is the reference: a panel judge is "off" when their
  // slip differs from the Senior Judge's, never the other way round. Element
  // counts and checklist selections are only compared when BOTH slips carry
  // that detail (see the detailedSlips note above).
  const senior = panelScores?.['Senior Judge'];
  const comboIdsFor = (s) => Object.keys(s?.breakdown?.combination?.checked || {}).map(Number);
  const comboFingerprint = (s, ids) => {
    const checked = s?.breakdown?.combination?.checked || {};
    return ids.map((id) => `${id}:${checked[id] ? 1 : 0}`).join(',');
  };
  const mixKey = (s) => {
    const d = s?.breakdown?.difficulty || {};
    return `${d.aClass ?? 0}|${d.bClass ?? 0}|${d.cClass ?? 0}`;
  };

  // Per-category divergence from the Senior Judge's slip, so each judge's own
  // mismatch popup can show only the category(ies) THEIR slip actually
  // disagrees on — not every category any judge in the panel disagrees on.
  const judgeDiffFromSenior = (entry) => {
    if (!senior || !entry || entry.judgeType === 'Senior Judge') {
      return { difficulty: false, combination: false };
    }
    const bothDetailed =
      senior.breakdown?.detailed !== false && entry.breakdown?.detailed !== false;

    let difficulty = !nearlyEqual(entry.breakdown?.difficulty?.total ?? 0, senior.breakdown?.difficulty?.total ?? 0);
    let combination = !nearlyEqual(entry.breakdown?.combination?.total ?? 0, senior.breakdown?.combination?.total ?? 0);
    if (bothDetailed) {
      if (mixKey(entry) !== mixKey(senior)) difficulty = true;
      const ids = [...new Set([...comboIdsFor(senior), ...comboIdsFor(entry)])].sort((a, b) => a - b);
      if (comboFingerprint(entry, ids) !== comboFingerprint(senior, ids)) combination = true;
    }
    return { difficulty, combination };
  };

  const judgeMismatchDetails = {};
  JUDGE_ORDER.forEach((jt) => {
    judgeMismatchDetails[jt] = judgeDiffFromSenior(panelScores?.[jt]);
  });

  const disagreeingJudges = JUDGE_ORDER.filter(
    (jt) => judgeMismatchDetails[jt].difficulty || judgeMismatchDetails[jt].combination
  );

  const size = panelSize || slips.length;
  let toleranceMismatch = false;
  let toleranceInfo = null;

  // Tolerance / base-score only for 4- and 5-judge panels
  if (size >= 4 && slips.length >= 4) {
    const fields = panelScoresToJudgeFields(panelScores);
    const result = calculateAverageMarks(fields, size);
    toleranceMismatch = !!result.baseScoreApplied;
    toleranceInfo = result;
  }

  // A tolerance breach is a gap between the execution average and the Senior
  // Judge's mark, so the execution judges whose own total differs from the
  // Senior's are the ones asked to re-check.
  const toleranceOffJudges = toleranceMismatch
    ? JUDGE_ORDER.filter(
        (jt) =>
          jt !== 'Senior Judge' &&
          panelScores?.[jt] &&
          !nearlyEqual(panelScores[jt].score ?? 0, senior?.score ?? 0)
      )
    : [];

  // Everyone who should be prompted to review their slip. The Senior Judge is
  // the reference and is never listed here — they are alerted separately
  // because resolving the mismatch is their call.
  const judgesNeedingReview = JUDGE_ORDER.filter(
    (jt) => disagreeingJudges.includes(jt) || toleranceOffJudges.includes(jt)
  );

  return {
    difficultyMismatch,
    combinationMismatch,
    combinationSelectionMismatch,
    difficultyMixMismatch,
    toleranceMismatch,
    toleranceInfo,
    difficultyValues,
    combinationValues,
    disagreeingJudges,
    judgeMismatchDetails,
    toleranceOffJudges,
    judgesNeedingReview,
    hasBlockingMismatch: difficultyMismatch || combinationMismatch,
  };
}

/**
 * Calculate final score applying deductions to the average marks.
 */
export function calculateFinalScore(ps) {
    const r = calculateAverageMarks(ps);
    return Math.max(0, r.average - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2);
}

