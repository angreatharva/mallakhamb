const crypto = require('crypto');

/**
 * OTP Utilities for Password Reset
 * Generates and validates One-Time Passwords
 */

/**
 * Generate a 6-digit OTP
 * @returns {string} 6-digit OTP
 */
function generateOTP() {
  // Generate a random 6-digit number
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
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

module.exports = {
  generateOTP,
  hashOTP,
  isValidOTPFormat
};
