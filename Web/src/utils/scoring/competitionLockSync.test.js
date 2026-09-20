/**
 * The two stacks must agree on the instant a meet freezes.
 *
 * `Web/src/utils/scoring/competitionLock.js` mirrors
 * `Server/src/utils/security/competition-lock.util.js`, for the same reason the
 * fee window is mirrored (see competitionFeeSync.test.js): the UI has to render
 * the read-only state BEFORE any request is made, and the server is the one
 * that refuses the write.
 *
 * Drift here is not cosmetic in either direction. A client that thinks a meet
 * is still open lets four judges fill in a score sheet that saves as 423; a
 * client that thinks it has closed hides the controls of a live competition
 * mid-event.
 *
 * So this feeds the real server module and the client mirror the same inputs
 * and requires the answers to be identical, millisecond for millisecond — and
 * separately pins the lock instant to the fee window's close, which is the
 * invariant that keeps money and results on the same calendar.
 */

import { describe, it, expect } from 'vitest';

import { isCompetitionLocked, lockInstant, mayBypassCompetitionLock } from './competitionLock';

// Reaching across into the server package is deliberate. This is a monorepo and
// the invariant being protected is precisely that these two files agree.
import serverLock from '../../../../Server/src/utils/security/competition-lock.util.js';
import serverPayment from '../../../../Server/src/config/payment.config.js';

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);

const COMPETITION = {
  name: 'Nagpur National 2026',
  startDate: day('2026-12-10'),
  endDate: day('2026-12-13'),
  registrationOpenDate: day('2026-01-01'),
  feeDueDate: day('2026-12-05'),
  lateFee: 200,
  playerFee: 500,
};

/** Every instant that decides something, plus the boundary to the millisecond. */
const INSTANTS = [
  '2026-06-01T12:00:00.000Z', // long before the meet
  '2026-12-10T00:00:00.000Z', // first day of competition
  '2026-12-13T00:00:00.000Z', // the end date, morning
  '2026-12-13T23:59:59.998Z', // second-to-last writable millisecond
  '2026-12-13T23:59:59.999Z', // THE last writable millisecond
  '2026-12-14T00:00:00.000Z', // frozen
  '2027-03-01T09:00:00.000Z', // long after
].map((iso) => new Date(iso));

describe('the client mirror agrees with the server rule', () => {
  it('locks at the same instant', () => {
    expect(lockInstant(COMPETITION).getTime())
      .toBe(serverLock.lockInstant(COMPETITION).getTime());
  });

  it.each(INSTANTS)('agrees at %s', (at) => {
    expect(isCompetitionLocked(COMPETITION, at))
      .toBe(serverLock.isCompetitionLocked(COMPETITION, at));
  });

  it('agrees that a competition with no end date never locks', () => {
    const open = { name: 'No end date' };
    for (const at of INSTANTS) {
      expect(isCompetitionLocked(open, at)).toBe(serverLock.isCompetitionLocked(open, at));
      expect(isCompetitionLocked(open, at)).toBe(false);
    }
  });

  it('agrees on who may bypass it', () => {
    for (const type of ['superadmin', 'super_admin', 'SuperAdmin']) {
      expect(mayBypassCompetitionLock(type)).toBe(true);
      expect(serverLock.mayBypassCompetitionLock(null, type)).toBe(true);
    }
    for (const type of ['admin', 'judge', 'coach', 'player', undefined]) {
      expect(mayBypassCompetitionLock(type)).toBe(false);
      expect(serverLock.mayBypassCompetitionLock(null, type)).toBe(false);
    }
  });
});

describe('the lock closes exactly when the fee window does', () => {
  it('shares the boundary with resolveFeeWindow', () => {
    // Both read `endOfUtcDay(endDate)` from `utils/data/day-boundary.util`. If
    // they could drift, a gap either way is a window where a coach's money
    // moves into a meet nobody can then record it against.
    const closesAt = serverPayment.resolveFeeWindow(COMPETITION, day('2026-12-14')).closesAt;

    expect(lockInstant(COMPETITION).getTime()).toBe(closesAt.getTime());
  });

  it('is open for payment exactly while it is open for writes', () => {
    for (const at of INSTANTS) {
      const canPay = serverPayment.resolveFeeWindow(COMPETITION, at).canPay;
      const locked = isCompetitionLocked(COMPETITION, at);

      // Payment can be closed while writes are open (before the window opens,
      // and this meet's window opens in January) — but the reverse must never
      // happen: a locked meet must never accept money.
      if (locked) expect(canPay).toBe(false);
    }
  });
});

describe('the boundary itself', () => {
  it('is the final millisecond of the end date, in UTC', () => {
    expect(lockInstant(COMPETITION).toISOString()).toBe('2026-12-13T23:59:59.999Z');
  });

  it('is still open on that millisecond and closed on the next', () => {
    expect(isCompetitionLocked(COMPETITION, new Date('2026-12-13T23:59:59.999Z'))).toBe(false);
    expect(isCompetitionLocked(COMPETITION, new Date('2026-12-14T00:00:00.000Z'))).toBe(true);
  });
});
