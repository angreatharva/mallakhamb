'use strict';

/**
 * Eligibility engine vectors: age on the cut-off, the lowest age group, the
 * groups an athlete may play up into, and which entries belong to a category.
 *
 * `checkAgeGroup` always gets a cut-off year or a competition start date. With
 * neither, Node falls back to the current year, which would make a vector
 * depend on when it was generated.
 */

const { requireServer } = require('../../lib/server');

const cop = requireServer('config/cop-rules');
const { checkAgeGroup, groupLabel } = requireServer('utils/data/age-eligibility.util');
const category = requireServer('utils/data/category.util');

const GENDERS = ['Male', 'Female'];
const GENDER_FORMS = [...GENDERS, ...GENDERS, 'male', '', null, undefined, 'Other'];
const AGE_GROUPS = [...cop.CATEGORY_AGE_GROUPS];
const APPARATUS = ['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'];
const TYPE_FORMS = ['competition_1', 'competition_2', 'competition_3', 'Competition I', 'Competition II', 'Competition III', '', null, undefined, 'unknown'];

/** A date of birth near the turn of a year, where the UTC year decides the age. */
function dateOfBirth(rng) {
  const year = rng.int(2000, 2020);
  const kind = rng.int(0, 9);
  if (kind === 0) return `${year}-12-31T23:59:59.999Z`;
  if (kind === 1) return `${year}-01-01T00:00:00.000Z`;
  if (kind === 2) return `${year}-12-31`;
  if (kind === 3) return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  if (kind === 4) return new Date(Date.UTC(year, 0, 1));
  if (kind === 5 && rng.chance(0.4)) return rng.pick([null, undefined, '', 'not a date']);
  const date = new Date(Date.UTC(year, rng.int(0, 11), rng.int(1, 28), rng.int(0, 23)));
  return rng.chance(0.5) ? date : date.toISOString();
}

const offered = (rng) => rng.pick([undefined, null, rng.sample(AGE_GROUPS, rng.int(0, 5)), [], 'Under12']);

function entry(rng) {
  const some = () => rng.sample(APPARATUS, rng.int(0, 3));
  return rng.pick([
    { apparatus: { competition_1: some(), competition_2: some(), competition_3: some() } },
    { apparatus: { competition_3: some() } },
    { apparatus: some() },
    { apparatus: rng.pick(APPARATUS) },
    {},
    null,
  ]);
}

function competition(rng) {
  const out = {
    ageGroups: Array.from({ length: rng.int(0, 5) }, () => ({ gender: rng.pick(GENDERS), ageGroup: rng.pick(cop.AGE_GROUPS) })),
    competitionTypes: rng.pick([['competition_1'], ['competition_1', 'competition_2'], ['competition_1', 'competition_2', 'competition_3'], undefined]),
  };
  if (rng.chance(0.2)) out.legacyFinals = rng.pick([true, false]);
  return rng.chance(0.05) ? rng.pick([null, undefined, {}]) : out;
}

module.exports = {
  engine: 'eligibility',
  functions: [
    {
      name: 'ageCutoffYear',
      fn: cop.ageCutoffYear,
      fixed: [
        [{ startDate: '2026-12-12' }],
        [{ startDate: '2026-12-31T23:59:59.999Z' }],
        [{ startDate: '2027-01-01T00:00:00.000Z' }],
        [{ startDate: new Date('2026-06-01T00:00:00.000Z') }],
        [{ startDate: 'not a date' }],
        [{ startDate: null }],
        [{}],
        [null],
        [undefined],
      ],
    },
    {
      name: 'ageOnCutoff',
      fn: cop.ageOnCutoff,
      fixed: [
        ['2014-12-31', 2026],
        ['2014-01-01', 2026],
        ['2013-12-31T23:59:59.999Z', 2026],
        [null, 2026],
        ['2014-06-01', null],
        ['2014-06-01', '2026'],
        ['2014-06-01', 2026.5],
        ['not a date', 2026],
        ['2030-01-01', 2026],
      ],
      gen: (rng) => [dateOfBirth(rng), rng.int(2024, 2028)],
    },
    {
      name: 'lowestAgeGroup',
      fn: cop.lowestAgeGroup,
      fixed: [
        ...GENDERS.flatMap((gender) => Array.from({ length: 43 }, (_, i) => [i - 2, gender])),
        [12, 'male'],
        [12, null],
        [12.5, 'Male'],
        [null, 'Male'],
        ['12', 'Male'],
        [Number.NaN, 'Female'],
        [Infinity, 'Female'],
      ],
    },
    {
      name: 'eligibleAgeGroups',
      fn: cop.eligibleAgeGroups,
      fixed: GENDERS.flatMap((gender) => Array.from({ length: 24 }, (_, i) => [i - 1, gender, undefined])),
      gen: (rng) => [rng.int(-1, 30), rng.pick(GENDER_FORMS), offered(rng)],
    },
    {
      name: 'checkAgeGroup',
      fn: checkAgeGroup,
      fixed: [
        [{ dateOfBirth: '2014-12-31', gender: 'Male', ageGroup: 'Under12', cutoffYear: 2026 }],
        [{ dateOfBirth: '2013-12-31', gender: 'Male', ageGroup: 'Under12', cutoffYear: 2026 }],
        [{ dateOfBirth: '2013-12-31', gender: 'Male', ageGroup: 'Under14', cutoffYear: 2026 }],
        [{ dateOfBirth: '2009-06-01', gender: 'Female', ageGroup: 'Under16', competition: { startDate: '2026-12-12' } }],
        [{ dateOfBirth: null, gender: 'Male', ageGroup: 'Under12', cutoffYear: 2026 }],
        [{ dateOfBirth: '2014-12-31', gender: null, ageGroup: 'Under12', cutoffYear: 2026 }],
        [{ dateOfBirth: '2014-12-31', gender: 'Male', ageGroup: null, cutoffYear: 2026 }],
      ],
      gen: (rng) => {
        const args = {
          dateOfBirth: dateOfBirth(rng),
          gender: rng.chance(0.9) ? rng.pick(GENDERS) : rng.pick(GENDER_FORMS),
          ageGroup: rng.chance(0.95) ? rng.pick(AGE_GROUPS) : rng.pick([null, '']),
        };
        if (rng.chance(0.5)) args.cutoffYear = rng.int(2024, 2028);
        else args.competition = { startDate: `${rng.int(2024, 2028)}-${rng.pick(['01-01', '06-15', '12-31'])}T${rng.pick(['00:00:00.000', '23:59:59.999'])}Z` };
        return [args];
      },
    },
    { name: 'groupLabel', fn: groupLabel, fixed: [...AGE_GROUPS, '', null, undefined, 'Under 12'].map((v) => [v]) },
    {
      name: 'ageMatches',
      fn: category.ageMatches,
      fixed: [...AGE_GROUPS, null].flatMap((a) => [...AGE_GROUPS, null, undefined, ''].map((b) => [a, b])),
    },
    {
      name: 'entryInCompetition',
      fn: category.entryInCompetition,
      fixed: [[null, null], [{}, 'competition_1'], [{ apparatus: ['Pole Mallakhamb'] }, 'competition_3', 'Pole Mallakhamb']],
      gen: (rng) => [entry(rng), rng.pick(TYPE_FORMS), rng.pick([null, undefined, ...APPARATUS])],
    },
    {
      name: 'categoryAgeGroups',
      fn: category.categoryAgeGroups,
      fixed: [[null, 'Male'], [{}, undefined]],
      gen: (rng) => [competition(rng), rng.pick([...GENDERS, undefined, null])],
    },
  ],
};
