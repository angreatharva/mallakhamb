/**
 * Code of Points (COP) Rules — versioned scoring constants & lookup tables.
 *
 * Source: MFI Code of Points, November 2022 Edition (see repo doc
 * "Mallakhamb Judging Software.md"). Kept as DATA, not logic, so a future COP
 * revision is a data edit rather than a code rewrite. The Technical Committee
 * may revise these values between editions.
 *
 * This module is the single backend source of truth for:
 *   - point ceilings (Difficulty / Combination / Execution / Bonus / Total)
 *   - element class values (A/B/C)
 *   - difficulty element-count requirements per competition type
 *   - the tolerance-tier table (Chief vs execution average)
 *   - the time-deduction table (overage beyond 90s)
 *   - per-apparatus combination checklists (§5.1–5.3)
 *   - the minor/major/final-score deduction catalogs (§3.6–3.8, reference-only)
 *
 * The frontend keeps a mirror at Web/src/utils/scoring/copRules.js. Keep them in
 * sync until unified behind a served endpoint (see plan follow-ups).
 */

const COP_EDITION = 'COP Nov 2022';

// §3.3 — universal point distribution (all apparatus, all competitions)
const POINT_CEILINGS = Object.freeze({
  difficulty: 3.80,
  combination: 1.60,
  execution: 4.40,
  bonus: 0.20,
  total: 10.00,
});

// §3.1 — element class values
const ELEMENT_CLASS_VALUES = Object.freeze({ A: 0.20, B: 0.40, C: 0.60 });

// §3.2 — difficulty element-count requirements by competition type.
// Both mixes sum to 3.80, but the mix (not just the total) must be validated.
const DIFFICULTY_REQUIREMENTS = Object.freeze({
  COMPETITION_I: Object.freeze({ A: 4, B: 6, C: 1 }),      // 0.80 + 2.40 + 0.60 = 3.80
  COMPETITION_II_III: Object.freeze({ A: 1, B: 6, C: 2 }), // 0.20 + 2.40 + 1.20 = 3.80
});

/**
 * Resolve the required A/B/C difficulty mix for a competition type.
 * Accepts both the slug form (competition_1/2/3) and the display form
 * (Competition I/II/III).
 * @param {string} competitionType
 * @returns {{A:number,B:number,C:number}}
 */
function getDifficultyRequirement(competitionType) {
  const t = String(competitionType || '').toLowerCase();
  const isCompI = t === 'competition_1' || t === 'competition i' || t === 'competition 1';
  return isCompI ? DIFFICULTY_REQUIREMENTS.COMPETITION_I : DIFFICULTY_REQUIREMENTS.COMPETITION_II_III;
}

// §3.4 — tolerance limit table (Chief Judge vs. avg-of-2-middle execution scores).
// Keyed by the execution average.
function getTolerance(avgScore) {
  const s = Number(avgScore) || 0;
  if (s >= 9.00) return 0.10;
  if (s >= 8.00) return 0.20;
  if (s >= 7.00) return 0.30;
  if (s >= 6.00) return 0.40;
  if (s >= 5.00) return 0.50;
  return 1.00; // below 5.00
}

// §3.5 — time-deduction table (overage beyond the 90s limit).
const TIME_LIMIT_SECONDS = 90;
function getTimeDeduction(overageSeconds) {
  const over = Number(overageSeconds) || 0;
  if (over <= 0) return 0;
  if (over <= 3) return 0.20;
  if (over <= 5) return 0.30;
  if (over <= 9) return 0.40;
  return 0.50; // >= 10 (and the 9–10 gap in the source table)
}

