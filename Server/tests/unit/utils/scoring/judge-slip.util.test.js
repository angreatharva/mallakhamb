/**
 * Unit tests for judge slip assembly (task 3.2 / MED-6).
 *
 * This mapping used to be written out by hand in admin.controller.js and again
 * in judge.service.js. The failure mode of a divergence is nasty and quiet: a
 * judge submits into one `judgeScores` field, the read path looks in another,
 * and the UI tells them they have not scored the performer. These tests pin the
 * contract so the two can never disagree again.
 */

const {
  JUDGE_ROLE_MAP,
  PANEL_JUDGE_TYPES,
  JUDGE_SCORE_FIELDS,
  getJudgeRoleMapping,
  isPanelJudgeType,
  buildJudgeSlipPlayerScore,
} = require('../../../../src/utils/scoring/judge-slip.util');

describe('the panel-role mapping', () => {
  test('covers exactly the five evaluating roles', () => {
    // 'Scorer' is a Judge document but records on behalf of the panel; it must
    // not appear here or it would be given a slip slot of its own.
    expect(PANEL_JUDGE_TYPES).toEqual([
      'Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4',
    ]);
    expect(PANEL_JUDGE_TYPES).not.toContain('Scorer');
  });

  test.each([
    ['Senior Judge', 'seniorJudge', 'SR_JUDGE'],
    ['Judge 1', 'judge1', 'J1'],
    ['Judge 2', 'judge2', 'J2'],
    ['Judge 3', 'judge3', 'J3'],
    ['Judge 4', 'judge4', 'J4'],
  ])('%s maps to judgeScores.%s and judgeRole %s', (judgeType, field, role) => {
    expect(getJudgeRoleMapping(judgeType)).toEqual({ field, role });
  });

  test('the field list matches the Score schema keys the rest of the code uses', () => {
    // scoring.service and scoring.validator both iterate this exact list.
    expect(JUDGE_SCORE_FIELDS).toEqual(['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4']);
  });

  test('fields and roles are unique — no two judges share a slot', () => {
    const fields = Object.values(JUDGE_ROLE_MAP).map((m) => m.field);
    const roles = Object.values(JUDGE_ROLE_MAP).map((m) => m.role);
    expect(new Set(fields).size).toBe(fields.length);
    expect(new Set(roles).size).toBe(roles.length);
  });

  test('an unknown role falls back to Judge 1, preserving prior behaviour', () => {
    expect(getJudgeRoleMapping('Scorer')).toEqual({ field: 'judge1', role: 'J1' });
    expect(getJudgeRoleMapping(undefined)).toEqual({ field: 'judge1', role: 'J1' });
  });

  test('isPanelJudgeType distinguishes real panel roles', () => {
    expect(isPanelJudgeType('Senior Judge')).toBe(true);
    expect(isPanelJudgeType('Scorer')).toBe(false);
    expect(isPanelJudgeType(undefined)).toBe(false);
  });
});

describe('buildJudgeSlipPlayerScore', () => {
  const breakdown = {
    difficulty: { aClass: 4, bClass: 6, cClass: 1, total: 3.8 },
    combination: { checked: { 1: true }, total: 1.6 },
    execution: 3.1,
    bonus: 0.20,
  };

  const base = {
    judgeType: 'Judge 2',
    playerId: 'player-1',
    playerName: 'Test Performer',
    apparatus: 'Rope Mallakhamb',
    score: 8.7,
    breakdown,
  };

  test('writes the score into the judge’s own slot only', () => {
    const ps = buildJudgeSlipPlayerScore(base);

    expect(ps.judgeScores).toEqual({ judge2: 8.7 });
    expect(ps.judgeScores.seniorJudge).toBeUndefined();
  });

  test('records one slip stamped with the matching role', () => {
    const ps = buildJudgeSlipPlayerScore(base);

    expect(ps.judgeSlips).toHaveLength(1);
    expect(ps.judgeSlips[0].judgeRole).toBe('J2');
    expect(ps.judgeSlips[0].total).toBe(8.7);
  });

  test('carries the full breakdown so re-opening a slip restores selections', () => {
    const ps = buildJudgeSlipPlayerScore(base);
    const slip = ps.judgeSlips[0];

    // Section totals alone are not enough — the element counts and combination
    // checklist have to survive or an edit silently loses them.
    expect(slip.breakdown).toEqual(breakdown);
    expect(slip.difficultyScore).toBe(3.8);
    expect(slip.combinationScore).toBe(1.6);
    expect(slip.executionScore).toBe(3.1);
  });

  test('the bonus is all-or-nothing at 0.20', () => {
    expect(buildJudgeSlipPlayerScore(base).judgeSlips[0].bonusScore).toBe(0.20);

    const partial = buildJudgeSlipPlayerScore({
      ...base,
      breakdown: { ...breakdown, bonus: 0.10 },
    });
    expect(partial.judgeSlips[0].bonusScore).toBe(0);
  });

  test('accepts `originality` as the older name for the bonus', () => {
    const ps = buildJudgeSlipPlayerScore({
      ...base,
      breakdown: { execution: 3.1, originality: 0.20 },
    });
    expect(ps.judgeSlips[0].bonusScore).toBe(0.20);
  });

  test('only the Senior Judge slip is marked chief-prefilled', () => {
    expect(buildJudgeSlipPlayerScore({ ...base, judgeType: 'Senior Judge' })
      .judgeSlips[0].isChiefPrefilled).toBe(true);
    expect(buildJudgeSlipPlayerScore(base).judgeSlips[0].isChiefPrefilled).toBe(false);
  });

  test('defaults apparatus and tolerates a missing breakdown', () => {
    const ps = buildJudgeSlipPlayerScore({
      judgeType: 'Judge 1', playerId: 'p', score: 5,
    });

    expect(ps.apparatus).toBe('Pole Mallakhamb');
    expect(ps.judgeSlips[0].difficultyScore).toBe(0);
    expect(ps.judgeSlips[0].bonusScore).toBe(0);
  });
});
