/**
 * COP 1.8.3.2–1.8.3.5 — which age groups a player may enter.
 *
 * Mirrors `Server/src/config/cop-rules.js` (ageCutoffYear, ageOnCutoff,
 * lowestAgeGroup, eligibleAgeGroups). The walk-in desk shows the result before
 * any request is made and the server enforces it; ageEligibilitySync.test.js
 * feeds both the same inputs and fails if they ever disagree.
 *
 *  - Age is measured on 31 December of the cut-off year: cut-off year minus
 *    birth year.
 *  - "Under N" includes N (the COP puts a 12-year-old in Under 12).
 *  - A player may play up into any higher group, never down.
 */

import { AGE_GROUPS_BY_GENDER } from '@/hooks/useAgeGroups';

export const AGE_GROUP_RANGES = Object.freeze({
  Under10: { min: 0, max: 10 },
  Under12: { min: 0, max: 12 },
  Under14: { min: 0, max: 14 },
  Under16: { min: 0, max: 16 },
  Under18: { min: 0, max: 18 },
  Above16: { min: 17, max: Infinity },
  Above18: { min: 19, max: Infinity },
});

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

export function eligibleAgeGroups(age, gender, offered) {
  const list = AGE_GROUPS_BY_GENDER[gender];
  const lowest = lowestAgeGroup(age, gender);
  if (!list || !lowest) return [];
  const allowed = list.slice(list.indexOf(lowest));
  return Array.isArray(offered) ? allowed.filter((group) => offered.includes(group)) : allowed;
}
