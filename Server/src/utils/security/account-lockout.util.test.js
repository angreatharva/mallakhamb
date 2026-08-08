/**
 * Unit tests for the account-lockout policy (MED-1).
 *
 * The previous implementation was an in-memory Map that nothing ever called,
 * so lockout was configured but never enforced. These cover the replacement's
 * decision logic; persistence lives in the auth services.
 */

const {
  getLockoutState,
  registerFailedAttempt,
  clearedLockoutState,
  lockoutMessage,
} = require('./account-lockout.util');

const NOW = Date.parse('2026-08-07T12:00:00.000Z');
const POLICY = { maxAttempts: 5, lockoutMinutes: 15 };

describe('getLockoutState', () => {
  test('a user with no counters is not locked', () => {
    expect(getLockoutState({}, NOW)).toEqual({
      isLocked: false,
      remainingMinutes: 0,
      lockUntil: null,
    });
  });

  test('a future lockUntil is locked, with minutes remaining', () => {
    const user = { lockUntil: new Date(NOW + 5 * 60000) };
    const state = getLockoutState(user, NOW);

    expect(state.isLocked).toBe(true);
    expect(state.remainingMinutes).toBe(5);
  });

  test('an expired lockUntil is NOT locked', () => {
    // Otherwise a lockout would be permanent, which is the worst possible
    // failure mode for this feature during a live event.
    const user = { lockUntil: new Date(NOW - 1000) };
    expect(getLockoutState(user, NOW).isLocked).toBe(false);
  });

  test('a garbage lockUntil is treated as unlocked rather than throwing', () => {
    expect(getLockoutState({ lockUntil: 'not-a-date' }, NOW).isLocked).toBe(false);
  });

  test('is side-effect free — it does not mutate the user', () => {
    const user = { lockUntil: new Date(NOW - 1000), loginAttempts: 4 };
    const snapshot = JSON.stringify(user);
    getLockoutState(user, NOW);
    expect(JSON.stringify(user)).toBe(snapshot);
  });
});

describe('registerFailedAttempt', () => {
  test('increments below the threshold without locking', () => {
    const next = registerFailedAttempt({ loginAttempts: 2 }, POLICY, NOW);

    expect(next.loginAttempts).toBe(3);
    expect(next.isLocked).toBe(false);
    expect(next.lockUntil).toBeNull();
  });

  test('locks exactly on the configured attempt', () => {
    const next = registerFailedAttempt({ loginAttempts: 4 }, POLICY, NOW);

    expect(next.loginAttempts).toBe(5);
    expect(next.isLocked).toBe(true);
    expect(next.lockUntil.getTime()).toBe(NOW + 15 * 60000);
    expect(next.remainingMinutes).toBe(15);
  });

  test('a missing counter counts as zero', () => {
    expect(registerFailedAttempt({}, POLICY, NOW).loginAttempts).toBe(1);
    expect(registerFailedAttempt({ loginAttempts: null }, POLICY, NOW).loginAttempts).toBe(1);
    expect(registerFailedAttempt({ loginAttempts: 'x' }, POLICY, NOW).loginAttempts).toBe(1);
  });

  test('an expired lock restarts the count instead of resuming the old tally', () => {
    // Otherwise someone who mistyped their password weeks ago would begin
    // today one attempt away from being locked out again.
    const user = { loginAttempts: 4, lockUntil: new Date(NOW - 60 * 60000) };
    const next = registerFailedAttempt(user, POLICY, NOW);

    expect(next.loginAttempts).toBe(1);
    expect(next.isLocked).toBe(false);
  });

  test('honours a non-default policy', () => {
    const next = registerFailedAttempt({ loginAttempts: 2 }, { maxAttempts: 3, lockoutMinutes: 30 }, NOW);

    expect(next.isLocked).toBe(true);
    expect(next.lockUntil.getTime()).toBe(NOW + 30 * 60000);
  });
});

describe('clearedLockoutState', () => {
  test('clears both fields so a successful login never carries a stale tally', () => {
    expect(clearedLockoutState()).toEqual({ loginAttempts: 0, lockUntil: null });
  });
});

describe('lockoutMessage', () => {
  /**
   * Contract guard. Web/src/pages/unified/UnifiedLogin.jsx decides whether to
   * render AccountLockoutMessage by testing
   * `message.toLowerCase().includes('locked')`. Rewording this string without
   * updating the client silently disables the lockout countdown UI.
   */
  test('contains the word the login page matches on', () => {
    expect(lockoutMessage(15).toLowerCase()).toContain('locked');
  });

  test('reports the remaining time and pluralizes correctly', () => {
    expect(lockoutMessage(15)).toContain('15 minutes');
    expect(lockoutMessage(1)).toContain('1 minute');
    expect(lockoutMessage(1)).not.toContain('1 minutes');
  });

  test('never advertises a nonsensical zero or negative wait', () => {
    expect(lockoutMessage(0)).toContain('1 minute');
    expect(lockoutMessage(undefined)).toContain('1 minute');
  });
});