// §5.1–5.3 — per-apparatus combination checklists. Penalties sum to 1.60.
// A failed (unchecked) item deducts its penalty from the 1.60 allocation.
const COMBINATION_CHECKLISTS = Object.freeze({
  'Pole Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of pole utilized', penalty: 0.10 },
    { id: 2, rule: "One 'B' acrobatic element executed from both sides", penalty: 0.20 },
    { id: 3, rule: "3 continuous acrobatic elements, ≥1 must be 'B'", penalty: 0.20 },
    { id: 4, rule: '≥1 Vertical Hold part', penalty: 0.20 },
    { id: 5, rule: '≥1 Horizontal Hold part', penalty: 0.20 },
    { id: 6, rule: '1 Hold part demonstrating backbone flexibility', penalty: 0.10 },
    { id: 7, rule: '≥1 B-class mount', penalty: 0.10 },
    { id: 8, rule: '≥1 C-class dismount', penalty: 0.20 },
    { id: 9, rule: '≥2 transitions between hold positions', penalty: 0.20 },
    { id: 10, rule: 'Minimum 16 elements in the set', penalty: 0.10 },
  ]),
  'Hanging Mallakhamb': Object.freeze([
    { id: 1, rule: 'All parts of Hanging Mallakhamb utilized', penalty: 0.10 },
    { id: 2, rule: "'A' acrobatic element from both sides", penalty: 0.20 },
    { id: 3, rule: "3 continuous acrobatic elements, ≥1 must be 'B'", penalty: 0.20 },
    { id: 4, rule: '≥1 Vertical Hold part', penalty: 0.20 },
    { id: 5, rule: '≥1 Horizontal Hold part', penalty: 0.20 },
    { id: 6, rule: 'Backbone flexibility hold', penalty: 0.10 },
    { id: 7, rule: '≥1 B-class mount', penalty: 0.10 },
    { id: 8, rule: '≥1 C-class dismount', penalty: 0.20 },
    { id: 9, rule: '≥1 transition between hold positions', penalty: 0.20 },
    { id: 10, rule: 'Minimum 14 elements in the set', penalty: 0.10 },
  ]),
  'Rope Mallakhamb': Object.freeze([
    { id: 1, rule: 'Rope held in legs at 4m height, at least once', penalty: 0.20 },
    { id: 2, rule: '≥2 hold parts showing forward+backward flexibility (both required)', penalty: 0.30 },
    { id: 3, rule: '≥1 Vertical AND ≥1 Horizontal hold part', penalty: 0.30 },
    { id: 4, rule: '≥1 B-class mount', penalty: 0.20 },
    { id: 5, rule: '≥1 C-class dismount', penalty: 0.20 },
    { id: 6, rule: '≥1 Strength part', penalty: 0.20 },
    { id: 7, rule: 'Minimum 18 elements in the set', penalty: 0.20 },
  ]),
});

/**
 * Normalize an apparatus label to a canonical combination-checklist key.
 * Tolerates short labels ("Pole", "rope") and the full enum
 * ("Pole Mallakhamb"). Returns null if unrecognized.
 * @param {string} apparatus
 * @returns {string|null}
 */
function normalizeApparatus(apparatus) {
  const a = String(apparatus || '').toLowerCase();
  if (a.includes('pole')) return 'Pole Mallakhamb';
  if (a.includes('hang')) return 'Hanging Mallakhamb';
  if (a.includes('rope')) return 'Rope Mallakhamb';
  return null;
}

/**
 * Get the combination checklist for an apparatus (defaults to Pole if unknown).
 * @param {string} apparatus
 * @returns {Array<{id:number,rule:string,penalty:number}>}
 */
function getCombinationChecklist(apparatus) {
  const key = normalizeApparatus(apparatus) || 'Pole Mallakhamb';
  return COMBINATION_CHECKLISTS[key];
}

// Competition-type encoding: the frontend/Judge/Competition models use slugs
// (competition_1/2/3); the Score model stores display form (Competition I/II/III).
// These helpers are the single place that maps between them.
const COMPETITION_TYPE_SLUG_TO_DISPLAY = Object.freeze({
  competition_1: 'Competition I',
  competition_2: 'Competition II',
  competition_3: 'Competition III',
});
const COMPETITION_TYPE_DISPLAY_TO_SLUG = Object.freeze({
  'Competition I': 'competition_1',
  'Competition II': 'competition_2',
  'Competition III': 'competition_3',
});

/**
 * Map a competition-type slug (or display value) to the Score display form.
 * Passes through anything already in display form / unknown.
 */
function toCompetitionTypeDisplay(competitionType) {
  return COMPETITION_TYPE_SLUG_TO_DISPLAY[competitionType] || competitionType;
}

/**
 * Map a competition-type display value (or slug) to the frontend slug form.
 * Defaults to competition_1 for unknown input (preserves prior behavior).
 */
function toCompetitionTypeSlug(competitionType) {
  if (COMPETITION_TYPE_DISPLAY_TO_SLUG[competitionType]) {
    return COMPETITION_TYPE_DISPLAY_TO_SLUG[competitionType];
  }
  if (COMPETITION_TYPE_SLUG_TO_DISPLAY[competitionType]) {
    return competitionType; // already a slug
  }
  return 'competition_1';
}

