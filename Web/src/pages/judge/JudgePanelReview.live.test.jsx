/**
 * Panel Review as the Senior Judge, with the panel feed driven by hand the
 * way the socket drives it — no page refresh anywhere in these tests.
 *
 *   - a mismatch that arrives over the feed opens the popup;
 *   - a dismissed mismatch re-opens when a slip changes and still disagrees;
 *   - a mismatch resolved over the feed closes the popup (never empty);
 *   - a tolerance breach: Understood → "Final Submit with Base Score".
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const feed = vi.hoisted(() => ({ push: null }));
const api = vi.hoisted(() => ({ saveScore: null }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: {}, pathname: '/judge/scoring/panel-review' }),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../../contexts/CompetitionContext', () => ({
  useCompetition: () => ({ clearCompetitionContext: vi.fn() }),
}));
vi.mock('@/hooks/useResponsive', () => ({ useReducedMotion: () => true }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/public/judge.api', () => {
  api.saveScore = vi.fn().mockResolvedValue({ data: {} });
  return { judgeAPI: { saveScore: (...a) => api.saveScore(...a) } };
});
vi.mock('./useJudgePanelData', async () => {
  const { useState } = await import('react');
  const SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
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
    useJudgeInfo: () => ({ name: 'Chief', judgeType: 'Senior Judge', competition: 'c1' }),
    useJudgePanelData: () => {
      const [state, setState] = useState({ panelScores: {}, size: 3 });
      feed.push = setState;
      const { panelScores, size } = state;
      const count = Object.keys(panelScores).length;
      return {
        panelScores,
        setPanelScores: vi.fn(),
        judgeNameMap: {},
        finalized: false,
        setFinalized: vi.fn(),
        socket: null,
        isConnected: true,
        panelScoresCount: count,
        effectivePanelSize: size,
        orderedPanelEntries: SEATS.filter((jt) => panelScores[jt]).map((jt) => [jt, panelScores[jt]]),
        allPanelSubmitted: count >= size,
        isSeniorJudge: true,
      };
    },
    resolveJudgeSeat: (judgeInfo) => judgeInfo,
  };
});

import JudgePanelReview from './JudgePanelReview';

const slip = (judgeType, difficulty, combination, score) => ({
  judgeType,
  score,
  breakdown: {
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: difficulty },
    combination: { checked: {}, total: combination },
    execution: 0,
    bonus: 0,
    detailed: false,
  },
});
const push = (panelScores, size = 3) => act(() => feed.push({ panelScores, size }));
const mismatchPopup = () => screen.queryByText('Score Mismatch Detected');
const tolerancePopup = () => screen.queryByText('Tolerance Limit Exceeded');

describe('Panel Review — alerts follow the live feed', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    api.saveScore?.mockClear();
  });

  it('opens, re-opens and closes the mismatch popup without a refresh', async () => {
    render(<JudgePanelReview />);
    push({
      'Senior Judge': slip('Senior Judge', 2.4, 1.6, 8),
      'Judge 1': slip('Judge 1', 2.4, 1.6, 8),
    });
    expect(mismatchPopup()).toBeNull();

    // J2 arrives over the socket, disagreeing on difficulty → popup opens.
    push({
      'Senior Judge': slip('Senior Judge', 2.4, 1.6, 8),
      'Judge 1': slip('Judge 1', 2.4, 1.6, 8),
      'Judge 2': slip('Judge 2', 3.2, 1.6, 8.8),
    });
    expect(mismatchPopup()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Understood — Call Judges' }));
    expect(mismatchPopup()).toBeNull();

    // J2 resubmits, still wrong → it comes back, though it was dismissed.
    push({
      'Senior Judge': slip('Senior Judge', 2.4, 1.6, 8),
      'Judge 1': slip('Judge 1', 2.4, 1.6, 8),
      'Judge 2': slip('Judge 2', 3.0, 1.6, 8.6),
    });
    expect(mismatchPopup()).not.toBeNull();

    // J2 fixes it over the socket while the popup is open → it closes; no
    // empty "Score Mismatch Detected" is left behind.
    push({
      'Senior Judge': slip('Senior Judge', 2.4, 1.6, 8),
      'Judge 1': slip('Judge 1', 2.4, 1.6, 8),
      'Judge 2': slip('Judge 2', 2.4, 1.6, 8),
    });
    expect(mismatchPopup()).toBeNull();
    expect(screen.queryByText(/mismatch detected/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Final Submit' })).toBeEnabled();
  });

  it('tolerance: after Understood the button is "Final Submit with Base Score" and submits it', async () => {
    render(<JudgePanelReview />);
    // Evaluators 8.40 ×4 against a chief of 9.40: avg 8.40, gap 1.00 > ±0.20,
    // base score (8.40 + 9.40) ÷ 2 = 8.90.
    push({
      'Senior Judge': slip('Senior Judge', 3.8, 1.6, 9.4),
      'Judge 1': slip('Judge 1', 3.8, 1.6, 8.4),
      'Judge 2': slip('Judge 2', 3.8, 1.6, 8.4),
      'Judge 3': slip('Judge 3', 3.8, 1.6, 8.4),
      'Judge 4': slip('Judge 4', 3.8, 1.6, 8.4),
    }, 5);
    expect(tolerancePopup()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Understood — Dismiss' }));
    expect(tolerancePopup()).toBeNull();

    const submit = screen.getByRole('button', { name: 'Final Submit with Base Score 8.90' });
    expect(submit).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Final Submit' })).toBeNull();

    await act(async () => { fireEvent.click(submit); });
    expect(api.saveScore).toHaveBeenCalledTimes(1);
    const [payload] = api.saveScore.mock.calls[0];
    expect(payload.isFinalSubmit).toBe(true);
    expect(payload.playerScores[0].finalScore).toBe(8.9);
    expect(payload.playerScores[0].baseScoreApplied).toBe(true);
  });
});
