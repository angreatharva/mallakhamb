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

// ── Category vocabulary ─────────────────────────────────────────────────────
//
// The values that identify WHICH competition a performance belongs to, as
// opposed to how it is scored. They live here beside APPARATUS because this
// module is already the one place both stacks agree on domain vocabulary, and
// because the alternative is what was here before: the same literal array
// written out in fourteen files — six Mongoose enums, six validators, a route
// and a service — where adding an age bracket meant twenty-five edits and any
// one of them could be missed without an error.
//
// Frozen so a caller cannot sort or splice the shared array in place.

/**
 * The age brackets a competition can contest, in ascending order.
 * Every `ageGroup` enum in `models/` and every `isIn` check in `validators/`
 * reads this.
 */
const AGE_GROUPS = Object.freeze([
  'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18',
]);

/**
 * Competition II (All Round Individual) is ONE final per gender with the top
 * two of every age group in it (owner, 2026-10-29; docs/qualification-plan.md).
 * Its category's age group is this value. Only a CATEGORY carries it — scores,
 * panels, running order, tie-break draws — never a player or a squad entry.
 */
const ALL_AGES = 'AllAges';

/** Every age group a category (not a player) may be keyed on. */
const CATEGORY_AGE_GROUPS = Object.freeze([...AGE_GROUPS, ALL_AGES]);

/** The two sexes a category is split by. */
const GENDERS = Object.freeze(['Male', 'Female']);

// ── Age eligibility (COP 1.8.3.2–1.8.3.5) ───────────────────────────────────
//
// The Web client has always known which brackets each gender plays
// (Web/src/hooks/useAgeGroups.js); the server did not, and had no rule from a
// date of birth to a bracket at all. The walk-in desk needs both on this side,
// because it is the one path where an admin types a DOB off paper and the
// server must refuse a child placed in a group too young for them.
// Web/src/utils/competition/ageEligibility.js mirrors this; the Web
// ageEligibilitySync.test.js fails if the two drift.

/** The brackets each gender competes in, youngest first. */
const AGE_GROUPS_BY_GENDER = Object.freeze({
  Male: Object.freeze(['Under10', 'Under12', 'Under14', 'Under18', 'Above18']),
  Female: Object.freeze(['Under10', 'Under12', 'Under14', 'Under16', 'Above16']),
});

/**
 * The ages each bracket admits, inclusive. "Under N" INCLUDES N: the COP's own
 * example puts a player who is 12 on 31 December in Under 12 and a 13-year-old
 * in Under 14. "Above N" therefore starts at N + 1.
 */
const AGE_GROUP_RANGES = Object.freeze({
  Under10: Object.freeze({ min: 0, max: 10 }),
  Under12: Object.freeze({ min: 0, max: 12 }),
  Under14: Object.freeze({ min: 0, max: 14 }),
  Under16: Object.freeze({ min: 0, max: 16 }),
  Under18: Object.freeze({ min: 0, max: 18 }),
  Above16: Object.freeze({ min: 17, max: Infinity }),
  Above18: Object.freeze({ min: 19, max: Infinity }),
});

/**
 * The year whose 31 December ages are measured on: ALWAYS the year the
 * competition is held (its start date). Owner, 2026-10-29: every competition
 * in 2026 measures on 31 Dec 2026, every one in 2027 on 31 Dec 2027, whatever
 * the month — a meet on 12–13 Dec 2026 and a player born 1 Jan 2016 → age 10
 * → Under 10. There is no per-meet override (the old "previous season"
 * choice was removed; migration 015 cleared any saved value).
 *
 * @param {Object} competition
 * @returns {number|null}
 */
function ageCutoffYear(competition) {
  const start = competition?.startDate ? new Date(competition.startDate) : null;
  return start && !Number.isNaN(start.getTime()) ? start.getUTCFullYear() : null;
}

/**
 * Age on 31 December of `cutoffYear`. Measured on the last day of the year it
 * is simply the difference of the years — every birthday has happened.
 *
 * @param {Date|string} dateOfBirth
 * @param {number} cutoffYear
 * @returns {number|null} null for a missing or unreadable date
 */
function ageOnCutoff(dateOfBirth, cutoffYear) {
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  if (!dob || Number.isNaN(dob.getTime()) || !Number.isInteger(cutoffYear)) return null;
  return cutoffYear - dob.getUTCFullYear();
}

/**
 * The youngest bracket of this gender that admits `age` — where the player
 * belongs unless they choose to play up.
 *
 * @param {number} age
 * @param {string} gender
 * @returns {string|null}
 */
function lowestAgeGroup(age, gender) {
  const list = AGE_GROUPS_BY_GENDER[gender];
  if (!list || !Number.isFinite(age) || age < 0) return null;
  return list.find((group) => age >= AGE_GROUP_RANGES[group].min && age <= AGE_GROUP_RANGES[group].max) || null;
}

