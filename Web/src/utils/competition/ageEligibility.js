/**
 * COP 1.8.3.2–1.8.3.5 — which age groups a player may enter — and a meet's
 * own custom age groups (owner, 2026-11-15).
 *
 * Mirrors `Server/src/config/cop-rules.js` (AGE_GROUPS_BY_GENDER,
 * ageCutoffYear, ageOnCutoff, lowestAgeGroup, eligibleAgeGroups and the
 * custom-age-group helpers). The desk and the squad pickers show the result
 * before any request is made and the server enforces it;
 * ageEligibilitySync.test.js feeds both the same inputs and fails if they
 * ever disagree.
 *
 *  - Age is measured on 31 December of the cut-off year: cut-off year minus
 *    birth year.
 *  - "Under N" includes N (the COP puts a 12-year-old in Under 12).
 *  - A player may play up into any higher COP group, never down.
 *  - A custom group admits exactly the ages in its own range (a blank end is
 *    open). Its key is 'Custom' + letters/digits; only its definition on the
 *    competition (`customAgeGroups`) knows its name and range.
 *
 * This module imports nothing from the app, so hooks/useAgeGroups can build
 * on it.
 */

/**
 * Which age groups each gender competes in, youngest first. Boys run to
 * Under 18 and Above 18, girls to Under 16 and Above 16.
 */
export const AGE_GROUPS_BY_GENDER = {
  Male: ['Under10', 'Under12', 'Under14', 'Under18', 'Above18'],
  Female: ['Under10', 'Under12', 'Under14', 'Under16', 'Above16'],
};

export const AGE_GROUP_RANGES = Object.freeze({
  Under10: { min: 0, max: 10 },
  Under12: { min: 0, max: 12 },
  Under14: { min: 0, max: 14 },
  Under16: { min: 0, max: 16 },
  Under18: { min: 0, max: 18 },
  Above16: { min: 17, max: Infinity },
  Above18: { min: 19, max: Infinity },
});

/** Competition II's old one-final-per-gender category. */
const ALL_AGES = 'AllAges';

export const CUSTOM_AGE_GROUP_PREFIX = 'Custom';
const CUSTOM_AGE_GROUP_RE = /^Custom[A-Za-z0-9]{1,40}$/;
export const MAX_CUSTOM_AGE_GROUPS = 20;
export const CUSTOM_AGE_GROUP_LABEL_MAX = 40;
export const CUSTOM_AGE_MAX = 99;

/** @returns {boolean} is this a custom age group key? */
export const isCustomAgeGroup = (value) => typeof value === 'string' && CUSTOM_AGE_GROUP_RE.test(value);

/** A competition's custom definitions (accepts the competition or the list). */
export function customAgeGroupsOf(source) {
  const list = Array.isArray(source) ? source : source?.customAgeGroups;
  return Array.isArray(list) ? list.filter((d) => d && isCustomAgeGroup(d.key)) : [];
}

/*
 * A meet's custom groups are named only on the competition that defines them.
 * Every competition the app loads adds its definitions here (CompetitionContext,
 * the pickers, the desk), so a label can be found on screens that hold only a
 * key — a judge's seat, a score row. Keys are made from the name, so two meets'
 * "Under 11" share one key and one label.
 */
const knownCustom = new Map();

/** Remember a competition's custom age group definitions (the competition or its list). */
export function registerCustomAgeGroups(source) {
  for (const def of customAgeGroupsOf(source)) knownCustom.set(def.key, def);
}

/** A custom definition seen on any competition so far, or null. */
export const knownCustomAgeGroup = (key) => knownCustom.get(key) || null;

const findCustom = (group, custom) => customAgeGroupsOf(custom).find((d) => d.key === group) || null;
const ageOrNull = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

