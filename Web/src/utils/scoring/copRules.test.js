import { describe, it, expect } from 'vitest';
import {
  getTolerance,
  getCombinationChecklist,
  computeCombinationTotal,
  getDifficultyRequirement,
  isApparatusAllowedForGender,
  normalizeApparatus,
  resolveDifficultyValue,
  difficultyClassMax,
  analyzePanelMismatches,
  calculateAverageMarks,
  roundExecution,
  getTimeDeductionForTime,
  averageSlipBreakdown,
  describeSlipAverage,
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
  it('an extra C fills one B slot and scores 0.40 there', () => {
    // Competition I required: A4 B6 C1; executed: A0 B5 C2
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 0, B: 5, C: 2 }, required);
    // C slot: 0.60. B slots: 5 B + the extra C = 6 × 0.40 = 2.40 (user rule
    // 2026-11-08: a filled slot scores ITS value, not the element's). A: 0.
    expect(result.C).toBe(0.60);
    expect(result.B).toBe(2.40);
    expect(result.A).toBe(0.00);
    expect(result.total).toBe(3.00);
    expect(result.shortfallFlag).toBe(true);
  });

  it('returns full points when mix matches exactly', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 6, C: 1 }, required);
    expect(result.total).toBe(3.80);
    expect(result.shortfallFlag).toBe(false);
  });

  it('A4 B4 C2 for Comp I gives 3.40 — the extra C is one more B', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 4, C: 2 }, required);
    // C slot 0.60; B slots: 4 B + 1 extra C = 5 × 0.40 = 2.00; A: 4 × 0.20 = 0.80
    expect(result.C).toBe(0.60);
    expect(result.B).toBe(2.00);
    expect(result.A).toBe(0.80);
    expect(result.total).toBe(3.40);
  });

  it('an extra C fills ONE missing A at 0.20, never 0.60 or three A\'s', () => {
    // Competition I: A2 B6 C2 — C is extra, A is missing two.
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 2, B: 6, C: 2 }, required);
    // C slot 0.60; B slots 2.40; A slots: 2 A + 1 C = 3 × 0.20 = 0.60.
    expect(result.A).toBe(0.60);
    expect(result.total).toBe(3.60);
    expect(result.counts).toEqual({ C: 1, B: 6, A: 3 });
    expect(result.shortfallFlag).toBe(true);
  });

  it('discards excess when all slots are full — A4 B6 C2 stays 3.80', () => {
    const required = getDifficultyRequirement('competition_1');
    const result = resolveDifficultyValue({ A: 4, B: 6, C: 2 }, required);
    // 1 C in slot + 0 cascaded (B full, A full) → extra C discarded
    expect(result.total).toBe(3.80);
  });
});

