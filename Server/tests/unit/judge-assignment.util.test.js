/**
 * Which seat does a judge occupy for the category in front of them?
 *
 * This is the question the whole judge-account split turns on. One person can
 * be Senior Judge in Under-14 Male and Judge 2 in Under-16 Female, and their
 * slip has to land in the seat that matches the category being scored — not in
 * whichever assignment row the database happened to return first, which is
 * what the old username-based lookup did.
 */

const {
  resolveAssignment,
  assignmentCoversCategory,
  hasAnyRole,
  competitionsFor,
  loadAssignments,
} = require('../../src/utils/data/judge-assignment.util');

const COMPETITION = 'comp-1';

const seat = (overrides = {}) => ({
  _id: 'seat',
  competition: COMPETITION,
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
  apparatus: null,
  judgeType: 'Judge 1',
  judgeNo: 2,
  ...overrides,
});

describe('resolveAssignment', () => {
  it('picks the seat for the category being scored, not the first one held', () => {
    const assignments = [
      seat({ _id: 'a', gender: 'Female', ageGroup: 'Under16', judgeType: 'Judge 2', judgeNo: 3 }),
      seat({ _id: 'b', judgeType: 'Senior Judge', judgeNo: 1 }),
    ];

    const match = resolveAssignment(assignments, {
      competition: COMPETITION,
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'competition_1',
    });

    expect(match._id).toBe('b');
    expect(match.judgeType).toBe('Senior Judge');
  });

  it('returns null for a category the judge does not sit on', () => {
    const match = resolveAssignment([seat()], {
      competition: COMPETITION,
      gender: 'Female',
      ageGroup: 'Under14',
    });

    expect(match).toBeNull();
  });

  it('returns null when the judge holds no seats at all', () => {
    expect(resolveAssignment([], { gender: 'Male', ageGroup: 'Under14' })).toBeNull();
    expect(resolveAssignment(undefined, {})).toBeNull();
  });

  it('accepts either spelling of the competition type', () => {
    const assignments = [seat({ competitionTypes: ['competition_2'] })];

    const match = resolveAssignment(assignments, {
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'Competition II',
    });

    expect(match).not.toBeNull();
  });

  it('prefers the apparatus-specific seat when both could match', () => {
    const assignments = [
      seat({ _id: 'wide', apparatus: null }),
      seat({ _id: 'narrow', apparatus: 'Rope Mallakhamb' }),
    ];

    const match = resolveAssignment(assignments, {
      gender: 'Male',
      ageGroup: 'Under14',
      apparatus: 'Rope Mallakhamb',
    });

    expect(match._id).toBe('narrow');
  });
});

describe('assignmentCoversCategory', () => {
  it('treats an empty competitionTypes list as every category', () => {
    // A Scorer is routinely created without competition types; an empty list
    // has always meant "all of them in this gender/age group".
    const scorer = seat({ judgeType: 'Scorer', competitionTypes: [] });

    expect(assignmentCoversCategory(scorer, {
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'competition_3',
    })).toBe(true);
  });

  it('does not let a seat at one meet cover another meet', () => {
    expect(assignmentCoversCategory(seat(), {
      competition: 'comp-2',
      gender: 'Male',
      ageGroup: 'Under14',
    })).toBe(false);
  });
});

describe('hasAnyRole', () => {
  it('finds a role held on any seat', () => {
    const assignments = [seat(), seat({ judgeType: 'Senior Judge', ageGroup: 'Under16' })];

    expect(hasAnyRole(assignments, ['Senior Judge', 'Scorer'])).toBe(true);
  });

  it('is false for a judge with no seats', () => {
    expect(hasAnyRole([], ['Senior Judge'])).toBe(false);
    expect(hasAnyRole(undefined, ['Scorer'])).toBe(false);
  });
});

describe('competitionsFor', () => {
  it('deduplicates and keeps assignment order', () => {
    const assignments = [
      seat({ competition: 'comp-2' }),
      seat({ competition: 'comp-1' }),
      seat({ competition: 'comp-2' }),
    ];

    expect(competitionsFor(assignments)).toEqual(['comp-2', 'comp-1']);
  });
});

describe('loadAssignments', () => {
  it('asks for active seats held by the account, scoped to the competition', async () => {
    const judgeRepository = { find: jest.fn(async () => [seat()]) };

    await loadAssignments(judgeRepository, 'account-1', COMPETITION);

    expect(judgeRepository.find).toHaveBeenCalledWith({
      judgeAccount: 'account-1',
      isActive: { $ne: false },
      competition: COMPETITION,
    });
  });

  it('returns an empty list rather than throwing when there is no repository', async () => {
    expect(await loadAssignments(null, 'account-1')).toEqual([]);
    expect(await loadAssignments({ find: jest.fn() }, null)).toEqual([]);
  });
});
