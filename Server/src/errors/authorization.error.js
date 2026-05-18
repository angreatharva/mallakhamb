const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Authorization Error
 * 
 * Thrown when user lacks permission to perform an action.
 * HTTP Status: 403 Forbidden
 */
class AuthorizationError extends BaseError {
  /**
   * Create an authorization error
   * @param {string} message - Error message (default: 'Access denied')
   */
  constructor(message = 'Access denied') {
    super(message, 403, ERROR_CODES.AUTHORIZATION_ERROR);
  }
}

module.exports = AuthorizationError;
