/**
 * v2 Spec Scoring Tests
 *
 * Unit tests derived from the worked examples in "Mallakhamb Judging Software v2.md":
 *   - §12: 5-judge panel within tolerance (8.30/7.50/7.90/8.30/8.40 → 8.10)
 *   - §12: 5-judge panel exceeding tolerance (9.40/8.90/9.10/9.00/9.50 → base score 9.225)
 *   - §3.2.1: Difficulty cascade (Competition I, {A:0, B:5, C:2} → 3.00)
 *   - §4.2: 3-judge panel simple average — no tolerance check
 *   - §4.3: 4-judge panel as 5-judge equivalent — no high/low drop but tolerance check
 *   - Tie-breaks by panel size: 3 judges on time; 4/5 judges by COP 1.12.1-1.12.3
 *     (base score, then average of the four judges, then (that average + Chief) / 2)
 *   - §11: Hanging Mallakhamb / Female hard block
 */

const { calculateIndividualScore } = require('../../src/utils/scoring/calculation.util');
const { resolveDifficultyValue, getTolerance, getTimeDeduction, isApparatusAllowedForGender } = require('../../src/config/cop-rules');
const { applyTieBreaker, determineTieBreakerWinner, areTied, baseScoreOf } = require('../../src/utils/scoring/tie-breaker.util');

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

  test('Senior + J1 + J2 (common 3-judge assignment) averages all three totals', () => {
    // Live panels often put Senior in the chief slot even on a 3-judge panel.
    // Avg = (0.80 + 0.70 + 0.90) / 3 = 0.80
    const result = calculateIndividualScore({
      seniorJudge: 0.80,
      judge1: 0.70,
      judge2: 0.90,
      judge3: 0,
      judge4: 0
    }, 3);

    expect(result.method).toBe('3_JUDGE_SIMPLE_AVERAGE');
    expect(result.averageMarks).toBeCloseTo(0.80, 2);
    expect(result.baseScoreApplied).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Four-Judge Panel — the Chief fills the vacant 4th slot, then 5-judge COP
// ─────────────────────────────────────────────────────────────────────────────
describe('4-Judge Panel Scoring (as 5-judge equivalent)', () => {
  test('copies the Sr. Judge into the 4th slot, drops high/low, averages the middle two', () => {
    // Sr. Judge (Chief) = 8.50, J1=8.00, J2=8.20, J3=8.40
    // Pool with the Chief as the 4th evaluator: [8.00, 8.20, 8.40, 8.50]
    // Drop 8.00 and 8.50 → middle two = 8.20, 8.40 → avg = 8.30
    // Tolerance for 8.30 (in [8.00, 9.00)) = 0.20
    // |8.50 - 8.30| = 0.20, which is NOT greater than 0.20 → within tolerance
    const result = calculateIndividualScore({
      seniorJudge: 8.50,
      judge1: 8.00,
      judge2: 8.20,
      judge3: 8.40,
      judge4: 0
    }, 4);

    expect(result.method).toBe('4_JUDGE_AS_5_JUDGE_EQUIVALENT');
    expect(result.executionAverage).toBeCloseTo(8.30, 2);
    expect(result.baseScoreApplied).toBe(false);
    expect(result.averageMarks).toBeCloseTo(8.30, 2);
  });

  test('a Chief far from the panel is dropped from the pool and still breaches tolerance', () => {
    // Sr. Judge = 9.40, J1=8.00, J2=8.40, J3=8.60
    // Pool: [8.00, 8.40, 8.60, 9.40] → drop 8.00 and 9.40 → (8.40 + 8.60) / 2 = 8.50
    // |9.40 - 8.50| = 0.90 > 0.20 → base = (8.50 + 9.40) / 2 = 8.95
    const result = calculateIndividualScore({
      seniorJudge: 9.40,
      judge1: 8.00,
      judge2: 8.40,
      judge3: 8.60,
      judge4: 0
    }, 4);

    expect(result.executionAverage).toBeCloseTo(8.50, 2);
    expect(result.baseScoreApplied).toBe(true);
    expect(result.baseScore).toBeCloseTo(8.95, 2);
  });

  test('within tolerance: no base score applied', () => {
    // Sr. Judge = 8.10, J1=8.00, J2=8.10, J3=8.20
    // Pool: [8.00, 8.10, 8.10, 8.20] → drop 8.00 and 8.20 → (8.10 + 8.10) / 2 = 8.10
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

  test('matches the 5-judge branch exactly when the Chief is duplicated by hand', () => {
    // The rule in one assertion: a 4-judge panel IS the 5-judge panel whose
    // fourth evaluator happens to hold the Chief's mark.
    const asFour = calculateIndividualScore(
      { seniorJudge: 8.50, judge1: 8.00, judge2: 8.20, judge3: 8.40, judge4: 0 }, 4
    );
    const asFive = calculateIndividualScore(
      { seniorJudge: 8.50, judge1: 8.00, judge2: 8.20, judge3: 8.40, judge4: 8.50 }, 5
    );

    expect(asFour.executionAverage).toBeCloseTo(asFive.executionAverage, 3);
    expect(asFour.averageMarks).toBeCloseTo(asFive.averageMarks, 3);
    expect(asFour.baseScoreApplied).toBe(asFive.baseScoreApplied);
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
  test('Competition I: {A:0, B:5, C:2} → total 3.20 (C keeps 0.60 value when filling B slot)', () => {
    // Required: A:4, B:6, C:1
    // Step 1 — C: required 1, executed 2. cInC=1, cExcess=1
    // Step 2 — B: 5 orig B fill 5 of 6 slots, 1 excess C fills 1 more → bSlotsFilled=6
    // Step 3 — A: 0 orig A → shortfall=TRUE
    // Points: C=(1+1)*0.60=1.20, B=5*0.40=2.00, A=0 → total=3.20
    const result = resolveDifficultyValue(
      { A: 0, B: 5, C: 2 },
      { A: 4, B: 6, C: 1 }
    );

    expect(result.C).toBeCloseTo(1.20, 2);
    expect(result.B).toBeCloseTo(2.00, 2);
    expect(result.A).toBeCloseTo(0.00, 2);
    expect(result.total).toBeCloseTo(3.20, 2);
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

  test('excess C cascades to B then A, keeping C value — capped at 3.80', () => {
    // Competition II/III required: A:1, B:6, C:2
    // Executed: A:0, B:4, C:5
    // cInC=2, cExcess=3. bInB=4, cInB=2 (fills 2 empty B slots), cExcess=1.
    // aInA=0, cInA=1 (fills 1 of 1 A slot).
    // C=(2+2+1)*0.60=3.00, B=4*0.40=1.60, A=0 → raw=4.60, capped to 3.80
    const result = resolveDifficultyValue(
      { A: 0, B: 4, C: 5 },
      { A: 1, B: 6, C: 2 }
    );

    expect(result.C).toBeCloseTo(3.00, 2);
    expect(result.B).toBeCloseTo(1.60, 2);
    expect(result.A).toBeCloseTo(0.00, 2);
    expect(result.total).toBeCloseTo(3.80, 2);
    expect(result.shortfallFlag).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Tie-Breaks — decided by the size of the panel that judged the performance
// ─────────────────────────────────────────────────────────────────────────────
describe('Tie-Breaks on a 3-judge panel (1 senior + 2 evaluation)', () => {
  const onTime = (time, judgeScores = { seniorJudge: 8, judge1: 8, judge2: 8 }) => ({
    finalScore: 8.00, panelSize: 3, time, judgeScores
  });

  test('the faster time takes the placing', () => {
    const result = determineTieBreakerWinner(onTime('1:28'), onTime('1:30'));

    expect(result.winner).toBe('A');
    expect(result.step).toBe(1);
    expect(result.reason).toBe('faster_time');
    expect(result.isTieBreaker).toBe(true);
  });

  test('a time stored as plain seconds reads the same as "MM:SS"', () => {
    expect(determineTieBreakerWinner(onTime('88'), onTime('1:30')).winner).toBe('A');
    expect(determineTieBreakerWinner(onTime('1:30'), onTime(90)).winner).toBe('tie');
  });

  test('the senior judge is NOT consulted — the clock is the whole rule', () => {
    const slowerButBetterMarked = onTime('1:31', { seniorJudge: 9.5, judge1: 8, judge2: 8 });
    const fasterButWorseMarked = onTime('1:29', { seniorJudge: 7.0, judge1: 8, judge2: 8 });

    const result = determineTieBreakerWinner(slowerButBetterMarked, fasterButWorseMarked);

    expect(result.winner).toBe('B');
    expect(result.reason).toBe('faster_time');
  });

  test('identical times stay tied', () => {
    const result = determineTieBreakerWinner(onTime('1:30'), onTime('1:30'));

    expect(result.winner).toBe('tie');
    expect(result.reason).toBe('identical_time');
  });

  test('a missing time cannot break the tie, so the tie stands', () => {
    expect(determineTieBreakerWinner(onTime(''), onTime('1:30')).reason).toBe('time_unavailable');
    expect(determineTieBreakerWinner(onTime('1:28'), onTime(undefined)).winner).toBe('tie');
  });
});

describe('Tie-Breaks on a 4-judge panel (1 senior + 3 evaluation) — COP §1.12', () => {
  // The Sr. Judge is the Chief AND fills the vacant fourth evaluation slot.
  const panel = (seniorJudge, judge1, judge2, judge3, extra = {}) => ({
    finalScore: 8.00,
    panelSize: 4,
    judgeScores: { seniorJudge, judge1, judge2, judge3, ...extra }
  });

  test('1.12.1: the higher base score takes the placing', () => {
    // A: four slots [8.0, 8.0, 8.0, 8.5] → middle two 8.0 → (8.0 + 8.5) / 2 = 8.25
    // B: four slots [8.0, 8.0, 8.0, 8.2] → middle two 8.0 → (8.0 + 8.2) / 2 = 8.10
    const result = determineTieBreakerWinner(
      panel(8.5, 8.0, 8.0, 8.0),
      panel(8.2, 8.0, 8.0, 8.0)
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(1);
    expect(result.reason).toBe('base_score');
  });

  test('1.12.2: base scores agree, so the average of the four judges decides', () => {
    // A slots [8.0, 8.0, 8.6, 8.0], B slots [8.0, 8.0, 8.0, 8.0]: middle two
    // are 8.0 for both, so both base scores are 8.0.
    // Average of four: A 32.6 / 4 = 8.15, B 32.0 / 4 = 8.00.
    const result = determineTieBreakerWinner(
      panel(8.0, 8.0, 8.0, 8.6),
      panel(8.0, 8.0, 8.0, 8.0)
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(2);
    expect(result.reason).toBe('four_judge_average');
  });

  test('a stray judge4 mark is ignored — the fourth slot is the Sr. Judge', () => {
    // A: slots [8.0, 8.0, 8.0, 8.0] (the 10 is not read) → average 8.00
    // B: slots [8.0, 8.0, 8.2, 8.0] → same base score 8.0, average 8.05
    const result = determineTieBreakerWinner(
      panel(8.0, 8.0, 8.0, 8.0, { judge4: 10 }),
      panel(8.0, 8.0, 8.0, 8.2)
    );

    expect(result.winner).toBe('B');
    expect(result.reason).toBe('four_judge_average');
  });

  test('the same marks in different seats stay tied', () => {
    const result = determineTieBreakerWinner(
      panel(8.0, 8.4, 7.6, 8.0),
      panel(8.0, 7.6, 8.4, 8.0)
    );

    expect(result.winner).toBe('tie');
    expect(result.step).toBe(3);
    expect(result.reason).toBe('identical_panel_scores');
  });
});

describe('Tie-Breaks on a 5-judge panel (1 Chief + 4 evaluation) — COP §1.12', () => {
  const panel = (seniorJudge, judge1, judge2, judge3, judge4) => ({
    finalScore: 8.00,
    panelSize: 5,
    judgeScores: { seniorJudge, judge1, judge2, judge3, judge4 }
  });

  test('the base score is COP §2.1.3 — worked example: Chief 9.40, judges 8.90/9.10/9.00/9.50 → 9.225', () => {
    expect(baseScoreOf(panel(9.40, 8.90, 9.10, 9.00, 9.50))).toBeCloseTo(9.225, 6);
  });

  test('the base score is calculated even when it was not applied to the final score', () => {
    // The §2.1.2 example is within tolerance (final = 8.10), yet the tie-break
    // still reads its base score: (8.10 + 8.30) / 2 = 8.20.
    expect(baseScoreOf(panel(8.30, 7.50, 7.90, 8.30, 8.40))).toBeCloseTo(8.20, 6);
  });

  test('1.12.1: the higher base score takes the placing', () => {
    // A: middle two (8.0, 8.0) → (8.0 + 8.4) / 2 = 8.20
    // B: middle two (9.0, 9.0) → (9.0 + 7.0) / 2 = 8.00
    const result = determineTieBreakerWinner(
      panel(8.4, 8.0, 8.0, 8.0, 8.0),
      panel(7.0, 9.0, 9.0, 9.0, 9.0)
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(1);
    expect(result.reason).toBe('base_score');
  });

  test('1.12.2: base scores agree, so the plain average of all four judges decides', () => {
    // Middle two are (8.0, 8.0) for both → base 8.0 each.
    // Average of four (Chief excluded, nothing dropped): A 32.6 / 4 = 8.15, B 32.0 / 4 = 8.00.
    const result = determineTieBreakerWinner(
      panel(8.0, 7.9, 8.0, 8.0, 8.7),
      panel(8.0, 8.0, 8.0, 8.0, 8.0)
    );

    expect(result.winner).toBe('A');
    expect(result.step).toBe(2);
    expect(result.reason).toBe('four_judge_average');
  });

  test('1.12.3: equal average of four, so (average + Chief) / 2 decides', () => {
    // A: judges [7.0, 8.0, 8.2, 9.0], Chief 8.0 → middle (8.0, 8.2) avg 8.1 → base 8.05
    // B: judges [7.6, 8.0, 8.0, 8.6], Chief 8.1 → middle (8.0, 8.0) avg 8.0 → base 8.05
    // Average of four: A 32.2 / 4 = 8.05, B 32.2 / 4 = 8.05 → equal
    // Step 3: A (8.05 + 8.0) / 2 = 8.025, B (8.05 + 8.1) / 2 = 8.075 → B
    const result = determineTieBreakerWinner(
      panel(8.0, 7.0, 8.0, 8.2, 9.0),
      panel(8.1, 7.6, 8.0, 8.0, 8.6)
    );

    expect(result.winner).toBe('B');
    expect(result.step).toBe(3);
    expect(result.reason).toBe('four_judge_average_with_chief');
  });

  test('an identical panel stays tied — no lucky draw (COP 1.12.4 is not applied)', () => {
    const identical = () => panel(8.0, 8.0, 8.0, 8.0, 8.0);

    expect(determineTieBreakerWinner(identical(), identical()).winner).toBe('tie');
    expect(areTied(identical(), identical())).toBe(true);
  });

  test('panel size is inferred from the marks when it was not recorded', () => {
    const withoutPanelSize = (seniorJudge) => ({
      finalScore: 8.00,
      judgeScores: { seniorJudge, judge1: 8, judge2: 8, judge3: 8, judge4: 8 }
    });

    const result = determineTieBreakerWinner(withoutPanelSize(8.3), withoutPanelSize(8.1));

    expect(result.winner).toBe('A');
    expect(result.reason).toBe('base_score');
  });

  test('a panel whose marks cannot be read leaves the tie standing', () => {
    const result = determineTieBreakerWinner(
      panel(8.0, 8.0, 8.0, 8.0, 8.0),
      { finalScore: 8.00, panelSize: 5, judgeScores: { seniorJudge: 8.0 } }
    );

    expect(result.winner).toBe('tie');
    expect(result.reason).toBe('panel_scores_unavailable');
  });
});

describe('Tie-Break ordering and annotation', () => {
  const panel = (finalScore, seniorJudge) => ({
    finalScore,
    panelSize: 4,
    judgeScores: { seniorJudge, judge1: 8, judge2: 8, judge3: 8 }
  });

  test('a clear score gap is not a tie-break at all', () => {
    const result = determineTieBreakerWinner(panel(9.0, 8.0), panel(8.0, 9.0));

    expect(result.winner).toBe('A');
    expect(result.step).toBe(0);
    expect(result.reason).toBe('higher_final_score');
    expect(result.isTieBreaker).toBe(false);
  });

  test('applyTieBreaker orders the field and records how each tie was settled', () => {
    const sorted = applyTieBreaker([
      panel(8.0, 8.1),
      panel(9.0, 7.0),
      panel(8.0, 8.4)
    ]);

    expect(sorted.map((p) => p.finalScore)).toEqual([9.0, 8.0, 8.0]);
    expect(sorted[1].judgeScores.seniorJudge).toBe(8.4);
    expect(sorted[1].tieBreakInfo).toEqual({
      resolvedAtStep: 1,
      method: 'base_score',
      unresolved: false
    });
    // The competitor who was never tied carries no explanation.
    expect(sorted[0].tieBreakInfo).toBeUndefined();
  });

  test('applyTieBreaker does not reorder or annotate the caller\'s objects', () => {
    const players = [panel(8.0, 8.1), panel(8.0, 8.4)];

    applyTieBreaker(players);

    expect(players[0].judgeScores.seniorJudge).toBe(8.1);
    expect(players[0].tieBreakInfo).toBeUndefined();
  });

  test('ranking the same field twice gives the same order', () => {
    const field = () => [panel(8.0, 8.0), panel(8.0, 8.0), panel(9.0, 8.0)];

    expect(applyTieBreaker(field())).toEqual(applyTieBreaker(field()));
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
