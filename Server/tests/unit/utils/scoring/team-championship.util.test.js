/**
 * Team Championship: per apparatus, a 4-player team counts its best 3 scores
 * and a 6-player team its best 5; the team total is the sum over every
 * apparatus the category runs.
 *
 *   Pole + Hanging + Rope, size 4 → top3 Pole + top3 Hanging + top3 Rope
 *   Pole + Rope, size 6           → top5 Pole + top5 Rope
 *   Pole only, size 6             → top5 Pole
 */

const {
  TEAM_SIZES,
  countedScoresFor,
  effectiveTeamSize,
  hasRoomInSquad,
  scoreTeam,
  rankTeamChampionship,
} = require('../../../../src/utils/scoring/team-championship.util');

const POLE = 'Pole Mallakhamb';
const HANGING = 'Hanging Mallakhamb';
const ROPE = 'Rope Mallakhamb';

/** One performance per score, athletes named by index. */
const on = (apparatus, scores) => scores.map((finalScore, i) => ({
  playerId: `${apparatus}-${i}`, playerName: `Athlete ${i}`, apparatus, finalScore,
}));

describe('team size', () => {
  it('offers exactly 4 and 6', () => {
    expect(TEAM_SIZES).toEqual([4, 6]);
  });

  it('counts the best 3 for a 4-player team and the best 5 for a 6-player team', () => {
    expect(countedScoresFor(4)).toBe(3);
    expect(countedScoresFor(6)).toBe(5);
  });

  it('reads a team with no declared size as a 6-player team', () => {
    expect(effectiveTeamSize(undefined)).toBe(6);
    expect(effectiveTeamSize(null)).toBe(6);
    expect(countedScoresFor(undefined)).toBe(5);
  });
});

describe('scoreTeam', () => {
  it('Pole + Hanging + Rope, size 4: top 3 of each, summed', () => {
    const result = scoreTeam({
      maxTeamSize: 4,
      performances: [
        ...on(POLE, [9.0, 8.5, 8.0, 7.0]),
        ...on(HANGING, [8.8, 8.2, 7.9, 6.0]),
        ...on(ROPE, [9.2, 8.1, 7.5, 7.4]),
      ],
    });

    const subtotal = (name) => result.apparatus.find((a) => a.apparatus === name).subtotal;
    expect(subtotal(POLE)).toBeCloseTo(25.5);
    expect(subtotal(HANGING)).toBeCloseTo(24.9);
    expect(subtotal(ROPE)).toBeCloseTo(24.8);
    expect(result.totalScore).toBeCloseTo(25.5 + 24.9 + 24.8);
    expect(result.countedPerApparatus).toBe(3);
  });

  it('Pole + Rope, size 6: top 5 of each, summed', () => {
    const result = scoreTeam({
      maxTeamSize: 6,
      performances: [
        ...on(POLE, [9, 8, 7, 6, 5, 4]),
        ...on(ROPE, [8, 8, 8, 8, 8, 1]),
      ],
    });

    expect(result.totalScore).toBeCloseTo(35 + 40);
    expect(result.apparatus.map((a) => a.dropped.map((p) => p.finalScore))).toEqual([[4], [1]]);
  });

  it('Pole only, size 6: top 5 Pole', () => {
    const result = scoreTeam({ maxTeamSize: 6, performances: on(POLE, [9, 8, 7, 6, 5, 4]) });
    expect(result.totalScore).toBeCloseTo(35);
    expect(result.apparatus).toHaveLength(1);
  });

  it('counts every score when the team fielded fewer than the counted number', () => {
    const result = scoreTeam({ maxTeamSize: 6, performances: on(ROPE, [9, 8]) });
    expect(result.totalScore).toBeCloseTo(17);
    expect(result.apparatus[0].dropped).toEqual([]);
  });

  it('does not let one apparatus borrow another\'s places', () => {
    // Size 4: five strong Pole scores cannot stand in for the missing Rope ones.
    const result = scoreTeam({
      maxTeamSize: 4,
      performances: [...on(POLE, [9, 9, 9, 9]), ...on(ROPE, [5])],
    });
    expect(result.totalScore).toBeCloseTo(27 + 5);
  });

  it('keeps three decimals and does not accumulate float noise', () => {
    const result = scoreTeam({ maxTeamSize: 4, performances: on(POLE, [8.1, 8.2, 8.3]) });
    expect(result.totalScore).toBe(24.6);
  });
});

describe('rankTeamChampionship', () => {
  it('ranks on the counted total, not on every score entered', () => {
    const ranked = rankTeamChampionship([
      // Six athletes summed would be 45; only the best five count → 40.
      { name: 'Deep', maxTeamSize: 6, performances: on(POLE, [8, 8, 8, 8, 8, 5]) },
      { name: 'Sharp', maxTeamSize: 4, performances: on(POLE, [9.9, 9.9, 9.9, 1]) },
    ]);
    expect(ranked.map((t) => [t.name, t.rank, t.totalScore])).toEqual([
      ['Deep', 1, 40],
      ['Sharp', 2, 29.7],
    ]);
  });

  it('shares a placing on a level total', () => {
    const ranked = rankTeamChampionship([
      { name: 'A', maxTeamSize: 4, performances: on(POLE, [9, 8, 7]) },
      { name: 'B', maxTeamSize: 4, performances: on(ROPE, [8, 8, 8]) },
      { name: 'C', maxTeamSize: 4, performances: on(ROPE, [1]) },
    ]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 1, 3]);
  });
});

describe('hasRoomInSquad', () => {
  const entries = [
    { player: 'p1', gender: 'Male', ageGroup: 'Under14' },
    { player: 'p2', gender: 'Male', ageGroup: 'Under14' },
    { player: 'p3', gender: 'Male', ageGroup: 'Under14' },
    { player: 'p4', gender: 'Male', ageGroup: 'Under14' },
    { player: 'p5', gender: 'Female', ageGroup: 'Under14' },
  ];

  it('refuses a fifth athlete in one category of a 4-player team', () => {
    expect(hasRoomInSquad(4, entries, 'Male', 'Under14')).toBe(false);
  });

  it('counts per gender and age group', () => {
    expect(hasRoomInSquad(4, entries, 'Female', 'Under14')).toBe(true);
    expect(hasRoomInSquad(4, entries, 'Male', 'Under16')).toBe(true);
  });

  it('does not count the athlete being re-posted against themselves', () => {
    expect(hasRoomInSquad(4, entries, 'Male', 'Under14', 'p4')).toBe(true);
  });

  it('does not cap a team with no declared size', () => {
    expect(hasRoomInSquad(undefined, entries, 'Male', 'Under14')).toBe(true);
  });
});
