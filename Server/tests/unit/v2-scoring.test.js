/**
 * v2 Spec Scoring Tests
 *
 * Unit tests derived from the worked examples in "Mallakhamb Judging Software v2.md":
 *   - §12: 5-judge panel within tolerance (8.30/7.50/7.90/8.30/8.40 → 8.10)
 *   - §12: 5-judge panel exceeding tolerance (9.40/8.90/9.10/9.00/9.50 → base score 9.225)
 *   - §3.2.1: Difficulty cascade (Competition I, {A:0, B:5, C:2} → 3.00)
 *   - §4.2: 3-judge panel simple average — no tolerance check
 *   - §4.3: 4-judge panel as 5-judge equivalent — no high/low drop but tolerance check
 *   - §7: Tie-break 4-step cascade
 *   - §11: Hanging Mallakhamb / Female hard block
 */

const { calculateIndividualScore } = require('../../src/utils/scoring/calculation.util');
const { resolveDifficultyValue, getTolerance, getTimeDeduction, isApparatusAllowedForGender } = require('../../src/config/cop-rules');
const { applyTieBreaker, determineTieBreakerWinner, areTied } = require('../../src/utils/scoring/tie-breaker.util');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Five-Judge Panel — within tolerance (v2 §12 worked example #1)
// ─────────────────────────────────────────────────────────────────────────────
describe('5-Judge Panel Scoring (Standard COP)', () => {
  test('within tolerance: Chief 8.30, J1-J4 = 7.50/7.90/8.30/8.40 → avg 8.10', () => {
    // Chief = 8.30, Eval judges J1=7.50, J2=7.90, J3=8.30, J4=8.40
    // Sorted eval: [7.50, 7.90, 8.30, 8.40] → drop high/low → middle [7.90, 8.30]
    // avgScore = (7.90 + 8.30) / 2 = 8.10
    // Tolerance for 8.10 (in [8.00, 9.00)) = 0.20
    // |8.30 - 8.10| = 0.20 ≤ 0.20 → within tolerance
    // finalScore = avgScore = 8.10
    const result = calculateIndividualScore({
      seniorJudge: 8.30,
      judge1: 7.50,
      judge2: 7.90,
      judge3: 8.30,
      judge4: 8.40
    });

    expect(result.method).toBe('5_JUDGE_STANDARD_COP');
    expect(result.executionAverage).toBeCloseTo(8.10, 2);
    expect(result.baseScoreApplied).toBe(false);
    expect(result.averageMarks).toBeCloseTo(8.10, 2);
  });

  test('exceeding tolerance: Chief 9.40, J1-J4 = 8.90/9.10/9.00/9.50 → base 9.225', () => {
    // Chief = 9.40, Eval judges J1=8.90, J2=9.10, J3=9.00, J4=9.50
    // Sorted eval: [8.90, 9.00, 9.10, 9.50] → drop high/low → middle [9.00, 9.10]
    // avgScore = (9.00 + 9.10) / 2 = 9.05
    // Tolerance for 9.05 (in [9.00, 10.00]) = 0.10
    // |9.40 - 9.05| = 0.35 > 0.10 → tolerance EXCEEDED
    // baseScore = (9.05 + 9.40) / 2 = 9.225
    const result = calculateIndividualScore({
      seniorJudge: 9.40,
      judge1: 8.90,
      judge2: 9.10,
      judge3: 9.00,
      judge4: 9.50
    });

    expect(result.method).toBe('5_JUDGE_STANDARD_COP');
    expect(result.executionAverage).toBeCloseTo(9.05, 2);
    expect(result.baseScoreApplied).toBe(true);
    expect(result.baseScore).toBeCloseTo(9.225, 3);
    expect(result.averageMarks).toBeCloseTo(9.225, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Three-Judge Panel — simple average, no chief (v2 §4.2)
// ─────────────────────────────────────────────────────────────────────────────
describe('3-Judge Panel Scoring', () => {
  test('simple average of 3 judges, no tolerance check', () => {
    const result = calculateIndividualScore({
      seniorJudge: 0,
      judge1: 7.00,
      judge2: 8.00,
      judge3: 7.50,
      judge4: 0
    }, 3);

    expect(result.method).toBe('3_JUDGE_SIMPLE_AVERAGE');
    expect(result.executionAverage).toBeCloseTo(7.50, 2);
    expect(result.baseScoreApplied).toBe(false);
    expect(result.baseScore).toBe(0);
    expect(result.toleranceUsed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Four-Judge Panel — 5-judge equivalent, no high/low drop (v2 §4.3)
// ─────────────────────────────────────────────────────────────────────────────
describe('4-Judge Panel Scoring (as 5-judge equivalent)', () => {
  test('averages all 3 eval judges (no drop), applies tolerance vs Sr. Judge', () => {
    // Sr. Judge (Chief role) = 8.50, J2=8.00, J3=8.20, J4=8.40
    // Eval scores (all 3, no drop): avg = (8.00 + 8.20 + 8.40) / 3 = 8.20
    // Tolerance for 8.20 (in [8.00, 9.00)) = 0.20
    // |8.50 - 8.20| = 0.30 > 0.20 → tolerance EXCEEDED
    // baseScore = (8.20 + 8.50) / 2 = 8.35
    const result = calculateIndividualScore({
      seniorJudge: 8.50,
      judge1: 8.00,
      judge2: 8.20,
      judge3: 8.40,
      judge4: 0
    }, 4);

    expect(result.method).toBe('4_JUDGE_AS_5_JUDGE_EQUIVALENT');
    expect(result.executionAverage).toBeCloseTo(8.20, 2);
    expect(result.baseScoreApplied).toBe(true);
    expect(result.baseScore).toBeCloseTo(8.35, 2);
  });

  test('within tolerance: no base score applied', () => {
    // Sr. Judge = 8.10, J2=8.00, J3=8.10, J4=8.20
    // Eval avg = (8.00 + 8.10 + 8.20) / 3 = 8.10
    // Tolerance for 8.10 = 0.20
    // |8.10 - 8.10| = 0.00 ≤ 0.20 → within tolerance
    const result = calculateIndividualScore({
      seniorJudge: 8.10,
      judge1: 8.00,
      judge2: 8.10,
      judge3: 8.20,
      judge4: 0
    }, 4);

    expect(result.method).toBe('4_JUDGE_AS_5_JUDGE_EQUIVALENT');
    expect(result.baseScoreApplied).toBe(false);
    expect(result.averageMarks).toBeCloseTo(8.10, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tolerance Limit Table (v2 §3.4)
// ─────────────────────────────────────────────────────────────────────────────
describe('Tolerance Limit Table', () => {
  test.each([
    [10.00, 0.10],
    [9.50, 0.10],
    [9.00, 0.10],
    [8.99, 0.20],
    [8.00, 0.20],
    [7.50, 0.30],
    [7.00, 0.30],
    [6.50, 0.40],
    [6.00, 0.40],
    [5.50, 0.50],
    [5.00, 0.50],
    [4.99, 1.00],
    [3.00, 1.00],
    [0.00, 1.00],
  ])('getTolerance(%f) = %f', (score, expected) => {
    expect(getTolerance(score)).toBeCloseTo(expected, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Time Deduction Table (v2 §3.5)
// ─────────────────────────────────────────────────────────────────────────────
describe('Time Deduction Table', () => {
  test.each([
    [-5, 0],
    [0, 0],
    [1, 0.20],
    [3, 0.20],
    [4, 0.30],
    [5, 0.30],
    [6, 0.40],
    [9, 0.40],
    [10, 0.50],
    [15, 0.50],
  ])('getTimeDeduction(%d overage) = %f', (overage, expected) => {
    expect(getTimeDeduction(overage)).toBeCloseTo(expected, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Difficulty Cascade (v2 §3.2.1 worked example)
// ─────────────────────────────────────────────────────────────────────────────
describe('Difficulty Cascade (C→B→A)', () => {
  test('Competition I: {A:0, B:5, C:2} → total 3.00 (spec worked example)', () => {
    // Required: A:4, B:6, C:1
    // Step 1 — C: required 1, executed 2. c_used=1 (→0.60), c_excess=1
    // Step 2 — B: pool=5+1=6, required 6. b_used=6 (→2.40), b_excess=0
    // Step 3 — A: pool=0+0=0, required 4. a_used=0 (→0.00). shortfall=TRUE
    // Total = 0.60 + 2.40 + 0.00 = 3.00
    const result = resolveDifficultyValue(
      { A: 0, B: 5, C: 2 },
      { A: 4, B: 6, C: 1 }
    );

    expect(result.C).toBeCloseTo(0.60, 2);
    expect(result.B).toBeCloseTo(2.40, 2);
    expect(result.A).toBeCloseTo(0.00, 2);
    expect(result.total).toBeCloseTo(3.00, 2);
    expect(result.shortfallFlag).toBe(true);
  });

  test('Competition I: exact match {A:4, B:6, C:1} → total 3.80', () => {
    const result = resolveDifficultyValue(
      { A: 4, B: 6, C: 1 },
      { A: 4, B: 6, C: 1 }
    );

    expect(result.total).toBeCloseTo(3.80, 2);
    expect(result.shortfallFlag).toBe(false);
  });

  test('Competition II/III: exact match {A:1, B:6, C:2} → total 3.80', () => {
    const result = resolveDifficultyValue(
      { A: 1, B: 6, C: 2 },
      { A: 1, B: 6, C: 2 }
    );

    expect(result.total).toBeCloseTo(3.80, 2);
    expect(result.shortfallFlag).toBe(false);
  });

  test('excess C cascades to B, excess B cascades to A', () => {
    // Competition II/III required: A:1, B:6, C:2
    // Executed: A:0, B:4, C:5
    // Step 1 — C: c_used=2 (→1.20), c_excess=3
    // Step 2 — B: pool=4+3=7, b_used=6 (→2.40), b_excess=1
    // Step 3 — A: pool=0+1=1, a_used=1 (→0.20), no shortfall on A
    // Total = 1.20 + 2.40 + 0.20 = 3.80, shortfall=false (all met!)
    const result = resolveDifficultyValue(
      { A: 0, B: 4, C: 5 },
      { A: 1, B: 6, C: 2 }
    );

    expect(result.C).toBeCloseTo(1.20, 2);
    expect(result.B).toBeCloseTo(2.40, 2);
    expect(result.A).toBeCloseTo(0.20, 2);
    expect(result.total).toBeCloseTo(3.80, 2);
    expect(result.shortfallFlag).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Tie-Break Engine (v2 §7)
// ─────────────────────────────────────────────────────────────────────────────
describe('Tie-Break Engine (v2 4-step cascade)', () => {
  test('Step 1: resolved by base_score difference', () => {
    const result = determineTieBreakerWinner(
      { finalScore: 8.00, baseScore: 8.10, averageMarks: 8.00, executionAverage: 8.00 },
      { finalScore: 8.00, baseScore: 7.90, averageMarks: 8.00, executionAverage: 8.00 }
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(1);
    expect(result.reason).toBe('base_score');
    expect(result.isTieBreaker).toBe(true);
  });

  test('Step 2: resolved by avg eval judges (excluding chief)', () => {
    const result = determineTieBreakerWinner(
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.10, panelSize: 5 },
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 7.90, panelSize: 5 }
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(2);
    expect(result.reason).toBe('avg_eval_judges');
  });

  test('Step 3: resolved by (avg + chief) / 2', () => {
    const result = determineTieBreakerWinner(
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, chiefScore: 8.50, panelSize: 5 },
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, chiefScore: 7.50, panelSize: 5 }
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(3);
    expect(result.reason).toBe('avg_plus_chief');
  });

  test('Step 4: all steps exhausted → lucky draw required', () => {
    const result = determineTieBreakerWinner(
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, chiefScore: 8.00, panelSize: 5 },
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, chiefScore: 8.00, panelSize: 5 }
    );

    expect(result.winner).toBe('tie');
    expect(result.step).toBe(4);
    expect(result.reason).toBe('lucky_draw_required');
  });

  test('3-judge panel: skips Steps 2-3, goes to Step 4 (lucky draw)', () => {
    const result = determineTieBreakerWinner(
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, panelSize: 3 },
      { finalScore: 8.00, baseScore: 8.00, averageMarks: 8.00, executionAverage: 8.00, panelSize: 3 }
    );

    expect(result.winner).toBe('tie');
    expect(result.step).toBe(4);
  });

  test('applyTieBreaker sorts a list of players', () => {
    const players = [
      { finalScore: 8.00, baseScore: 7.90, averageMarks: 7.90, executionAverage: 7.90 },
      { finalScore: 9.00, baseScore: 9.00, averageMarks: 9.00, executionAverage: 9.00 },
      { finalScore: 8.00, baseScore: 8.10, averageMarks: 8.10, executionAverage: 8.10 },
    ];

    const sorted = applyTieBreaker(players);

    // 9.00 first, then the 8.10 base_score, then 7.90 base_score
    expect(sorted[0].finalScore).toBe(9.00);
    expect(sorted[1].baseScore).toBe(8.10);
    expect(sorted[2].baseScore).toBe(7.90);
  });

  test('areTied returns true for identical scores with no chief', () => {
    expect(areTied(
      { finalScore: 7.50, baseScore: 7.50, averageMarks: 7.50, executionAverage: 7.50, panelSize: 3 },
      { finalScore: 7.50, baseScore: 7.50, averageMarks: 7.50, executionAverage: 7.50, panelSize: 3 }
    )).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Hanging Mallakhamb / Female Hard Block (v2 §11)
// ─────────────────────────────────────────────────────────────────────────────
describe('Apparatus Gender Restrictions', () => {
  test('Hanging Mallakhamb is NOT allowed for Female', () => {
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Female')).toBe(false);
  });

  test('Hanging Mallakhamb IS allowed for Male', () => {
    expect(isApparatusAllowedForGender('Hanging Mallakhamb', 'Male')).toBe(true);
  });

  test('Pole Mallakhamb is allowed for Female', () => {
    expect(isApparatusAllowedForGender('Pole Mallakhamb', 'Female')).toBe(true);
  });

  test('Rope Mallakhamb is allowed for Female', () => {
    expect(isApparatusAllowedForGender('Rope Mallakhamb', 'Female')).toBe(true);
  });

  test('short label "Hanging" is also blocked for Female', () => {
    expect(isApparatusAllowedForGender('Hanging', 'Female')).toBe(false);
  });
});
