import { describe, it, expect } from 'vitest';
import {
  indexPerformanceOrder,
  applyRunningOrder,
  eventMatchesCategory,
} from './performanceOrder';

const PAYLOAD = {
  gender: 'Male',
  ageGroup: 'Under14',
  competitionType: 'competition_1',
  teams: [
    {
      _id: 't1',
      lotNo: 5,
      position: 1,
      players: [
        { _id: 'p1', lotNo: 2, position: 1 },
        { _id: 'p2', lotNo: 1, position: 0 },
      ],
    },
    { _id: 't2', lotNo: 3, position: 0, players: [] },
  ],
};

describe('indexPerformanceOrder', () => {
  it('indexes teams by id and athletes by team-and-athlete', () => {
    const index = indexPerformanceOrder(PAYLOAD);

    expect(index.teams.get('t1')).toEqual({ position: 1, lotNo: 5 });
    // Athlete order is a property of the team's slot, so the key is compound —
    // a player-only key would collide for anyone rostered on two teams.
    expect(index.players.get('t1:p2')).toEqual({ position: 0, lotNo: 1 });
    expect(index.players.get('p2')).toBeUndefined();
  });

  it('survives a null or empty payload', () => {
    expect(indexPerformanceOrder(null).teams.size).toBe(0);
    expect(indexPerformanceOrder({}).players.size).toBe(0);
  });
});

describe('applyRunningOrder', () => {
  const accessors = { key: (r) => r.id, name: (r) => r.name };

  it('sorts by stored position and stamps the lot number', () => {
    const index = indexPerformanceOrder(PAYLOAD);
    const rows = [{ id: 't1', name: 'Alpha' }, { id: 't2', name: 'Bravo' }];

    const ordered = applyRunningOrder(rows, index.teams, accessors);

    expect(ordered.map((r) => r.id)).toEqual(['t2', 't1']);
    expect(ordered[0].lotNo).toBe(3);
    expect(ordered[1].runningPosition).toBe(1);
  });

  it('appends rows with no stored position, in name order', () => {
    const index = indexPerformanceOrder(PAYLOAD);
    const rows = [
      { id: 'newer', name: 'Zulu' },
      { id: 't1', name: 'Alpha' },
      { id: 'newest', name: 'Mike' },
      { id: 't2', name: 'Bravo' },
    ];

    const ordered = applyRunningOrder(rows, index.teams, accessors);

    // The two unordered rows must land LAST. A naive numeric sort treats their
    // null position as 0 and promotes a team registered after the draw to the
    // head of the running order.
    expect(ordered.map((r) => r.id)).toEqual(['t2', 't1', 'newest', 'newer']);
    expect(ordered[2].lotNo).toBeNull();
  });

  it('treats position 0 as an order, not as missing', () => {
    const index = indexPerformanceOrder({ teams: [{ _id: 'a', position: 0, lotNo: null }] });
    const ordered = applyRunningOrder(
      [{ id: 'b', name: 'Bravo' }, { id: 'a', name: 'Alpha' }],
      index.teams,
      accessors
    );
    expect(ordered.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const rows = [{ id: 't1', name: 'Alpha' }, { id: 't2', name: 'Bravo' }];
    const snapshot = rows.map((r) => r.id);
    applyRunningOrder(rows, indexPerformanceOrder(PAYLOAD).teams, accessors);
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});

describe('eventMatchesCategory', () => {
  const category = { gender: 'Male', ageGroup: 'Under14', competitionType: 'competition_1' };

  it('matches the same category', () => {
    expect(eventMatchesCategory(PAYLOAD, category)).toBe(true);
  });

  it('matches across the slug and display encodings', () => {
    // The server broadcasts the slug; a page's session may hold either form
    // depending on which screen navigated to it.
    expect(eventMatchesCategory(PAYLOAD, { ...category, competitionType: 'Competition I' })).toBe(true);
  });

  it('rejects a different age group, gender or competition type', () => {
    expect(eventMatchesCategory(PAYLOAD, { ...category, ageGroup: 'Under18' })).toBe(false);
    expect(eventMatchesCategory(PAYLOAD, { ...category, gender: 'Female' })).toBe(false);
    expect(eventMatchesCategory(PAYLOAD, { ...category, competitionType: 'competition_2' })).toBe(false);
  });

  it('rejects null inputs', () => {
    expect(eventMatchesCategory(null, category)).toBe(false);
    expect(eventMatchesCategory(PAYLOAD, null)).toBe(false);
  });
});
