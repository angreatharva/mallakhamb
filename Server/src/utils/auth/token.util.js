/**
 * Token Utilities
 * JWT generation/verification and cryptographic reset tokens.
 *
 * Consolidated from Server/utils/tokenUtils.js and Server/utils/passwordResetTracking.js
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const configManager = require('../../config/config-manager');

// ---------------------------------------------------------------------------
// Cryptographic token helpers (from tokenUtils.js)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure random reset token
 * @returns {string} 64-character hex string
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using SHA-256
 * @param {string} token - The raw token to hash
 * @returns {string} SHA-256 hash of the token as hex string
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate JWT token with optional competition context
 * @param {string} userId - User's ID
 * @param {string} userType - Type of user (admin, coach, player, judge, superadmin)
 * @param {string|null} [currentCompetition] - Optional competition ID for competition context
 * @returns {string} JWT token
 */
function generateToken(userId, userType, currentCompetition = null) {
  const payload = { userId, userType };

  if (currentCompetition) {
    payload.currentCompetition = currentCompetition;
  }

  configManager.load();
  const jwtSecret = configManager.get('jwt.secret');
  const expiresIn = configManager.get('jwt.expiresIn') || '7d';
  return jwt.sign(payload, jwtSecret, { expiresIn });
}

// ---------------------------------------------------------------------------
// Password reset token tracking (from passwordResetTracking.js)
// ---------------------------------------------------------------------------

// In-memory store for tracking used password reset tokens
// Key: hashedToken, Value: timestamp when used
const usedTokens = new Map();

const RESET_TOKEN_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const RESET_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a password reset token has already been used
 * @param {string} hashedToken - The hashed token to check
 * @returns {boolean} True if token has been used
 */
function isTokenUsed(hashedToken) {
  return usedTokens.has(hashedToken);
}

/**
 * Mark a password reset token as used
 * @param {string} hashedToken - The hashed token to mark as used
 */
function markTokenAsUsed(hashedToken) {
  usedTokens.set(hashedToken, Date.now());
}

/**
 * Clean up expired used tokens
 */
function cleanupExpiredResetTokens() {
  const now = Date.now();
  for (const [token, timestamp] of usedTokens.entries()) {
    if (now - timestamp > RESET_TOKEN_EXPIRY) {
      usedTokens.delete(token);
    }
  }
}

/**
 * Clear all used tokens (for testing purposes)
 */
function clearAllUsedTokens() {
  usedTokens.clear();
}

// Start periodic cleanup on module load
setInterval(cleanupExpiredResetTokens, RESET_TOKEN_CLEANUP_INTERVAL);

module.exports = {
  // JWT / crypto helpers
  generateResetToken,
  hashToken,
  generateToken,
  // Reset token tracking
  isTokenUsed,
  markTokenAsUsed,
  cleanupExpiredResetTokens,
  clearAllUsedTokens,
};
