/**
 * The seats stored when a judge enters a meet (bug fix 2026-11-08): never an
 * empty list because a second request was late or dropped.
 */
import { describe, it, expect, vi } from 'vitest';
import { seatsForMeet, judgeAtMeet } from './judgeSeats';

const MEET = 'meet-1';
const sr = { _id: 's1', judgeType: 'Senior Judge', competition: MEET, gender: 'Male', ageGroup: 'Under10' };
const elsewhere = { _id: 's2', judgeType: 'Judge 2', competition: { _id: 'meet-2' } };

describe('seatsForMeet', () => {
  it('takes the seats the switch answer carries, with no second request', async () => {
    const fetchAssignments = vi.fn();
    const seats = await seatsForMeet({
      switchResult: { assignments: [sr, elsewhere] }, competitionId: MEET, fetchAssignments,
    });
    expect(seats.map((s) => s.judgeType)).toEqual(['Senior Judge']);
    expect(fetchAssignments).not.toHaveBeenCalled();
  });

  it('retries the fetch once for an older server', async () => {
    const fetchAssignments = vi.fn()
      .mockRejectedValueOnce(new Error('dropped'))
      .mockResolvedValueOnce({ data: { data: [elsewhere, sr] } });
    const seats = await seatsForMeet({ switchResult: {}, competitionId: MEET, fetchAssignments });
    expect(seats.map((s) => s.judgeType)).toEqual(['Senior Judge']);
    expect(fetchAssignments).toHaveBeenCalledTimes(2);
  });

  it('keeps the seats already known rather than storing none', async () => {
    const fetchAssignments = vi.fn().mockRejectedValue(new Error('offline'));
    const seats = await seatsForMeet({
      switchResult: {}, competitionId: MEET, knownSeats: [sr], fetchAssignments,
    });
    expect(seats).toHaveLength(1);
    expect(seats[0].judgeType).toBe('Senior Judge');
  });

  it('never keeps a seat from another meet', async () => {
    const seats = await seatsForMeet({ switchResult: { assignments: [elsewhere] }, competitionId: MEET, knownSeats: [elsewhere] });
    expect(seats).toEqual([]);
  });
});

describe('judgeAtMeet', () => {
  it('re-derives the seat fields and keeps the account', () => {
    const user = { _id: 'acc', name: 'Ravi', judgeType: 'Judge 2', competition: 'meet-2' };
    const judge = judgeAtMeet(user, MEET, [sr]);
    expect(judge).toMatchObject({ _id: 'acc', name: 'Ravi', competition: MEET, judgeType: 'Senior Judge', allAssignments: [sr] });
  });
});
