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

// §3.6 — minor deductions (2.4.1); folded into the judge's own Execution rating.
// Reference-only in this phase (Execution is entered as a free number).
const MINOR_DEDUCTIONS = Object.freeze([
  { code: 'M01', desc: 'Improper body posture', amount: 0.10, fixed: true },
  { code: 'M02', desc: 'Not stretched palms/legs', amount: 0.10, fixed: true },
  { code: 'M03', desc: 'Bending palms/elbows/knees', amount: 0.10, fixed: true },
  { code: 'M04', desc: 'Unnecessary separation of hands/legs', amount: 0.10, fixed: true },
  { code: 'M05', desc: 'Improper final position', amount: 0.10, fixed: true },
  { code: 'M06', desc: 'Unessential pause >2 sec', amount: 0.10, fixed: true },
  { code: 'M07', desc: 'Unnecessary touches to apparatus', amount: 0.10, fixed: true },
  { code: 'M08', desc: 'Low height/flight at mount/dismount', amount: 0.10, fixed: true },
  { code: 'M09', desc: 'Technically improper turning movements', amount: 0.10, fixed: true },
  { code: 'M10', desc: 'Low amplitude', amount: 0.10, fixed: true },
  { code: 'M11', desc: 'Slight touch of hands/legs to ground/mats', amountMax: 0.20, fixed: false },
  { code: 'M12', desc: 'Extra swing where not required', amountMax: 0.20, fixed: false },
  { code: 'M13', desc: 'Improper/slipped catches', amountMax: 0.20, fixed: false },
  { code: 'M14', desc: 'Too low height/flight at mount/dismount', amountMax: 0.20, fixed: false },
  { code: 'M15', desc: 'Tuck/pike/hollow where not required', amountMax: 0.20, fixed: false },
  { code: 'M16', desc: 'Unnecessary break in continuity', amountMax: 0.20, fixed: false },
]);

// §3.7 — major deductions (2.4.2).
const MAJOR_DEDUCTIONS = Object.freeze([
  { code: 'J01', desc: 'Losing balance on apparatus', amountMax: 0.50, fixed: false },
  { code: 'J02', desc: 'Physical help by coach', amountMax: 0.50, fixed: false },
  { code: 'J03', desc: 'Fall on the ground', amount: 0.50, fixed: true },
]);

// §3.8 — final-score deductions (2.4.3), applied by the Chief Judge AFTER the
// average/base score. Reference-only in this phase (Chief workflow deferred).
// NOTE: F09 lists 0.10 for a "debarring" offense — flagged as a likely source
// inconsistency; keep editable, do not trust blindly.
const FINAL_SCORE_DEDUCTIONS = Object.freeze([
  { code: 'F01', desc: 'Not reporting to Chief Judge before/after set', amount: 0.10 },
  { code: 'F02', desc: 'Not maintaining sequence', amount: 0.20 },
  { code: 'F03', desc: 'Exceeding warm-up period', amount: 0.20 },
  { code: 'F04', desc: 'Set not started within 10 sec of start signal', amount: 0.20 },
  { code: 'F05', desc: 'Improper attire', amount: 0.20 },
  { code: 'F06', desc: 'Team not in uniform (applies to whole team total)', amount: 0.50 },
  { code: 'F07', desc: 'Time overage', amount: 'lookup', note: 'use time-deduction table §3.5' },
  { code: 'F08', desc: 'Misbehaviour of competitor', amount: 1.00 },
  { code: 'F09', desc: 'Gross misconduct debarring individual/team', amount: 0.10, flagged: true },
  { code: 'F10', desc: 'Coach present near apparatus during performance', amount: 0.20 },
  { code: 'F11', desc: 'Coach signals competitor during performance', amount: 0.50 },
  { code: 'F12', desc: 'Coach in improper uniform (deducted from ALL team members)', amount: 0.50 },
  { code: 'F13', desc: 'Fall, continued within 10 sec', amount: 0.50, perOccurrence: true },
  { code: 'F14', desc: 'General indiscipline/misconduct (individual or team)', amount: 0.50 },
]);

module.exports = {
  COP_EDITION,
  POINT_CEILINGS,
  ELEMENT_CLASS_VALUES,
  DIFFICULTY_REQUIREMENTS,
  getDifficultyRequirement,
  getTolerance,
  TIME_LIMIT_SECONDS,
  getTimeDeduction,
  COMBINATION_CHECKLISTS,
  normalizeApparatus,
  getCombinationChecklist,
  toCompetitionTypeDisplay,
  toCompetitionTypeSlug,
  validateSlipBreakdown,
  MINOR_DEDUCTIONS,
  MAJOR_DEDUCTIONS,
  FINAL_SCORE_DEDUCTIONS,
};
