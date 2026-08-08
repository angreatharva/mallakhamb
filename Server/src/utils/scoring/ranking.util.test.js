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
  getTopTeams,
  getTopPlayers,
  findPlayerRank,
  findTeamRank,
  groupPlayersByRank,
  groupTeamsByRank,
  calculateRankStatistics,
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

describe('getTopTeams / getTopPlayers', () => {
  const ranked = [
    { name: 'C', rank: 3 }, { name: 'A', rank: 1 }, { name: 'B', rank: 2 }, { name: 'D', rank: 4 },
  ];

  test('returns the best N in rank order regardless of input order', () => {
    expect(getTopTeams(ranked, 3).map((t) => t.name)).toEqual(['A', 'B', 'C']);
    expect(getTopPlayers(ranked, 2).map((p) => p.name)).toEqual(['A', 'B']);
  });

  test('defaults to a podium of 3 for teams and 10 for players', () => {
    expect(getTopTeams(ranked)).toHaveLength(3);
    expect(getTopPlayers(ranked)).toHaveLength(4); // fewer than the default 10
  });

  test('asking for more than exists returns everything, not undefined padding', () => {
    expect(getTopTeams(ranked, 99)).toHaveLength(4);
  });

  test('returns [] for empty or missing input', () => {
    expect(getTopTeams([], 3)).toEqual([]);
    expect(getTopPlayers(null, 3)).toEqual([]);
  });

  test('does not mutate the caller’s array', () => {
    const input = [...ranked];
    getTopTeams(input, 2);
    expect(input.map((t) => t.name)).toEqual(['C', 'A', 'B', 'D']);
  });
});

describe('findPlayerRank / findTeamRank', () => {
  test('matches on _id, playerId or id — the three shapes this codebase uses', () => {
    const players = [
      { _id: 'p1', rank: 1 },
      { playerId: 'p2', rank: 2 },
      { id: 'p3', rank: 3 },
    ];

    expect(findPlayerRank(players, 'p1').rank).toBe(1);
    expect(findPlayerRank(players, 'p2').rank).toBe(2);
    expect(findPlayerRank(players, 'p3').rank).toBe(3);
  });

  test('compares by string, so an ObjectId-like value still matches', () => {
    const objectIdish = { toString: () => 'p1' };
    const players = [{ _id: objectIdish, rank: 1 }];

    expect(findPlayerRank(players, 'p1').rank).toBe(1);
  });

  test('returns null when absent or when inputs are missing', () => {
    expect(findPlayerRank([{ _id: 'p1', rank: 1 }], 'nope')).toBeNull();
    expect(findPlayerRank(null, 'p1')).toBeNull();
    expect(findPlayerRank([{ _id: 'p1' }], null)).toBeNull();
  });

  test('findTeamRank behaves the same for teams', () => {
    const teams = [{ _id: 't1', rank: 1 }, { teamId: 't2', rank: 2 }];

    expect(findTeamRank(teams, 't2').rank).toBe(2);
    expect(findTeamRank(teams, 'missing')).toBeNull();
  });
});

describe('groupPlayersByRank / groupTeamsByRank', () => {
  test('collects everyone sharing a rank, which is how a tie is presented', () => {
    const grouped = groupPlayersByRank([
      { name: 'A', rank: 1 }, { name: 'B', rank: 1 }, { name: 'C', rank: 3 },
    ]);

    expect(grouped[1].map((p) => p.name)).toEqual(['A', 'B']);
    expect(grouped[3].map((p) => p.name)).toEqual(['C']);
  });

  test('returns {} for empty or missing input', () => {
    expect(groupPlayersByRank([])).toEqual({});
    expect(groupTeamsByRank(null)).toEqual({});
  });
});

describe('calculateRankStatistics', () => {
  test('reports totals, distinct ranks and which ranks are tied', () => {
    const stats = calculateRankStatistics([
      { rank: 1 }, { rank: 1 }, { rank: 3 }, { rank: 4 },
    ]);

    expect(stats.totalItems).toBe(4);
    expect(stats.uniqueRanks).toBe(3);
    expect(stats.maxRank).toBe(4);
    expect(stats.tiedRanks).toEqual([{ rank: 1, count: 2 }]);
  });

  test('reports no ties when every rank is distinct', () => {
    const stats = calculateRankStatistics([{ rank: 1 }, { rank: 2 }]);

    expect(stats.tiedRanks).toEqual([]);
    expect(stats.uniqueRanks).toBe(2);
  });

  test('returns a zeroed shape for empty input rather than NaN', () => {
    // Math.max() of an empty array is -Infinity, so the early return matters.
    expect(calculateRankStatistics([])).toEqual({
      totalItems: 0, uniqueRanks: 0, tiedRanks: [], maxRank: 0,
    });
    expect(calculateRankStatistics(null).maxRank).toBe(0);
  });
});
