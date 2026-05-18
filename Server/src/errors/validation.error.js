const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Validation Error
 * 
 * Thrown when input validation fails.
 * HTTP Status: 400 Bad Request
 */
class ValidationError extends BaseError {
  /**
   * Create a validation error
   * @param {string} message - Error message
   * @param {Object} details - Validation error details (field-specific errors)
   */
  constructor(message, details = {}) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

module.exports = ValidationError;
