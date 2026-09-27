/**
 * The Combination card on the judge slip: every requirement in the COP's own
 * wording, and a Select all that ticks or clears the whole checklist.
 *
 * Mocks mirror JudgeScoring.hooks.test.jsx; the slip's own state is real. Only
 * the desktop card is in the DOM until the phone's Combination tab is opened,
 * so a single Select all exists unless a test opens that tab.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCombinationChecklist } from '@/utils/scoring/copRules';

const { session, saveScore } = vi.hoisted(() => ({
  session: { apparatus: 'Pole Mallakhamb' },
  saveScore: vi.fn(),
}));

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
    selectedApparatus: session.apparatus,
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
  }),
  resolveJudgeSeat: (judgeInfo) => judgeInfo,
}));
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore } }));

import JudgeScoring from './JudgeScoring';

const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

const renderSlip = (apparatus) => {
  session.apparatus = apparatus;
  return render(<JudgeScoring />);
};

/** The desktop card's checkboxes: Select all first, then each requirement. */
const checkboxes = () => {
  const [selectAll, ...items] = screen.getAllByRole('checkbox');
  return { selectAll, items };
};

describe('JudgeScoring — combination checklist', () => {
  beforeEach(() => {
    localStorage.clear();
    saveScore.mockReset().mockResolvedValue({ data: {} });
  });

  it.each(APPARATUS)('%s shows every requirement in the COP wording', (apparatus) => {
    renderSlip(apparatus);

    for (const item of getCombinationChecklist(apparatus)) {
      expect(screen.getByText(item.rule)).toBeInTheDocument();
    }
  });

  it.each(APPARATUS)('%s: Select all ticks every requirement, then clears them', (apparatus) => {
    renderSlip(apparatus);
    const count = getCombinationChecklist(apparatus).length;
    const { selectAll, items } = checkboxes();
    expect(items).toHaveLength(count);
    expect(screen.getByText(`0 / ${count}`)).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(items.every((box) => box.checked)).toBe(true);
    expect(selectAll.checked).toBe(true);
    expect(screen.getByText(`${count} / ${count}`)).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(items.some((box) => box.checked)).toBe(false);
    expect(selectAll.checked).toBe(false);
    expect(screen.getByText(`0 / ${count}`)).toBeInTheDocument();
  });

  it('is mixed while only some requirements are ticked, and ticks the rest', () => {
    renderSlip('Rope Mallakhamb');
    const { selectAll, items } = checkboxes();

    fireEvent.click(items[2]);
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll.checked).toBe(false);

    fireEvent.click(selectAll);
    expect(items.every((box) => box.checked)).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
  });

  it('submits the full 1.60 with every requirement ticked', async () => {
    renderSlip('Hanging Mallakhamb');
    fireEvent.click(checkboxes().selectAll);
    fireEvent.click(screen.getAllByRole('button', { name: /submit score/i })[0]);

    await waitFor(() => expect(saveScore).toHaveBeenCalledTimes(1));
    const { combination } = saveScore.mock.calls[0][0].breakdown;
    expect(combination.total).toBe(1.6);
    for (const item of getCombinationChecklist('Hanging Mallakhamb')) {
      expect(combination.checked[item.id]).toBe(true);
    }
  });

  it('gives the phone layout its own Select all, sharing the same sheet', () => {
    renderSlip('Pole Mallakhamb');
    fireEvent.click(screen.getByRole('button', { name: 'Combination' }));

    const selectAlls = screen.getAllByRole('checkbox', { name: /select all/i });
    expect(selectAlls).toHaveLength(2);

    fireEvent.click(selectAlls[0]);
    const all = screen.getAllByRole('checkbox');
    expect(all.every((box) => box.checked)).toBe(true);
  });
});

describe('JudgeScoring — difficulty number grid', () => {
  beforeEach(() => localStorage.clear());

  it('A4 B6 C1 picked on the grid is the full 3.80', () => {
    renderSlip('Pole Mallakhamb');
    fireEvent.click(screen.getAllByRole('button', { name: 'A - Class - 0.20: 4' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'B - Class - 0.40: 6' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'C - Class - 0.60: 1' })[0]);
    expect(screen.getAllByText('3.80').length).toBeGreaterThan(0);
  });
});
