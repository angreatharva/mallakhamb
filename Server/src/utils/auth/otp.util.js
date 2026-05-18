/**
 * OTP Utilities for Password Reset
 * Generates and validates One-Time Passwords
 *
 * Consolidated from Server/utils/otpUtils.js and Server/utils/otpTracking.js
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// OTP generation helpers (from otpUtils.js)
// ---------------------------------------------------------------------------

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP using SHA-256
 * @param {string} otp - The OTP to hash
 * @returns {string} SHA-256 hash of the OTP
 */
function hashOTP(otp) {
  return crypto
    .createHash('sha256')
    .update(otp.toString())
    .digest('hex');
}

/**
 * Validate OTP format (must be 6 digits)
 * @param {string} otp - The OTP to validate
 * @returns {boolean} True if valid format
 */
function isValidOTPFormat(otp) {
  return /^\d{6}$/.test(otp);
}

// ---------------------------------------------------------------------------
// OTP attempt tracking (from otpTracking.js)
// ---------------------------------------------------------------------------

// In-memory store for OTP attempts
// Format: { email: { attempts: number, lockedUntil: timestamp } }
const otpAttempts = new Map();

const MAX_OTP_ATTEMPTS = 3;
const OTP_LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const OTP_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Check if email is locked out due to too many failed OTP attempts
 * @param {string} email - User's email
 * @returns {boolean} True if locked out
 */
function isLockedOut(email) {
  const record = otpAttempts.get(email.toLowerCase());

  if (!record) return false;

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return true;
  }

  // Lockout expired — reset
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    otpAttempts.delete(email.toLowerCase());
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

  if (!record || !record.lockedUntil) return 0;

  const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed OTP attempt
 * @param {string} email - User's email
 * @returns {{ locked: boolean, attemptsRemaining: number, lockoutSeconds: number }}
 */
function recordOTPFailedAttempt(email) {
  const emailLower = email.toLowerCase();
  const record = otpAttempts.get(emailLower) || { attempts: 0, lockedUntil: null };

  record.attempts += 1;

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    record.lockedUntil = Date.now() + OTP_LOCKOUT_DURATION;
    otpAttempts.set(emailLower, record);

    return {
      locked: true,
      attemptsRemaining: 0,
      lockoutSeconds: Math.ceil(OTP_LOCKOUT_DURATION / 1000),
    };
  }

  otpAttempts.set(emailLower, record);

  return {
    locked: false,
    attemptsRemaining: MAX_OTP_ATTEMPTS - record.attempts,
    lockoutSeconds: 0,
  };
}

/**
 * Reset OTP attempts for an email (called on successful verification)
 * @param {string} email - User's email
 */
function resetOTPAttempts(email) {
  otpAttempts.delete(email.toLowerCase());
}

/**
 * Get current OTP attempt count for an email
 * @param {string} email - User's email
 * @returns {number} Number of failed attempts
 */
function getOTPAttemptCount(email) {
  const record = otpAttempts.get(email.toLowerCase());
  return record ? record.attempts : 0;
}

/**
 * Cleanup expired OTP lockouts (called periodically)
 */
function cleanupExpiredOTPLockouts() {
  const now = Date.now();
  for (const [email, record] of otpAttempts.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      otpAttempts.delete(email);
    }
  }
}

// Start periodic cleanup
setInterval(cleanupExpiredOTPLockouts, OTP_CLEANUP_INTERVAL);

module.exports = {
  // Generation helpers
  generateOTP,
  hashOTP,
  isValidOTPFormat,
  // Attempt tracking
  isLockedOut,
  getLockoutTimeRemaining,
  recordOTPFailedAttempt,
  resetOTPAttempts,
  getOTPAttemptCount,
  cleanupExpiredOTPLockouts,
  MAX_OTP_ATTEMPTS,
  OTP_LOCKOUT_DURATION,
};
