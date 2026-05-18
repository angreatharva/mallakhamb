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
      details[err.param] = err.msg;
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
