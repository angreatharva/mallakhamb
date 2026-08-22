/**
 * resolveJudgeSeat — which panel role the UI should show and use.
 *
 * The server binds a slip to the seat matching the category being scored, so
 * the client has to agree or the judge is shown someone else's slip as their
 * own. This is the client half of that agreement.
 */

import { describe, it, expect } from 'vitest';
import { resolveJudgeSeat, judgeRoleFor } from './useJudgePanelData';

const seat = (overrides = {}) => ({
  gender: 'Male',
  ageGroup: 'Under14',
  competitionTypes: ['competition_1'],
  apparatus: null,
  judgeType: 'Judge 1',
  judgeNo: 2,
  ...overrides,
});

const judgeWithSeats = (...seats) => ({
  _id: 'account-1',
  name: 'Pat',
  allAssignments: seats,
});

describe('resolveJudgeSeat', () => {
  it('picks the seat matching the category on screen', () => {
    const judge = judgeWithSeats(
      seat({ gender: 'Female', ageGroup: 'Under16', judgeType: 'Judge 2', judgeNo: 3 }),
      seat({ judgeType: 'Senior Judge', judgeNo: 1 })
    );

    const resolved = resolveJudgeSeat(judge, {
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'competition_1',
    });

    expect(resolved.judgeType).toBe('Senior Judge');
  });

  it('treats a seat with no competition types as covering all of them', () => {
    const judge = judgeWithSeats(seat({ judgeType: 'Scorer', judgeNo: 6, competitionTypes: [] }));

    expect(judgeRoleFor(judge, {
      gender: 'Male',
      ageGroup: 'Under14',
      competitionType: 'competition_3',
    })).toBe('Scorer');
  });

  it('falls back to the only seat when the category is not yet chosen', () => {
    const judge = judgeWithSeats(seat({ judgeType: 'Judge 3', judgeNo: 4 }));

    expect(judgeRoleFor(judge, {})).toBe('Judge 3');
  });

  it('handles a judge object with no assignments list', () => {
    // Older stored sessions, and the shape the login response used to have.
    expect(judgeRoleFor({ judgeType: 'Judge 2' }, { gender: 'Male' })).toBe('Judge 2');
  });

  it('returns null rather than throwing when there is no judge', () => {
    expect(resolveJudgeSeat(null, { gender: 'Male' })).toBeNull();
    expect(judgeRoleFor(null, {})).toBeNull();
  });
});
