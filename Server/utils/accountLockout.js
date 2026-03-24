/**
 * Account Lockout Utility
 * Prevents brute force attacks by locking accounts after failed login attempts
 * 
 * This uses an in-memory store for simplicity. For production with multiple servers, use Redis.
 */

// Configuration
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// In-memory store for tracking failed login attempts
// Key: identifier (email/username), Value: { attempts, lockedUntil }
const loginAttempts = new Map();

/**
 * Check if an account is currently locked
 * @param {String} identifier - Email or username
 * @returns {Object} - { isLocked: boolean, remainingTime: number }
 */
function checkAccountLockout(identifier) {
  const record = loginAttempts.get(identifier.toLowerCase());
  
  if (!record) {
    return { isLocked: false, remainingTime: 0 };
  }
  
  // Check if lockout has expired
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);
    return { 
      isLocked: true, 
      remainingTime: remainingMinutes,
      attempts: record.attempts 
    };
  }
  
  // Lockout expired, clear the record
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginAttempts.delete(identifier.toLowerCase());
    return { isLocked: false, remainingTime: 0 };
  }
  
  return { isLocked: false, remainingTime: 0, attempts: record.attempts };
}

/**
 * Record a failed login attempt
 * @param {String} identifier - Email or username
 * @returns {Object} - { attempts: number, isLocked: boolean, remainingTime: number }
 */
function recordFailedAttempt(identifier) {
  const key = identifier.toLowerCase();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: null };
  
  record.attempts += 1;
  
  // Lock account if max attempts reached
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
    loginAttempts.set(key, record);
    
    const remainingMinutes = Math.ceil(LOCKOUT_DURATION / 60000);
    console.log(`🔒 Account locked: ${identifier} (${record.attempts} failed attempts)`);
    
    return { 
      attempts: record.attempts, 
      isLocked: true, 
      remainingTime: remainingMinutes 
    };
  }
  
  loginAttempts.set(key, record);
  console.log(`⚠️ Failed login attempt ${record.attempts}/${MAX_ATTEMPTS}: ${identifier}`);
  
  return { 
    attempts: record.attempts, 
    isLocked: false, 
    remainingTime: 0 
  };
}

/**
 * Clear failed attempts for an account (after successful login)
 * @param {String} identifier - Email or username
 */
function clearFailedAttempts(identifier) {
  const key = identifier.toLowerCase();
  loginAttempts.delete(key);
  console.log(`✅ Cleared failed attempts for: ${identifier}`);
}

/**
 * Get current attempt count for an account
 * @param {String} identifier - Email or username
 * @returns {Number} - Number of failed attempts
 */
function getAttemptCount(identifier) {
  const record = loginAttempts.get(identifier.toLowerCase());
  return record ? record.attempts : 0;
}

/**
 * Manually unlock an account (admin function)
 * @param {String} identifier - Email or username
 */
function unlockAccount(identifier) {
  const key = identifier.toLowerCase();
  loginAttempts.delete(key);
  console.log(`🔓 Manually unlocked account: ${identifier}`);
}

/**
 * Get all locked accounts
 * @returns {Array} - Array of locked account identifiers with lockout info
 */
function getLockedAccounts() {
  const locked = [];
  const now = Date.now();
  
  for (const [identifier, record] of loginAttempts.entries()) {
    if (record.lockedUntil && now < record.lockedUntil) {
      const remainingMs = record.lockedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      locked.push({
        identifier,
        attempts: record.attempts,
        remainingTime: remainingMinutes
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
  console.log('🗑️ Cleared all account lockout records');
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
  LOCKOUT_DURATION
};
