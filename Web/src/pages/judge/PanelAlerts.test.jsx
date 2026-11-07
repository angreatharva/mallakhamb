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
import { analyzePanelMismatches, describeSlipDifferences, getCombinationChecklist } from '@/utils/scoring/copRules';
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

// User rule 2026-11-07: the mismatch dialog says WHAT differs, not only who.
describe('MismatchModal — exact differences', () => {
  const POLE = getCombinationChecklist('Pole Mallakhamb');
  const allMet = Object.fromEntries(POLE.map((item) => [item.id, true]));
  const detailed = (judgeType, { a, b, c, total, checked, comboTotal }) => ({
    judgeType,
    score: 8,
    breakdown: {
      difficulty: { aClass: a, bClass: b, cClass: c, total },
      combination: { checked, total: comboTotal },
      execution: 2.6,
      bonus: 0,
    },
  });
  const panelScores = {
    'Senior Judge': detailed('Senior Judge', { a: 4, b: 6, c: 1, total: 3.8, checked: allMet, comboTotal: 1.6 }),
    // J1: one C element short, recorded as an extra A.
    'Judge 1': detailed('Judge 1', { a: 5, b: 6, c: 0, total: 3.4, checked: allMet, comboTotal: 1.6 }),
    // J2: did not credit requirement 4 (Vertical Hold, 0.20).
    'Judge 2': detailed('Judge 2', { a: 4, b: 6, c: 1, total: 3.8, checked: { ...allMet, 4: false }, comboTotal: 1.4 }),
  };
  const panelMismatch = analyzePanelMismatches(panelScores, 3);
  const open = (props) => render(
    <MismatchModal isOpen onClose={() => {}} panelMismatch={panelMismatch} panelScores={panelScores}
      judgeNameMap={{ 'Judge 1': 'Yatin Nachre' }} combinationChecklist={POLE} {...props} />
  );

  it('describeSlipDifferences names the differing classes and checklist items', () => {
    const j1 = describeSlipDifferences(panelScores['Senior Judge'], panelScores['Judge 1'], POLE);
    expect(j1.difficulty.classes).toEqual([
      { cls: 'A', senior: 4, judge: 5 },
      { cls: 'C', senior: 1, judge: 0 },
    ]);
    const j2 = describeSlipDifferences(panelScores['Senior Judge'], panelScores['Judge 2'], POLE);
    expect(j2.combination.notMet.map((i) => i.id)).toEqual([4]);
    expect(j2.combination.met).toEqual([]);
  });

  it('shows the Senior Judge each off judge\'s exact difference', () => {
    open({ isSeniorJudge: true, myJudgeType: 'Senior Judge' });

    const diff = screen.getByTestId('mismatch-detail-difficulty-Judge 1');
    expect(diff).toHaveTextContent('J1 · Yatin Nachre: 3.40 vs SR 3.80 (−0.40)');
    expect(diff).toHaveTextContent('A-class elements: J1 5, SR 4');
    expect(diff).toHaveTextContent('C-class elements: J1 0, SR 1');

    const combo = screen.getByTestId('mismatch-detail-combination-Judge 2');
    expect(combo).toHaveTextContent('J2: 1.40 vs SR 1.60 (−0.20)');
    expect(combo).toHaveTextContent(`Not met by J2 (SR: met) — ${POLE[3].rule} (−0.20)`);

    // A judge who agrees with the Senior on a section gets no block there.
    expect(screen.queryByTestId('mismatch-detail-combination-Judge 1')).toBeNull();
    expect(screen.queryByTestId('mismatch-detail-difficulty-Judge 2')).toBeNull();
  });

  it('shows a panel judge only their own difference', () => {
    open({ isSeniorJudge: false, myJudgeType: 'Judge 2' });
    const combo = screen.getByTestId('mismatch-detail-combination-Judge 2');
    expect(combo).toHaveTextContent('Your slip: 1.40 vs SR 1.60');
    expect(combo).toHaveTextContent('Not met by You (SR: met)');
    expect(screen.queryByTestId('mismatch-detail-difficulty-Judge 1')).toBeNull();
  });

  it('falls back to totals for a slip without element detail', () => {
    const totalsOnly = {
      ...panelScores,
      'Judge 1': slip('Judge 1', 3.4, 1.6, 8),
    };
    render(
      <MismatchModal isOpen onClose={() => {}} panelMismatch={analyzePanelMismatches(totalsOnly, 3)}
        panelScores={totalsOnly} isSeniorJudge myJudgeType="Senior Judge" judgeNameMap={{}} combinationChecklist={POLE} />
    );
    const diff = screen.getByTestId('mismatch-detail-difficulty-Judge 1');
    expect(diff).toHaveTextContent('3.40 vs SR 3.80');
    expect(diff).toHaveTextContent('totals only');
  });
});

