/**
 * Account Lockout Utility
 *
 * Throttles online password guessing by locking an account after repeated
 * failed logins (MED-1).
 *
 * WHY THIS WAS REWRITTEN (2026-08-07)
 *
 * The previous implementation kept attempts in a module-level `Map`. It was
 * never called from anywhere, so lockout was configured but not enforced, and
 * the in-memory design had two problems that mattered here:
 *
 *   1. It resets on every deploy. Render restarts the service on each push, so
 *      an attacker's counter cleared regularly.
 *   2. It is per-process. Two instances mean two independent counters, and each
 *      would grant the full attempt budget.
 *
 * State now lives on the user document, so it is durable and shared across
 * instances. These functions stay pure — they compute the next state and the
 * caller persists it — which keeps them trivially testable and leaves the
 * repository/model concerns in the services.
 *
 * The counters are `select: false` on every user schema, so a login lookup that
 * wants to enforce lockout must opt into them explicitly.
 */

/**
 * Is this account currently locked?
 *
 * @param {Object} user - User document (needs `lockUntil`)
 * @param {number} [now] - Epoch ms, injectable for tests
 * @returns {{ isLocked: boolean, remainingMinutes: number, lockUntil: Date|null }}
 */
function getLockoutState(user, now = Date.now()) {
  const lockUntil = user?.lockUntil ? new Date(user.lockUntil) : null;

  if (!lockUntil || Number.isNaN(lockUntil.getTime()) || lockUntil.getTime() <= now) {
    // An expired lock is not a lock. The counter is cleared on the next
    // successful login rather than eagerly here, so this stays side-effect free.
    return { isLocked: false, remainingMinutes: 0, lockUntil: null };
  }

  return {
    isLocked: true,
    remainingMinutes: Math.ceil((lockUntil.getTime() - now) / 60000),
    lockUntil,
  };
}

/**
 * Compute the state to persist after a failed login.
 *
 * A previously expired lock restarts the count from this attempt rather than
 * resuming an old tally, so someone who mistyped their password weeks ago does
 * not start today one attempt away from a lockout.
 *
 * @param {Object} user - User document (needs `loginAttempts`, `lockUntil`)
 * @param {Object} options
 * @param {number} options.maxAttempts
 * @param {number} options.lockoutMinutes
 * @param {number} [now] - Epoch ms, injectable for tests
 * @returns {{ loginAttempts: number, lockUntil: Date|null, isLocked: boolean, remainingMinutes: number }}
 */
function registerFailedAttempt(user, { maxAttempts, lockoutMinutes }, now = Date.now()) {
  const previouslyLocked = getLockoutState(user, now).isLocked;
  const hadExpiredLock = !!user?.lockUntil && !previouslyLocked;

  // A missing or garbage counter counts as zero rather than throwing.
  const priorAttempts = hadExpiredLock ? 0 : Number(user?.loginAttempts) || 0;
  const loginAttempts = priorAttempts + 1;

  if (loginAttempts >= maxAttempts) {
    return {
      loginAttempts,
      lockUntil: new Date(now + lockoutMinutes * 60000),
      isLocked: true,
      remainingMinutes: lockoutMinutes,
    };
  }

  return { loginAttempts, lockUntil: null, isLocked: false, remainingMinutes: 0 };
}

/**
 * State to persist after a successful login. Always clears both fields, so a
 * user who authenticates can never carry a stale counter.
 * @returns {{ loginAttempts: number, lockUntil: null }}
 */
function clearedLockoutState() {
  return { loginAttempts: 0, lockUntil: null };
}

/**
 * The user-facing message for a locked account.
 *
 * MUST contain the word "locked". The login page matches on it —
 * `Web/src/pages/unified/UnifiedLogin.jsx` tests
 * `message.toLowerCase().includes('locked')` to decide whether to render
 * AccountLockoutMessage. Changing this wording silently disables that UI.
 *
 * @param {number} remainingMinutes
 * @returns {string}
 */
function lockoutMessage(remainingMinutes) {
  const minutes = Math.max(1, Number(remainingMinutes) || 1);
  return `Account locked due to too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

module.exports = {
  getLockoutState,
  registerFailedAttempt,
  clearedLockoutState,
  lockoutMessage,
};
