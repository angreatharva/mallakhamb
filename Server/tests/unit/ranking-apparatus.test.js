const {
  calculateIndividualRankingsByApparatus,
} = require('../../src/utils/scoring/ranking.util');

/**
 * One standing per apparatus.
 *
 * Pole and Rope are different events, judged on different score sheets. Mixing
 * them into one table ranks people who never competed against each other — and
 * an athlete entered for both would appear twice in it, with one of the two
 * entries deciding their "place".
 */
describe('individual rankings, grouped by apparatus', () => {
  const player = (playerName, apparatus, finalScore) => ({
    playerName, apparatus, finalScore, averageMarks: finalScore,
  });

  test('ranks within an apparatus, not across them', () => {
    const ranked = calculateIndividualRankingsByApparatus([
      player('Pole winner', 'Pole Mallakhamb', 9.4),
      player('Pole second', 'Pole Mallakhamb', 9.0),
      // Lower than both Pole scores, and still first on Rope.
      player('Rope winner', 'Rope Mallakhamb', 8.2),
      player('Rope second', 'Rope Mallakhamb', 7.4),
    ]);

    const rankOf = (name) => ranked.find((r) => r.playerName === name).rank;
    expect(rankOf('Pole winner')).toBe(1);
    expect(rankOf('Rope winner')).toBe(1);
    expect(rankOf('Pole second')).toBe(2);
    expect(rankOf('Rope second')).toBe(2);
  });

  test('gives one athlete a place in each apparatus they entered', () => {
    const ranked = calculateIndividualRankingsByApparatus([
      player('Atharva Angre', 'Pole Mallakhamb', 9.4),
      player('Atharva Angre', 'Rope Mallakhamb', 7.4),
      player('Someone else', 'Rope Mallakhamb', 8.0),
    ]);

    const his = ranked.filter((r) => r.playerName === 'Atharva Angre');
    expect(his).toHaveLength(2);
    // First on Pole, second on Rope — two events, two results.
    expect(his.find((r) => r.apparatus === 'Pole Mallakhamb').rank).toBe(1);
    expect(his.find((r) => r.apparatus === 'Rope Mallakhamb').rank).toBe(2);
  });

  test('treats an unrecorded apparatus as Pole, the stored default', () => {
    const ranked = calculateIndividualRankingsByApparatus([
      player('No apparatus', undefined, 8.0),
      player('Explicit Pole', 'Pole Mallakhamb', 9.0),
    ]);
    expect(ranked.find((r) => r.playerName === 'No apparatus').rank).toBe(2);
  });
});
