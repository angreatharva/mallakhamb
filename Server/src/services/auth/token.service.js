/**
 * Token Service
 * 
 * Handles JWT token generation, verification, and refresh operations.
 * Uses ConfigManager for JWT configuration.
 * 
 * Requirements: 1.5, 1.8
 */

const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../../errors');

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
   * Generates a new token with the same payload but extended expiration
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