/**
 * Resolve difficulty point value using strict C→B→A cascade (v2 §3.2.1).
 * When element counts differ from requirements, excess C cascades to B,
 * excess B cascades to A. A is the floor of the hierarchy.
 * @param {Object} counts - { A: number, B: number, C: number } executed elements
 * @param {Object} required - { A: number, B: number, C: number } required mix
 * @returns {{ C: number, B: number, A: number, total: number, shortfall_flag: boolean }}
 */
function resolveDifficultyValue(counts, required) {
  const cUsed = Math.min(counts.C || 0, required.C || 0);
  const cExcess = Math.max(0, (counts.C || 0) - (required.C || 0));

  const bPool = (counts.B || 0) + cExcess;
  const bUsed = Math.min(bPool, required.B || 0);
  const bExcess = Math.max(0, bPool - (required.B || 0));

  const aPool = (counts.A || 0) + bExcess;
  const aUsed = Math.min(aPool, required.A || 0);

  const cPoints = cUsed * ELEMENT_CLASS_VALUES.C;
  const bPoints = bUsed * ELEMENT_CLASS_VALUES.B;
  const aPoints = aUsed * ELEMENT_CLASS_VALUES.A;

  return {
    C: Number(cPoints.toFixed(2)),
    B: Number(bPoints.toFixed(2)),
    A: Number(aPoints.toFixed(2)),
    total: Number((cPoints + bPoints + aPoints).toFixed(2)),
    shortfallFlag: (cUsed < (required.C || 0)) || (bUsed < (required.B || 0)) || (aUsed < (required.A || 0)),
    counts: { C: cUsed, B: bUsed, A: aUsed },
    excess: { C: cExcess, cascadedToB: cExcess, cascadedToA: bExcess }
  };
}

/**
 * Validate a single judge's slip breakdown against the COP section ceilings.
 * No-op (valid) when no breakdown is supplied (e.g. admin bulk edits). The
 * "bonus" is read from breakdown.bonus, falling back to the legacy
 * breakdown.originality key, and must be exactly 0 or 0.20.
 * @param {Object} breakdown - { difficulty:{total}, combination:{total}, execution, bonus|originality }
 * @returns {{ valid: boolean, error: (string|null) }}
 */
function validateSlipBreakdown(breakdown) {
  const EPS = 1e-6;
  if (!breakdown || typeof breakdown !== 'object' || Object.keys(breakdown).length === 0) {
    return { valid: true, error: null };
  }

  const difficulty = Number(breakdown.difficulty?.total ?? 0);
  const combination = Number(breakdown.combination?.total ?? 0);
  const execution = Number(breakdown.execution ?? 0);
  const bonus = Number(breakdown.bonus ?? breakdown.originality ?? 0);

  if (difficulty > POINT_CEILINGS.difficulty + EPS) {
    return { valid: false, error: `Difficulty ${difficulty} exceeds ceiling ${POINT_CEILINGS.difficulty}` };
  }
  if (combination > POINT_CEILINGS.combination + EPS) {
    return { valid: false, error: `Combination ${combination} exceeds ceiling ${POINT_CEILINGS.combination}` };
  }
  if (execution > POINT_CEILINGS.execution + EPS) {
    return { valid: false, error: `Execution ${execution} exceeds ceiling ${POINT_CEILINGS.execution}` };
  }
  if (Math.abs(bonus) > EPS && Math.abs(bonus - POINT_CEILINGS.bonus) > EPS) {
    return { valid: false, error: `Bonus must be 0 or ${POINT_CEILINGS.bonus} (got ${bonus})` };
  }
  const total = difficulty + combination + execution + bonus;
  if (total > POINT_CEILINGS.total + EPS) {
    return { valid: false, error: `Slip total ${total.toFixed(2)} exceeds ${POINT_CEILINGS.total}` };
  }
  return { valid: true, error: null };
}

// Note: Sections 3.6–3.8 (minor/major/final-score deductions) are not modeled
// as separate system entities — all deductions are folded directly into the
// judge's Execution component per v2 §2 note. These catalogs are retained
// as comments only for reference, since judges apply them internally.

module.exports = {
  COP_EDITION,
  POINT_CEILINGS,
  ELEMENT_CLASS_VALUES,
  DIFFICULTY_REQUIREMENTS,
  getDifficultyRequirement,
  resolveDifficultyValue,
  getTolerance,
  TIME_LIMIT_SECONDS,
  getTimeDeduction,
  COMBINATION_CHECKLISTS,
  normalizeApparatus,
  getCombinationChecklist,
  toCompetitionTypeDisplay,
  toCompetitionTypeSlug,
  validateSlipBreakdown,
};
