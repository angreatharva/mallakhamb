/**
 * The COP age rule (1.8.3.2–1.8.3.5) at every point a player is put into a
 * team's age group — coach squad entry, the competition route, Super Admin Add
 * Player, the walk-in desk and the player's own choice (owner, 2026-10-28;
 * docs/archive/team-per-level-plan.md).
 *
 *  - Age = cut-off year − birth year, measured on 31 December
 *    (`ageCutoffYear`: always the year the meet is held — owner, 2026-10-29).
 *  - "Under N" includes N. A player may enter their own group or any HIGHER
 *    one the meet runs. Coming back down after playing up is allowed for now
 *    (PARKED).
 *  - A meet's custom age group (owner, 2026-11-15) admits exactly the ages in
 *    its own range, on the same 31 December.
 *
 * The arithmetic lives in config/cop-rules (mirrored on the Web and held in
 * step by ageEligibilitySync.test.js); this module turns it into one check
 * and one message.
 *
 * @module utils/data/age-eligibility.util
 */

const { ValidationError } = require('../../errors');
const {
  ageCutoffYear, ageOnCutoff, lowestAgeGroup, eligibleAgeGroups,
  ageGroupLabel, ageGroupRange, customAgeGroupsOf, isCustomAgeGroup,
} = require('../../config/cop-rules');

/**
 * 'Under12' → 'Under 12'; a custom key → its name (from `competition` when
 * given).
 */
const groupLabel = (group, competition = null) => ageGroupLabel(group, customAgeGroupsOf(competition));

const nameOf = (player) => [player?.firstName, player?.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'") || 'This player';

/**
 * May this player enter `ageGroup` (as `gender`) in this competition?
 *
 * @param {Object} args
 * @param {Date|string} args.dateOfBirth
 * @param {string} args.gender
 * @param {string} args.ageGroup
 * @param {Object} [args.competition] - for the cut-off year and custom groups
 * @param {number} [args.cutoffYear]  - when there is no competition (a player's own choice)
 * @returns {{ok: boolean, age: number|null, cutoffYear: number|null, lowest: string|null, eligible: string[], problem: string|null}}
 *   `ok` is true when the date is missing or unreadable — nothing to judge by.
 *   `problem` says why not, e.g. "too old for Under 12".
 */
function checkAgeGroup({ dateOfBirth, gender, ageGroup, competition = null, cutoffYear = null }) {
  const year = cutoffYear ?? ageCutoffYear(competition) ?? new Date().getUTCFullYear();
  const age = ageOnCutoff(dateOfBirth, year);
  if (age === null || !ageGroup || !gender) return { ok: true, age, cutoffYear: year, lowest: null, eligible: [], problem: null };
  const custom = customAgeGroupsOf(competition);
  const lowest = lowestAgeGroup(age, gender);
  const eligible = eligibleAgeGroups(age, gender, undefined, custom);
  const ok = eligible.includes(ageGroup);
  let problem = null;
  if (!ok) {
    const range = ageGroupRange(ageGroup, custom);
    const label = groupLabel(ageGroup, competition);
    if (!range) problem = `${label} is not an age group of this competition`;
    else if (isCustomAgeGroup(ageGroup) && age < range.min) problem = `too young for ${label}`;
    else problem = `too old for ${label}`;
  }
  return { ok, age, cutoffYear: year, lowest, eligible, problem };
}

/**
 * The groups this player could choose instead, narrowed to what the meet runs
 * for the gender.
 */
function choicesFor(result, gender, competition) {
  const offered = competition?.ageGroups?.length
    ? competition.ageGroups.filter((g) => g.gender === gender).map((g) => g.ageGroup)
    : null;
  return offered ? result.eligible.filter((g) => offered.includes(g)) : result.eligible;
}

/**
 * Throw a 400 that says why, in the coach's words, when the player may not
 * enter this group.
 * @throws {ValidationError} reason AGE_GROUP_NOT_ALLOWED
 */
function assertAgeGroup({ player, gender, ageGroup, competition = null, cutoffYear = null }) {
  const result = checkAgeGroup({ dateOfBirth: player?.dateOfBirth, gender, ageGroup, competition, cutoffYear });
  if (result.ok) return result;
  const choices = choicesFor(result, gender, competition);
  const hint = choices.length
    ? `Choose ${groupLabel(choices[0], competition)}${choices.length > 1 ? ' or higher' : ''}.`
    : 'This competition runs no age group they may enter.';
  throw new ValidationError(
    `${nameOf(player)} is ${result.age} on 31 Dec ${result.cutoffYear}, ${result.problem}. ${hint}`,
    { field: 'ageGroup', reason: 'AGE_GROUP_NOT_ALLOWED', age: result.age, cutoffYear: result.cutoffYear, eligible: choices }
  );
}

module.exports = { checkAgeGroup, assertAgeGroup, groupLabel, choicesFor };
