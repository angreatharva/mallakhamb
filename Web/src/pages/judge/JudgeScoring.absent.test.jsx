/**
 * The Senior Judge's "Mark Absent" (user rule 2026-11-15): an athlete who did
 * not perform. Only the Senior Judge sees it; it asks first, then sends the
 * absent request (the server writes 0.00 for the whole panel) and leaves the
 * slip. Mocks mirror JudgeScoring.viewOnly.test.jsx.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const seat = vi.hoisted(() => ({ judgeType: 'Senior Judge', finalized: false }));
const navigate = vi.hoisted(() => vi.fn());
const saveScore = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ state: null, pathname: '/judge/scoring' }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
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
    activeSessionData: { returnTo: '/judge/team/t1' },
    selectedTeam: { _id: 't1', name: 'Team' },
    selectedPlayer: { _id: 'p1', name: 'Asha Rao' },
    selectedCompetitionType: 'competition_1',
    selectedApparatus: 'Pole Mallakhamb',
    selectedGender: 'Female',
    selectedAgeGroup: 'Under14',
  }),
  useJudgeInfo: () => ({ competition: 'c1', gender: 'Female', ageGroup: 'Under14' }),
  useJudgePanelData: () => ({
    panelScores: {},
    setPanelScores: vi.fn(),
    finalized: seat.finalized,
    socket: null,
    isConnected: true,
    loaded: true,
    seatReady: true,
    mySeat: { judgeType: seat.judgeType },
  }),
}));
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore } }));
vi.mock('@/hooks/useCompetitionLock', () => ({ useCompetitionLock: () => ({ locked: false }) }));
vi.mock('@/components/competition/CompetitionLockBanner', () => ({ default: () => null }));

import JudgeScoring from './JudgeScoring';

describe('JudgeScoring — Mark Absent', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.scrollTo = vi.fn();
    seat.judgeType = 'Senior Judge';
    seat.finalized = false;
    navigate.mockReset();
    saveScore.mockReset();
  });

  it('asks first, sends the absent request for this athlete, then leaves the slip', async () => {
    saveScore.mockResolvedValue({ data: { success: true } });
    render(<JudgeScoring />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Absent' }));
    expect(saveScore).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/final score is 0\.00/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Absent' }));

    await waitFor(() => expect(saveScore).toHaveBeenCalledWith(expect.objectContaining({
      markAbsent: true, playerId: 'p1', playerName: 'Asha Rao', teamId: 't1',
      gender: 'Female', ageGroup: 'Under14', competitionType: 'competition_1', apparatus: 'Pole Mallakhamb',
    })));
    // No marks of any kind go with it — the server writes 0 for everything.
    expect(saveScore.mock.calls[0][0].breakdown).toBeUndefined();
    expect(saveScore.mock.calls[0][0].score).toBeUndefined();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/judge/team/t1', expect.anything()));
  });

  it('keeps the dialog open and says why when the server refuses', async () => {
    saveScore.mockRejectedValue({ response: { data: { error: { message: 'Ask the admin to unlock the athlete first.' } } } });
    render(<JudgeScoring />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Absent' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Absent' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/unlock the athlete first/);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is offered to the Senior Judge only, and not once the score is final', () => {
    seat.judgeType = 'Judge 1';
    const { unmount } = render(<JudgeScoring />);
    expect(screen.queryByRole('button', { name: 'Mark Absent' })).toBeNull();
    unmount();

    seat.judgeType = 'Senior Judge';
    seat.finalized = true;
    render(<JudgeScoring />);
    expect(screen.queryByRole('button', { name: 'Mark Absent' })).toBeNull();
  });
});
