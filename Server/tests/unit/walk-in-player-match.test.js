/**
 * The desk must recognise a child who already has a Player ID even when the
 * photo of the paper was read imperfectly.
 */
const { matchKind, normName, nearDate } = require('../../src/utils/walk-in/player-match.util');

const player = { firstName: 'Aarav', lastName: 'Patil', dateOfBirth: new Date('2015-03-14T00:00:00Z') };
const row = (firstName, lastName, dateOfBirth = '2015-03-14') => ({ firstName, lastName, dateOfBirth });

describe('player match', () => {
  it('is exact for the same name and date of birth, whatever the case or punctuation', () => {
    expect(matchKind(row('AARAV', 'PATIL'), player)).toBe('exact');
    expect(matchKind(row("D'SOUZA", 'ANAYA'), { firstName: 'D&#x27;Souza', lastName: 'Anaya', dateOfBirth: '2015-03-14' })).toBe('exact');
    expect(normName('D&#x27;Souza')).toBe('DSOUZA');
  });

  it('is close for a misread letter or two on the same date of birth', () => {
    expect(matchKind(row('AARAU', 'PATIL'), player)).toBe('close');
    expect(matchKind(row('ARAV', 'PATlL'), player)).toBe('close');
    expect(matchKind(row('PATIL', 'AARAV'), player)).toBe('close'); // first and last swapped
  });

  it('is close for the same name with one date digit off, or day and month swapped', () => {
    expect(matchKind(row('AARAV', 'PATIL', '2015-03-19'), player)).toBe('close');
    expect(matchKind(row('AARAV', 'PATIL', '2015-14-03'), player)).toBe('close');
    expect(nearDate('2015-03-14', '2016-03-14')).toBe(true);
    expect(nearDate('2015-03-14', '2017-04-14')).toBe(false);
  });

  it('is not a match for a different child', () => {
    expect(matchKind(row('VEDANT', 'PATIL'), player)).toBeNull();
    expect(matchKind(row('AARAV', 'PATIL', '2012-07-01'), player)).toBeNull();
    expect(matchKind(row('AARAU', 'PATIL', '2015-03-19'), player)).toBeNull(); // name AND date both off
  });
});
