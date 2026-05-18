/**
 * Base Error Class
 * 
 * Base class for all application errors with consistent structure
 * and serialization support.
 */
class BaseError extends Error {
  /**
   * Create a base error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code constant
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error to JSON format
   * @returns {Object} JSON representation of error
   */
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      details: this.details
    };
  }
}

module.exports = BaseError;
