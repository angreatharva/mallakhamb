/**
 * The phone slip's Difficulty | Combination | Exec & Orig tabs: switching one
 * opens the new tab at the top of the page, and a chosen difficulty count
 * stays chosen when tapped again.
 *
 * Mocks mirror JudgeScoring.refresh.test.jsx.
 */
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('./useJudgePanelData', () => ({
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
  useJudgePanelData: () => ({
    panelScores: {},
    setPanelScores: vi.fn(),
    finalized: false,
    socket: null,
    isConnected: true,
    loaded: true,
  }),
  resolveJudgeSeat: (judgeInfo) => judgeInfo,
}));
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore: vi.fn() } }));

import JudgeScoring from './JudgeScoring';

const tab = (name) => screen.getByRole('button', { name });

describe('JudgeScoring — phone tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    window.scrollTo = vi.fn();
  });

  it('switching tabs scrolls the page to the top, every time', () => {
    render(<JudgeScoring />);
    window.scrollTo.mockClear(); // ignore anything done on mount

    fireEvent.click(tab('Combination'));
    expect(window.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));

    window.scrollTo.mockClear();
    fireEvent.click(tab('Exec & Orig'));
    expect(window.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));

    window.scrollTo.mockClear();
    fireEvent.click(tab('Difficulty'));
    expect(window.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('a chosen difficulty count survives a second tap', () => {
    render(<JudgeScoring />);
    // The phone and desktop sheets both render in jsdom; the first is the phone's.
    const four = screen.getAllByRole('button', { name: 'A - Class - 0.20: 4' })[0];
    fireEvent.click(four);
    expect(four).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(four);
    expect(four).toHaveAttribute('aria-pressed', 'true');
  });
});
