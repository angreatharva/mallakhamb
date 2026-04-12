const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Common validation rules used across multiple validators
 */

/**
 * Validate MongoDB ObjectId
 */
const objectId = (field, location = 'param') => {
  const validator = location === 'param' ? param(field) : 
                    location === 'body' ? body(field) : 
                    query(field);
  
  return validator
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error(`Invalid ${field} format`);
      }
      return true;
    });
};

/**
 * Validate email format
 */
const email = (field = 'email') => {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .toLowerCase();
};

/**
 * Validate password
 */
const password = (field = 'password', isOptional = false) => {
  const validator = body(field);
  
  if (isOptional) {
    return validator
      .optional()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number');
  }
  
  return validator
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number');
};

/**
 * Validate pagination parameters
 */
const pagination = () => {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ];
};

/**
 * Validate date range
 */
const dateRange = (startField = 'startDate', endField = 'endDate') => {
  return [
    body(startField)
      .trim()
      .notEmpty()
      .withMessage(`${startField} is required`)
      .isISO8601()
      .withMessage(`${startField} must be a valid date`)
      .toDate(),
    body(endField)
      .trim()
      .notEmpty()
      .withMessage(`${endField} is required`)
      .isISO8601()
      .withMessage(`${endField} must be a valid date`)
      .toDate()
      .custom((value, { req }) => {
        if (new Date(value) < new Date(req.body[startField])) {
          throw new Error(`${endField} must be after ${startField}`);
        }
        return true;
      })
  ];
};

/**
 * Validate date field
 */
const date = (field, isOptional = false) => {
  const validator = body(field)
    .trim()
    .isISO8601()
    .withMessage(`${field} must be a valid date`)
    .toDate();
  
  if (isOptional) {
    return validator.optional();
  }
  
  return validator.notEmpty().withMessage(`${field} is required`);
};

/**
 * Validate enum values
 */
const enumValue = (field, allowedValues, location = 'body') => {
  const validator = location === 'body' ? body(field) : 
                    location === 'param' ? param(field) : 
                    query(field);
  
  return validator
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .isIn(allowedValues)
    .withMessage(`${field} must be one of: ${allowedValues.join(', ')}`);
};

/**
 * Validate string field
 */
const string = (field, options = {}) => {
  const { 
    minLength = 1, 
    maxLength = 500, 
    isOptional = false,
    location = 'body'
  } = options;
  
  const validator = location === 'body' ? body(field) : 
                    location === 'param' ? param(field) : 
                    query(field);
  
  let chain = validator.trim();
  
  if (!isOptional) {
    chain = chain.notEmpty().withMessage(`${field} is required`);
  } else {
    chain = chain.optional();
  }
  
  return chain
    .isLength({ min: minLength, max: maxLength })
    .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`)
    .escape();
};

/**
 * Validate number field
 */
const number = (field, options = {}) => {
  const { 
    min = 0, 
    max = Number.MAX_SAFE_INTEGER, 
    isOptional = false,
    location = 'body'
  } = options;
  
  const validator = location === 'body' ? body(field) : 
                    location === 'param' ? param(field) : 
                    query(field);
  
  let chain = validator;
  
  if (!isOptional) {
    chain = chain.notEmpty().withMessage(`${field} is required`);
  } else {
    chain = chain.optional();
  }
  
  return chain
    .isNumeric()
    .withMessage(`${field} must be a number`)
    .custom((value) => {
      const num = parseFloat(value);
      if (num < min || num > max) {
        throw new Error(`${field} must be between ${min} and ${max}`);
      }
      return true;
    })
    .toFloat();
};

/**
 * Validate boolean field
 */
const boolean = (field, isOptional = false) => {
  const validator = body(field);
  
  if (isOptional) {
    return validator
      .optional()
      .isBoolean()
      .withMessage(`${field} must be a boolean`)
      .toBoolean();
  }
  
  return validator
    .notEmpty()
    .withMessage(`${field} is required`)
    .isBoolean()
    .withMessage(`${field} must be a boolean`)
    .toBoolean();
};

/**
 * Validate array field
 */
const array = (field, options = {}) => {
  const { 
    minLength = 0, 
    maxLength = 100, 
    isOptional = false 
  } = options;
  
  const validator = body(field);
  
  let chain = validator;
  
  if (!isOptional) {
    chain = chain.notEmpty().withMessage(`${field} is required`);
  } else {
    chain = chain.optional();
  }
  
  return chain
    .isArray({ min: minLength, max: maxLength })
    .withMessage(`${field} must be an array with ${minLength} to ${maxLength} items`);
};

module.exports = {
  objectId,
  email,
  password,
  pagination,
  dateRange,
  date,
  enumValue,
  string,
  number,
  boolean,
  array
};
