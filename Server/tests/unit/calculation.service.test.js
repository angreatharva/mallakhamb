/**
 * COP scoring correctness tests for CalculationService.
 *
 * These tests are pure unit tests that don't require MongoDB.
 * They test the core calculation logic directly.
 *
 * Covers the v2 spec panel-size branches (Section 4) and the difficulty
 * cascade rule (Section 3.2.1).
 */

const { calculateIndividualScore } = require('../../src/utils/scoring/calculation.util');
const {
  validateSlipBreakdown,
  getTolerance,
  getTimeDeduction,
  resolveDifficultyValue,
  getDifficultyRequirement
} = require('../../src/config/cop-rules');

describe('CalculationService — COP aggregation', () => {
  describe('calculateCompletePlayerScore — worked examples', () => {
    it('Example 1: chief 8.30 / panel 7.50,7.90,8.30,8.40 → 8.10, base NOT applied', () => {
      const result = calculateIndividualScore({
        playerId: 'p1',
        playerName: 'Example One',
        seniorJudge: 8.30, judge1: 7.50, judge2: 7.90, judge3: 8.30, judge4: 8.40
      });

      // exec avg = (7.90 + 8.30) / 2 = 8.10
      // diff = |8.30 - 8.10| = 0.20, tolerance for tier 8.00 = 0.20, diff NOT > tolerance
      expect(result.executionAverage).toBeCloseTo(8.10, 3);
      expect(result.toleranceUsed).toBe(0.20);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBeCloseTo(8.10, 3);
    });

    it('Example 2: chief 9.40 / panel 8.90,9.10,9.00,9.50 → base 9.225 applied', () => {
      const result = calculateIndividualScore({
        playerId: 'p2',
        playerName: 'Example Two',
        seniorJudge: 9.40, judge1: 8.90, judge2: 9.10, judge3: 9.00, judge4: 9.50
      });

      // Sorted: 8.90, 9.00, 9.10, 9.50 -> middle two: 9.00, 9.10
      // exec avg = (9.00 + 9.10) / 2 = 9.05
      // diff = |9.40 - 9.05| = 0.35, tolerance for tier 9.00 = 0.10, diff > tolerance
      // base = (9.05 + 9.40) / 2 = 9.225
      expect(result.executionAverage).toBeCloseTo(9.05, 3);
      expect(result.toleranceUsed).toBe(0.10);
      expect(result.baseScoreApplied).toBe(true);
      expect(result.averageMarks).toBeCloseTo(9.225, 3);
    });
  });

  describe('tolerance boundary — exactly at the tier limit stays within tolerance', () => {
    it('difference exactly equal to tolerance does NOT trigger base score', () => {
      // execAvg 8.00 (tier 0.20), chief 8.20 -> diff 0.20 == tolerance -> within.
      const result = calculateIndividualScore({
        playerId: 'p4',
        playerName: 'Boundary',
        seniorJudge: 8.20, judge1: 7.90, judge2: 8.00, judge3: 8.00, judge4: 8.10
      });
      expect(result.executionAverage).toBeCloseTo(8.00, 3);
      expect(result.toleranceUsed).toBe(0.20);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.averageMarks).toBeCloseTo(8.00, 3);
    });

    it('difference just over tolerance triggers base score', () => {
      // execAvg 8.00 (tier 0.20), chief 8.30 -> diff 0.30 > 0.20 -> base.
      const result = calculateIndividualScore({
        playerId: 'p5',
        playerName: 'Boundary Over',
        seniorJudge: 8.30, judge1: 7.90, judge2: 8.00, judge3: 8.00, judge4: 8.10
      });
      expect(result.baseScoreApplied).toBe(true);
      expect(result.averageMarks).toBeCloseTo((8.00 + 8.30) / 2, 3);
    });
  });
});

