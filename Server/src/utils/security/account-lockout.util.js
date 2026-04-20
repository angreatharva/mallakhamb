/**
 * Account Lockout Utility
 * Prevents brute force attacks by locking accounts after failed login attempts.
 *
 * Moved from Server/utils/accountLockout.js
 *
 * NOTE: Uses an in-memory store. For multi-server production deployments, replace
 * with a shared store such as Redis.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// In-memory store: key = identifier (email/username), value = { attempts, lockedUntil }
const loginAttempts = new Map();

/**
 * Check if an account is currently locked
 * @param {string} identifier - Email or username
 * @returns {{ isLocked: boolean, remainingTime: number, attempts?: number }}
 */
function checkAccountLockout(identifier) {
  const record = loginAttempts.get(identifier.toLowerCase());

  if (!record) {
    return { isLocked: false, remainingTime: 0 };
  }

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return { isLocked: true, remainingTime: remainingMinutes, attempts: record.attempts };
  }

  // Lockout expired — clear the record
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(identifier.toLowerCase());
    return { isLocked: false, remainingTime: 0 };
  }

  return { isLocked: false, remainingTime: 0, attempts: record.attempts };
}

/**
 * Record a failed login attempt
 * @param {string} identifier - Email or username
 * @returns {{ attempts: number, isLocked: boolean, remainingTime: number }}
 */
function recordFailedAttempt(identifier) {
  const key = identifier.toLowerCase();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: null };

  record.attempts += 1;

  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
    loginAttempts.set(key, record);

    const remainingMinutes = Math.ceil(LOCKOUT_DURATION / 60000);
    return { attempts: record.attempts, isLocked: true, remainingTime: remainingMinutes };
  }

  loginAttempts.set(key, record);
  return { attempts: record.attempts, isLocked: false, remainingTime: 0 };
}

/**
 * Clear failed attempts for an account (after successful login)
 * @param {string} identifier - Email or username
 */
function clearFailedAttempts(identifier) {
  loginAttempts.delete(identifier.toLowerCase());
}

/**
 * Get current attempt count for an account
 * @param {string} identifier - Email or username
 * @returns {number} Number of failed attempts
 */
function getAttemptCount(identifier) {
  const record = loginAttempts.get(identifier.toLowerCase());
  return record ? record.attempts : 0;
}

/**
 * Manually unlock an account (admin function)
 * @param {string} identifier - Email or username
 */
function unlockAccount(identifier) {
  loginAttempts.delete(identifier.toLowerCase());
}

/**
 * Get all currently locked accounts
 * @returns {Array<{ identifier: string, attempts: number, remainingTime: number }>}
 */
function getLockedAccounts() {
  const locked = [];
  const now = Date.now();

  for (const [identifier, record] of loginAttempts.entries()) {
    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingMs = record.lockedUntil - now;
      locked.push({
        identifier,
        attempts: record.attempts,
        remainingTime: Math.ceil(remainingMs / 60000),
      });
    }
  }

  return locked;
}

/**
 * Clear all lockout records (for testing purposes)
 */
function clearAllLockouts() {
  loginAttempts.clear();
}

module.exports = {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  getAttemptCount,
  unlockAccount,
  getLockedAccounts,
  clearAllLockouts,
  MAX_ATTEMPTS,
  LOCKOUT_DURATION,
};
