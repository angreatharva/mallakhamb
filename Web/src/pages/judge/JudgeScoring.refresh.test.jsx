/**
 * A refresh on the judge slip: the marks entered so far come back, and while
 * there are unsubmitted marks the browser is asked to confirm leaving.
 *
 * Mocks mirror JudgeScoring.combination.test.jsx, except useJudgeInfo — the
 * real one reads the judge in an effect, so the first render has no judge.
 * That delay is what used to lose the autosaved marks, so it is kept here.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null, pathname: '/judge/scoring' }),
}));
vi.mock('@/utils/auth/secureStorage', () => ({
  secureStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../../contexts/CompetitionContext', () => ({
  useCompetition: () => ({ clearCompetitionContext: vi.fn() }),
}));
vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));
vi.mock('./ScorerScoring', () => ({ default: () => null }));
vi.mock('./useJudgePanelData', async () => {
  const { useState, useEffect } = await import('react');
  return {
    useJudgeSession: () => ({
      activeSessionData: {},
      selectedTeam: { _id: 't1', name: 'Team' },
      selectedPlayer: { _id: 'p1', name: 'Athlete' },
      selectedCompetitionType: 'competition_1',
      selectedApparatus: 'Pole Mallakhamb',
      selectedGender: 'Male',
      selectedAgeGroup: 'Under14',
    }),
    // Null on the first render, like the real hook.
    useJudgeInfo: () => {
      const [info, setInfo] = useState(null);
      useEffect(() => { setInfo({ judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14' }); }, []);
      return info;
    },
    useJudgePanelData: () => ({
      panelScores: {},
      setPanelScores: vi.fn(),
      finalized: false,
      socket: null,
      isConnected: true,
    }),
    resolveJudgeSeat: (judgeInfo) => judgeInfo,
  };
});
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore: vi.fn() } }));

import JudgeScoring from './JudgeScoring';

const CACHE_KEY = 'judge_scores_t1_p1_Judge 1';
const executionField = () => screen.getAllByPlaceholderText('0.00')[0];

/** True when the page asked the browser to confirm leaving. */
const refreshIsBlocked = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('JudgeScoring — refresh', () => {
  beforeEach(() => localStorage.clear());

  it('brings back the marks entered before the refresh', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
      combination: { checked: { 1: true }, total: 0.2 },
      execution: 3.5,
      bonus: 0,
    }));

    render(<JudgeScoring />);

    await waitFor(() => expect(executionField()).toHaveValue('3.5'));
    // …and the restore did not overwrite the cache with an empty slip.
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)).execution).toBe(3.5);
  });

  it('does not ask to confirm a refresh on an empty slip', async () => {
    render(<JudgeScoring />);
    await waitFor(() => expect(executionField()).toBeInTheDocument());
    expect(refreshIsBlocked()).toBe(false);
  });

  it('asks to confirm a refresh once a mark is entered', async () => {
    render(<JudgeScoring />);
    fireEvent.change(executionField(), { target: { value: '3' } });
    await waitFor(() => expect(refreshIsBlocked()).toBe(true));
  });
});
