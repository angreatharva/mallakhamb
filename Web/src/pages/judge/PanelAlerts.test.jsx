/**
 * The two Panel Review alerts, as the Senior Judge sees them.
 *
 * Mismatch: a judge is red only in the section THEIR slip disagrees on —
 * SR 2.40 / J1 2.40 / J2 3.20 marks J2 alone under Difficulty.
 * Tolerance: the dialog only acknowledges; Panel Review then offers the
 * base-score submit (see JudgePanelReview.live.test.jsx).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MismatchModal, ToleranceModal } from './judgeShared';
import { analyzePanelMismatches } from '@/utils/scoring/copRules';
import { FG } from '@/styles/tokens';

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

// The mismatch red is the danger token (#EF4444 in dark, a deeper red in light), not a fixed hex.
const RED = FG.danger;
const chip = (label) => screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.textContent.startsWith(label));

describe('MismatchModal — Senior Judge view', () => {
  const panelScores = {
    'Senior Judge': slip('Senior Judge', 2.4, 1.6, 8),
    'Judge 1': slip('Judge 1', 2.4, 1.4, 8),
    'Judge 2': slip('Judge 2', 3.2, 1.6, 8),
  };
  const panelMismatch = analyzePanelMismatches(panelScores, 3);

  it('reds a judge only in the section their slip differs on', () => {
    render(
      <MismatchModal isOpen onClose={() => {}} panelMismatch={panelMismatch}
        panelScores={panelScores} isSeniorJudge myJudgeType="Senior Judge" judgeNameMap={{}} />
    );
    // Order in the DOM: the Combination block, then the Difficulty block.
    const [comboJ1, diffJ1] = chip('J1:');
    const [comboJ2, diffJ2] = chip('J2:');
    const [comboSr, diffSr] = chip('SR:');

    expect(diffJ2).toHaveStyle({ color: RED });
    expect(diffJ1).not.toHaveStyle({ color: RED });
    expect(diffSr).not.toHaveStyle({ color: RED });

    expect(comboJ1).toHaveStyle({ color: RED });
    expect(comboJ2).not.toHaveStyle({ color: RED });
    expect(comboSr).not.toHaveStyle({ color: RED });
  });

  it('asks the Senior Judge to call the judges', () => {
    render(
      <MismatchModal isOpen onClose={() => {}} panelMismatch={panelMismatch}
        panelScores={panelScores} isSeniorJudge myJudgeType="Senior Judge" judgeNameMap={{}} />
    );
    expect(screen.getByRole('button', { name: 'Understood — Call Judges' })).toBeInTheDocument();
  });

  it('a panel judge just dismisses', () => {
    render(
      <MismatchModal isOpen onClose={() => {}} panelMismatch={panelMismatch}
        panelScores={panelScores} isSeniorJudge={false} myJudgeType="Judge 2" judgeNameMap={{}} />
    );
    expect(screen.getByRole('button', { name: 'Understood — Dismiss' })).toBeInTheDocument();
  });
});

describe('ToleranceModal', () => {
  // Evaluators 8.40 ×4 against a chief of 9.40: avg 8.40, gap 1.00 > ±0.20.
  const panelScores = {
    'Senior Judge': slip('Senior Judge', 3.8, 1.6, 9.4),
    'Judge 1': slip('Judge 1', 3.8, 1.6, 8.4),
    'Judge 2': slip('Judge 2', 3.8, 1.6, 8.4),
    'Judge 3': slip('Judge 3', 3.8, 1.6, 8.4),
    'Judge 4': slip('Judge 4', 3.8, 1.6, 8.4),
  };
  const panelMismatch = analyzePanelMismatches(panelScores, 5);

  it('has only Understood — the base-score submit is on the page, after it', () => {
    const onClose = vi.fn();
    render(
      <ToleranceModal isOpen onClose={onClose} panelMismatch={panelMismatch} panelScores={panelScores}
        isSeniorJudge myJudgeType="Senior Judge" judgeNameMap={{}} />
    );
    expect(screen.getByText(/base score 8\.90/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Final Submit/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Understood — Dismiss' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
