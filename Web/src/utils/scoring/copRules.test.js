import { describe, it, expect } from 'vitest';
import {
  getCombinationChecklist,
  computeCombinationTotal,
  getDifficultyRequirement,
  isApparatusAllowedForGender,
  normalizeApparatus,
  resolveDifficultyValue,
  analyzePanelMismatches,
  calculateAverageMarks,
  roundExecution,
  POINT_CEILINGS,
} from './copRules';

describe('copRules — apparatus combination checklists', () => {
  it('provides the right item count per apparatus (Pole 10 / Hanging 10 / Rope 7)', () => {
    expect(getCombinationChecklist('Pole Mallakhamb')).toHaveLength(10);
    expect(getCombinationChecklist('Hanging Mallakhamb')).toHaveLength(10);
    expect(getCombinationChecklist('Rope Mallakhamb')).toHaveLength(7);
  });

  it('each apparatus checklist penalties sum to the 1.60 combination ceiling', () => {
    for (const app of ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']) {
      const sum = getCombinationChecklist(app).reduce((s, i) => s + i.penalty, 0);
      expect(Number(sum.toFixed(2))).toBe(POINT_CEILINGS.combination);
    }
  });

  it('normalizes short and long apparatus labels', () => {
    expect(normalizeApparatus('Pole')).toBe('Pole Mallakhamb');
    expect(normalizeApparatus('rope mallakhamb')).toBe('Rope Mallakhamb');
    expect(normalizeApparatus('HANGING')).toBe('Hanging Mallakhamb');
    expect(normalizeApparatus('unknown')).toBeNull();
  });

  it('defaults unknown apparatus to the Pole checklist', () => {
    expect(getCombinationChecklist('nonsense')).toBe(getCombinationChecklist('Pole Mallakhamb'));
  });

  /*
   * Transcribed from COP Mallakhamb.pdf §2.3.2.1–2.3.2.3 (PDF p.28). Judges read
   * the slip against the printed Code, so a paraphrase — which is what shipped
   * before — is a defect even when every penalty is right. Also pins each
   * penalty to its own requirement, which the sum above cannot.
   */
  it.each([
    ['Pole Mallakhamb', [
      ['All parts of the Pole should be properly utilized.', 0.10],
      ["One Acrobatic element of 'B' part should be executed from both sides.", 0.20],
      ["Continuous 3 Acrobatic elements of which at least one should be 'B' part", 0.20],
      ['At least one Vertical Hold part.', 0.20],
      ['At least one Horizontal Hold part.', 0.20],
      ['One Hold part demonstrating flexibility of back bone.', 0.10],
      ['At least B mount.', 0.10],
      ['At least C dismounts.', 0.20],
      ['At least two transitions from one hold position to another Hold position.', 0.20],
      ['Minimum 16 elements in one Set.', 0.10],
    ]],
    ['Hanging Mallakhamb', [
      ['All parts of the Hanging Mallakhamb should be properly utilized.', 0.10],
      ["Acrobatic element of 'A' part from both sides.", 0.20],
      ["Continuous 3 Acrobatic elements of which at least 1 should be 'B' part", 0.20],
      ['At least one Vertical Hold part.', 0.20],
      ['At least one Horizontal Hold part.', 0.20],
      ['Back bone flexibility', 0.10],
      ['At least B mount.', 0.10],
      ['At least C dismounts.', 0.20],
      ['At least one transitions from one hold position to another Hold position.', 0.20],
      ['Minimum 14 elements in one Set.', 0.10],
    ]],
    ['Rope Mallakhamb', [
      ['At Least once the rope should be held in legs at 4 meter height', 0.20],
      ['At least 2 hold parts showing forward & backward flexibility (Both elements should be performed)', 0.30],
      ['At least one Vertical and one Horizontal Hold part.', 0.30],
      ['At least B-Part mount.', 0.20],
      ['At least C-Part Dismount.', 0.20],
      ['At least one Strength Part', 0.20],
      ['Minimum 18 elements in one Set', 0.20],
    ]],
  ])('%s quotes the COP combination requirements word for word', (apparatus, expected) => {
    expect(getCombinationChecklist(apparatus).map((i) => [i.rule, i.penalty])).toEqual(expected);
  });
});

