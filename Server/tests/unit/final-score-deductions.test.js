const CalculationService = require('../../src/services/scoring/calculation.service');

/**
 * The Scorer's sheet is the last word on the final score.
 *
 * Two of the deductions it records cannot come off a judge's slip at all: the
 * time penalty is read off a stopwatch after the routine ends, and a Senior
 * Judge's late ruling has no field on the slip to go in. So the stored
 * finalScore is the panel average less what the Scorer entered — not the
 * average on its own.
 */
describe('finalScore applies the Scorer deductions', () => {
  const service = new CalculationService({
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
  });

  test('subtracts the time deduction and the other deduction', () => {
    // 8.633 − 0.30 (five seconds over 90) − 0.20 (Senior Judge's ruling)
    expect(service.calculateFinalScore({
      averageMarks: 8.633, deduction: 0.3, otherDeduction: 0.2,
    })).toBeCloseTo(8.133, 3);
  });

  test('is the average when the Scorer recorded nothing', () => {
    expect(service.calculateFinalScore({ averageMarks: 9.4 })).toBeCloseTo(9.4, 3);
  });

  test('never goes below zero, however large the deduction', () => {
    expect(service.calculateFinalScore({
      averageMarks: 0.4, deduction: 0.5, otherDeduction: 0.5,
    })).toBe(0);
  });

  test('ignores deductions that arrive as strings from a form', () => {
    expect(service.calculateFinalScore({
      averageMarks: 9.4, deduction: '0.30', otherDeduction: '',
    })).toBeCloseTo(9.1, 3);
  });
});
