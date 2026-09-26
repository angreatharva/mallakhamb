/**
 * Re-editing a submitted slip (Panel Review → Edit): the sheet waits for the
 * submitted slip and opens on it, instead of showing zeros that a late load
 * then overwrote — which put the old score back over the judge's edit.
 *
 * Mocks mirror JudgeScoring.refresh.test.jsx; the panel feed is driven by hand
 * so a test decides when the server's answer lands.
 */
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const feed = vi.hoisted(() => ({ push: null }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: { resumeEditing: true }, pathname: '/judge/scoring' }),
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
  const { useState } = await import('react');
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
    useJudgeInfo: () => ({ judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14' }),
    useJudgePanelData: () => {
      const [state, setState] = useState({ panelScores: {}, loaded: false });
      feed.push = setState;
      return {
        panelScores: state.panelScores,
        loaded: state.loaded,
        setPanelScores: vi.fn(),
        finalized: false,
        socket: null,
        isConnected: true,
      };
    },
    resolveJudgeSeat: (judgeInfo) => judgeInfo,
  };
});
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore: vi.fn() } }));

import JudgeScoring from './JudgeScoring';

const CACHE_KEY = 'judge_scores_t1_p1_Judge 1';
const loading = () => screen.queryByText(/Loading your submitted score/);
const executionField = () => screen.getAllByPlaceholderText('0.00')[0];

const submittedSlip = (execution) => ({
  'Judge 1': {
    judgeType: 'Judge 1',
    score: 3.8 + 1.6 + execution,
    breakdown: {
      difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
      combination: { checked: {}, total: 1.6 },
      execution,
      bonus: 0,
    },
  },
});

describe('JudgeScoring — re-editing a submitted slip', () => {
  beforeEach(() => localStorage.clear());

  it('holds the sheet until the submitted slip arrives, then opens on it', async () => {
    render(<JudgeScoring />);
    expect(loading()).toBeInTheDocument();

    await act(async () => feed.push({ panelScores: submittedSlip(3.1), loaded: true }));

    expect(loading()).not.toBeInTheDocument();
    expect(executionField()).toHaveValue('3.1');
  });

  it('opens on the latest submitted score, not on marks left from an earlier edit', async () => {
    // Panel Review clears this key on the way in; a stale one must still lose
    // to nothing — here it is absent, so the server slip is what shows.
    render(<JudgeScoring />);
    await act(async () => feed.push({ panelScores: submittedSlip(2.0), loaded: true }));
    expect(executionField()).toHaveValue('2');
  });

  it('keeps unsaved edits from this edit across a refresh', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
      combination: { checked: {}, total: 1.6 },
      execution: 2.5,
      bonus: 0,
    }));
    render(<JudgeScoring />);

    // The unsaved edit is shown straight away…
    expect(loading()).not.toBeInTheDocument();
    expect(executionField()).toHaveValue('2.5');

    // …and the submitted slip landing afterwards does not replace it.
    await act(async () => feed.push({ panelScores: submittedSlip(3.1), loaded: true }));
    expect(executionField()).toHaveValue('2.5');
  });

  it('does not hang when there is no submitted slip to load', async () => {
    render(<JudgeScoring />);
    await act(async () => feed.push({ panelScores: {}, loaded: true }));
    expect(loading()).not.toBeInTheDocument();
  });
});
