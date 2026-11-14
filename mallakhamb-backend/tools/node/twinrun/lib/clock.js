'use strict';

/**
 * Starts this process's clock at a chosen instant (04 §2).
 *
 * A replay has to see the same "now" the recording saw, or date rules (fee
 * phases, the end-date lock, token expiry) take a different branch. Only
 * `Date` is shifted: timers keep running in real time, so the Mongo driver and
 * HTTP keep working, and the clock still advances normally from the start
 * instant.
 *
 * The plan names `@sinonjs/fake-timers` with `toFake: ['Date']`. This does the
 * same thing in a few lines with nothing to install.
 */

const RealDate = Date;
let offsetMs = 0;

class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...args);
  }

  static now() {
    return RealDate.now() + offsetMs;
  }

  /** A date made before the clock was shifted (or by another realm) is still a Date. */
  static [Symbol.hasInstance](value) {
    return value instanceof RealDate;
  }
}
// Mongoose recognises schema types by constructor name.
Object.defineProperty(ShiftedDate, 'name', { value: 'Date' });

/** Make `new Date()` and `Date.now()` read `startAt` now, advancing in real time from there. */
function startClockAt(startAt) {
  const start = new RealDate(startAt).getTime();
  if (Number.isNaN(start)) throw new Error(`twinrun clock: not a date: ${startAt}`);
  offsetMs = start - RealDate.now();
  globalThis.Date = ShiftedDate;
}

function restoreClock() {
  offsetMs = 0;
  globalThis.Date = RealDate;
}

module.exports = { startClockAt, restoreClock };
