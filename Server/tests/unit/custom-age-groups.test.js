/**
 * A competition's own age groups (owner, 2026-11-15): a name and an age range
 * on 31 Dec of the meet year, switched on per gender, beside the COP groups.
 */
const {
  AGE_GROUP_PATTERN,
  CATEGORY_AGE_GROUP_PATTERN,
  isAgeGroup,
  isCategoryAgeGroup,
  isCustomAgeGroup,
  ageGroupRange,
  ageGroupLabel,
  sortAgeGroups,
  customAgeGroupKey,
  eligibleAgeGroups,
} = require('../../src/config/cop-rules');
const { applyAgeGroups, normalizeCustomAgeGroups } = require('../../src/utils/data/custom-age-groups.util');
const { checkAgeGroup, assertAgeGroup, groupLabel } = require('../../src/utils/data/age-eligibility.util');

const U11 = { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 };
const VET = { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null };
const TEEN = { key: 'CustomTeen', label: 'Teen 13-15', minAge: 13, maxAge: 15 };
const CUSTOM = [U11, VET, TEEN];

describe('the shape of an age group', () => {
  test('COP brackets and Custom keys pass; anything else does not', () => {
    for (const ok of ['Under10', 'Above18', 'CustomUnder11', 'CustomX9']) {
      expect(isAgeGroup(ok)).toBe(true);
      expect(AGE_GROUP_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ['Under11', 'custom', 'Custom', 'Custom_Under', 'Custom Under', 'AllAges', '', null, 'CustomUnder11<script>']) {
      expect(isAgeGroup(bad)).toBe(false);
      expect(AGE_GROUP_PATTERN.test(String(bad))).toBe(false);
    }
  });

  test('a category may also be All ages', () => {
    expect(isCategoryAgeGroup('AllAges')).toBe(true);
    expect(CATEGORY_AGE_GROUP_PATTERN.test('AllAges')).toBe(true);
    expect(CATEGORY_AGE_GROUP_PATTERN.test('CustomUnder11')).toBe(true);
    expect(isCustomAgeGroup('AllAges')).toBe(false);
  });

  test('keys come from the name and never collide', () => {
    expect(customAgeGroupKey('Under 11')).toBe('CustomUnder11');
    expect(customAgeGroupKey('Under 11', ['CustomUnder11'])).toBe('CustomUnder11x2');
    expect(customAgeGroupKey('३५+')).toBe('CustomGroup');
    expect(isCustomAgeGroup(customAgeGroupKey('x'.repeat(80)))).toBe(true);
  });
});

describe('ranges, order and names', () => {
  test('a blank end is open; unknown groups have no range', () => {
    expect(ageGroupRange('CustomUnder11', CUSTOM)).toEqual({ min: 0, max: 11 });
    expect(ageGroupRange('CustomVeterans35', CUSTOM)).toEqual({ min: 35, max: Infinity });
    expect(ageGroupRange('Under12', CUSTOM)).toEqual({ min: 0, max: 12 });
    expect(ageGroupRange('CustomNope', CUSTOM)).toBeNull();
  });

  test('custom groups sort among the COP ones by age', () => {
    expect(sortAgeGroups(['Above18', 'CustomVeterans35', 'Under12', 'CustomUnder11', 'CustomTeen', 'Under10'], CUSTOM))
      .toEqual(['Under10', 'CustomUnder11', 'Under12', 'CustomTeen', 'Above18', 'CustomVeterans35']);
  });

  test('a custom key reads by its name, or sensibly without one', () => {
    expect(ageGroupLabel('CustomVeterans35', CUSTOM)).toBe('Veterans 35+');
    expect(ageGroupLabel('CustomVeterans35')).toBe('Veterans 35');
    expect(ageGroupLabel('Under12')).toBe('Under 12');
    expect(ageGroupLabel('AllAges')).toBe('All ages');
    expect(groupLabel('CustomUnder11', { customAgeGroups: CUSTOM })).toBe('Under 11');
  });
});

describe('who may enter a custom group', () => {
  test('exactly the ages in its range, beside the COP play-up rule', () => {
    expect(eligibleAgeGroups(11, 'Male', undefined, CUSTOM)).toEqual(['CustomUnder11', 'Under12', 'Under14', 'Under18', 'Above18']);
    expect(eligibleAgeGroups(14, 'Female', undefined, CUSTOM)).toEqual(['Under14', 'CustomTeen', 'Under16', 'Above16']);
    expect(eligibleAgeGroups(40, 'Male', undefined, CUSTOM)).toEqual(['Above18', 'CustomVeterans35']);
    // narrowed to what the meet runs
    expect(eligibleAgeGroups(11, 'Male', ['CustomUnder11', 'Under14'], CUSTOM)).toEqual(['CustomUnder11', 'Under14']);
  });

  test('without custom groups nothing changes', () => {
    for (let age = 0; age <= 40; age += 1) {
      for (const gender of ['Male', 'Female']) expect(eligibleAgeGroups(age, gender, undefined, [])).toEqual(eligibleAgeGroups(age, gender));
    }
  });

  test('the refusal says too young or too old, by the name', () => {
    const meet = { startDate: new Date('2026-12-12T00:00:00Z'), customAgeGroups: CUSTOM, ageGroups: [{ gender: 'Male', ageGroup: 'CustomVeterans35' }, { gender: 'Male', ageGroup: 'CustomUnder11' }] };
    const player = (dob) => ({ firstName: 'Ravi', lastName: 'Kale', dateOfBirth: new Date(dob) });
    expect(checkAgeGroup({ dateOfBirth: new Date('1990-05-01'), gender: 'Male', ageGroup: 'CustomVeterans35', competition: meet }).ok).toBe(true);
    expect(() => assertAgeGroup({ player: player('2000-05-01'), gender: 'Male', ageGroup: 'CustomVeterans35', competition: meet }))
      .toThrow('Ravi Kale is 26 on 31 Dec 2026, too young for Veterans 35+. This competition runs no age group they may enter.');
    expect(() => assertAgeGroup({ player: player('2014-05-01'), gender: 'Male', ageGroup: 'CustomUnder11', competition: meet }))
      .toThrow('Ravi Kale is 12 on 31 Dec 2026, too old for Under 11.');
    // a key the meet does not define
    expect(checkAgeGroup({ dateOfBirth: new Date('2014-05-01'), gender: 'Male', ageGroup: 'CustomGhost', competition: meet }))
      .toMatchObject({ ok: false, problem: 'Ghost is not an age group of this competition' });
  });
});

describe('writing a competition\'s age groups', () => {
  test('new groups get keys; ticks name them; COP rows pass through', () => {
    const body = applyAgeGroups({
      customAgeGroups: [{ label: '  Under   11 ', maxAge: '11' }, { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: '' }],
      ageGroups: [{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Female', ageGroup: 'CustomVeterans35' }, { gender: 'Female', ageGroup: 'CustomVeterans35' }],
    });
    expect(body.customAgeGroups).toEqual([
      { key: 'CustomUnder11', label: 'Under 11', minAge: null, maxAge: 11 },
      { key: 'CustomVeterans35', label: 'Veterans 35+', minAge: 35, maxAge: null },
    ]);
    expect(body.ageGroups).toEqual([{ gender: 'Male', ageGroup: 'Under12' }, { gender: 'Female', ageGroup: 'CustomVeterans35' }]);
  });

  test.each([
    [[{ label: '' }], 'needs a name'],
    [[{ label: 'Under 12' }], 'already a COP age group'],
    [[{ label: 'A' }, { label: 'a' }], 'both called'],
    [[{ label: 'A', minAge: 12, maxAge: 10 }], 'above the maximum'],
    [[{ label: 'A', minAge: 1.5 }], 'whole number'],
    [[{ label: 'A', maxAge: 100 }], 'whole number'],
    [[{ label: '<b>x</b>' }], 'not allowed'],
    [[{ label: 'A', key: 'Under12' }], 'invalid key'],
    [Array.from({ length: 21 }, (_, i) => ({ label: `G${i}` })), 'At most 20'],
  ])('refuses %j', (list, message) => {
    expect(() => normalizeCustomAgeGroups(list)).toThrow(message);
  });

  test('a tick may only name a group the meet defines', () => {
    expect(() => applyAgeGroups({ ageGroups: [{ gender: 'Male', ageGroup: 'CustomGhost' }] }, { customAgeGroups: [U11] }))
      .toThrow('not defined for this competition');
    expect(applyAgeGroups({ ageGroups: [{ gender: 'Male', ageGroup: 'CustomUnder11' }] }, { customAgeGroups: [U11] }).ageGroups)
      .toEqual([{ gender: 'Male', ageGroup: 'CustomUnder11' }]);
    expect(() => applyAgeGroups({ ageGroups: [{ gender: 'Male', ageGroup: 'Under11' }] })).toThrow('Invalid age group');
  });

  test('removing a group drops its ticks, unless a player is still entered in it', () => {
    const stored = { customAgeGroups: [U11, VET], ageGroups: [{ gender: 'Male', ageGroup: 'CustomUnder11' }, { gender: 'Male', ageGroup: 'Under10' }], registeredTeams: [] };
    expect(applyAgeGroups({ customAgeGroups: [VET] }, stored).ageGroups).toEqual([{ gender: 'Male', ageGroup: 'Under10' }]);
    expect(applyAgeGroups({ customAgeGroups: [VET], ageGroups: stored.ageGroups }, stored).ageGroups).toEqual([{ gender: 'Male', ageGroup: 'Under10' }]);

    const inUse = { ...stored, registeredTeams: [{ players: [{ ageGroup: 'CustomUnder11' }, { ageGroup: 'CustomUnder11' }] }] };
    expect(() => applyAgeGroups({ customAgeGroups: [VET] }, inUse))
      .toThrow('Under 11 still has 2 players entered — move them to another age group before removing it');
  });

  test('renaming keeps the key, so stored entries stay in the group', () => {
    const body = applyAgeGroups({ customAgeGroups: [{ ...U11, label: 'Under Eleven' }] }, { customAgeGroups: [U11], ageGroups: [{ gender: 'Female', ageGroup: 'CustomUnder11' }] });
    expect(body.customAgeGroups[0]).toMatchObject({ key: 'CustomUnder11', label: 'Under Eleven' });
    expect(body.ageGroups).toEqual([{ gender: 'Female', ageGroup: 'CustomUnder11' }]);
  });

  test('a write that touches neither is left alone', () => {
    expect(applyAgeGroups({ name: 'x' }, { customAgeGroups: [U11] })).toEqual({ name: 'x' });
  });
});
