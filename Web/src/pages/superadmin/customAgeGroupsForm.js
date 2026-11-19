/**
 * The competition form's custom age groups (owner, 2026-11-15): rows of a
 * name, an age range and Boys/Girls ticks, beside the COP grid.
 *
 * In the form the COP grid keeps `ageGroups` (COP pairs only) and each custom
 * row carries its own `Male` / `Female` ticks; `buildAgeGroupPayload` merges
 * them into the server's shape — `customAgeGroups` definitions plus one
 * `ageGroups` row per ticked gender — and gives a new row its key, so the
 * ticks can name it in the same request. The server
 * (utils/data/custom-age-groups.util) checks all of it again.
 */

import {
  CUSTOM_AGE_MAX,
  CUSTOM_AGE_GROUP_LABEL_MAX,
  MAX_CUSTOM_AGE_GROUPS,
  customAgeGroupKey,
  customAgeGroupsOf,
  isCustomAgeGroup,
} from '@/utils/competition/ageEligibility';

/** The COP bracket names each gender runs (Boys have no Under 16; Girls have no Under 18). */
const COP_LABELS_BY_GENDER = {
  Male: ['under 10', 'under 12', 'under 14', 'under 18', 'above 18'],
  Female: ['under 10', 'under 12', 'under 14', 'under 16', 'above 16'],
};

let nextUid = 0;
/** A blank row for "Add custom age group". */
export const blankCustomRow = () => ({ uid: `new-${(nextUid += 1)}`, key: null, label: '', minAge: '', maxAge: '', Male: true, Female: true });

const tidy = (label) => String(label ?? '').replace(/\s+/g, ' ').trim();
const ageText = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * A stored competition → the form's two parts.
 * @returns {{ageGroups: Array, customAgeGroups: Array}}
 */
export function splitAgeGroups(competition) {
  const all = competition?.ageGroups || [];
  const ticked = (key, gender) => all.some((g) => g.ageGroup === key && g.gender === gender);
  return {
    ageGroups: all.filter((g) => !isCustomAgeGroup(g.ageGroup)).map(({ gender, ageGroup }) => ({ gender, ageGroup })),
    customAgeGroups: customAgeGroupsOf(competition).map((d) => ({
      uid: d.key,
      key: d.key,
      label: d.label,
      minAge: ageText(d.minAge),
      maxAge: ageText(d.maxAge),
      Male: ticked(d.key, 'Male'),
      Female: ticked(d.key, 'Female'),
    })),
  };
}

const readAge = (v) => {
  const text = String(v ?? '').trim();
  if (text === '') return null;
  return /^\d{1,2}$/.test(text) ? Number(text) : NaN;
};

/** What is wrong with the custom rows, in words, or null. */
export function customAgeGroupsError(rows) {
  const list = rows || [];
  if (list.length > MAX_CUSTOM_AGE_GROUPS) return `At most ${MAX_CUSTOM_AGE_GROUPS} custom age groups`;
  const seen = new Set();
  for (const row of list) {
    const label = tidy(row.label);
    if (!label) return 'Give every custom age group a name';
    if (label.length > CUSTOM_AGE_GROUP_LABEL_MAX) return `${label.slice(0, 20)}…: at most ${CUSTOM_AGE_GROUP_LABEL_MAX} characters`;
    if (/[<>]/.test(label)) return `${label}: < and > are not allowed`;
    const lower = label.toLowerCase();
    const clashGender = ['Male', 'Female'].find((g) => row[g] && COP_LABELS_BY_GENDER[g].includes(lower));
    if (clashGender) {
      return `"${label}" is already a COP age group for ${clashGender === 'Male' ? 'Boys' : 'Girls'} — tick it above instead`;
    }
    if (seen.has(lower)) return `Two custom age groups are both called "${label}"`;
    seen.add(lower);
    const min = readAge(row.minAge);
    const max = readAge(row.maxAge);
    if (Number.isNaN(min) || (min !== null && min > CUSTOM_AGE_MAX)) return `${label}: minimum age must be a whole number from 0 to ${CUSTOM_AGE_MAX}`;
    if (Number.isNaN(max) || (max !== null && max > CUSTOM_AGE_MAX)) return `${label}: maximum age must be a whole number from 0 to ${CUSTOM_AGE_MAX}`;
    if (min !== null && max !== null && min > max) return `${label}: the minimum age is above the maximum`;
    if (!row.Male && !row.Female) return `${label}: tick Boys, Girls or both`;
  }
  return null;
}

/** How many gender/age-group pairs the form will run (COP and custom). */
export const selectedPairCount = (form) =>
  (form.ageGroups || []).length
  + (form.customAgeGroups || []).reduce((n, row) => n + (row.Male ? 1 : 0) + (row.Female ? 1 : 0), 0);

/**
 * The form → the request's `customAgeGroups` and `ageGroups`.
 * @param {{ageGroups: Array, customAgeGroups: Array}} form
 */
export function buildAgeGroupPayload(form) {
  const rows = form.customAgeGroups || [];
  const taken = rows.map((r) => r.key).filter(Boolean);
  const defs = rows.map((row) => {
    const label = tidy(row.label);
    const key = row.key || customAgeGroupKey(label, taken);
    if (!row.key) taken.push(key);
    return { key, label, minAge: readAge(row.minAge), maxAge: readAge(row.maxAge), Male: row.Male, Female: row.Female };
  });
  return {
    customAgeGroups: defs.map(({ key, label, minAge, maxAge }) => ({ key, label, minAge, maxAge })),
    ageGroups: [
      ...(form.ageGroups || []).filter((g) => !isCustomAgeGroup(g.ageGroup)),
      ...defs.flatMap((d) => ['Male', 'Female'].filter((g) => d[g]).map((gender) => ({ gender, ageGroup: d.key }))),
    ],
  };
}

/** "Ages up to 11", "Ages 35 and over", "Ages 13–15", "Any age" — the range in words. */
export function rangeText(minAge, maxAge) {
  const min = readAge(minAge);
  const max = readAge(maxAge);
  if (Number.isNaN(min) || Number.isNaN(max)) return '';
  if (min === null && max === null) return 'Any age';
  if (min === null) return `Ages up to ${max}`;
  if (max === null) return `Ages ${min} and over`;
  return `Ages ${min}–${max}`;
}