describe('copRules — computeCombinationTotal', () => {
  it('returns full 1.60 when every requirement is met', () => {
    const checklist = getCombinationChecklist('Pole Mallakhamb');
    const allChecked = Object.fromEntries(checklist.map(i => [i.id, true]));
    expect(computeCombinationTotal('Pole Mallakhamb', allChecked)).toBe(1.60);
  });

  it('subtracts the exact penalty of a single failed item', () => {
    const checklist = getCombinationChecklist('Rope Mallakhamb');
    const checked = Object.fromEntries(checklist.map(i => [i.id, true]));
    // Fail item id 2 (penalty 0.30 for Rope)
    checked[2] = false;
    expect(computeCombinationTotal('Rope Mallakhamb', checked)).toBe(1.30);
  });

  it('never goes below zero and treats missing map entries as failed', () => {
    // Empty map = all items failed = 1.60 - 1.60 = 0.
    expect(computeCombinationTotal('Pole Mallakhamb', {})).toBe(0);
  });
});

describe('copRules — difficulty requirements', () => {
  it('Competition I requires A4/B6/C1', () => {
    expect(getDifficultyRequirement('competition_1')).toEqual({ A: 4, B: 6, C: 1 });
    expect(getDifficultyRequirement('Competition I')).toEqual({ A: 4, B: 6, C: 1 });
  });

  it('Competition II/III require A1/B6/C2', () => {
    expect(getDifficultyRequirement('competition_2')).toEqual({ A: 1, B: 6, C: 2 });
    expect(getDifficultyRequirement('competition_3')).toEqual({ A: 1, B: 6, C: 2 });
  });
});

describe('copRules — gender apparatus rule', () => {
  it('blocks Hanging Mallakhamb for Female competitions', () => {
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Female')).toBe(false);
    expect(isApparatusAllowedForGender('Hanging', 'female')).toBe(false);
  });

  it('allows Pole and Rope for Female, and everything for Male', () => {
    expect(isApparatusAllowedForGender('Pole Mallakhamb', 'Female')).toBe(true);
    expect(isApparatusAllowedForGender('Rope Mallakhamb', 'Female')).toBe(true);
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Male')).toBe(true);
  });
});

describe('copRules — difficulty cascade (v2 §3.2.1)', () => {
  it('cascades excess C to B, keeping C value (0.60)', () => {
    // Competition I required: A4 B6 C1; executed: A0 B5 C2
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 0, B: 5, C: 2 }, required);
    // C: 2 elements × 0.60 = 1.20 (1 in C slot, 1 filling B slot)
    // B: 5 elements × 0.40 = 2.00
    // A: 0
    expect(result.C).toBe(1.20);
    expect(result.B).toBe(2.00);
    expect(result.A).toBe(0.00);
    expect(result.total).toBe(3.20);
    expect(result.shortfallFlag).toBe(true);
  });

  it('returns full points when mix matches exactly', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 6, C: 1 }, required);
    expect(result.total).toBe(3.80);
    expect(result.shortfallFlag).toBe(false);
  });

  it('caps via cascade — A4 B4 C2 for Comp I gives 3.60, not 3.40', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 4, C: 2 }, required);
    // C: 2 × 0.60 = 1.20 (1 in C, 1 fills B), B: 4 × 0.40 = 1.60, A: 4 × 0.20 = 0.80
    expect(result.C).toBe(1.20);
    expect(result.B).toBe(1.60);
    expect(result.A).toBe(0.80);
    expect(result.total).toBe(3.60);
  });

  it('discards excess when all slots are full — A4 B6 C2 stays 3.80', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 6, C: 2 }, required);
    // 1 C in slot + 0 cascaded (B full, A full) → extra C discarded
    expect(result.total).toBe(3.80);
  });
});

