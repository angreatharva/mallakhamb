/**
 * The gender → age-group rule.
 *
 * Boys and girls do not share the top two brackets. Every age-group picker in
 * the app derives its options from this module, so these tests are what stop a
 * boys' category being offered Under 16 — an entry that would then be scored
 * against the wrong field.
 */

import { describe, test, expect } from 'vitest';
import {
  AGE_GROUPS_BY_GENDER,
  ALL_AGE_GROUPS,
  getAgeGroupsForGender,
  getFilteredAgeGroups,
  isAgeGroupValidForGender,
} from './useAgeGroups';

const valuesOf = (options) => options.map((option) => option.value);

describe('the brackets each gender competes in', () => {
  test('boys run to Under 18 and Above 18', () => {
    expect(valuesOf(getAgeGroupsForGender('Male')))
      .toEqual(['Under10', 'Under12', 'Under14', 'Under18', 'Above18']);
  });

  test('girls run to Under 16 and Above 16', () => {
    expect(valuesOf(getAgeGroupsForGender('Female')))
      .toEqual(['Under10', 'Under12', 'Under14', 'Under16', 'Above16']);
  });

  test('the two lists never overlap at the top', () => {
    expect(AGE_GROUPS_BY_GENDER.Male).not.toContain('Under16');
    expect(AGE_GROUPS_BY_GENDER.Male).not.toContain('Above16');
    expect(AGE_GROUPS_BY_GENDER.Female).not.toContain('Under18');
    expect(AGE_GROUPS_BY_GENDER.Female).not.toContain('Above18');
  });

  test('options carry a readable label', () => {
    expect(getAgeGroupsForGender('Male')[0]).toEqual({ value: 'Under10', label: 'Under 10' });
  });

  test('an unknown gender offers nothing rather than guessing', () => {
    expect(getAgeGroupsForGender(undefined)).toEqual([]);
    expect(getAgeGroupsForGender('Other')).toEqual([]);
  });

  test('isAgeGroupValidForGender answers per gender', () => {
    expect(isAgeGroupValidForGender('Under18', 'Male')).toBe(true);
    expect(isAgeGroupValidForGender('Under16', 'Male')).toBe(false);
    expect(isAgeGroupValidForGender('Above16', 'Female')).toBe(true);
    expect(isAgeGroupValidForGender('Above18', 'Female')).toBe(false);
  });

  test('ALL_AGE_GROUPS covers both genders, in age order', () => {
    expect(ALL_AGE_GROUPS).toEqual([
      'Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18',
    ]);
    for (const gender of ['Male', 'Female']) {
      for (const bracket of AGE_GROUPS_BY_GENDER[gender]) {
        expect(ALL_AGE_GROUPS).toContain(bracket);
      }
    }
  });
});

describe('narrowing to what a competition runs', () => {
  test('no competition offers the gender its full list', () => {
    expect(valuesOf(getFilteredAgeGroups(null, 'Female')))
      .toEqual(['Under10', 'Under12', 'Under14', 'Under16', 'Above16']);
  });

  test('a competition declaring no age groups offers the full list', () => {
    expect(valuesOf(getFilteredAgeGroups({ ageGroups: [] }, 'Male')))
      .toEqual(['Under10', 'Under12', 'Under14', 'Under18', 'Above18']);
  });

  test('a competition running two brackets offers only those two', () => {
    const competition = {
      ageGroups: [
        { ageGroup: 'Under12', gender: 'Male' },
        { ageGroup: 'Above18', gender: 'Male' },
        { ageGroup: 'Under12', gender: 'Female' },
      ],
    };

    expect(valuesOf(getFilteredAgeGroups(competition, 'Male'))).toEqual(['Under12', 'Above18']);
  });

  test('the other gender\'s brackets are never offered', () => {
    const competition = {
      ageGroups: [
        { ageGroup: 'Under18', gender: 'Male' },
        { ageGroup: 'Under16', gender: 'Female' },
      ],
    };

    expect(valuesOf(getFilteredAgeGroups(competition, 'Male'))).toEqual(['Under18']);
    expect(valuesOf(getFilteredAgeGroups(competition, 'Female'))).toEqual(['Under16']);
  });

  test('a mis-configured pairing is dropped, not offered', () => {
    // Under 16 is a girls' bracket; pairing it with Male is bad data, and
    // offering it would create an entry with no field to compete against.
    const competition = {
      ageGroups: [
        { ageGroup: 'Under14', gender: 'Male' },
        { ageGroup: 'Under16', gender: 'Male' },
      ],
    };

    expect(valuesOf(getFilteredAgeGroups(competition, 'Male'))).toEqual(['Under14']);
  });

  test('options come back in age order whatever order they were configured in', () => {
    const competition = {
      ageGroups: [
        { ageGroup: 'Above18', gender: 'Male' },
        { ageGroup: 'Under10', gender: 'Male' },
        { ageGroup: 'Under14', gender: 'Male' },
      ],
    };

    expect(valuesOf(getFilteredAgeGroups(competition, 'Male')))
      .toEqual(['Under10', 'Under14', 'Above18']);
  });

  test('a competition running nothing for this gender offers nothing', () => {
    const competition = { ageGroups: [{ ageGroup: 'Under12', gender: 'Female' }] };

    expect(getFilteredAgeGroups(competition, 'Male')).toEqual([]);
  });
});
