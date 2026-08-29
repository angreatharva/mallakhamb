import { describe, it, expect } from 'vitest';
import { apparatusFor, isRegisteredFor, apparatusInUse, apparatusToJudge } from './apparatus';

// The three shapes `registeredTeams[].players[].apparatus` has been written in.
const asName = { apparatus: 'Rope Mallakhamb' };
const asList = { apparatus: ['Pole Mallakhamb', 'Rope Mallakhamb'] };
const asMap = { apparatus: { competition_1: ['Rope Mallakhamb'], competition_3: ['Pole Mallakhamb'] } };
const unspecified = { apparatus: {} };

describe('apparatusFor', () => {
  it('reads a bare name, which is what the coach dashboard writes', () => {
    expect(apparatusFor(asName, 'competition_1')).toEqual(['Rope Mallakhamb']);
  });

  it('reads a list', () => {
    expect(apparatusFor(asList, 'competition_1')).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('reads a map keyed by competition type', () => {
    expect(apparatusFor(asMap, 'competition_1')).toEqual(['Rope Mallakhamb']);
    expect(apparatusFor(asMap, 'competition_3')).toEqual(['Pole Mallakhamb']);
  });

  it('returns nothing when the entry says nothing', () => {
    expect(apparatusFor(unspecified, 'competition_1')).toEqual([]);
    expect(apparatusFor({}, 'competition_1')).toEqual([]);
    expect(apparatusFor(null, 'competition_1')).toEqual([]);
  });
});

describe('isRegisteredFor', () => {
  it('keeps an athlete out of an apparatus they are not entered for', () => {
    expect(isRegisteredFor(asName, 'competition_1', 'Pole Mallakhamb')).toBe(false);
    expect(isRegisteredFor(asName, 'competition_1', 'Rope Mallakhamb')).toBe(true);
  });

  it('lets a multi-apparatus athlete through on each of them', () => {
    expect(isRegisteredFor(asList, 'competition_1', 'Pole Mallakhamb')).toBe(true);
    expect(isRegisteredFor(asList, 'competition_1', 'Rope Mallakhamb')).toBe(true);
    expect(isRegisteredFor(asList, 'competition_1', 'Hanging Mallakhamb')).toBe(false);
  });

  it('treats an unrecorded apparatus as eligible for anything', () => {
    // Every competition seeded before this field was used depends on this:
    // declaring those athletes ineligible would empty the judge's roster.
    expect(isRegisteredFor(unspecified, 'competition_1', 'Pole Mallakhamb')).toBe(true);
  });

  it('filters nothing when no apparatus is being judged', () => {
    expect(isRegisteredFor(asName, 'competition_1', null)).toBe(true);
  });
});

describe('apparatusInUse', () => {
  it('lists what a category actually needs, in COP order', () => {
    const entries = [asName, asList, unspecified];
    expect(apparatusInUse(entries, 'competition_1')).toEqual(['Pole Mallakhamb', 'Rope Mallakhamb']);
  });

  it('is empty when nobody has been given one', () => {
    expect(apparatusInUse([unspecified, {}], 'competition_1')).toEqual([]);
  });
});

describe('apparatusToJudge', () => {
  it('honours the judge’s choice above everything', () => {
    expect(apparatusToJudge('Pole Mallakhamb', asName, 'competition_1')).toBe('Pole Mallakhamb');
  });

  it('falls back to the athlete’s registration when nothing was chosen', () => {
    // The bug this exists to stop: a Rope athlete on the ten-item Pole sheet.
    expect(apparatusToJudge(null, asName, 'competition_1')).toBe('Rope Mallakhamb');
  });

  it('will not guess between two apparatus', () => {
    // Ambiguous, so the old default stands and the judge is expected to pick.
    expect(apparatusToJudge(null, asList, 'competition_1')).toBe('Pole Mallakhamb');
  });

  it('defaults to Pole only when nobody has said anything', () => {
    expect(apparatusToJudge(null, unspecified, 'competition_1')).toBe('Pole Mallakhamb');
  });
});