/**
 * Every bracket this player may enter: their lowest one and each higher one
 * (COP 1.8.3.3 lets a player play up, never down), narrowed to what the meet
 * runs for the gender when `offered` is given.
 *
 * @param {number} age
 * @param {string} gender
 * @param {string[]} [offered] - the meet's brackets for this gender
 * @returns {string[]} youngest first; empty when the player fits none
 */
function eligibleAgeGroups(age, gender, offered) {
  const list = AGE_GROUPS_BY_GENDER[gender];
  const lowest = lowestAgeGroup(age, gender);
  if (!list || !lowest) return [];
  const allowed = list.slice(list.indexOf(lowest));
  return Array.isArray(offered) ? allowed.filter((group) => offered.includes(group)) : allowed;
}

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
//
// Held as data, not as an if-ladder, so GET /api/public/cop-rules can serve it
// (task 3.3). The *table* is what drifts between the two stacks; the lookup
// function is trivial and stays duplicated.
const TOLERANCE_TIERS = Object.freeze([
  Object.freeze({ minAverage: 9.00, tolerance: 0.10 }),
  Object.freeze({ minAverage: 8.00, tolerance: 0.20 }),
  Object.freeze({ minAverage: 7.00, tolerance: 0.30 }),
  Object.freeze({ minAverage: 6.00, tolerance: 0.40 }),
  Object.freeze({ minAverage: 5.00, tolerance: 0.50 }),
]);
const TOLERANCE_BELOW_MINIMUM = 1.00; // below 5.00

function getTolerance(avgScore) {
  const s = Number(avgScore) || 0;
  const tier = TOLERANCE_TIERS.find((t) => s >= t.minAverage);
  return tier ? tier.tolerance : TOLERANCE_BELOW_MINIMUM;
}

// §3.5 — time-deduction table. Applies both ways: to the seconds OVER the 90s
// limit, and (added 2026-09-26) to the seconds SHORT of the 60s minimum — the
// same bands, ≤3 → 0.20, ≤5 → 0.30, ≤9 → 0.40, 10+ → 0.50.
const TIME_LIMIT_SECONDS = 90;
const TIME_MINIMUM_SECONDS = 60;
const TIME_DEDUCTION_TIERS = Object.freeze([
  Object.freeze({ maxOverageSeconds: 3, deduction: 0.20 }),
  Object.freeze({ maxOverageSeconds: 5, deduction: 0.30 }),
  Object.freeze({ maxOverageSeconds: 9, deduction: 0.40 }),
]);
// >= 10, and the 9–10 gap in the source table.
const TIME_DEDUCTION_MAXIMUM = 0.50;

function getTimeDeduction(overageSeconds) {
  const over = Number(overageSeconds) || 0;
  if (over <= 0) return 0;
  const tier = TIME_DEDUCTION_TIERS.find((t) => over <= t.maxOverageSeconds);
  return tier ? tier.deduction : TIME_DEDUCTION_MAXIMUM;
}

/**
 * The time deduction for a performance of `seconds`: the table applied to how
 * far it fell SHORT of the 60s minimum, or ran OVER the 90s limit. 60–90 s
 * (inclusive) costs nothing; no time at all (0 / blank) is not a performance
 * and costs nothing here.
 *
 * @param {number|string} seconds
 * @returns {number}
 */
function getTimeDeductionForTime(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return 0;
  if (s < TIME_MINIMUM_SECONDS) return getTimeDeduction(TIME_MINIMUM_SECONDS - s);
  if (s > TIME_LIMIT_SECONDS) return getTimeDeduction(s - TIME_LIMIT_SECONDS);
  return 0;
}

// §5.1–5.3 — per-apparatus combination checklists. Penalties sum to 1.60.
// A failed (unchecked) item deducts its penalty from the 1.60 allocation.
/**
 * The three apparatus a Mallakhamb competition is judged on (COP §5).
 *
 * The keys of COMBINATION_CHECKLISTS below, named once so that a squad
 * registration, a Score document and a judge slip cannot drift apart on the
 * spelling — the value decides which checklist a judge is shown.
 */
const APPARATUS = Object.freeze(['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']);

/**
 * The apparatus a score belongs to, as a comparable key.
 *
 * `Score.playerScores[].apparatus` defaults to Pole, so a row written before a
 * competition used apparatus at all and a row explicitly marked Pole are the
 * same squad place and must compare equal — otherwise saving a Pole slip
 * against an older row appends a duplicate instead of updating it.
 *
 * @param {unknown} value
 * @returns {string}
 */
function apparatusKey(value) {
  return normalizeApparatus(value) || 'Pole Mallakhamb';
}

