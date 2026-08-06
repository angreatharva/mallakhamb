import { describe, it, expect } from 'vitest';
import { slipToBreakdown } from './useJudgePanelData';
import { normalizeBreakdown } from './judgeShared';
import { analyzePanelMismatches } from '@/utils/scoring/copRules';

// A judgeSlip exactly as the server stores it: four flat section totals, no
// nested `breakdown`, no element counts, no checklist.
const storedSlip = {
  judgeRole: 'SR_JUDGE',
  difficultyScore: 3.8,
  combinationScore: 1.6,
  executionScore: 2.55,
  bonusScore: 0,
  total: 7.95,
};

describe('slipToBreakdown', () => {
  it('maps a stored slip flat totals into the breakdown shape', () => {
    const b = normalizeBreakdown(slipToBreakdown(storedSlip), storedSlip.total);
    expect(b.difficulty.total).toBe(3.8);
    expect(b.combination.total).toBe(1.6);
    expect(b.execution).toBe(2.55);
    expect(b.bonus).toBe(0);
  });

  it('marks a stored slip as lacking element-level detail', () => {
    // The A/B/C counts and checklist are not persisted per judge, so they must
    // not be presented as if the judge had entered zeros.
    const b = normalizeBreakdown(slipToBreakdown(storedSlip), storedSlip.total);
    expect(b.detailed).toBe(false);
    expect(b.difficulty.aClass).toBe(0);
  });

  it('passes through a slip that already carries a full breakdown', () => {
    const full = {
      difficulty: { aClass: 1, bClass: 2, cClass: 3, total: 3.8 },
      combination: { checked: { 1: true }, total: 1.6 },
      execution: 2.55,
      bonus: 0,
    };
    const b = normalizeBreakdown(slipToBreakdown({ ...storedSlip, breakdown: full }), 7.95);
    expect(b.detailed).toBe(true);
    expect(b.difficulty.cClass).toBe(3);
  });
});

describe('analyzePanelMismatches with server-loaded slips', () => {
  const detailed = (total, mix, checked) => ({
    score: total,
    breakdown: normalizeBreakdown({
      difficulty: { ...mix, total: 3.8 },
      combination: { checked, total: 1.6 },
      execution: 2.4,
      bonus: 0,
    }, total),
  });
  const fromServer = (total) => ({
    score: total,
    breakdown: normalizeBreakdown(slipToBreakdown({ ...storedSlip, total }), total),
  });

  it('does not invent a mismatch when detail levels differ', () => {
    // One slip arrived live over the socket (full detail), the others were
    // reloaded from the server (totals only). Their section totals agree, so
    // there is no real disagreement to report.
    const result = analyzePanelMismatches({
      'Senior Judge': fromServer(7.95),
      'Judge 1': fromServer(7.95),
      'Judge 2': detailed(7.95, { aClass: 1, bClass: 2, cClass: 3 }, { 1: true }),
    }, 3);
    expect(result.difficultyMismatch).toBe(false);
    expect(result.combinationMismatch).toBe(false);
    expect(result.hasBlockingMismatch).toBeFalsy();
  });

  it('still reports a genuine element-mix disagreement between detailed slips', () => {
    const result = analyzePanelMismatches({
      'Judge 1': detailed(7.95, { aClass: 1, bClass: 2, cClass: 3 }, { 1: true }),
      'Judge 2': detailed(7.95, { aClass: 3, bClass: 2, cClass: 1 }, { 1: true }),
    }, 3);
    expect(result.difficultyMismatch).toBe(true);
  });

  it('still reports differing section totals regardless of detail level', () => {
    const result = analyzePanelMismatches({
      'Senior Judge': fromServer(7.95),
      'Judge 1': {
        score: 6.0,
        breakdown: normalizeBreakdown(
          slipToBreakdown({ ...storedSlip, difficultyScore: 2.0, total: 6.0 }), 6.0
        ),
      },
    }, 3);
    expect(result.difficultyMismatch).toBe(true);
  });
});

describe('mismatch attribution against the Senior Judge', () => {
  // Full-detail slip helper: the Senior Judge's slip is the reference.
  const slip = (score, diffTotal, comboTotal, mix = { aClass: 1, bClass: 2, cClass: 3 }) => ({
    score,
    judgeType: undefined,
    breakdown: normalizeBreakdown({
      difficulty: { ...mix, total: diffTotal },
      combination: { checked: { 1: true }, total: comboTotal },
      execution: 2.4,
      bonus: 0,
    }, score),
  });
  const panel = (entries) =>
    Object.fromEntries(Object.entries(entries).map(([jt, v]) => [jt, { ...v, judgeType: jt }]));

  it('names only the judges who differ from the Senior Judge', () => {
    const result = analyzePanelMismatches(panel({
      'Senior Judge': slip(7.95, 3.8, 1.6),
      'Judge 1': slip(7.95, 3.8, 1.6),   // agrees with SR
      'Judge 2': slip(6.50, 2.4, 1.6),   // differs on difficulty
    }), 3);
    expect(result.judgesNeedingReview).toEqual(['Judge 2']);
  });

  it('never blames the Senior Judge, who is the reference', () => {
    // Two judges agree with each other but not with the Senior Judge —
    // the Senior Judge is still not the one asked to re-check.
    const result = analyzePanelMismatches(panel({
      'Senior Judge': slip(6.50, 2.4, 1.6),
      'Judge 1': slip(7.95, 3.8, 1.6),
      'Judge 2': slip(7.95, 3.8, 1.6),
    }), 3);
    expect(result.judgesNeedingReview).toEqual(['Judge 1', 'Judge 2']);
    expect(result.judgesNeedingReview).not.toContain('Senior Judge');
  });

  it('reports nobody when the whole panel matches the Senior Judge', () => {
    const result = analyzePanelMismatches(panel({
      'Senior Judge': slip(7.95, 3.8, 1.6),
      'Judge 1': slip(7.95, 3.8, 1.6),
      'Judge 2': slip(7.95, 3.8, 1.6),
    }), 3);
    expect(result.judgesNeedingReview).toEqual([]);
    expect(result.hasBlockingMismatch).toBe(false);
  });

  it('lists judges in panel order — Senior Judge, Judge 1, Judge 2, …', () => {
    // Insertion order here is deliberately scrambled.
    const result = analyzePanelMismatches(panel({
      'Judge 2': slip(6.0, 2.0, 1.6),
      'Senior Judge': slip(7.95, 3.8, 1.6),
      'Judge 3': slip(5.0, 1.0, 1.6),
      'Judge 1': slip(7.0, 3.0, 1.6),
    }), 4);
    expect(result.judgesNeedingReview).toEqual(['Judge 1', 'Judge 2', 'Judge 3']);
    // Totals are reported SR-first, then J1, J2, J3
    expect(result.difficultyValues).toEqual([3.8, 3.0, 2.0, 1.0]);
  });
});
