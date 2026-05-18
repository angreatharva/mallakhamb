/**
 * Token Service
 * 
 * Handles JWT token generation, verification, and refresh operations.
 * Uses ConfigManager for JWT configuration.
 * Implements token rotation for long-lived sessions (Requirement 17.7).
 * 
 * Requirements: 1.5, 1.8, 17.7
 */

const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../../errors');

/**
 * Token rotation threshold in milliseconds.
 * Tokens older than this will be rotated on use.
 * Default: 12 hours (half of the 24h expiry).
 */
const TOKEN_ROTATION_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

class TokenService {
  /**
   * Create a token service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   */
  constructor(configManager, logger) {
    this.config = configManager;
    this.logger = logger;
  }

  /**
   * Generate JWT token for user
   * Includes `iat` (issued-at) claim for rotation tracking.
   * @param {string} userId - User ID
   * @param {string} userType - User type (player, coach, admin, judge)
   * @param {string} competitionId - Optional competition context
   * @returns {string} JWT token
   */
  generateToken(userId, userType, competitionId = null) {
    try {
      const payload = {
        userId,
        userType,
        ...(competitionId && { competitionId })
        // jwt.sign automatically adds `iat` (issued-at) claim
      };

      const secret = this.config.get('jwt.secret');
      const expiresIn = this.config.get('jwt.expiresIn');

      const token = jwt.sign(payload, secret, { expiresIn });

      this.logger.debug('Token generated', { userId, userType, competitionId });

      return token;
    } catch (error) {
      this.logger.error('Token generation failed', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   * @throws {AuthenticationError} If token is invalid or expired
   */
  verifyToken(token) {
    try {
      const secret = this.config.get('jwt.secret');
      const decoded = jwt.verify(token, secret);

      this.logger.debug('Token verified', { userId: decoded.userId });

      return decoded;
    } catch (error) {
      this.logger.warn('Token verification failed', { error: error.message });

      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }

      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid token');
      }

      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Refresh JWT token
   * Generates a new token with the same payload but extended expiration.
   * @param {string} token - Current JWT token
   * @returns {string} New JWT token
   * @throws {AuthenticationError} If token is invalid
   */
  refreshToken(token) {
    try {
      // Verify the current token (will throw if invalid)
      const decoded = this.verifyToken(token);

      // Generate new token with same payload
      const newToken = this.generateToken(
        decoded.userId,
        decoded.userType,
        decoded.competitionId
      );

      this.logger.info('Token refreshed', { userId: decoded.userId });

      return newToken;
    } catch (error) {
      this.logger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check whether a token should be rotated.
   * A token should be rotated when it is older than TOKEN_ROTATION_THRESHOLD_MS.
   * @param {Object} decoded - Decoded JWT payload (must contain `iat`)
   * @returns {boolean} True if the token should be rotated
   */
  shouldRotateToken(decoded) {
    if (!decoded || !decoded.iat) {
      return false;
    }
    const issuedAtMs = decoded.iat * 1000; // `iat` is in seconds
    const ageMs = Date.now() - issuedAtMs;
    return ageMs >= TOKEN_ROTATION_THRESHOLD_MS;
  }

  /**
   * Rotate a token if it is old enough.
   * Returns the new token if rotation occurred, or null if not needed.
   * @param {Object} decoded - Already-verified decoded JWT payload
   * @returns {string|null} New token string, or null if rotation not needed
   */
  rotateTokenIfNeeded(decoded) {
    if (!this.shouldRotateToken(decoded)) {
      return null;
    }

    const newToken = this.generateToken(
      decoded.userId,
      decoded.userType,
      decoded.competitionId || null
    );

    this.logger.info('Token rotated (age threshold reached)', {
      userId: decoded.userId,
      userType: decoded.userType
    });

    return newToken;
  }

  /**
   * Decode token without verification (for debugging/logging)
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded payload or null if invalid
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      this.logger.warn('Token decode failed', { error: error.message });
      return null;
    }
  }
}

module.exports = TokenService;
