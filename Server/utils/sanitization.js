/**
 * Input Sanitization Utility
 * Prevents NoSQL injection attacks by sanitizing query parameters
 */

/**
 * Sanitize a single query parameter
 * @param {*} param - The parameter to sanitize
 * @returns {string|null} - Sanitized string or null if invalid
 */
const sanitizeQueryParam = (param) => {
  if (typeof param !== 'string') {
    return null; // Reject non-string values
  }
  return param.trim();
};

/**
 * Sanitize an entire MongoDB query object
 * Removes any non-primitive values that could contain MongoDB operators
 * @param {Object} query - The query object to sanitize
 * @returns {Object} - Sanitized query object
 */
const sanitizeMongoQuery = (query) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      sanitized[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
    // Reject objects, arrays, and other types that could contain operators
  }
  return sanitized;
};

module.exports = { sanitizeQueryParam, sanitizeMongoQuery };
