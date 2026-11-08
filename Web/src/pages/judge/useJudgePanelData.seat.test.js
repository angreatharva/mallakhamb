/**
 * Which judge "I" am on a panel (bug fix 2026-11-08).
 *
 * On some phones the seat list stored at sign-in was empty (a failed fetch
 * stored []), or held seats from other meets. With no seat the Senior Judge
 * saw no other judge's marks and "Edit my score" opened a blank slip. The
 * seat now comes from the panel the server returns for this category, matched
 * on the signed-in account, with the stored list only as a fallback.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ getJudges: vi.fn(), getTeamScores: vi.fn(), navigate: () => {} }));

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => 'token', setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: { getJudges: h.getJudges, getTeamScores: h.getTeamScores },
}));

import { useJudgePanelData, resolveJudgeSeat } from './useJudgePanelData';

const RAVI = 'acc-ravi';
const session = {
  selectedTeam: { _id: 't1' },
  selectedPlayer: { _id: 'p1', name: 'Aarav' },
  selectedCompetitionType: 'competition_1',
  selectedApparatus: 'Pole Mallakhamb',
  selectedGender: 'Male',
  selectedAgeGroup: 'Under10',
};
const seat = (judgeType, account) => ({
  _id: `seat-${judgeType}`, judgeType, judgeAccount: account, name: account,
  gender: 'Male', ageGroup: 'Under10', competitionTypes: ['competition_1'], apparatus: 'Pole Mallakhamb',
});
const PANEL = [seat('Senior Judge', RAVI), seat('Judge 1', 'acc-v'), seat('Judge 2', 'acc-y'), seat('Scorer', 'acc-p')];

describe('my seat comes from the server\'s panel', () => {
  beforeEach(() => {
    h.getJudges.mockReset().mockResolvedValue({ data: { data: PANEL } });
    h.getTeamScores.mockReset().mockResolvedValue({ data: { data: [] } });
  });

  it('finds the Senior Judge even when the device stored no seats at all', async () => {
    // What a failed seat fetch left on the phone: no role, an empty list.
    const judgeInfo = { _id: RAVI, competition: 'meet-1', judgeType: null, allAssignments: [] };
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));

    await waitFor(() => expect(result.current.myJudgeType).toBe('Senior Judge'));
    expect(result.current.isSeniorJudge).toBe(true);
    expect(result.current.seatReady).toBe(true);
    expect(result.current.panelSize).toBe(3);
  });

  it('beats a wrong stored seat', async () => {
    const judgeInfo = {
      _id: RAVI, competition: 'meet-1', judgeType: 'Judge 2',
      allAssignments: [{ ...seat('Judge 2', RAVI), competition: 'meet-1' }],
    };
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.myJudgeType).toBe('Senior Judge'));
  });

  it('falls back to the stored seat if the panel cannot be read', async () => {
    h.getJudges.mockRejectedValue(new Error('offline'));
    const judgeInfo = {
      _id: RAVI, competition: 'meet-1', judgeType: 'Senior Judge',
      allAssignments: [{ ...seat('Senior Judge', RAVI), competition: 'meet-1' }],
    };
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.seatReady).toBe(true));
    expect(result.current.myJudgeType).toBe('Senior Judge');
  });
});

describe('resolveJudgeSeat — the stored fallback', () => {
  const category = { gender: 'Male', ageGroup: 'Under10', competitionType: 'competition_1', apparatus: 'Pole Mallakhamb' };

  it('never takes a seat held at another meet', () => {
    const judgeInfo = {
      _id: RAVI, competition: 'meet-1',
      // Login stores every meet's seats; the other meet's comes first.
      allAssignments: [
        { ...seat('Judge 2', RAVI), competition: { _id: 'meet-2' } },
        { ...seat('Senior Judge', RAVI), competition: 'meet-1' },
      ],
    };
    expect(resolveJudgeSeat(judgeInfo, category).judgeType).toBe('Senior Judge');
  });
});
