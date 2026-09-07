/**
 * Ranking utilities.
 *
 * A coverage pass put this file at 2.5% — essentially untested, despite being
 * the code that decides who placed first at a competition. These tests pin the
 * behaviour that matters to a competitor: the ordering, and how ties are
 * numbered.
 *
 * The convention being asserted is STANDARD COMPETITION RANKING: two athletes
 * tied for first are both rank 1 and the next is rank 3, not rank 2. Getting
 * that wrong hands somebody the wrong medal, and it is not something a passing
 * smoke test would reveal.
 */

const {
  calculateTeamRankings,
  calculateIndividualRankings,
} = require('./ranking.util');

const team = (name, totalScore) => ({ _id: `team-${name}`, name, totalScore });

describe('calculateTeamRankings', () => {
  test('orders by total score, highest first', () => {
    const ranked = calculateTeamRankings([team('B', 24.5), team('A', 26.1), team('C', 19.0)]);

    expect(ranked.map((t) => t.name)).toEqual(['A', 'B', 'C']);
    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  test('ties share a rank and the next place is SKIPPED', () => {
    // 1, 1, 3 — not 1, 1, 2. This is the assertion that protects a podium.
    const ranked = calculateTeamRankings([team('A', 26.1), team('B', 26.1), team('C', 19.0)]);

    expect(ranked.map((t) => t.rank)).toEqual([1, 1, 3]);
  });

  test('handles a three-way tie at the top', () => {
    const ranked = calculateTeamRankings([
      team('A', 26.1), team('B', 26.1), team('C', 26.1), team('D', 20.0),
    ]);

    expect(ranked.map((t) => t.rank)).toEqual([1, 1, 1, 4]);
  });

  test('handles a tie that is not at the top', () => {
    const ranked = calculateTeamRankings([
      team('A', 30), team('B', 20), team('C', 20), team('D', 10),
    ]);

    expect(ranked.map((t) => t.rank)).toEqual([1, 2, 2, 4]);
  });

  test('treats a missing score as zero rather than throwing', () => {
    const ranked = calculateTeamRankings([{ name: 'A' }, team('B', 5)]);

    expect(ranked.map((t) => t.name)).toEqual(['B', 'A']);
    expect(ranked[1].rank).toBe(2);
  });

  test('does not mutate the caller’s array', () => {
    const input = [team('B', 10), team('A', 20)];
    const snapshot = JSON.stringify(input);

    calculateTeamRankings(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  test('returns [] for empty or missing input', () => {
    expect(calculateTeamRankings([])).toEqual([]);
    expect(calculateTeamRankings(null)).toEqual([]);
    expect(calculateTeamRankings(undefined)).toEqual([]);
  });

  test('preserves the rest of the team object', () => {
    const [first] = calculateTeamRankings([{ _id: 't1', name: 'A', totalScore: 9, extra: 'kept' }]);

    expect(first.extra).toBe('kept');
    expect(first._id).toBe('t1');
  });
});

describe('calculateIndividualRankings', () => {
  const player = (name, finalScore, extra = {}) => ({
    _id: `p-${name}`, name, finalScore, ...extra,
  });

  test('orders by final score and numbers sequentially when nothing ties', () => {
    const ranked = calculateIndividualRankings([
      player('B', 8.5), player('A', 9.1), player('C', 7.2),
    ]);

    expect(ranked.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  test('returns [] for empty or missing input', () => {
    expect(calculateIndividualRankings([])).toEqual([]);
    expect(calculateIndividualRankings(null)).toEqual([]);
  });

  test('preserves the rest of the player object', () => {
    const [first] = calculateIndividualRankings([player('A', 9.1, { chestNo: 42 })]);

    expect(first.chestNo).toBe(42);
    expect(first.rank).toBe(1);
  });

  test('a single competitor is rank 1', () => {
    expect(calculateIndividualRankings([player('A', 5)])[0].rank).toBe(1);
  });
});