describe('cop-rules lookup tables', () => {
  it('getTolerance tiers', () => {
    expect(getTolerance(9.5)).toBe(0.10);
    expect(getTolerance(9.0)).toBe(0.10);
    expect(getTolerance(8.99)).toBe(0.20);
    expect(getTolerance(7.0)).toBe(0.30);
    expect(getTolerance(6.5)).toBe(0.40);
    expect(getTolerance(5.0)).toBe(0.50);
    expect(getTolerance(4.99)).toBe(1.00);
  });

  it('getTimeDeduction tiers', () => {
    expect(getTimeDeduction(0)).toBe(0);
    expect(getTimeDeduction(3)).toBe(0.20);
    expect(getTimeDeduction(5)).toBe(0.30);
    expect(getTimeDeduction(9)).toBe(0.40);
    expect(getTimeDeduction(10)).toBe(0.50);
  });
});

describe('validateSlipBreakdown — COP §3.3 ceilings', () => {
  it('accepts a valid full slip (10.00)', () => {
    const { valid } = validateSlipBreakdown({
      difficulty: { total: 3.80 },
      combination: { total: 1.60 },
      execution: 4.40,
      bonus: 0.20
    });
    expect(valid).toBe(true);
  });

  it('is a no-op (valid) when no breakdown supplied', () => {
    expect(validateSlipBreakdown(undefined).valid).toBe(true);
    expect(validateSlipBreakdown({}).valid).toBe(true);
  });

  it('rejects difficulty over 3.80', () => {
    const { valid, error } = validateSlipBreakdown({ difficulty: { total: 4.00 } });
    expect(valid).toBe(false);
    expect(error).toMatch(/Difficulty/);
  });

  it('rejects execution over 4.40', () => {
    expect(validateSlipBreakdown({ execution: 4.50 }).valid).toBe(false);
  });

  it('rejects a bonus that is neither 0 nor 0.20', () => {
    expect(validateSlipBreakdown({ bonus: 0.10 }).valid).toBe(false);
    expect(validateSlipBreakdown({ bonus: 0.20 }).valid).toBe(true);
    expect(validateSlipBreakdown({ bonus: 0 }).valid).toBe(true);
  });

  it('reads legacy originality key as bonus', () => {
    expect(validateSlipBreakdown({ originality: 0.20 }).valid).toBe(true);
    expect(validateSlipBreakdown({ originality: 0.15 }).valid).toBe(false);
  });
});

describe('calculateTimeDeduction — COP §3.5 tiered table', () => {
  // Test the getTimeDeduction helper directly
  // COP §3.5: overage <=3s -> 0.20, <=5s -> 0.30, <=9s -> 0.40, >=10s -> 0.50
  it.each([
    [0, 0],      // no overage
    [1, 0.20],   // 1s over = 0.20 (threshold is <=3, not >3)
    [3, 0.20],   // exactly +3s = 0.20
    [4, 0.30],   // between 3-5s = 0.30
    [5, 0.30],   // exactly +5s = 0.30
    [6, 0.40],   // between 5-9s = 0.40
    [9, 0.40],   // exactly +9s = 0.40
    [10, 0.50],  // >=10s = 0.50
    [20, 0.50],  // well over = 0.50
  ])('overage %is -> deduction %f', (overage, expected) => {
    expect(getTimeDeduction(overage)).toBe(expected);
  });
});

