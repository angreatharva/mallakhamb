/**
 * The COP age rule (1.8.3.2–1.8.3.5) at every point a player is put into a
 * team's age group — coach squad entry, the competition route, Super Admin Add
 * Player, the walk-in desk and the player's own choice (owner, 2026-10-28;
 * docs/team-per-level-plan.md).
 *
 *  - Age = cut-off year − birth year, measured on 31 December
 *    (`ageCutoffYear`: the meet's override, else its start-date year — how the
 *    season is chosen is PARKED, see the plan).
 *  - "Under N" includes N. A player may enter their own group or any HIGHER
 *    one the meet runs. Coming back down after playing up is allowed for now
 *    (PARKED).
 *
 * The arithmetic lives in config/cop-rules (mirrored on the Web and held in
 * step by ageEligibilitySync.test.js); this module turns it into one check
 * and one message.
 *
 * @module utils/data/age-eligibility.util
 */

const { ValidationError } = require('../../errors');
const { ageCutoffYear, ageOnCutoff, lowestAgeGroup, eligibleAgeGroups } = require('../../config/cop-rules');

/** 'Under12' → 'Under 12'. */
const groupLabel = (group) => String(group || '').replace(/^(Under|Above)(\d+)$/, '$1 $2');

const nameOf = (player) => [player?.firstName, player?.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'") || 'This player';

/**
 * May this player enter `ageGroup` (as `gender`) in this competition?
 *
 * @param {Object} args
 * @param {Date|string} args.dateOfBirth
 * @param {string} args.gender
 * @param {string} args.ageGroup
 * @param {Object} [args.competition] - for the cut-off year
 * @param {number} [args.cutoffYear]  - when there is no competition (a player's own choice)
 * @returns {{ok: boolean, age: number|null, cutoffYear: number|null, lowest: string|null, eligible: string[]}}
 *   `ok` is true when the date is missing or unreadable — nothing to judge by
 */
function checkAgeGroup({ dateOfBirth, gender, ageGroup, competition = null, cutoffYear = null }) {
  const year = cutoffYear ?? ageCutoffYear(competition) ?? new Date().getUTCFullYear();
  const age = ageOnCutoff(dateOfBirth, year);
  if (age === null || !ageGroup || !gender) return { ok: true, age, cutoffYear: year, lowest: null, eligible: [] };
  const lowest = lowestAgeGroup(age, gender);
  const eligible = eligibleAgeGroups(age, gender);
  return { ok: eligible.includes(ageGroup), age, cutoffYear: year, lowest, eligible };
}

/**
 * Throw a 400 that says why, in the coach's words, when the player may not
 * enter this group.
 * @throws {ValidationError} reason AGE_GROUP_NOT_ALLOWED
 */
function assertAgeGroup({ player, gender, ageGroup, competition = null, cutoffYear = null }) {
  const result = checkAgeGroup({ dateOfBirth: player?.dateOfBirth, gender, ageGroup, competition, cutoffYear });
  if (result.ok) return result;
  const offered = competition?.ageGroups?.length
    ? competition.ageGroups.filter((g) => g.gender === gender).map((g) => g.ageGroup)
    : null;
  const choices = offered ? result.eligible.filter((g) => offered.includes(g)) : result.eligible;
  const hint = choices.length
    ? `Choose ${groupLabel(choices[0])}${choices.length > 1 ? ' or higher' : ''}.`
    : 'This competition runs no age group they may enter.';
  throw new ValidationError(
    `${nameOf(player)} is ${result.age} on 31 Dec ${result.cutoffYear}, too old for ${groupLabel(ageGroup)}. ${hint}`,
    { field: 'ageGroup', reason: 'AGE_GROUP_NOT_ALLOWED', age: result.age, cutoffYear: result.cutoffYear, eligible: choices }
  );
}

module.exports = { checkAgeGroup, assertAgeGroup, groupLabel };
