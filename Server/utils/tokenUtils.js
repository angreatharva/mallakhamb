const crypto = require('crypto');

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

module.exports = {
  generateResetToken,
  hashToken
};
