/**
 * A judge edits a submitted slip: everyone else's Panel Review must end up on
 * the NEW score. The live socket is the fast path; these cover what happens
 * when it is not enough — a re-read replaces what is on screen, and Panel
 * Review re-reads on its own.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getTeamScores, navigate } = vi.hoisted(() => ({ getTeamScores: vi.fn(), navigate: () => {} }));

// Stable, like the real one: the socket effect depends on it.
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), connected: false }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => 'token', setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getTeamScores,
    getJudges: () => Promise.resolve({ data: { data: [] } }),
  },
}));

import { useJudgePanelData } from './useJudgePanelData';

const judgeInfo = { judgeType: 'Senior Judge', gender: 'Male', ageGroup: 'Under14', competition: 'c1' };
const session = {
  selectedTeam: { _id: 't1' },
  selectedPlayer: { _id: 'p1', name: 'Athlete' },
  selectedCompetitionType: 'competition_1',
  selectedApparatus: 'Pole Mallakhamb',
  selectedGender: 'Male',
  selectedAgeGroup: 'Under14',
};

/** The server's answer with Judge 1's slip at `total`. */
const serverWith = (total) => ({
  data: {
    data: [{
      _id: 't1',
      scores: [{
        playerId: 'p1',
        apparatus: 'Pole Mallakhamb',
        judgeSlips: [{
          judgeRole: 'J1',
          difficultyScore: 3.8,
          combinationScore: 1.6,
          executionScore: total - 5.4,
          bonusScore: 0,
          total,
        }],
      }],
    }],
  },
});

describe('useJudgePanelData — an edited slip replaces the old one', () => {
  beforeEach(() => getTeamScores.mockReset());
  afterEach(() => vi.useRealTimers());

  it('a re-read replaces a slip already on screen', async () => {
    getTeamScores.mockResolvedValue(serverWith(8.5));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.panelScores['Judge 1']?.score).toBe(8.5));

    // Judge 1 edits their slip; the broadcast never arrives here.
    getTeamScores.mockResolvedValue(serverWith(7.4));
    await act(async () => { await result.current.refetchScores(); });

    expect(result.current.panelScores['Judge 1'].score).toBe(7.4);
  });

  it('Panel Review re-reads on its own, so a missed broadcast is caught up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getTeamScores.mockResolvedValue(serverWith(8.5));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session, refreshMs: 10_000 }));
    await waitFor(() => expect(result.current.panelScores['Judge 1']?.score).toBe(8.5));

    getTeamScores.mockResolvedValue(serverWith(7.4));
    await act(async () => { vi.advanceTimersByTime(10_000); });

    await waitFor(() => expect(result.current.panelScores['Judge 1'].score).toBe(7.4));
  });

  it('keeps a slip the server does not have yet', async () => {
    getTeamScores.mockResolvedValue(serverWith(8.5));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // Arrived over the socket a moment ago; the server read below predates it.
    act(() => result.current.setPanelScores((prev) => ({
      ...prev,
      'Judge 2': { judgeType: 'Judge 2', score: 8.1, breakdown: null },
    })));
    await act(async () => { await result.current.refetchScores(); });

    expect(result.current.panelScores['Judge 2'].score).toBe(8.1);
  });
});
