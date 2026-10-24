/**
 * The lifecycle check stays off a meet: yesterday, today and tomorrow in India
 * time (scripts/e2eGuard.js). SGAM-TRIALS-1 runs Sat 31 Oct 2026.
 */
const { meetsNearby, istMidnight } = require('../../../scripts/e2eGuard');

const TRIALS = { place: 'Mumbai', startDate: new Date('2026-10-31T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z') };
const at = (iso) => new Date(iso);

describe('e2eGuard meetsNearby', () => {
  it('skips the day before, the day, and the day after (IST)', () => {
    expect(meetsNearby([TRIALS], at('2026-10-30T00:30:00+05:30'))).toHaveLength(1);
    expect(meetsNearby([TRIALS], at('2026-10-31T12:00:00+05:30'))).toHaveLength(1);
    expect(meetsNearby([TRIALS], at('2026-11-01T18:00:00+05:30'))).toHaveLength(1);
  });

  it('runs two days either side', () => {
    expect(meetsNearby([TRIALS], at('2026-10-29T18:00:00+05:30'))).toHaveLength(0);
    expect(meetsNearby([TRIALS], at('2026-11-02T00:00:00+05:30'))).toHaveLength(0);
  });

  it('counts a multi-day meet for every day it runs', () => {
    const weekend = { startDate: new Date('2026-11-14T00:00:00Z'), endDate: new Date('2026-11-15T00:00:00Z') };
    expect(meetsNearby([weekend], at('2026-11-16T12:00:00+05:30'))).toHaveLength(1);
    expect(meetsNearby([weekend], at('2026-11-17T12:00:00+05:30'))).toHaveLength(0);
  });

  it('takes the day in India, not in UTC', () => {
    // 00:30 IST on the 30th is still the 29th in UTC.
    expect(istMidnight(at('2026-10-30T00:30:00+05:30')).toISOString()).toBe('2026-10-29T18:30:00.000Z');
  });
});
