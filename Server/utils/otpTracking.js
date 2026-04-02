/**
 * OTP Attempt Tracking
 * Prevents brute force attacks by limiting verification attempts
 */

// In-memory store for OTP attempts
// Format: { email: { attempts: number, lockedUntil: timestamp } }
const otpAttempts = new Map();

// Configuration
const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Check if email is locked out due to too many failed attempts
 * @param {string} email - User's email
 * @returns {boolean} True if locked out
 */
function isLockedOut(email) {
  const record = otpAttempts.get(email.toLowerCase());
  
  if (!record) {
    return false;
  }
  
  // Check if lockout period has expired
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return true;
  }
  
  // Lockout expired, reset attempts
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    otpAttempts.delete(email.toLowerCase());
    return false;
  }
  
  return false;
}

/**
 * Get remaining lockout time in seconds
 * @param {string} email - User's email
 * @returns {number} Seconds remaining, or 0 if not locked
 */
function getLockoutTimeRemaining(email) {
  const record = otpAttempts.get(email.toLowerCase());
  
  if (!record || !record.lockedUntil) {
    return 0;
  }
  
  const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed OTP attempt
 * @param {string} email - User's email
 * @returns {object} { locked: boolean, attemptsRemaining: number, lockoutSeconds: number }
 */
function recordFailedAttempt(email) {
  const emailLower = email.toLowerCase();
  const record = otpAttempts.get(emailLower) || { attempts: 0, lockedUntil: null };
  
  record.attempts += 1;
  
  // Check if max attempts reached
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION;
    otpAttempts.set(emailLower, record);
    
    console.log(`🔒 Email ${email} locked out for ${LOCKOUT_DURATION / 1000 / 60} minutes`);
    
    return {
      locked: true,
      attemptsRemaining: 0,
      lockoutSeconds: Math.ceil(LOCKOUT_DURATION / 1000)
    };
  }
  
  otpAttempts.set(emailLower, record);
  
  const remaining = MAX_ATTEMPTS - record.attempts;
  console.log(`⚠️ Failed OTP attempt for ${email}. ${remaining} attempts remaining`);
  
  return {
    locked: false,
    attemptsRemaining: remaining,
    lockoutSeconds: 0
  };
}

/**
 * Reset attempts for an email (called on successful verification)
 * @param {string} email - User's email
 */
function resetAttempts(email) {
  otpAttempts.delete(email.toLowerCase());
  console.log(`✅ OTP attempts reset for ${email}`);
}

/**
 * Get current attempt count for an email
 * @param {string} email - User's email
 * @returns {number} Number of failed attempts
 */
function getAttemptCount(email) {
  const record = otpAttempts.get(email.toLowerCase());
  return record ? record.attempts : 0;
}

/**
 * Cleanup expired lockouts (called periodically)
 */
function cleanupExpiredLockouts() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [email, record] of otpAttempts.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      otpAttempts.delete(email);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired OTP lockouts`);
  }
}

// Start periodic cleanup
setInterval(cleanupExpiredLockouts, CLEANUP_INTERVAL);

module.exports = {
  isLockedOut,
  getLockoutTimeRemaining,
  recordFailedAttempt,
  resetAttempts,
  getAttemptCount,
  MAX_ATTEMPTS,
  LOCKOUT_DURATION
};