// User rule 2026-11-08: the most each class can score.
describe('copRules — difficulty maximum per class', () => {
  it('Competition I: A 0.80, B 2.40, C 0.60 (3.80)', () => {
    expect(difficultyClassMax(getDifficultyRequirement('competition_1'))).toEqual({ A: 0.8, B: 2.4, C: 0.6 });
  });
  it('Competition II and III: A 0.20, B 2.40, C 1.20 (3.80)', () => {
    for (const type of ['competition_2', 'competition_3']) {
      expect(difficultyClassMax(getDifficultyRequirement(type))).toEqual({ A: 0.2, B: 2.4, C: 1.2 });
    }
  });
  it('no class ever scores above its maximum, whatever the counts', () => {
    for (const type of ['competition_1', 'competition_2']) {
      const req = getDifficultyRequirement(type);
      const max = difficultyClassMax(req);
      for (let a = 0; a <= 10; a += 1) for (let b = 0; b <= 10; b += 1) for (let c = 0; c <= 10; c += 1) {
        const r = resolveDifficultyValue({ A: a, B: b, C: c }, req);
        expect(r.A).toBeLessThanOrEqual(max.A);
        expect(r.B).toBeLessThanOrEqual(max.B);
        expect(r.C).toBeLessThanOrEqual(max.C);
        expect(r.total).toBeLessThanOrEqual(3.8);
      }
    }
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

  it('holds the tolerance breach back while a difficulty mismatch is open', () => {
    // Hierarchy: Difficulty / Combination are resolved first; tolerance only
    // shows once the slips agree.
    const panel = panelOf(4.0, [3.0, 3.0, 3.0, 3.0]);
    panel['Judge 1'].breakdown.difficulty = { aClass: 4, bClass: 5, cClass: 1, total: 3.4 };
    const result = analyzePanelMismatches(panel, 5);
    expect(result.hasBlockingMismatch).toBe(true);
    expect(result.toleranceMismatch).toBe(true);
    expect(result.hasToleranceBreach).toBe(false);
  });

  it('holds the tolerance breach back while a combination mismatch is open', () => {
    const panel = panelOf(4.0, [3.0, 3.0, 3.0, 3.0]);
    panel['Judge 2'].breakdown.combination = { checked: { 1: false }, total: 1.2 };
    const result = analyzePanelMismatches(panel, 5);
    expect(result.combinationMismatch).toBe(true);
    expect(result.hasToleranceBreach).toBe(false);
  });

  it('uses the tolerance table 0.10 / 0.20 / 0.30 / 0.40 / 0.50 / 1.00', () => {
    expect(getTolerance(9.99)).toBe(0.10);
    expect(getTolerance(9.00)).toBe(0.10);
    expect(getTolerance(8.99)).toBe(0.20);
    expect(getTolerance(8.999999999)).toBe(0.10); // float noise rounds to 9.00
    expect(getTolerance(8.00)).toBe(0.20);
    expect(getTolerance(7.50)).toBe(0.30);
    expect(getTolerance(6.00)).toBe(0.40);
    expect(getTolerance(5.99)).toBe(0.50);
    expect(getTolerance(5.00)).toBe(0.50);
    expect(getTolerance(4.99)).toBe(1.00);
    expect(getTolerance(0)).toBe(1.00);
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

describe('copRules — averageSlipBreakdown (published per-section average)', () => {
  // A stored slip: section totals plus the slip total, as the results feed ships it.
  const slip = (judgeRole, difficulty, combination, execution, bonus = 0) => ({
    judgeRole,
    difficultyScore: difficulty,
    combinationScore: combination,
    executionScore: execution,
    bonusScore: bonus,
    total: difficulty + combination + execution + bonus,
  });

  it('3 judges: every slip, each section divided by 3', () => {
    const b = averageSlipBreakdown([
      slip('SR_JUDGE', 3.8, 1.6, 3.0),
      slip('J1', 3.6, 1.4, 2.7),
      slip('J2', 3.4, 1.2, 2.4, 0.2),
    ], 3);
    expect(b.used).toBe(3);
    expect(b.difficulty).toBeCloseTo(3.6, 10);
    expect(b.combination).toBeCloseTo(1.4, 10);
    expect(b.execution).toBeCloseTo(2.7, 10);
    expect(b.bonus).toBeCloseTo(0.2 / 3, 10);
  });

  it('5 judges: Senior Judge left out, highest and lowest dropped, middle two ÷ 2', () => {
    const b = averageSlipBreakdown([
      slip('SR_JUDGE', 1.0, 1.0, 1.0),      // excluded however it scores
      slip('J1', 3.8, 1.6, 4.0),            // highest  → dropped
      slip('J2', 3.8, 1.6, 3.0),            // counted
      slip('J3', 3.6, 1.4, 2.6),            // counted
      slip('J4', 2.0, 1.0, 1.0),            // lowest   → dropped
    ], 5);
    expect(b.used).toBe(2);
    expect(b.difficulty).toBeCloseTo(3.7, 10);
    expect(b.combination).toBeCloseTo(1.5, 10);
    expect(b.execution).toBeCloseTo(2.8, 10);
    expect(b.bonus).toBe(0);
  });

  it('4 judges: scored as five — the Senior Judge fills the 4th seat, middle two ÷ 2', () => {
    const b = averageSlipBreakdown([
      slip('SR_JUDGE', 3.8, 1.6, 3.0),      // 8.4 — counted in the 4th seat
      slip('J1', 3.8, 1.6, 4.0),            // 9.4 — highest → dropped
      slip('J2', 3.6, 1.4, 2.6),            // 7.6 — counted
      slip('J3', 2.0, 1.0, 1.0),            // 4.0 — lowest  → dropped
    ], 4);
    expect(b.used).toBe(2);
    expect(b.difficulty).toBeCloseTo(3.7, 10);
    expect(b.combination).toBeCloseTo(1.5, 10);
    expect(b.execution).toBeCloseTo(2.8, 10);
  });

  it('adds up to the panel average calculateAverageMarks gives, at 4 and 5 judges', () => {
    const five = [
      slip('SR_JUDGE', 3.8, 1.6, 3.2),
      slip('J1', 3.8, 1.6, 3.9),
      slip('J2', 3.8, 1.4, 3.0),
      slip('J3', 3.6, 1.6, 2.8),
      slip('J4', 3.4, 1.2, 2.2),
    ];
    const b = averageSlipBreakdown(five, 5);
    const avg = calculateAverageMarks({
      seniorJudge: five[0].total, judge1: five[1].total, judge2: five[2].total,
      judge3: five[3].total, judge4: five[4].total,
    }, 5).executionAvg;
    expect(b.difficulty + b.combination + b.execution + b.bonus).toBeCloseTo(avg, 2);
  });

  it('infers the panel from the slips when the row has no panelSize, and reads the old SJ role', () => {
    const b = averageSlipBreakdown([
      slip('SJ', 3.8, 1.6, 3.0),
      slip('J1', 3.8, 1.6, 3.0),
      slip('J2', 3.8, 1.6, 3.0),
    ]);
    expect(b.panelSize).toBe(3);
    expect(b.used).toBe(3);
  });

  it('returns null when there are no slips', () => {
    expect(averageSlipBreakdown([], 5)).toBeNull();
    expect(averageSlipBreakdown(undefined, 3)).toBeNull();
  });

  it('describes which slips were averaged', () => {
    expect(describeSlipAverage({ used: 3, panelSize: 3 })).toBe('Averaged from 3 judge slips');
    expect(describeSlipAverage({ used: 2, panelSize: 5 })).toMatch(/middle 2 of Judges 1–4 — Senior Judge excluded/);
    expect(describeSlipAverage({ used: 2, panelSize: 4 })).toMatch(/Senior Judge \(4th seat\)/);
  });
});

describe('copRules — time deduction, short of 60 s as well as over 90 s', () => {
  it.each([
    [0, 0], [45, 0.5], [50, 0.5], [51, 0.4], [55, 0.3], [56, 0.3], [57, 0.2], [59, 0.2],
    [60, 0], [75, 0], [90, 0], [91, 0.2], [95, 0.3], [99, 0.4], [100, 0.5],
  ])('%is -> %f', (seconds, expected) => {
    expect(getTimeDeductionForTime(seconds)).toBe(expected);
  });
});

describe('panelMarksComplete — the server\'s rule for "every seated judge has marked"', () => {
  it('3 judges: any three marks', async () => {
    const { panelMarksComplete } = await import('./copRules');
    expect(panelMarksComplete({ seniorJudge: 8, judge1: 7, judge2: 7.5 }, 3)).toBe(true);
    expect(panelMarksComplete({ seniorJudge: 8, judge1: 7 }, 3)).toBe(false);
  });

  it('4 judges: the Senior Judge and three evaluators', async () => {
    const { panelMarksComplete } = await import('./copRules');
    expect(panelMarksComplete({ seniorJudge: 8.4, judge1: 6.8, judge2: 7.2, judge4: 0 }, 4)).toBe(false);
    expect(panelMarksComplete({ judge1: 6.8, judge2: 7.2, judge3: 7.6 }, 4)).toBe(false);
    expect(panelMarksComplete({ seniorJudge: 8.4, judge1: 6.8, judge2: 7.2, judge3: 7.6 }, 4)).toBe(true);
  });

  it('5 judges: the Senior Judge and four; unknown size never waits', async () => {
    const { panelMarksComplete } = await import('./copRules');
    expect(panelMarksComplete({ seniorJudge: 8, judge1: 7, judge2: 7, judge3: 7 }, 5)).toBe(false);
    expect(panelMarksComplete({ seniorJudge: 8, judge1: 7, judge2: 7, judge3: 7, judge4: 7 }, 5)).toBe(true);
    expect(panelMarksComplete({}, undefined)).toBe(true);
  });
});
