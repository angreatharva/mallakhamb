import { useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

/**
 * Which age groups each gender competes in.
 *
 * The two are NOT the same list and never have been: boys run to Under 18 and
 * Above 18, girls to Under 16 and Above 16. This object is the single source of
 * that rule — every age-group picker in the app derives its options from here,
 * so a Male selection can never offer Under 16 and a Female one can never offer
 * Above 18.
 *
 * Values are in age order, which is also the order they are displayed in.
 */
export const AGE_GROUPS_BY_GENDER = {
  Male: ['Under10', 'Under12', 'Under14', 'Under18', 'Above18'],
  Female: ['Under10', 'Under12', 'Under14', 'Under16', 'Above16'],
};

// Age group mapping from competition format to display format
export const ageGroupMapping = {
  'Under10': { value: 'Under10', label: 'Under 10' },
  'Under12': { value: 'Under12', label: 'Under 12' },
  'Under14': { value: 'Under14', label: 'Under 14' },
  'Under16': { value: 'Under16', label: 'Under 16' },
  'Under18': { value: 'Under18', label: 'Under 18' },
  'Above16': { value: 'Above16', label: 'Above 16' },
  'Above18': { value: 'Above18', label: 'Above 18' }
};

/**
 * Every bracket either gender competes in, in age order.
 *
 * Only for surfaces that show both genders at once — the competition editor's
 * grid, which offers all seven and disables the pairings that do not exist. A
 * picker for one gender must use `getAgeGroupsForGender` instead.
 */
export const ALL_AGE_GROUPS = Object.keys(ageGroupMapping);

/**
 * @param {string} ageGroup - stored value, e.g. 'Under14'
 * @returns {{value: string, label: string}} dropdown option
 */
const toOption = (ageGroup) => ageGroupMapping[ageGroup] || { value: ageGroup, label: ageGroup };

/**
 * Is this age group one the gender actually competes in?
 *
 * @param {string} ageGroup
 * @param {string} gender - 'Male' | 'Female'
 * @returns {boolean}
 */
export const isAgeGroupValidForGender = (ageGroup, gender) =>
  (AGE_GROUPS_BY_GENDER[gender] || []).includes(ageGroup);

/**
 * Every age group a gender competes in, as dropdown options.
 *
 * @param {string} gender - 'Male' | 'Female'
 * @returns {Array<{value: string, label: string}>} empty when gender is unknown
 */
export const getAgeGroupsForGender = (gender) =>
  (AGE_GROUPS_BY_GENDER[gender] || []).map(toOption);

export const defaultBoysAgeGroups = getAgeGroupsForGender('Male');
export const defaultGirlsAgeGroups = getAgeGroupsForGender('Female');

/**
 * The age groups on offer for a gender in a given competition.
 *
 * A competition may narrow the list — a district meet running only the two
 * youngest brackets — but it can never widen it past what the gender competes
 * in. The intersection matters because `competition.ageGroups` is free-form
 * data: a mis-configured entry pairing Under 16 with Male would otherwise be
 * offered to a boys' category and produce an entry no one can score.
 *
 * With no competition, or one that declares no age groups, the gender's full
 * list is offered.
 *
 * @param {Object|null} competition - may carry `ageGroups: [{ageGroup, gender}]`
 * @param {string} gender - 'Male' | 'Female'
 * @returns {Array<{value: string, label: string}>}
 */
export const getFilteredAgeGroups = (competition, gender) => {
  const allowed = AGE_GROUPS_BY_GENDER[gender];
  if (!allowed) return [];

  const configured = competition?.ageGroups;
  if (!configured || configured.length === 0) {
    return getAgeGroupsForGender(gender);
  }

  return configured
    .filter((ag) => ag.gender === gender && allowed.includes(ag.ageGroup))
    .map((ag) => toOption(ag.ageGroup))
    .sort((a, b) => allowed.indexOf(a.value) - allowed.indexOf(b.value));
};

/**
 * Hook to get filtered age groups based on competition settings and gender
 * @param {string} gender - 'Male' or 'Female'
 * @param {Object|null} competitionOverride - use instead of the active competition
 * @returns {Array} Array of age group options filtered by competition and gender
 */
export const useAgeGroups = (gender, competitionOverride = null) => {
  const { currentCompetition } = useCompetition();
  const competition = competitionOverride ?? currentCompetition;

  return useMemo(() => getFilteredAgeGroups(competition, gender), [competition, gender]);
};

/**
 * Get all available age groups for a competition (both genders)
 * @returns {Object} Object with 'Male' and 'Female' arrays
 */
export const useAllAgeGroups = () => {
  const { currentCompetition } = useCompetition();

  return useMemo(() => {
    return {
      Male: getFilteredAgeGroups(currentCompetition, 'Male'),
      Female: getFilteredAgeGroups(currentCompetition, 'Female')
    };
  }, [currentCompetition]);
};

/**
 * Get array of age group values (e.g. ['Under10', 'Under12']) for a gender - useful for iterating/display
 * @param {string} gender - 'Male' or 'Female'
 * @returns {Array<string>} Array of age group value strings
 */
export const useAgeGroupValues = (gender) => {
  const groups = useAgeGroups(gender);
  return useMemo(() => groups.map(g => g.value), [groups]);
};

export default useAgeGroups;