describe('Panel Size Branches (v2 §4)', () => {
  describe('4.2 — 3-Judge Panel', () => {
    it('simple average of all 3 judge totals, no base-score concept', () => {
      const result = calculateIndividualScore({
        panelSize: 3,
        judge1: 8.5, judge2: 8.7, judge3: 8.9
      });
      expect(result.method).toBe('3_JUDGE_SIMPLE_AVERAGE');
      expect(result.executionAverage).toBeCloseTo(8.7, 3);
      expect(result.averageMarks).toBeCloseTo(8.7, 3);
      expect(result.baseScoreApplied).toBe(false);
      expect(result.toleranceUsed).toBe(0);
    });

    it('infers 3-judge panel when only 3 scores provided without panelSize', () => {
      const result = calculateIndividualScore({
        judge1: 8.0, judge2: 8.5, judge3: 9.0
      });
      expect(result.method).toBe('3_JUDGE_SIMPLE_AVERAGE');
    });
  });

  describe('4.3 — 4-Judge Panel (Sr. Judge acts as Chief AND fills the 4th slot)', () => {
    it('drops high/low from the pool the Chief completes', () => {
      const result = calculateIndividualScore({
        panelSize: 4,
        seniorJudge: 9.0, // acts as Chief, and as the fourth evaluator
        judge2: 8.5, judge3: 8.7, judge4: 9.2
      });
      expect(result.method).toBe('4_JUDGE_AS_5_JUDGE_EQUIVALENT');
      // Pool [8.5, 8.7, 9.0, 9.2] → drop 8.5 and 9.2 → (8.7 + 9.0) / 2 = 8.85.
      // The Chief's 9.0 is neither highest nor lowest, so it survives the drop
      // and sits inside the average it is then tolerance-checked against.
      expect(result.executionAverage).toBeCloseTo(8.85, 3);
      // A real evaluation mark is always discarded: 8.5 and 9.2 both came from
      // evaluators, and only three evaluators marked.
      expect(result.baseScoreApplied).toBe(false);
    });
  });

  describe('4.4 — 5-Judge Panel (Standard COP)', () => {
    it('drops high/low of 4 eval judges, averages middle two', () => {
      const result = calculateIndividualScore({
        panelSize: 5,
        seniorJudge: 9.4, // Chief
        judge1: 8.9, judge2: 9.1, judge3: 9.0, judge4: 9.5
      });
      expect(result.method).toBe('5_JUDGE_STANDARD_COP');
      // Sorted: 8.9, 9.0, 9.1, 9.5 -> middle two: 9.0, 9.1 -> avg = 9.05
      expect(result.executionAverage).toBeCloseTo(9.05, 3);
    });
  });
});

describe('Difficulty Cascade (v2 §3.2.1)', () => {
  it('works with Competition I required mix (A4/B6/C1)', () => {
    const required = getDifficultyRequirement('competition_1');
    // Performer executes {A: 0, B: 5, C: 2}
    const result = resolveDifficultyValue({ A: 0, B: 5, C: 2 }, required);
    // C: 1 in C slot + 1 filling B slot = 2 C elements × 0.60 = 1.20
    // B: 5 × 0.40 = 2.00
    // A: 0
    expect(result.C).toBe(1.20);
    expect(result.B).toBe(2.00);
    expect(result.A).toBe(0.00);
    expect(result.total).toBe(3.20);
    expect(result.shortfallFlag).toBe(true); // missing A elements
  });

  it('works with Competition II/III required mix (A1/B6/C2)', () => {
    const required = getDifficultyRequirement('competition_2');
    // Exact match
    const result = resolveDifficultyValue({ A: 1, B: 6, C: 2 }, required);
    expect(result.total).toBe(3.80);
    expect(result.shortfallFlag).toBe(false);
  });

  it('cascades excess C to B and A, keeping original C value', () => {
    const required = { A: 2, B: 3, C: 1 };
    // Executes {A: 0, B: 1, C: 3}
    // cInC=1, cExcess=2. bInB=1, bSlotsLeft=2, cInB=2 → cExcess=0
    // aInA=0, no excess C/B to fill A → shortfall on A
    // C: (1+2)*0.60=1.80, B: 1*0.40=0.40, A: 0
    const result = resolveDifficultyValue({ A: 0, B: 1, C: 3 }, required);
    expect(result.C).toBe(1.80);
    expect(result.B).toBe(0.40);
    expect(result.A).toBe(0.00);
    expect(result.total).toBe(2.20);
    expect(result.shortfallFlag).toBe(true); // missing A elements
  });
});