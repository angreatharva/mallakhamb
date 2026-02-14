const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Generate a cryptographically secure random token
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
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * Generate JWT token with optional competition context
 * @param {string} userId - User's ID
 * @param {string} userType - Type of user (admin, coach, player, judge, superadmin)
 * @param {string} [currentCompetition] - Optional competition ID for competition context
 * @returns {string} JWT token
 */
function generateToken(userId, userType, currentCompetition = null) {
  const payload = {
    userId,
    userType
  };

  // Add competition context if provided
  if (currentCompetition) {
    payload.currentCompetition = currentCompetition;
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '7d' }
  );
}

module.exports = {
  generateResetToken,
  hashToken,
  generateToken
};
