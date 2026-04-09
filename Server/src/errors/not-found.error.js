const BaseError = require('./base.error');
const ERROR_CODES = require('./error-codes');

/**
 * Not Found Error
 * 
 * Thrown when a requested resource is not found.
 * HTTP Status: 404 Not Found
 */
class NotFoundError extends BaseError {
  /**
   * Create a not found error
   * @param {string} resource - Resource type (e.g., 'Player', 'Competition')
   * @param {string|null} id - Resource ID (optional)
   */
  constructor(resource, id = null) {
    const message = id 
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, ERROR_CODES.NOT_FOUND);
  }
}

module.exports = NotFoundError;