// The rule text is quoted from COP Mallakhamb.pdf §2.3.2.1–2.3.2.3 (PDF p.28),
// the Code judges hold in their hands, so do not paraphrase or abbreviate it.
// Only three slips in the printed Code are corrected: "p art" → "part" (Pole 6),
// "Mallakhmab" → "Mallakhamb" (Hanging 1) and "B- Part" → "B-Part" (Rope 4).
// The Web mirror must match word for word (Web copRulesSync.test.js).
const COMBINATION_CHECKLISTS = Object.freeze({
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
 * The two encodings as lists, derived from the map above so a fourth category
 * cannot be added to one and forgotten in the other.
 *
 * DISPLAYS is ordered longest-first. Every consumer that matches a competition
 * type inside a longer string — the socket room ids, above all — must test
 * "Competition III" before "Competition I", because the shorter one is a prefix
 * of the longer two. Getting that backwards turns
 * `scoring_Male_Under14_Competition III` into
 * `scoring_Male_Under14_competition_1II`, which is a room nobody is in.
 */
const COMPETITION_TYPE_SLUGS = Object.freeze(Object.keys(COMPETITION_TYPE_SLUG_TO_DISPLAY));
const COMPETITION_TYPE_DISPLAYS = Object.freeze(
  Object.values(COMPETITION_TYPE_SLUG_TO_DISPLAY).sort((a, b) => b.length - a.length)
);

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
  const cCount = counts.C || 0;
  const bCount = counts.B || 0;
  const aCount = counts.A || 0;
  const cReq = required.C || 0;
  const bReq = required.B || 0;
  const aReq = required.A || 0;

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
    counts: { C: cInC + cInB + cInA, B: bInB + bInA, A: aInA },
    excess: { C: cExcess, cascadedToB: cInB, cascadedToA: cInA + bInA }
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

/**
 * Hanging Mallakhamb is not available for women (v2 §11, rule 1.8.2 / 1.10).
 * This is a HARD BLOCK — not a warning.
 * @param {string} apparatus
 * @param {string} gender - 'Male' or 'Female'
 * @returns {boolean}
 */
function isApparatusAllowedForGender(apparatus, gender) {
  const key = normalizeApparatus(apparatus);
  const isFemale = String(gender || '').toLowerCase().startsWith('f');
  if (isFemale && key === 'Hanging Mallakhamb') return false;
  return true;
}

/**
 * The serializable half of this module (task 3.3 / MED-7).
 *
 * `Web/src/utils/scoring/copRules.js` mirrors these tables BY HAND, and both
 * file headers admit it. That is dangerous rather than merely untidy: the
 * client computes the slip total and posts it, and the server only checks it
 * against the section ceilings — it does not recompute. So a one-sided edit
 * produces *persisted wrong scores* rather than a visible mismatch.
 *
 * Served by GET /api/public/cop-rules so the client can fetch the tables
 * instead of copying them. Only DATA is included; the pure functions
 * (resolveDifficultyValue, getTolerance, getTimeDeduction, …) are trivial and
 * stay duplicated in code — the tables are what drift.
 *
 * @returns {Object} plain, JSON-safe COP constants
 */
function getCopRulesData() {
  return {
    edition: COP_EDITION,
    pointCeilings: POINT_CEILINGS,
    elementClassValues: ELEMENT_CLASS_VALUES,
    difficultyRequirements: DIFFICULTY_REQUIREMENTS,
    toleranceTiers: TOLERANCE_TIERS,
    toleranceBelowMinimum: TOLERANCE_BELOW_MINIMUM,
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    timeMinimumSeconds: TIME_MINIMUM_SECONDS,
    timeDeductionTiers: TIME_DEDUCTION_TIERS,
    timeDeductionMaximum: TIME_DEDUCTION_MAXIMUM,
    combinationChecklists: COMBINATION_CHECKLISTS,
    // §1.4 — Hanging Mallakhamb is not contested by women.
    apparatusGenderRules: {
      'Hanging Mallakhamb': { blockedForGenders: ['Female'] },
    },
  };
}

module.exports = {
  COP_EDITION,
  AGE_GROUPS,
  ALL_AGES,
  CATEGORY_AGE_GROUPS,
  GENDERS,
  AGE_GROUPS_BY_GENDER,
  AGE_GROUP_RANGES,
  ageCutoffYear,
  ageOnCutoff,
  lowestAgeGroup,
  eligibleAgeGroups,
  COMPETITION_TYPE_SLUGS,
  COMPETITION_TYPE_DISPLAYS,
  APPARATUS,
  apparatusKey,
  POINT_CEILINGS,
  ELEMENT_CLASS_VALUES,
  DIFFICULTY_REQUIREMENTS,
  getDifficultyRequirement,
  resolveDifficultyValue,
  TOLERANCE_TIERS,
  TOLERANCE_BELOW_MINIMUM,
  getTolerance,
  TIME_LIMIT_SECONDS,
  TIME_MINIMUM_SECONDS,
  TIME_DEDUCTION_TIERS,
  TIME_DEDUCTION_MAXIMUM,
  getTimeDeduction,
  getTimeDeductionForTime,
  COMBINATION_CHECKLISTS,
  getCopRulesData,
  normalizeApparatus,
  getCombinationChecklist,
  toCompetitionTypeDisplay,
  toCompetitionTypeSlug,
  validateSlipBreakdown,
  isApparatusAllowedForGender,
};
