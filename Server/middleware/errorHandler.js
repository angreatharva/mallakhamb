/**
 * Comprehensive Error Handling Middleware
 * Handles all types of errors with consistent response format
 * Requirement 10.6: Data Isolation and Security
 */

const mongoose = require('mongoose');

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode, errorType = 'Application Error', field = null, value = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.field = field;
    this.value = value;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle MongoDB validation errors (400)
 */
const handleValidationError = (error) => {
  const messages = Object.values(error.errors).map(e => e.message);
  return {
    error: 'Validation Error',
    message: messages.join(', '),
    details: error.errors,
    statusCode: 400
  };
};

/**
 * Handle MongoDB duplicate key errors (409)
 */
const handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyPattern)[0];
  const value = error.keyValue[field];
  return {
    error: 'Duplicate Entry',
    message: `${field} already exists`,
    field,
    value,
    statusCode: 409
  };
};

/**
 * Handle MongoDB cast errors - invalid ObjectId (400)
 */
const handleCastError = (error) => {
  return {
    error: 'Invalid ID Format',
    message: `Invalid ${error.path}: ${error.value}`,
    field: error.path,
    value: error.value,
    statusCode: 400
  };
};

/**
 * Handle JWT errors (401)
 */
const handleJWTError = () => {
  return {
    error: 'Authentication Error',
    message: 'Invalid token. Please log in again.',
    statusCode: 401
  };
};

/**
 * Handle JWT expired errors (401)
 */
const handleJWTExpiredError = () => {
  return {
    error: 'Authentication Error',
    message: 'Your token has expired. Please log in again.',
    statusCode: 401
  };
};

/**
 * Main error handling middleware
 * Processes all errors and returns consistent response format
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log error for debugging (in development) and security monitoring
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Details:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: error.statusCode
    });
  } else {
    // In production, log only essential information
    console.error('Error:', {
      name: err.name,
      message: err.message,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      userId: req.user?._id
    });
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    const validationError = handleValidationError(err);
    return res.status(validationError.statusCode).json(validationError);
  }

  if (err.code === 11000) {
    const duplicateError = handleDuplicateKeyError(err);
    return res.status(duplicateError.statusCode).json(duplicateError);
  }

  if (err.name === 'CastError') {
    const castError = handleCastError(err);
    return res.status(castError.statusCode).json(castError);
  }

  if (err.name === 'JsonWebTokenError') {
    const jwtError = handleJWTError();
    return res.status(jwtError.statusCode).json(jwtError);
  }

  if (err.name === 'TokenExpiredError') {
    const expiredError = handleJWTExpiredError();
    return res.status(expiredError.statusCode).json(expiredError);
  }

  // Handle custom AppError
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.errorType,
      message: err.message,
      ...(err.field && { field: err.field }),
      ...(err.value && { value: err.value })
    });
  }

  // Default error response for unknown errors
  const statusCode = error.statusCode || 500;
  const response = {
    error: statusCode === 500 ? 'Internal Server Error' : 'Error',
    message: statusCode === 500 
      ? 'An unexpected error occurred' 
      : error.message || 'Something went wrong',
    timestamp: new Date().toISOString()
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Handle 404 Not Found errors
 */
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route not found: ${req.originalUrl}`,
    404,
    'Not Found'
  );
  next(error);
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error handler for express-validator
 */
const handleExpressValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid input data',
      details: errorMessages
    });
  }
  
  next();
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  handleExpressValidationErrors
};
