/**
 * Password Reset Token Tracking Utility
 * Prevents token reuse by tracking used tokens
 * 
 * This uses an in-memory store for simplicity. For production with multiple servers, use Redis.
 */

// In-memory store for tracking used password reset tokens
// Key: hashedToken, Value: timestamp when used
const usedTokens = new Map();

// Token cleanup interval (1 hour)
const CLEANUP_INTERVAL = 60 * 60 * 1000;

// Token expiry time (24 hours - matches password reset expiry)
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

/**
 * Check if a password reset token has already been used
 * @param {String} hashedToken - The hashed token to check
 * @returns {Boolean} - True if token has been used
 */
function isTokenUsed(hashedToken) {
  return usedTokens.has(hashedToken);
}

/**
 * Mark a password reset token as used
 * @param {String} hashedToken - The hashed token to mark as used
 */
function markTokenAsUsed(hashedToken) {
  usedTokens.set(hashedToken, Date.now());
  console.log(`🔒 Password reset token marked as used`);
}

/**
 * Clean up expired used tokens
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, timestamp] of usedTokens.entries()) {
    if (now - timestamp > TOKEN_EXPIRY) {
      usedTokens.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🗑️ Cleaned up ${cleaned} expired password reset tokens`);
  }
}

/**
 * Start periodic cleanup of expired tokens
 */
function startCleanup() {
  setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);
  console.log('✅ Password reset token cleanup job started');
}

/**
 * Clear all used tokens (for testing purposes)
 */
function clearAllUsedTokens() {
  usedTokens.clear();
  console.log('🗑️ Cleared all used password reset tokens');
}

// Start cleanup on module load
startCleanup();

module.exports = {
  isTokenUsed,
  markTokenAsUsed,
  cleanupExpiredTokens,
  clearAllUsedTokens
};
