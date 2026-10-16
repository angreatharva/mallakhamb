/**
 * SEED_SEASON_LEAD_DAYS (scripts/lib/meets.js shiftSeason): the nightly e2e
 * run seeds the fixed meets.json season every night, and the end-date lock
 * freezes any meet whose dates have passed. The shift slides the season by
 * whole weeks so its first meet is at least `lead` days out — and does nothing
 * when unset, so ordinary seeding keeps the committed dates.
 */
const { shiftSeason, readMeets } = require('../../../scripts/lib/meets');

const RAW = {
  name: 'Test Meet',
  year: 2026,
  meets: [
    { place: 'A', level: 'district', startDate: '2026-10-03' },
    { place: 'B', level: 'state', startDate: '2026-10-10' },
    { place: 'C', level: 'national', startDate: '2026-12-19' },
  ],
};
const at = (iso) => new Date(`${iso}T12:00:00.000Z`);
const day = (iso) => new Date(`${iso}T00:00:00.000Z`).getUTCDay();

describe('shiftSeason', () => {
  it('leaves the season alone when SEED_SEASON_LEAD_DAYS is unset or empty', () => {
    expect(shiftSeason(RAW, undefined, at('2026-10-16'))).toBe(RAW);
    expect(shiftSeason(RAW, '', at('2026-10-16'))).toBe(RAW);
  });

  it('leaves it alone when the first meet is already far enough out', () => {
    expect(shiftSeason(RAW, '14', at('2026-09-01'))).toBe(RAW);
  });

  it('slides every meet by the same whole number of weeks, so all stay Saturdays', () => {
    const out = shiftSeason(RAW, '14', at('2026-10-16'));
    // today + 14 = 2026-10-30; the first Saturday on/after that from 2026-10-03 in whole weeks = 2026-10-31
    expect(out.meets.map((m) => m.startDate)).toEqual(['2026-10-31', '2026-11-07', '2027-01-16']);
    expect(out.shiftedWeeks).toBe(4);
    expect(out.meets.every((m) => day(m.startDate) === 6)).toBe(true);
    expect(out.year).toBe(2026); // identity unchanged
    expect(RAW.meets[0].startDate).toBe('2026-10-03'); // not mutated
  });

  it('puts the first meet at least lead days ahead', () => {
    for (const today of ['2026-10-16', '2026-11-30', '2027-03-05']) {
      const out = shiftSeason(RAW, '14', at(today));
      const first = Date.parse(`${out.meets[0].startDate}T00:00:00.000Z`);
      expect(first - Date.parse(`${today}T00:00:00.000Z`)).toBeGreaterThanOrEqual(14 * 86400000);
      expect(first - Date.parse(`${today}T00:00:00.000Z`)).toBeLessThan(21 * 86400000);
    }
  });

  it('refuses a lead that is not a whole number of days', () => {
    expect(() => shiftSeason(RAW, 'two weeks')).toThrow(/whole number of days/);
    expect(() => shiftSeason(RAW, '-3')).toThrow(/whole number of days/);
  });

  it('readMeets still returns the committed, valid season', () => {
    const meets = readMeets().meets;
    expect(meets).toHaveLength(12);
    expect(meets.every((m) => day(m.startDate) === 6)).toBe(true);
  });
});
