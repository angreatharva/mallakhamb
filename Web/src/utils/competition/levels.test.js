/**
 * Competition levels: the client list must match the server enum exactly, and
 * the two newer levels — DSO and University — must flow through every helper
 * the level chooser and competition screens use.
 */
import { describe, it, expect } from 'vitest';

import {
  COMPETITION_LEVELS,
  LEVEL_META,
  normalizeLevel,
  levelLabel,
  competitionsAtLevel,
  countByLevel,
} from './levels';

// Reaching across into the server package is deliberate (see
// competitionFeeSync.test.js): the invariant is that these two lists agree. A
// level only on the client is a card whose meets the server refuses to create;
// one only on the server is a meet nobody can pick.
import serverLevels from '../../../../Server/src/config/competition-levels.js';

describe('competition levels', () => {
  it('match the server Competition.level enum, in order', () => {
    expect(COMPETITION_LEVELS).toEqual([...serverLevels.COMPETITION_LEVELS]);
  });

  it('include DSO and University', () => {
    expect(COMPETITION_LEVELS).toEqual(
      expect.arrayContaining(['dso', 'university'])
    );
  });

  it('give every level a label and a blurb for its card', () => {
    for (const level of COMPETITION_LEVELS) {
      expect(LEVEL_META[level]?.label).toBeTruthy();
      expect(LEVEL_META[level]?.blurb).toBeTruthy();
    }
  });

  it('label DSO in capitals rather than capitalising the stored value', () => {
    expect(levelLabel('dso')).toBe('DSO');
    expect(levelLabel('university')).toBe('University');
  });

  it('read a stored or typed level in any casing', () => {
    expect(normalizeLevel('DSO')).toBe('dso');
    expect(normalizeLevel(' University ')).toBe('university');
    expect(normalizeLevel('college')).toBeNull();
  });

  it('count and filter the new levels like any other', () => {
    const competitions = [
      { _id: 'a', level: 'dso' },
      { _id: 'b', level: 'university' },
      { _id: 'c', level: 'university' },
      { _id: 'd', level: 'district' },
    ];
    const counts = countByLevel(competitions);
    expect(counts.dso).toBe(1);
    expect(counts.university).toBe(2);
    expect(counts.international).toBe(0);
    expect(competitionsAtLevel(competitions, 'university').map((c) => c._id)).toEqual(['b', 'c']);
  });
});
