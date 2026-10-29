/**
 * The desk shows a player's age and allowed groups before the server checks
 * them. If the two disagreed, the admin would pick a group the server then
 * refuses — or worse, the screen would accept a child the rule forbids.
 */
import { describe, it, expect } from 'vitest';
import { AGE_GROUPS_BY_GENDER } from '@/hooks/useAgeGroups';
import * as client from './ageEligibility';
// Reaching into the server package is deliberate (see competitionFeeSync.test.js).
import server from '../../../../Server/src/config/cop-rules.js';

describe('the two stacks agree on age eligibility', () => {
  it('play the same brackets per gender', () => {
    expect(AGE_GROUPS_BY_GENDER).toEqual(JSON.parse(JSON.stringify(server.AGE_GROUPS_BY_GENDER)));
    expect(client.AGE_GROUP_RANGES).toEqual({ ...server.AGE_GROUP_RANGES });
  });

  it.each(['Male', 'Female'])('agree on every age for %s', (gender) => {
    for (let age = -1; age <= 40; age += 1) {
      expect(client.lowestAgeGroup(age, gender)).toBe(server.lowestAgeGroup(age, gender));
      expect(client.eligibleAgeGroups(age, gender)).toEqual(server.eligibleAgeGroups(age, gender));
      expect(client.eligibleAgeGroups(age, gender, ['Under12', 'Above18', 'Above16']))
        .toEqual(server.eligibleAgeGroups(age, gender, ['Under12', 'Above18', 'Above16']));
    }
  });

  it('agree on the cut-off year and the age', () => {
    const meets = [
      { startDate: '2022-02-10T00:00:00Z' },
      { startDate: '2022-02-10T00:00:00Z', ageCutoffYear: 2021 },
      { startDate: '2026-12-31T23:59:59Z', ageCutoffYear: null },
      { startDate: '2026-12-12T00:00:00Z', endDate: '2026-12-13T00:00:00Z' },
      { startDate: '2027-01-15T00:00:00Z' },
      {},
    ];
    for (const meet of meets) expect(client.ageCutoffYear(meet)).toBe(server.ageCutoffYear(meet));
    for (const dob of ['2009-01-01', '2009-12-31', '2008-12-31', null, 'nope']) {
      expect(client.ageOnCutoff(dob, 2021)).toBe(server.ageOnCutoff(dob, 2021));
    }
  });
});
