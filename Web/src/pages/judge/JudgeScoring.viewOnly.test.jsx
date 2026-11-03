/**
 * A finished competition: the judge's slip is view only. Every mark control is
 * disabled (the server refuses the write with 423 anyway), while the section
 * tabs still switch so the whole slip can be read.
 *
 * Mocks mirror JudgeScoring.tabs.test.jsx.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lock = vi.hoisted(() => ({ locked: true }));

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

vi.mock('@/hooks/useCompetitionLock', () => ({
  useCompetitionLock: () => ({ locked: lock.locked, closedOn: '5 Jan 2020', competitionName: 'SGAM-TRIALS-1' }),
}));
vi.mock('@/components/competition/CompetitionLockBanner', () => ({ default: () => null }));

import JudgeScoring from './JudgeScoring';

describe('JudgeScoring — finished competition', () => {
  beforeEach(() => {
    localStorage.clear();
    window.scrollTo = vi.fn();
    lock.locked = true;
  });

  it('disables every mark control but keeps the tabs readable', () => {
    render(<JudgeScoring />);

    screen.getAllByRole('button', { name: 'A - Class - 0.20: 4' }).forEach((b) => expect(b).toBeDisabled());
    screen.getAllByRole('button', { name: /Increase A - Class/ }).forEach((b) => expect(b).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Combination' }));
    screen.getAllByRole('checkbox').forEach((c) => expect(c).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Exec & Orig' }));
    screen.getAllByRole('textbox').forEach((t) => expect(t).toHaveAttribute('readonly'));

    screen.getAllByRole('button', { name: /Submit Score/ }).forEach((b) => expect(b).toBeDisabled());
  });

  it('an open competition leaves the slip editable', () => {
    lock.locked = false;
    render(<JudgeScoring />);
    screen.getAllByRole('button', { name: 'A - Class - 0.20: 4' }).forEach((b) => expect(b).toBeEnabled());
  });
});
