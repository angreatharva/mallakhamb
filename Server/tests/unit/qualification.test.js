/**
 * Competition I → II / III qualification rules (docs/qualification-plan.md).
 */

const { apparatusFinal, allRoundAgeGroup } = require('../../src/utils/scoring/qualification.util');

const row = (id, team, rank, finalScore = 10 - rank / 10) => ({ playerId: id, playerName: `P${id}`, teamId: team, rank, finalScore });

describe('Competition III: top 10 per apparatus, at most 2 per team', () => {
  test('a team\'s third player is passed over and the next player gets the place', () => {
    const ranked = [
      row('a1', 'A', 1), row('a2', 'A', 2), row('a3', 'A', 3), // a3 is 3rd overall but A already has 2
      ...Array.from({ length: 12 }, (_, i) => row(`p${i}`, `T${i}`, i + 4)),
    ];
    const result = apparatusFinal(ranked);
    expect(result.status).toBe('ready');
    expect(result.qualifiers).toHaveLength(10);
    expect(result.qualifiers.map((q) => q.playerId).slice(0, 3)).toEqual(['a1', 'a2', 'p0']);
    expect(result.qualifiers.map((q) => q.playerId)).not.toContain('a3');
    expect(result.skipped).toEqual([expect.objectContaining({ playerId: 'a3', reason: 'team_cap' })]);
  });

  test('fewer than 10 performed: everyone goes through (no minimum score)', () => {
    const result = apparatusFinal([row('x', 'X', 1, 2.1), row('y', 'Y', 2, 0.5)]);
    expect(result.qualifiers.map((q) => q.playerId)).toEqual(['x', 'y']);
  });

  test('a tie across the cut waits for the lucky draw', () => {
    const ranked = [
      ...Array.from({ length: 9 }, (_, i) => row(`p${i}`, `T${i}`, i + 1)),
      row('t1', 'U', 10, 5), row('t2', 'V', 10, 5),
    ];
    const result = apparatusFinal(ranked);
    expect(result.status).toBe('waiting_draw');
    expect(result.qualifiers).toHaveLength(9);
    expect(result.tied.map((q) => q.playerId).sort()).toEqual(['t1', 't2']);
  });

  test('a withdrawn qualifier is replaced by the next in rank', () => {
    const ranked = Array.from({ length: 12 }, (_, i) => row(`p${i}`, `T${i}`, i + 1));
    const result = apparatusFinal(ranked, { withdrawn: new Set(['p3']) });
    expect(result.qualifiers.map((q) => q.playerId)).toEqual(['p0', 'p1', 'p2', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
  });
});

describe('Competition II: top 10 per age group on the sum of every apparatus, at most 2 per team', () => {
  const s = (id, team, finalScore) => ({ playerId: id, playerName: id, teamId: team, finalScore, panelSize: 5, judgeScores: {} });

  test('ranked on the sum; an apparatus not performed counts 0', () => {
    const result = allRoundAgeGroup({
      Pole: [s('a', 'A', 8), s('b', 'B', 7.5), s('c', 'C', 9.6)],
      Rope: [s('a', 'A', 8), s('b', 'B', 7.9)], // c did only Pole: 9.6 total
    });
    expect(result.qualifiers.map((q) => q.playerId)).toEqual(['a', 'b', 'c']); // 16, 15.4, 9.6
    expect(result.qualifiers[0].score).toBe(16);
  });

  test("the owner's Girls Under 16 example: a team's third is passed over (2026-11-15)", () => {
    const result = allRoundAgeGroup({
      Rope: [
        s('Gauri', 'SGAM', 7.73), s('Vaidavi', 'SGAM', 6.5), s('Anvika', 'SGAM', 6.3), s('Shreeja', 'SGAM', 1.73),
        s('Myra', 'TeamA', 7.13), s('Reeva', 'TeamA', 3.3), s('Krishika', 'TeamA', 2.37),
      ],
    });
    expect(result.status).toBe('ready');
    expect(result.qualifiers.map((q) => q.playerId)).toEqual(['Gauri', 'Myra', 'Vaidavi', 'Reeva']);
    expect(result.skipped.filter((x) => x.reason === 'team_cap').map((x) => x.playerId)).toEqual(['Anvika', 'Krishika', 'Shreeja']);
  });

  test('takes at most 10', () => {
    const rows = { Pole: Array.from({ length: 14 }, (_, i) => s(`p${i}`, `T${i}`, 9 - i * 0.1)) };
    expect(allRoundAgeGroup(rows).qualifiers).toHaveLength(10);
  });

  test('a tie on the sum at the cut that no step breaks waits for a draw, then follows it', () => {
    const rows = { Pole: [s('a', 'A', 9), s('b', 'B', 8), s('c', 'C', 8)] };
    const waiting = allRoundAgeGroup(rows, { size: 2 });
    expect(waiting.status).toBe('waiting_draw');
    expect(waiting.qualifiers.map((q) => q.playerId)).toEqual(['a']);
    const drawn = allRoundAgeGroup(rows, { size: 2, drawOrder: ['c', 'b'] });
    expect(drawn.status).toBe('ready');
    expect(drawn.qualifiers.map((q) => q.playerId)).toEqual(['a', 'c']);
  });
});
