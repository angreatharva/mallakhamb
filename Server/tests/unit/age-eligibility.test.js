/**
 * COP 1.8.3.2–1.8.3.5: age on 31 December, "Under N" includes N, a player may
 * play up but never down. The examples are the COP's own (2021-22 season).
 */
const {
  AGE_GROUPS_BY_GENDER,
  ageCutoffYear,
  ageOnCutoff,
  lowestAgeGroup,
  eligibleAgeGroups,
} = require('../../src/config/cop-rules');

describe('age eligibility', () => {
  it('measures age on 31 December of the cut-off year', () => {
    expect(ageOnCutoff('2009-01-01', 2021)).toBe(12);
    expect(ageOnCutoff('2009-12-31', 2021)).toBe(12);
    expect(ageOnCutoff('2008-12-31', 2021)).toBe(13);
    expect(ageOnCutoff(null, 2021)).toBeNull();
    expect(ageOnCutoff('not a date', 2021)).toBeNull();
  });

  it('puts a 12-year-old in Under 12 and a 13-year-old in Under 14 (COP example)', () => {
    expect(lowestAgeGroup(ageOnCutoff('2009-01-01', 2021), 'Male')).toBe('Under12');
    expect(lowestAgeGroup(ageOnCutoff('2008-06-15', 2021), 'Male')).toBe('Under14');
  });

  it('follows each gender ladder', () => {
    expect(lowestAgeGroup(15, 'Male')).toBe('Under18');
    expect(lowestAgeGroup(18, 'Male')).toBe('Under18');
    expect(lowestAgeGroup(19, 'Male')).toBe('Above18');
    expect(lowestAgeGroup(15, 'Female')).toBe('Under16');
    expect(lowestAgeGroup(16, 'Female')).toBe('Under16');
    expect(lowestAgeGroup(17, 'Female')).toBe('Above16');
    expect(lowestAgeGroup(6, 'Female')).toBe('Under10');
    expect(lowestAgeGroup(-1, 'Male')).toBeNull();
    expect(lowestAgeGroup(12, 'Other')).toBeNull();
  });

  it('allows the lowest group and every higher one the meet runs', () => {
    expect(eligibleAgeGroups(11, 'Male')).toEqual(['Under12', 'Under14', 'Under18', 'Above18']);
    expect(eligibleAgeGroups(11, 'Male', ['Under10', 'Under12', 'Above18'])).toEqual(['Under12', 'Above18']);
    expect(eligibleAgeGroups(30, 'Female')).toEqual(['Above16']);
    expect(eligibleAgeGroups(11, 'Male', ['Under10'])).toEqual([]);
  });

  it('never offers a bracket the gender does not play', () => {
    expect(eligibleAgeGroups(15, 'Male')).not.toContain('Under16');
    expect(eligibleAgeGroups(15, 'Female')).not.toContain('Under18');
    expect(AGE_GROUPS_BY_GENDER.Male).not.toContain('Above16');
  });

  it('takes the cut-off year from startDate unless the meet overrides it', () => {
    expect(ageCutoffYear({ startDate: '2022-02-10T00:00:00Z' })).toBe(2022);
    // No override any more: a saved value from before is ignored.
    expect(ageCutoffYear({ startDate: '2022-02-10T00:00:00Z', ageCutoffYear: 2021 })).toBe(2022);
    expect(ageCutoffYear({ startDate: '2022-02-10T00:00:00Z', ageCutoffYear: null })).toBe(2022);
    expect(ageCutoffYear({})).toBeNull();
  });

  test('the owner example: a meet on 12-13 Dec 2026, a player born 1 Jan 2016 plays Under 10', () => {
    const meet = { startDate: '2026-12-12T00:00:00Z', endDate: '2026-12-13T00:00:00Z' };
    const year = ageCutoffYear(meet);
    expect(year).toBe(2026);
    const age = ageOnCutoff('2016-01-01T00:00:00Z', year);
    expect(age).toBe(10);
    expect(lowestAgeGroup(age, 'Male')).toBe('Under10');
    // Every meet held in 2027 counts on 31 Dec 2027, January included.
    expect(ageCutoffYear({ startDate: '2027-01-15T00:00:00Z' })).toBe(2027);
  });
});
