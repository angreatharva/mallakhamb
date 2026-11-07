/**
 * An admin or superadmin reopens a Final-Submitted athlete for the judges
 * (user rule 2026-11-08). The judges' screens must open the slip again — the
 * unlock broadcast used to be read as one more "finalized and locked".
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    getTeamScores: vi.fn(),
    navigate: () => {},
    fire: (event, data) => (handlers[event] || []).forEach((fn) => fn(data)),
  };
});

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event, fn) => { (h.handlers[event] ||= []).push(fn); },
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
  }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => 'token', setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/services/public/judge.api', () => ({
  judgeAPI: {
    getTeamScores: h.getTeamScores,
    getJudges: () => Promise.resolve({ data: { data: [] } }),
  },
}));

import { useJudgePanelData } from './useJudgePanelData';

const judgeInfo = { judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14', competition: 'c1' };
const session = {
  selectedTeam: { _id: 't1' },
  selectedPlayer: { _id: 'p1', name: 'Athlete' },
  selectedCompetitionType: 'competition_1',
  selectedApparatus: 'Pole Mallakhamb',
  selectedGender: 'Male',
  selectedAgeGroup: 'Under14',
};

const server = (isFinalized) => ({
  data: {
    data: [{
      _id: 't1',
      scores: [{
        playerId: 'p1',
        apparatus: 'Pole Mallakhamb',
        isFinalized,
        judgeSlips: [{ judgeRole: 'J1', difficultyScore: 3.8, combinationScore: 1.6, executionScore: 3, bonusScore: 0, total: 8.4 }],
      }],
    }],
  },
});

describe('useJudgePanelData — reopened for the judges', () => {
  beforeEach(() => {
    Object.keys(h.handlers).forEach((k) => delete h.handlers[k]);
    h.getTeamScores.mockReset();
  });

  it('the unlock broadcast opens the slip again', async () => {
    h.getTeamScores.mockResolvedValue(server(true));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.finalized).toBe(true));

    h.getTeamScores.mockResolvedValue(server(false));
    act(() => h.fire('scores_saved_notification', {
      playerId: 'p1', apparatus: 'Pole Mallakhamb', unlocked: true, isFinalized: false, isLocked: false,
    }));

    await waitFor(() => expect(result.current.finalized).toBe(false));
    expect(h.getTeamScores.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('a Final Submit broadcast still locks it', async () => {
    h.getTeamScores.mockResolvedValue(server(false));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(h.getTeamScores).toHaveBeenCalled());
    expect(result.current.finalized).toBe(false);

    act(() => h.fire('scores_saved_notification', {
      playerId: 'p1', apparatus: 'Pole Mallakhamb', isFinalized: true, isLocked: true,
    }));
    expect(result.current.finalized).toBe(true);
  });

  it('a re-read of a reopened athlete clears a stale lock', async () => {
    h.getTeamScores.mockResolvedValue(server(true));
    const { result } = renderHook(() => useJudgePanelData({ judgeInfo, session }));
    await waitFor(() => expect(result.current.finalized).toBe(true));

    h.getTeamScores.mockResolvedValue(server(false));
    await act(async () => { await result.current.refetchScores(); });
    expect(result.current.finalized).toBe(false);
  });
});