/** The ages a group admits, inclusive; null for an unknown group. */
export function ageGroupRange(group, custom = []) {
  if (AGE_GROUP_RANGES[group]) return AGE_GROUP_RANGES[group];
  const def = findCustom(group, custom);
  if (!def) return null;
  const min = ageOrNull(def.minAge);
  const max = ageOrNull(def.maxAge);
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : Infinity };
}

/** Age order for any mix of groups; COP before custom on a tie. */
export function ageGroupSortKey(group, custom = []) {
  const range = ageGroupRange(group, custom);
  if (!range) return 100000;
  const base = Number.isFinite(range.max) ? range.max : 1000 + range.min;
  return base * 2 + (AGE_GROUP_RANGES[group] ? 0 : 1);
}

/** Groups youngest first (a new array). */
export function sortAgeGroups(groups, custom = []) {
  return [...(groups || [])].sort((a, b) => ageGroupSortKey(a, custom) - ageGroupSortKey(b, custom));
}

/**
 * 'Under12' → 'Under 12'; a custom key → its name, or a readable stand-in
 * ('CustomVeterans35' → 'Veterans 35') when no definition is at hand.
 */
export function ageGroupLabelFrom(group, custom = []) {
  if (group === ALL_AGES) return 'All ages';
  const def = findCustom(group, custom);
  if (def?.label) return def.label;
  const text = String(group || '');
  if (isCustomAgeGroup(text)) {
    return text.slice(CUSTOM_AGE_GROUP_PREFIX.length)
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2');
  }
  return text.replace(/^(Under|Above)(\d+)$/, '$1 $2');
}

/** A new key for a custom group named `label`, unique among `taken`. */
export function customAgeGroupKey(label, taken = []) {
  const used = new Set(taken);
  const stem = `${CUSTOM_AGE_GROUP_PREFIX}${(String(label || '').replace(/[^A-Za-z0-9]/g, '') || 'Group').slice(0, 30)}`;
  if (!used.has(stem)) return stem;
  for (let n = 2; ; n += 1) if (!used.has(`${stem}x${n}`)) return `${stem}x${n}`;
}

/**
 * Always the year the competition is held (its start date): every meet in
 * 2026 measures ages on 31 Dec 2026, whatever the month. No override.
 */
export function ageCutoffYear(competition) {
  const start = competition?.startDate ? new Date(competition.startDate) : null;
  return start && !Number.isNaN(start.getTime()) ? start.getUTCFullYear() : null;
}

export function ageOnCutoff(dateOfBirth, cutoffYear) {
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  if (!dob || Number.isNaN(dob.getTime()) || !Number.isInteger(cutoffYear)) return null;
  return cutoffYear - dob.getUTCFullYear();
}

export function lowestAgeGroup(age, gender) {
  const list = AGE_GROUPS_BY_GENDER[gender];
  if (!list || !Number.isFinite(age) || age < 0) return null;
  return list.find((group) => age >= AGE_GROUP_RANGES[group].min && age <= AGE_GROUP_RANGES[group].max) || null;
}

/**
 * Every group this player may enter, youngest first: their lowest COP bracket
 * and each higher one, plus each custom group whose range admits them;
 * narrowed to `offered` when given.
 *
 * @param {number} age
 * @param {string} gender
 * @param {string[]} [offered]
 * @param {Array|Object} [custom] - the meet's custom groups (or the meet)
 */
export function eligibleAgeGroups(age, gender, offered, custom = []) {
  const list = AGE_GROUPS_BY_GENDER[gender];
  if (!list || !Number.isFinite(age) || age < 0) return [];
  const lowest = lowestAgeGroup(age, gender);
  const cop = lowest ? list.slice(list.indexOf(lowest)) : [];
  const own = customAgeGroupsOf(custom)
    .filter((def) => {
      const range = ageGroupRange(def.key, custom);
      return age >= range.min && age <= range.max;
    })
    .map((def) => def.key);
  const all = own.length ? sortAgeGroups([...cop, ...own], custom) : cop;
  return Array.isArray(offered) ? all.filter((group) => offered.includes(group)) : all;
}
