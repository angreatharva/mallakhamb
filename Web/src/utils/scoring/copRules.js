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

/**
 * Round an execution mark to one decimal place, with the half going DOWN:
 *   2.00 – 2.05 → 2.00,   2.06 – 2.10 → 2.10
 * then clamp to 0 … POINT_CEILINGS.execution. Worked in whole hundredths so
 * float noise (2.05 * 100 = 204.99…) cannot tip a value across the line.
 *
 * @param {number|string} raw
 * @returns {number}
 */
export function roundExecution(raw) {
  const hundredths = Math.round((parseFloat(raw) || 0) * 100);
  const tenths = Math.ceil((hundredths - 5) / 10);
  return Math.max(0, Math.min(POINT_CEILINGS.execution, tenths / 10));
}

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
//
// The rule text is quoted from COP Mallakhamb.pdf §2.3.2.1–2.3.2.3 (PDF p.28),
// the Code judges hold in their hands, so do not paraphrase or abbreviate it.
// Only three slips in the printed Code are corrected: "p art" → "part" (Pole 6),
// "Mallakhmab" → "Mallakhamb" (Hanging 1) and "B- Part" → "B-Part" (Rope 4).
// Must match Server/src/config/cop-rules.js word for word (copRulesSync.test.js).
export const COMBINATION_CHECKLISTS = Object.freeze({
  'Pole Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of the Pole should be properly utilized.', penalty: 0.10 },
    { id: 2, rule: "One Acrobatic element of 'B' part should be executed from both sides.", penalty: 0.20 },
    { id: 3, rule: "Continuous 3 Acrobatic elements of which at least one should be 'B' part", penalty: 0.20 },
    { id: 4, rule: 'At least one Vertical Hold part.', penalty: 0.20 },
    { id: 5, rule: 'At least one Horizontal Hold part.', penalty: 0.20 },
    { id: 6, rule: 'One Hold part demonstrating flexibility of back bone.', penalty: 0.10 },
    { id: 7, rule: 'At least B mount.', penalty: 0.10 },
    { id: 8, rule: 'At least C dismounts.', penalty: 0.20 },
    { id: 9, rule: 'At least two transitions from one hold position to another Hold position.', penalty: 0.20 },
    { id: 10, rule: 'Minimum 16 elements in one Set.', penalty: 0.10 },
  ]),
  'Hanging Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of the Hanging Mallakhamb should be properly utilized.', penalty: 0.10 },
    { id: 2, rule: "Acrobatic element of 'A' part from both sides.", penalty: 0.20 },
    { id: 3, rule: "Continuous 3 Acrobatic elements of which at least 1 should be 'B' part", penalty: 0.20 },
    { id: 4, rule: 'At least one Vertical Hold part.', penalty: 0.20 },
    { id: 5, rule: 'At least one Horizontal Hold part.', penalty: 0.20 },
    { id: 6, rule: 'Back bone flexibility', penalty: 0.10 },
    { id: 7, rule: 'At least B mount.', penalty: 0.10 },
    { id: 8, rule: 'At least C dismounts.', penalty: 0.20 },
    { id: 9, rule: 'At least one transitions from one hold position to another Hold position.', penalty: 0.20 },
    { id: 10, rule: 'Minimum 14 elements in one Set.', penalty: 0.10 },
  ]),
  'Rope Mallakhamb': Object.freeze([
    { id: 1, rule: 'At Least once the rope should be held in legs at 4 meter height', penalty: 0.20 },
    { id: 2, rule: 'At least 2 hold parts showing forward & backward flexibility (Both elements should be performed)', penalty: 0.30 },
    { id: 3, rule: 'At least one Vertical and one Horizontal Hold part.', penalty: 0.30 },
    { id: 4, rule: 'At least B-Part mount.', penalty: 0.20 },
    { id: 5, rule: 'At least C-Part Dismount.', penalty: 0.20 },
    { id: 6, rule: 'At least one Strength Part', penalty: 0.20 },
    { id: 7, rule: 'Minimum 18 elements in one Set', penalty: 0.20 },
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
      return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0, tolerance: 0, difference: 0, seniorScore: seniorJudge, method: null };
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
      seniorScore: seniorJudge,
      method: '3_JUDGE_SIMPLE_AVERAGE',
    };
  }

  if (evalScores.length === 0) {
    return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0, tolerance: 0, difference: 0, seniorScore: seniorJudge, method: null };
  }

  let executionAverage;
  let method;
  if (size === 5 || evalScores.length === 4) {
    const middle = [...evalScores].sort((a, b) => a - b).slice(1, -1);
    executionAverage = middle.reduce((a, b) => a + b, 0) / middle.length;
    method = '5_JUDGE_STANDARD_COP';
  } else {
    /*
     * 4-judge: the Chief's mark fills the vacant fourth evaluation slot and the
     * panel then runs the 5-judge method unchanged — drop the highest and the
     * lowest of the four, average the middle two.
     *
     * The Sr. Judge is therefore counted twice: once as the fourth evaluator
     * here, and again as the Chief in the tolerance check below. See the long
     * note in Server/src/utils/scoring/calculation.util.js — this mirrors it,
     * and the two must not drift.
     */
    // Until the Chief has submitted there is no fourth mark to inject, and
    // injecting a 0 would drop a real judge in favour of a phantom. This
    // branch is a preview of an unfinished panel; the `seniorJudge === 0`
    // return below reports it as exactly that.
    const pool = seniorJudge > 0
      ? [...evalScores, seniorJudge].sort((a, b) => a - b).slice(1, -1)
      : evalScores;
    executionAverage = pool.reduce((a, b) => a + b, 0) / pool.length;
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
      seniorScore: seniorJudge,
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
      seniorScore: seniorJudge,
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
    seniorScore: seniorJudge,
    method,
  };
}

