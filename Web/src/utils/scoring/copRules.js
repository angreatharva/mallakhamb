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
