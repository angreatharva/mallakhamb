const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Business Rule Error
 * 
 * Thrown when a business rule is violated (e.g., invalid state transition).
 * HTTP Status: 422 Unprocessable Entity
 */
class BusinessRuleError extends BaseError {
  /**
   * Create a business rule error
   * @param {string} message - Error message
   * @param {Object} details - Business rule violation details
   */
  constructor(message, details = {}) {
    super(message, 422, ERROR_CODES.BUSINESS_RULE_VIOLATION, details);
  }
}

module.exports = BusinessRuleError;