/** Stored slip role (judgeSlips[].judgeRole) → panel seat. SJ is an older name. */
const SLIP_ROLE_TO_JUDGE_TYPE = Object.freeze({
  SR_JUDGE: 'Senior Judge',
  SJ: 'Senior Judge',
  J1: 'Judge 1',
  J2: 'Judge 2',
  J3: 'Judge 3',
  J4: 'Judge 4',
});

/**
 * The published per-section breakdown — Difficulty, Combination, Execution,
 * Originality — averaged over the slips the panel rule actually counts:
 *
 *   3 judges  every slip (Senior Judge, Judge 1, Judge 2), each section ÷ 3.
 *   5 judges  the Senior Judge's slip is left out; of Judges 1–4 the highest
 *             and lowest slip (by total) are dropped and the middle two are
 *             averaged, each section ÷ 2.
 *   4 judges  the same as five, the way calculateAverageMarks scores it: the
 *             Senior Judge's slip fills the vacant fourth evaluation seat, then
 *             the highest and lowest of the four are dropped and the middle
 *             two averaged.
 *
 * Slips are chosen by their TOTAL — the same slips whose totals make the panel
 * average — so the four sections add up to that average.
 *
 * @param {Array<Object>} slips - stored judgeSlips (judgeRole, *Score, total)
 * @param {number} [panelSize] - seated panel, 3 | 4 | 5; inferred from the slips if absent
 * @returns {{difficulty:number, combination:number, execution:number, bonus:number,
 *   used:number, panelSize:number}|null} null when there are no slips
 */
export function averageSlipBreakdown(slips = [], panelSize) {
  const bySeat = {};
  (slips || []).forEach((s) => {
    const seat = SLIP_ROLE_TO_JUDGE_TYPE[s?.judgeRole];
    if (!seat) return;
    bySeat[seat] = {
      difficulty: Number(s.difficultyScore) || 0,
      combination: Number(s.combinationScore) || 0,
      execution: Number(s.executionScore) || 0,
      bonus: Number(s.bonusScore) || 0,
      total: Number(s.total) || 0,
    };
  });

  const senior = bySeat['Senior Judge'];
  const evaluators = ['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']
    .map((seat) => bySeat[seat])
    .filter(Boolean);
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
  };
}