describe('copRules — tolerance gate (COP §3.4)', () => {
  // Every slip agrees on the routine (same A/B/C mix, same checklist), so the
  // only thing that can differ between these panels is the execution mark.
  const slip = (judgeType, total, execution) => ({
    judgeType,
    score: total,
    breakdown: {
      difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
      combination: { checked: { 1: true }, total: 1.6 },
      execution,
      bonus: 0,
    },
  });

  /** A full five-judge panel whose chief marks `senior` and J1–J4 `evals`. */
  const panelOf = (senior, evals) => ({
    'Senior Judge': slip('Senior Judge', 5.4 + senior, senior),
    'Judge 1': slip('Judge 1', 5.4 + evals[0], evals[0]),
    'Judge 2': slip('Judge 2', 5.4 + evals[1], evals[1]),
    'Judge 3': slip('Judge 3', 5.4 + evals[2], evals[2]),
    'Judge 4': slip('Judge 4', 5.4 + evals[3], evals[3]),
  });

  it('flags a breach when the chief sits outside tolerance of the execution average', () => {
    // Middle two of J1–J4 average 8.40; the chief is 9.40, a gap of 1.00
    // against the ±0.20 allowed at that score.
    const result = analyzePanelMismatches(panelOf(4.0, [3.0, 3.0, 3.0, 3.0]), 5);
    expect(result.hasToleranceBreach).toBe(true);
    expect(result.hasBlockingMismatch).toBe(false);
    expect(result.hasBlockingIssue).toBe(true);
  });

  it('clears once the marks are brought inside tolerance', () => {
    const result = analyzePanelMismatches(panelOf(3.05, [3.0, 3.0, 3.0, 3.0]), 5);
    expect(result.hasToleranceBreach).toBe(false);
    expect(result.hasBlockingIssue).toBe(false);
  });

  it('names the judges whose totals sit away from the chief', () => {
    const result = analyzePanelMismatches(panelOf(4.0, [3.0, 3.0, 3.0, 3.0]), 5);
    expect(result.toleranceOffJudges).toEqual(['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);
  });

  it('does not block a panel that has not finished marking', () => {
    // Three of five slips in. An execution average over a partial panel is not
    // the figure §3.4 talks about, and blocking on it would stall the panel.
    const partial = panelOf(4.0, [3.0, 3.0, 3.0, 3.0]);
    delete partial['Judge 3'];
    delete partial['Judge 4'];
    const result = analyzePanelMismatches(partial, 5);
    expect(result.hasToleranceBreach).toBe(false);
    expect(result.hasBlockingIssue).toBe(false);
  });

  it('never applies to a three-judge panel, which has no chief', () => {
    const three = {
      'Senior Judge': slip('Senior Judge', 9.4, 4.0),
      'Judge 1': slip('Judge 1', 8.4, 3.0),
      'Judge 2': slip('Judge 2', 8.4, 3.0),
    };
    const result = analyzePanelMismatches(three, 3);
    expect(result.toleranceMismatch).toBe(false);
    expect(result.hasToleranceBreach).toBe(false);
  });

  it('reports the chief’s own total, which the alert renders', () => {
    // Regression: the dialog read `toleranceInfo.seniorScore` and the
    // calculation never returned it, so the alert said "Senior ." to the panel.
    const calc = calculateAverageMarks({ seniorJudge: 9.4, judge1: 8.4, judge2: 8.4, judge3: 8.4, judge4: 8.4 }, 5);
    expect(calc.seniorScore).toBe(9.4);
    expect(calc.baseScoreApplied).toBe(true);
  });
});

describe('copRules — panel-size rules', () => {
  const marks = (seniorJudge, judge1, judge2, judge3, judge4) =>
    ({ seniorJudge, judge1, judge2, judge3, judge4 });

  it('3-judge: plain mean of all three totals, and no tolerance at all', () => {
    const r = calculateAverageMarks(marks(8.60, 8.00, 8.40, 0, 0), 3);
    expect(r.method).toBe('3_JUDGE_SIMPLE_AVERAGE');
    expect(r.average).toBeCloseTo(8.33, 2);
    expect(r.tolerance).toBe(0);
    expect(r.baseScoreApplied).toBe(false);
  });

  it('5-judge: drops the high and low of J1–J4, chief stays out of the average', () => {
    const r = calculateAverageMarks(marks(9.40, 8.00, 8.40, 8.60, 9.00), 5);
    expect(r.method).toBe('5_JUDGE_STANDARD_COP');
    // [8.00, 8.40, 8.60, 9.00] → (8.40 + 8.60) / 2
    expect(r.executionAvg).toBeCloseTo(8.50, 2);
  });

  it('4-judge: the chief fills the vacant 4th slot, then the 5-judge method runs', () => {
    const r = calculateAverageMarks(marks(9.40, 8.00, 8.40, 8.60, 0), 4);
    expect(r.method).toBe('4_JUDGE_AS_5_JUDGE_EQUIVALENT');
    // Pool [8.00, 8.40, 8.60, 9.40] → drop 8.00 and 9.40 → (8.40 + 8.60) / 2
    expect(r.executionAvg).toBeCloseTo(8.50, 2);
    expect(r.baseScoreApplied).toBe(true);
    expect(r.average).toBeCloseTo(8.95, 2);
  });

  it('4-judge and 5-judge agree when the chief is duplicated by hand', () => {
    const four = calculateAverageMarks(marks(8.50, 8.00, 8.20, 8.40, 0), 4);
    const five = calculateAverageMarks(marks(8.50, 8.00, 8.20, 8.40, 8.50), 5);
    expect(four.executionAvg).toBeCloseTo(five.executionAvg, 2);
    expect(four.average).toBeCloseTo(five.average, 2);
  });

  it('mirrors the server: same numbers as Server/src/utils/scoring/calculation.util.js', () => {
    // The two implementations are separate files and drift silently; this is
    // the case that would catch it, taken from the server's own unit test.
    const r = calculateAverageMarks(marks(9.00, 8.50, 8.70, 9.20, 0), 4);
    expect(r.executionAvg).toBeCloseTo(8.85, 2);
  });

  it('does not inject a phantom chief before the chief has marked', () => {
    // Mid-panel preview: injecting a 0 would drop a real judge in its favour.
    const r = calculateAverageMarks(marks(0, 8.00, 8.40, 8.60, 0), 4);
    expect(r.executionAvg).toBeCloseTo(8.33, 2);
    expect(r.baseScoreApplied).toBe(false);
  });
});

describe('copRules — roundExecution (one decimal, half rounds down)', () => {
  it.each([2.0, 2.01, 2.02, 2.03, 2.04, 2.05])('%s → 2.00', (v) => {
    expect(roundExecution(v)).toBe(2.0);
  });

  it.each([2.06, 2.07, 2.08, 2.09, 2.1])('%s → 2.10', (v) => {
    expect(roundExecution(v)).toBe(2.1);
  });

  it('works the same across the range, whatever float noise the value carries', () => {
    for (let whole = 0; whole <= 3; whole += 1) {
      for (let tenth = 0; tenth <= 9; tenth += 1) {
        const base = whole + tenth / 10;
        const down = Math.round(base * 10) / 10;
        const up = Math.round((base + 0.1) * 10) / 10;
        expect(roundExecution(base + 0.05)).toBe(down);
        expect(roundExecution(base + 0.06)).toBe(up);
      }
    }
  });

  it('accepts text as typed and clamps to 0 … 4.40', () => {
    expect(roundExecution('3.26')).toBe(3.3);
    expect(roundExecution('')).toBe(0);
    expect(roundExecution(4.46)).toBe(4.4);
    expect(roundExecution(9)).toBe(4.4);
    expect(roundExecution(-1)).toBe(0);
  });
});
