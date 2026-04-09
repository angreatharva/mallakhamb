const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Conflict Error
 * 
 * Thrown when a request conflicts with existing data (e.g., duplicate email).
 * HTTP Status: 409 Conflict
 */
class ConflictError extends BaseError {
  /**
   * Create a conflict error
   * @param {string} message - Error message
   * @param {Object} details - Conflict details
   */
  constructor(message, details = {}) {
    super(message, 409, ERROR_CODES.CONFLICT, details);
  }
}

module.exports = ConflictError;
