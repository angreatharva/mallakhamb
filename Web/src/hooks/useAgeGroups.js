import { useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

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

export const defaultBoysAgeGroups = [
  { value: 'Under10', label: 'Under 10' },
  { value: 'Under12', label: 'Under 12' },
  { value: 'Under14', label: 'Under 14' },
  { value: 'Under18', label: 'Under 18' },
  { value: 'Above18', label: 'Above 18' }
];

export const defaultGirlsAgeGroups = [
  { value: 'Under10', label: 'Under 10' },
  { value: 'Under12', label: 'Under 12' },
  { value: 'Under14', label: 'Under 14' },
  { value: 'Under16', label: 'Under 16' },
  { value: 'Above16', label: 'Above 16' }
];

/**
 * Helper to get filtered age groups (can be used outside hooks/components)
 */
export const getFilteredAgeGroups = (competition, gender) => {
  if (!competition || !competition.ageGroups || competition.ageGroups.length === 0) {
    return gender === 'Male' ? defaultBoysAgeGroups : defaultGirlsAgeGroups;
  }

  return competition.ageGroups
    .filter(ag => ag.gender === gender)
    .map(ag => {
      const mapping = ageGroupMapping[ag.ageGroup];
      if (mapping) return { value: mapping.value, label: mapping.label };
      return { value: ag.ageGroup, label: ag.ageGroup };
    })
    .sort((a, b) => {
      const order = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
      return order.indexOf(a.value) - order.indexOf(b.value);
    });
};

/**
 * Hook to get filtered age groups based on competition settings and gender
 * @param {string} gender - 'Male' or 'Female'
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
