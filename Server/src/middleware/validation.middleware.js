/**
 * Validation Middleware
 * 
 * Provides middleware for handling express-validator validation errors
 * 
 * @module middleware/validation.middleware
 */

const { validationResult } = require('express-validator');
const { ValidationError } = require('../errors');

/**
 * Handle validation errors from express-validator
 * 
 * Checks for validation errors and returns a 400 response if any are found.
 * Otherwise, passes control to the next middleware.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const details = {};
    for (const err of errors.array()) {
      /*
       * express-validator 7 renamed this field from `param` to `path`. Reading
       * the old name returned undefined for every error, so each response
       * carried `details: { "undefined": "..." }` — and because they all shared
       * that one key, a form with three bad fields reported only the last one.
       *
       * `param` is still read as a fallback so a downgrade does not silently
       * reintroduce the bug, and the error types that legitimately have no path
       * (`alternative`, `unknown_fields`) are grouped rather than colliding.
       */
      const field = err.path || err.param || '_error';
      details[field] = err.msg;
    }
    return next(new ValidationError('Validation error', details));
  }

  next();
};

const validate = (rules = []) => {
  return [...rules, handleValidationErrors];
};

module.exports = {
  handleValidationErrors,
  validate
};
