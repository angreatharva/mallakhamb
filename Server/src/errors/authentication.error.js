const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Authentication Error
 * 
 * Thrown when authentication fails (invalid credentials, expired token, etc.).
 * HTTP Status: 401 Unauthorized
 */
class AuthenticationError extends BaseError {
  /**
   * Create an authentication error
   * @param {string} message - Error message (default: 'Authentication failed')
   */
  constructor(message = 'Authentication failed') {
    super(message, 401, ERROR_CODES.AUTHENTICATION_ERROR);
  }
}

module.exports = AuthenticationError;
