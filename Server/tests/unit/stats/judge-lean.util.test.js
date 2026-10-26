/**
 * The judge-lean arithmetic. These are the numbers an organiser may act on, so
 * the tests pin the FAIRNESS properties first: a judge who is strict with
 * everyone is never flagged, a judge cannot pull the reference toward
 * themself, and nothing is flagged on too little evidence.
 */

const {
  THRESHOLDS, median, panelDeviation, describe: describeDevs, compareGroups, stateKey, tCritical,
} = require('../../../src/utils/stats/judge-lean.util');
const { slipsBySeat } = require('../../../src/utils/scoring/slip-breakdown.util');

const slips = (marks) => Object.entries(marks).map(([judgeRole, total]) => ({
  judgeRole, total, difficultyScore: total / 3, combinationScore: 1.6, executionScore: total / 2,
}));

describe('panelDeviation', () => {
  test('is the mark minus the median of the OTHER judges', () => {
    const bySeat = slipsBySeat(slips({ SR_JUDGE: 8.0, J1: 8.2, J2: 8.4, J3: 9.4 }));
    // Others of J3: 8.0, 8.2, 8.4 → median 8.2
    expect(panelDeviation('Judge 3', bySeat).total).toBeCloseTo(1.2, 6);
    // Others of J1: 8.0, 8.4, 9.4 → median 8.4 (J1's own mark is not in it)
    expect(panelDeviation('Judge 1', bySeat).total).toBeCloseTo(-0.2, 6);
  });

  test('needs at least two other judges to compare against', () => {
    const bySeat = slipsBySeat(slips({ SR_JUDGE: 8.0, J1: 8.2 }));
    expect(THRESHOLDS.minOtherJudges).toBe(2);
    expect(panelDeviation('Judge 1', bySeat)).toBeNull();
  });

  test('ignores roles that are not panel seats', () => {
    const bySeat = slipsBySeat(slips({ CHIEF: 1, SR_JUDGE: 8.0, J1: 8.2, J2: 8.4 }));
    expect(Object.keys(bySeat).sort()).toEqual(['Judge 1', 'Judge 2', 'Senior Judge']);
  });
});

describe('compareGroups', () => {
  const noisy = (center, n, spread = 0.05) => Array.from({ length: n }, (_, i) => center + ((i % 3) - 1) * spread);

  test('a judge strict with EVERY team is not leaning toward any', () => {
    const teamA = noisy(-0.5, 8);
    const others = noisy(-0.5, 20);
    const result = compareGroups(teamA, others);
    expect(Math.abs(result.lean)).toBeLessThan(0.05);
    expect(result.flagged).toBe(false);
  });

  test('flags a consistent, sizeable lean with enough performances', () => {
    const result = compareGroups(noisy(0.45, 8), noisy(0.0, 20));
    expect(result.lean).toBeCloseTo(0.45, 2);
    expect(result.enough).toBe(true);
    expect(result.ci[0]).toBeGreaterThan(0);
    expect(result.flagged).toBe(true);
  });

  test('a lean in the other direction is flagged too', () => {
    expect(compareGroups(noisy(-0.4, 7), noisy(0.0, 15)).flagged).toBe(true);
  });

  test('never flags on fewer than the minimum performances', () => {
    const result = compareGroups(noisy(0.9, THRESHOLDS.minPerformances - 1), noisy(0, 20));
    expect(result.enough).toBe(false);
    expect(result.flagged).toBe(false);
  });

  test('never flags a lean below the minimum size, however consistent', () => {
    const result = compareGroups(noisy(0.2, 30, 0.01), noisy(0, 30, 0.01));
    expect(result.ci[0]).toBeGreaterThan(0);
    expect(result.flagged).toBe(false);
  });

  test('never flags when the interval includes zero', () => {
    const wild = [1.5, -1.0, 1.2, -0.8, 1.4, -0.6, 1.1];
    const result = compareGroups(wild, noisy(0, 20));
    expect(result.ci[0]).toBeLessThan(0);
    expect(result.flagged).toBe(false);
  });

  test('cannot compare when either side is empty', () => {
    expect(compareGroups([0.5, 0.5], []).lean).toBeNull();
    expect(compareGroups([], [0.5]).flagged).toBe(false);
  });
});

describe('helpers', () => {
  test('median of even and odd lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test('describe gives mean, mean |deviation| and an interval', () => {
    const d = describeDevs([0.1, -0.1, 0.3, -0.3]);
    expect(d.n).toBe(4);
    expect(d.mean).toBe(0);
    expect(d.meanAbs).toBe(0.2);
    expect(d.ci[0]).toBeLessThan(0);
    expect(d.ci[1]).toBeGreaterThan(0);
  });

  test('t critical values fall toward the normal value', () => {
    expect(tCritical(1)).toBeCloseTo(6.314, 3);
    expect(tCritical(10)).toBeCloseTo(1.812, 3);
    expect(tCritical(500)).toBeCloseTo(1.645, 3);
    expect(tCritical(0)).toBeNull();
  });

  test('state units compare case- and space-insensitively', () => {
    expect(stateKey(' Maharashtra ')).toBe(stateKey('maharashtra'));
    expect(stateKey('')).toBeNull();
  });
});