/**
 * One line saying which slips a breakdown from averageSlipBreakdown averaged.
 * @param {Object|null} breakdown
 * @returns {string}
 */
export function describeSlipAverage(breakdown) {
  if (!breakdown) return '';
  const { used, panelSize } = breakdown;
  if (panelSize === 5) {
    return `Averaged from the middle ${used} of Judges 1–4 — Senior Judge excluded, highest and lowest dropped`;
  }
  if (panelSize === 4) {
    return `Averaged from the middle ${used} of Judges 1–3 and the Senior Judge (4th seat) — highest and lowest dropped`;
  }
  return `Averaged from ${used} judge slip${used === 1 ? '' : 's'}`;
}

/**
 * Cross-judge panel mismatch checks for Panel Review.
 * Difficulty compares the final difficulty value only — differing A/B/C counts
 * that produce the same value are not a mismatch. Combination compares the
 * checklist selections as well as the total.
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

  // Difficulty: only the final difficulty value must agree across judges.
  // Different A/B/C counts that land on the same value are not a mismatch —
  // the score is what counts, not how each judge arrived at it.
  const difficultyMismatch =
    difficultyValues.length >= 2 && !difficultyValues.every((v) => nearlyEqual(v, difficultyValues[0]));

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

  // Per-category divergence from the Senior Judge's slip, so each judge's own
  // mismatch popup can show only the category(ies) THEIR slip actually
  // disagrees on — not every category any judge in the panel disagrees on.
  const judgeDiffFromSenior = (entry) => {
    if (!senior || !entry || entry.judgeType === 'Senior Judge') {
      return { difficulty: false, combination: false };
    }
    const bothDetailed =
      senior.breakdown?.detailed !== false && entry.breakdown?.detailed !== false;

    const difficulty = !nearlyEqual(entry.breakdown?.difficulty?.total ?? 0, senior.breakdown?.difficulty?.total ?? 0);
    let combination = !nearlyEqual(entry.breakdown?.combination?.total ?? 0, senior.breakdown?.combination?.total ?? 0);
    if (bothDetailed) {
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

  // A tolerance breach is only meaningful once the whole panel has marked —
  // an execution average taken over half the slips is not the one the rule
  // §3.4 talks about, and blocking on it would stop a panel mid-way.
  const hasToleranceBreach = toleranceMismatch && size >= 4 && slips.length >= size;

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

  // `disagreeingJudges` and `toleranceOffJudges` are deliberately kept apart
  // rather than merged into one "needs review" list: they are shown in
  // different dialogs, and a judge who merely sits outside tolerance recorded
  // the same routine as the chief and has no slip to correct.

  return {
    difficultyMismatch,
    combinationMismatch,
    combinationSelectionMismatch,
    toleranceMismatch,
    toleranceInfo,
    difficultyValues,
    combinationValues,
    disagreeingJudges,
    judgeMismatchDetails,
    toleranceOffJudges,
    // Two independent gates, kept apart because they are resolved differently
    // and are reported to the panel in two different dialogs:
    //   hasBlockingMismatch — judges disagree about WHAT the athlete did
    //                          (difficulty mix / combination checklist)
    //   hasToleranceBreach  — judges agree on the routine but their execution
    //                          marks are further apart than §3.4 allows
    // Final Submit waits on both (hasBlockingIssue).
    hasBlockingMismatch: difficultyMismatch || combinationMismatch,
    hasToleranceBreach,
    hasBlockingIssue: difficultyMismatch || combinationMismatch || hasToleranceBreach,
  };
}

/**
 * Calculate final score applying deductions to the average marks.
 *
 * @param {Object} ps - player scores, including deduction / otherDeduction
 * @param {number} [panelSize] - 3 | 4 | 5. Pass it wherever the seated panel is
 *   known: inferring from how many marks are in yet reads a half-filled
 *   5-judge sheet as a 3-judge panel, which is a different rule entirely.
 */
export function calculateFinalScore(ps, panelSize) {
    const r = calculateAverageMarks(ps, panelSize);
    return Math.max(0, r.average - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2);
}

