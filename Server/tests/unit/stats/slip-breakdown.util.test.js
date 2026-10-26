/**
 * The published Difficulty / Combination / Execution average. The web twin
 * (Web/src/utils/scoring/copRules.js averageSlipBreakdown) is held to the same
 * answers by Web/src/utils/scoring/slipBreakdownSync.test.js.
 */

const { averageSlipBreakdown } = require('../../../src/utils/scoring/slip-breakdown.util');

const slip = (judgeRole, d, c, e, bonus = 0) => ({
  judgeRole, difficultyScore: d, combinationScore: c, executionScore: e, bonusScore: bonus, total: d + c + e + bonus,
});

describe('averageSlipBreakdown', () => {
  test('3 judges: all three slips', () => {
    const result = averageSlipBreakdown([
      slip('SR_JUDGE', 3.0, 1.6, 3.0), slip('J1', 3.2, 1.4, 3.1), slip('J2', 3.4, 1.6, 3.2),
    ], 3);
    expect(result.used).toBe(3);
    expect(result.difficulty).toBeCloseTo(3.2, 6);
    expect(result.combination).toBeCloseTo(1.5333333, 6);
    expect(result.countedSeats.sort()).toEqual(['Judge 1', 'Judge 2', 'Senior Judge']);
  });

  test('5 judges: Senior Judge out, high and low dropped, middle two averaged', () => {
    const result = averageSlipBreakdown([
      slip('SR_JUDGE', 1, 1, 1),
      slip('J1', 3.0, 1.6, 3.0), // 7.6 — lowest, dropped
      slip('J2', 3.2, 1.6, 3.2), // 8.0
      slip('J3', 3.4, 1.6, 3.4), // 8.4
      slip('J4', 3.8, 1.6, 4.0), // 9.4 — highest, dropped
    ], 5);
    expect(result.used).toBe(2);
    expect(result.countedSeats).toEqual(['Judge 2', 'Judge 3']);
    expect(result.difficulty).toBeCloseTo(3.3, 6);
    expect(result.execution).toBeCloseTo(3.3, 6);
  });

  test('4 judges: the Senior Judge fills the fourth seat', () => {
    const result = averageSlipBreakdown([
      slip('SR_JUDGE', 3.3, 1.6, 3.3), // 8.2
      slip('J1', 3.0, 1.6, 3.0), // 7.6 — dropped
      slip('J2', 3.2, 1.6, 3.2), // 8.0
      slip('J3', 3.8, 1.6, 4.0), // 9.4 — dropped
    ], 4);
    expect(result.countedSeats.sort()).toEqual(['Judge 2', 'Senior Judge']);
  });

  test('no slips → null', () => {
    expect(averageSlipBreakdown([], 3)).toBeNull();
    expect(averageSlipBreakdown(undefined)).toBeNull();
  });
});
