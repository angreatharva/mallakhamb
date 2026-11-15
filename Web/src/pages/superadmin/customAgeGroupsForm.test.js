/**
 * The competition form's custom age groups: what it loads, what it refuses
 * and what it sends.
 */
import { describe, test, expect } from 'vitest';
import {
  blankCustomRow, splitAgeGroups, customAgeGroupsError, selectedPairCount, buildAgeGroupPayload, rangeText,
} from './customAgeGroupsForm';
import { getFilteredAgeGroups, ageGroupLabel, isAgeGroupValidForGender } from '@/hooks/useAgeGroups';
import { registerCustomAgeGroups } from '@/utils/competition/ageEligibility';

const stored = {
  customAgeGroups: [
    { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 },
    { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null },
  ],
  ageGroups: [
    { gender: 'Male', ageGroup: 'Under12' },
    { gender: 'Female', ageGroup: 'CustomUnder11' },
    { gender: 'Male', ageGroup: 'CustomUnder11' },
    { gender: 'Male', ageGroup: 'CustomVeterans35' },
    { gender: 'Male', ageGroup: 'Above18' },
  ],
};

describe('loading a competition into the form', () => {
  test('COP ticks stay in the grid; each custom group becomes a row with its own ticks', () => {
    const form = splitAgeGroups(stored);
    expect(form.ageGroups).toEqual([{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Male', ageGroup: 'Above18' }]);
    expect(form.customAgeGroups).toEqual([
      { uid: 'CustomUnder11', key: 'CustomUnder11', label: 'Under 11', minAge: '', maxAge: '11', Male: true, Female: true },
      { uid: 'CustomVeterans35', key: 'CustomVeterans35', label: 'Veterans 35+', minAge: '35', maxAge: '', Male: true, Female: false },
    ]);
    expect(selectedPairCount(form)).toBe(5);
  });

  test('a round trip sends back what was stored', () => {
    const payload = buildAgeGroupPayload(splitAgeGroups(stored));
    expect(payload.customAgeGroups).toEqual(stored.customAgeGroups);
    const pairs = (list) => list.map((g) => `${g.gender}:${g.ageGroup}`).sort();
    expect(pairs(payload.ageGroups)).toEqual(pairs(stored.ageGroups));
  });
});

describe('a new row', () => {
  test('gets a key from its name that the ticks use in the same request', () => {
    const form = { ageGroups: [], customAgeGroups: [{ ...blankCustomRow(), label: ' Under 11 ', maxAge: '11', Female: false }, { ...blankCustomRow(), label: 'Under-11', minAge: '9' }] };
    expect(customAgeGroupsError(form.customAgeGroups)).toBeNull();
    expect(buildAgeGroupPayload(form)).toEqual({
      customAgeGroups: [
        { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 },
        { key: 'CustomUnder11x2', label: 'Under-11', minAge: 9, maxAge: null },
      ],
      ageGroups: [
        { gender: 'Male', ageGroup: 'CustomUnder11' },
        { gender: 'Male', ageGroup: 'CustomUnder11x2' },
        { gender: 'Female', ageGroup: 'CustomUnder11x2' },
      ],
    });
  });

  test.each([
    [{ label: '' }, 'Give every custom age group a name'],
    [{ label: 'Under 14' }, 'already a COP age group'],
    [{ label: 'A', minAge: '12', maxAge: '10' }, 'minimum age is above the maximum'],
    [{ label: 'A', minAge: '1.5' }, 'whole number'],
    [{ label: 'A', Male: false, Female: false }, 'tick Boys, Girls or both'],
  ])('refuses %j', (change, message) => {
    expect(customAgeGroupsError([{ ...blankCustomRow(), ...change }])).toContain(message);
  });

  test('two rows with one name are refused', () => {
    expect(customAgeGroupsError([{ ...blankCustomRow(), label: 'Open' }, { ...blankCustomRow(), label: 'open' }])).toContain('both called');
  });

  test('the range reads in words', () => {
    expect(rangeText('', '11')).toBe('Ages up to 11');
    expect(rangeText('35', '')).toBe('Ages 35 and over');
    expect(rangeText('13', '15')).toBe('Ages 13–15');
    expect(rangeText('', '')).toBe('Any age');
  });
});

describe('the pickers offer a meet\'s custom groups', () => {
  test('per gender, in age order, by name', () => {
    expect(getFilteredAgeGroups(stored, 'Male')).toEqual([
      { value: 'CustomUnder11', label: 'Under 11' },
      { value: 'Under12', label: 'Under 12' },
      { value: 'Above18', label: 'Above 18' },
      { value: 'CustomVeterans35', label: 'Veterans 35+' },
    ]);
    expect(getFilteredAgeGroups(stored, 'Female')).toEqual([{ value: 'CustomUnder11', label: 'Under 11' }]);
  });

  test('a key the meet does not define is not offered', () => {
    const meet = { ...stored, ageGroups: [...stored.ageGroups, { gender: 'Female', ageGroup: 'CustomGhost' }] };
    expect(getFilteredAgeGroups(meet, 'Female').map((o) => o.value)).toEqual(['CustomUnder11']);
  });

  test('a screen holding only a key still shows the name once any meet defined it', () => {
    expect(ageGroupLabel('CustomJunior9')).toBe('Junior 9');
    registerCustomAgeGroups({ customAgeGroups: [{ key: 'CustomJunior9', label: 'Junior (≤9)', minAge: null, maxAge: 9 }] });
    expect(ageGroupLabel('CustomJunior9')).toBe('Junior (≤9)');
    expect(ageGroupLabel('Under12')).toBe('Under 12');
  });

  test('a custom group is valid for either gender (its meet decides)', () => {
    expect(isAgeGroupValidForGender('CustomUnder11', 'Male')).toBe(true);
    expect(isAgeGroupValidForGender('CustomUnder11', 'Female')).toBe(true);
    expect(isAgeGroupValidForGender('CustomUnder11', 'Other')).toBe(false);
  });
});
