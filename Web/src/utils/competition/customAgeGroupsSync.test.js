/**
 * A meet's custom age groups (owner, 2026-11-15) are judged on both stacks:
 * the pickers and the desk offer only the groups a player's age fits, and the
 * server refuses the rest. If the two disagreed a coach would pick a group the
 * server then rejects. Same inputs, same answers.
 */
import { describe, it, expect } from 'vitest';
import * as client from './ageEligibility';
// Reaching into the server package is deliberate (see competitionFeeSync.test.js).
import server from '../../../../Server/src/config/cop-rules.js';

const CUSTOM = [
  { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 },
  { key: 'CustomTeen', label: 'Teen 13-15', minAge: 13, maxAge: 15 },
  { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null },
  { key: 'CustomOpen', label: 'Open', minAge: '', maxAge: '' },
];

describe('the two stacks agree on custom age groups', () => {
  it('share the limits', () => {
    expect(client.CUSTOM_AGE_GROUP_PREFIX).toBe(server.CUSTOM_AGE_GROUP_PREFIX);
    expect(client.MAX_CUSTOM_AGE_GROUPS).toBe(server.MAX_CUSTOM_AGE_GROUPS);
    expect(client.CUSTOM_AGE_GROUP_LABEL_MAX).toBe(server.CUSTOM_AGE_GROUP_LABEL_MAX);
    expect(client.CUSTOM_AGE_MAX).toBe(server.CUSTOM_AGE_MAX);
  });

  it.each(['Male', 'Female'])('agree on every age for %s', (gender) => {
    const offered = ['Under12', 'CustomUnder11', 'CustomTeen', 'CustomVeterans35', 'Above18', 'Above16'];
    for (let age = -1; age <= 60; age += 1) {
      expect(client.eligibleAgeGroups(age, gender, undefined, CUSTOM)).toEqual(server.eligibleAgeGroups(age, gender, undefined, CUSTOM));
      expect(client.eligibleAgeGroups(age, gender, offered, { customAgeGroups: CUSTOM }))
        .toEqual(server.eligibleAgeGroups(age, gender, offered, { customAgeGroups: CUSTOM }));
    }
  });

  it('agree on ranges, order, names and keys', () => {
    const groups = [...server.AGE_GROUPS, ...CUSTOM.map((d) => d.key), 'CustomUnknown', 'AllAges'];
    for (const g of groups) {
      expect(client.ageGroupRange(g, CUSTOM)).toEqual(server.ageGroupRange(g, CUSTOM));
      expect(client.ageGroupLabelFrom(g, CUSTOM)).toBe(server.ageGroupLabel(g, CUSTOM));
      expect(client.ageGroupLabelFrom(g)).toBe(server.ageGroupLabel(g));
      expect(client.isCustomAgeGroup(g)).toBe(server.isCustomAgeGroup(g));
    }
    expect(client.sortAgeGroups([...groups].reverse(), CUSTOM)).toEqual(server.sortAgeGroups([...groups].reverse(), CUSTOM));
    for (const label of ['Under 11', 'Veterans 35+', '३५+', 'x'.repeat(60), '']) {
      expect(client.customAgeGroupKey(label, ['CustomUnder11'])).toBe(server.customAgeGroupKey(label, ['CustomUnder11']));
    }
  });
});
