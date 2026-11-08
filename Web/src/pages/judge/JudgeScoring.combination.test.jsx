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
    // The seat the panel hook resolves (bug fix 2026-11-08).
    mySeat: { judgeType: 'Judge 1', gender: 'Male', ageGroup: 'Under14' }, myJudgeType: 'Judge 1', seatReady: true,
  }),
  resolveJudgeSeat: (judgeInfo) => judgeInfo,
}));
vi.mock('@/services/public/judge.api', () => ({ judgeAPI: { saveScore } }));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: toastError, success: vi.fn() } }));

import JudgeScoring from './JudgeScoring';

const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];

const renderSlip = (apparatus) => {
  session.apparatus = apparatus;
  return render(<JudgeScoring />);
};

/** The desktop Execution field (the phone tab is not open, so it is the only one). */
const enterExecution = (value) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Execution' }), { target: { value } });
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
    enterExecution('3.00');
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

describe('JudgeScoring — phone layout pins the score under the header', () => {
  beforeEach(() => localStorage.clear());

  it('pins Live Final Score + tabs at the header\'s measured height, not a fixed 57px', () => {
    // jsdom has no layout: report a two-row phone header of 121px.
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      if (this.tagName === 'HEADER') return { height: 121, top: 0, bottom: 121, left: 0, right: 375, width: 375 };
      return original.call(this);
    };
    try {
      renderSlip('Pole Mallakhamb');
      const bar = screen.getByTestId('mobile-score-bar');
      expect(bar.style.top).toBe('121px');
      expect(bar).toHaveTextContent('Live Final Score');
      expect(bar).toHaveTextContent('Difficulty');
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  // User rule 2026-11-07: Difficulty and Combination never unlock Submit;
  // Execution must reach 0.10. Below that the button reads disabled and a tap
  // only shows the popup.
  describe('Execution floor of 0.10', () => {
    beforeEach(() => toastError.mockReset());

    const submitButtons = () => screen.getAllByRole('button', { name: /submit score/i });

    it('stays locked on Combination alone and shows the popup on tap', () => {
      renderSlip('Pole Mallakhamb');
      fireEvent.click(checkboxes().selectAll);

      for (const button of submitButtons()) {
        expect(button).toHaveAttribute('aria-disabled', 'true');
      }
      fireEvent.click(submitButtons()[0]);
      expect(saveScore).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith(
        expect.stringMatching(/at least 0\.10/),
        expect.anything(),
      );
    });

    it('stays locked at 0.00 and unlocks at 0.10', async () => {
      renderSlip('Pole Mallakhamb');
      fireEvent.click(checkboxes().selectAll);

      enterExecution('0');
      expect(submitButtons()[0]).toHaveAttribute('aria-disabled', 'true');

      enterExecution('0.1');
      for (const button of submitButtons()) {
        expect(button).not.toHaveAttribute('aria-disabled');
      }
      fireEvent.click(submitButtons()[0]);
      await waitFor(() => expect(saveScore).toHaveBeenCalledTimes(1));
      expect(saveScore.mock.calls[0][0].breakdown.execution).toBe(0.1);
    });
  });

  // User rule 2026-11-07: the phone tabs change only on a tap of the tab. A
  // left/right swipe across the slip must not flip Difficulty → Combination.
  it('ignores a swipe on the phone tabs; a tap still switches', () => {
    renderSlip('Pole Mallakhamb');
    const tab = (name) => screen.getByRole('button', { name });
    // The phone tab content area (the old swipe target).
    const area = screen.getByTestId('mobile-tab-content');
    expect(tab('Difficulty')).toHaveClass('judge-tab--active');

    // A swipe left — the old "next tab" gesture.
    fireEvent.touchStart(area, { targetTouches: [{ clientX: 300 }] });
    fireEvent.touchMove(area, { targetTouches: [{ clientX: 50 }] });
    fireEvent.touchEnd(area);
    expect(tab('Difficulty')).toHaveClass('judge-tab--active');
    expect(tab('Combination')).not.toHaveClass('judge-tab--active');

    fireEvent.click(tab('Combination'));
    expect(tab('Combination')).toHaveClass('judge-tab--active');
  });

  // User rule 2026-11-08: a Difficulty row shows what the class scores against
  // its maximum (Competition I: A 0.80, B 2.40, C 0.60) — never "8 × 0.20 = 1.60".
  it('each Difficulty row stays at its class maximum', () => {
    renderSlip('Pole Mallakhamb');
    const points = (cls) => screen.getAllByTestId(`difficulty-${cls}-points`)[0];
    expect(points('A')).toHaveTextContent('0.00 / max 0.80');
    expect(points('B')).toHaveTextContent('0.00 / max 2.40');
    expect(points('C')).toHaveTextContent('0.00 / max 0.60');

    fireEvent.click(screen.getAllByRole('button', { name: 'A - Class - 0.20: 8' })[0]);
    expect(points('A')).toHaveTextContent('0.80 / max 0.80');

    fireEvent.click(screen.getAllByRole('button', { name: 'B - Class - 0.40: 7' })[0]);
    expect(points('B')).toHaveTextContent('2.40 / max 2.40');
  });
});

