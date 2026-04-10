import { useMemo } from 'react';
import { useCompetition } from '../contexts/CompetitionContext';

// Age group mapping from competition format to display format
const ageGroupMapping = {
  Under10: { value: 'Under10', label: 'Under 10' },
  Under12: { value: 'Under12', label: 'Under 12' },
  Under14: { value: 'Under14', label: 'Under 14' },
  Under16: { value: 'Under16', label: 'Under 16' },
  Under18: { value: 'Under18', label: 'Under 18' },
  Above16: { value: 'Above16', label: 'Above 16' },
  Above18: { value: 'Above18', label: 'Above 18' },
};

/**
 * Hook to get filtered age groups based on competition settings and gender
 * Boys: Under 10, Under 12, Under 14, Under 18, Above 18
 * Girls: Under 10, Under 12, Under 14, Under 16, Above 16
 * @param {string} gender - 'Male' or 'Female'
 * @returns {Array} Array of age group options filtered by competition and gender
 */
export const useAgeGroups = (gender) => {
  const { currentCompetition } = useCompetition();

  return useMemo(() => {
    if (
      !currentCompetition ||
      !currentCompetition.ageGroups ||
      currentCompetition.ageGroups.length === 0
    ) {
      // Fallback to default age groups if competition doesn't have age groups set
      return gender === 'Male'
        ? [
            { value: 'Under10', label: 'Under 10' },
            { value: 'Under12', label: 'Under 12' },
            { value: 'Under14', label: 'Under 14' },
            { value: 'Under18', label: 'Under 18' },
            { value: 'Above18', label: 'Above 18' },
          ]
        : [
            { value: 'Under10', label: 'Under 10' },
            { value: 'Under12', label: 'Under 12' },
            { value: 'Under14', label: 'Under 14' },
            { value: 'Under16', label: 'Under 16' },
            { value: 'Above16', label: 'Above 16' },
          ];
    }

    // Filter age groups by gender from competition
    const filteredAgeGroups = currentCompetition.ageGroups
      .filter((ag) => ag.gender === gender)
      .map((ag) => {
        const mapping = ageGroupMapping[ag.ageGroup];
        if (mapping) {
          return {
            value: mapping.value,
            label: mapping.label,
          };
        }
        // Fallback if mapping not found
        return {
          value: ag.ageGroup,
          label: ag.ageGroup,
        };
      })
      .sort((a, b) => {
        // Sort by value to maintain consistent order
        const order = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
        return order.indexOf(a.value) - order.indexOf(b.value);
      });

    return filteredAgeGroups;
  }, [currentCompetition, gender]);
};

/**
 * Get all available age groups for a competition (both genders)
 * @returns {Object} Object with 'Male' and 'Female' arrays
 */
export const useAllAgeGroups = () => {
  const { currentCompetition } = useCompetition();

  const getAgeGroupsForGender = (gender) => {
    if (
      !currentCompetition ||
      !currentCompetition.ageGroups ||
      currentCompetition.ageGroups.length === 0
    ) {
      // Fallback to default age groups if competition doesn't have age groups set
      return gender === 'Male'
        ? [
            { value: 'Under10', label: 'Under 10' },
            { value: 'Under12', label: 'Under 12' },
            { value: 'Under14', label: 'Under 14' },
            { value: 'Under18', label: 'Under 18' },
            { value: 'Above18', label: 'Above 18' },
          ]
        : [
            { value: 'Under10', label: 'Under 10' },
            { value: 'Under12', label: 'Under 12' },
            { value: 'Under14', label: 'Under 14' },
            { value: 'Under16', label: 'Under 16' },
            { value: 'Above16', label: 'Above 16' },
          ];
    }

    // Filter age groups by gender from competition
    const filteredAgeGroups = currentCompetition.ageGroups
      .filter((ag) => ag.gender === gender)
      .map((ag) => {
        const mapping = ageGroupMapping[ag.ageGroup];
        if (mapping) {
          return {
            value: mapping.value,
            label: mapping.label,
          };
        }
        // Fallback if mapping not found
        return {
          value: ag.ageGroup,
          label: ag.ageGroup,
        };
      })
      .sort((a, b) => {
        // Sort by value to maintain consistent order
        const order = ['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'];
        return order.indexOf(a.value) - order.indexOf(b.value);
      });

    return filteredAgeGroups;
  };

  return useMemo(() => {
    return {
      Male: getAgeGroupsForGender('Male'),
      Female: getAgeGroupsForGender('Female'),
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
  return useMemo(() => groups.map((g) => g.value), [groups]);
};

export default useAgeGroups;
