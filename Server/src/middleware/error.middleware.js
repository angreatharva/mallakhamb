/**
 * Error Handling Middleware
 * 
 * Provides centralized error handling with:
 * - Global error handler with logging
 * - Environment-specific error formatting (development vs production)
 * - 404 handler for undefined routes
 * - asyncHandler wrapper for catching async errors
 * 
 * Requirements: 6.2, 6.4, 6.5, 6.6, 6.7, 6.8
 */

const { BaseError } = require('../errors');

/**
 * Async handler wrapper to catch errors in async route handlers
 * Eliminates need for try-catch blocks in every async route
 * 
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await userService.getAll();
 *   res.json(users);
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler for undefined routes
 * Should be registered after all valid routes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
};

/**
 * Global error handler middleware
 * Handles all errors thrown in the application
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Get logger from request (injected by logging middleware) or use console
  const logger = req.logger || console;
  
  // Get correlation ID from request (if available)
  const correlationId = req.correlationId || req.id || 'unknown';
  
  // Determine if this is an operational error (expected) or programmer error (unexpected)
  const isOperational = err.isOperational !== undefined ? err.isOperational : err instanceof BaseError;
  
  // Determine status code
  let statusCode = err.statusCode || 500;
  
  // Handle specific error types
  if (err.name === 'ValidationError' && err.errors) {
    // Mongoose validation error
    statusCode = 400;
  } else if (err.name === 'CastError') {
    // Mongoose cast error (invalid ObjectId)
    statusCode = 400;
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 409;
  } else if (err.name === 'JsonWebTokenError') {
    // JWT error
    statusCode = 401;
  } else if (err.name === 'TokenExpiredError') {
    // JWT expired
    statusCode = 401;
  }
  
  // Determine log level based on status code
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  
  // Log error with context
  const logData = {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errorName: err.name,
    errorCode: err.code,
    message: err.message,
    isOperational,
    userId: req.user?.id || req.user?._id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };
  
  // Include stack trace for programmer errors
  if (!isOperational || statusCode >= 500) {
    logData.stack = err.stack;
  }
  
  // Log the error
  if (logger[logLevel]) {
    logger[logLevel](`Error occurred: ${err.message}`, logData);
  } else {
    console.error('Error occurred:', logData);
  }
  
  // Format error response based on environment
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorResponse = formatErrorResponse(err, isDevelopment, correlationId, statusCode);
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Format error response based on environment
 * Development: Detailed error information including stack trace
 * Production: Sanitized error messages without sensitive information
 * 
 * @param {Error} err - Error object
 * @param {boolean} isDevelopment - Whether running in development mode
 * @param {string} correlationId - Request correlation ID
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(err, isDevelopment, correlationId, statusCode) {
  const response = {
    success: false,
    error: {
      message: err.message,
      code: err.code || 'INTERNAL_SERVER_ERROR',
      correlationId
    }
  };
  
  // Add details for operational errors
  if (err.details && Object.keys(err.details).length > 0) {
    response.error.details = err.details;
  }
  
  // Handle Mongoose validation errors
  if (err.name === 'ValidationError' && err.errors) {
    response.error.code = 'VALIDATION_ERROR';
    response.error.details = {};
    for (const field in err.errors) {
      response.error.details[field] = err.errors[field].message;
    }
  }
  
  // Handle Mongoose cast errors
  if (err.name === 'CastError') {
    response.error.code = 'INVALID_INPUT';
    response.error.message = `Invalid ${err.path}: ${err.value}`;
  }
  
  // Handle MongoDB duplicate key errors
  if (err.code === 11000) {
    response.error.code = 'DUPLICATE_ENTRY';
    const field = Object.keys(err.keyValue || {})[0];
    response.error.message = field 
      ? `${field} already exists`
      : 'Duplicate entry';
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    response.error.code = 'TOKEN_INVALID';
    response.error.message = 'Invalid authentication token';
  }
  
  if (err.name === 'TokenExpiredError') {
    response.error.code = 'TOKEN_EXPIRED';
    response.error.message = 'Authentication token has expired';
  }
  
  // Sanitize error messages in production
  if (!isDevelopment) {
    // For 500 errors, don't expose internal error messages
    if (statusCode >= 500) {
      response.error.message = 'An internal server error occurred';
      delete response.error.details;
    }
    
    // Remove sensitive information from error messages
    response.error.message = sanitizeErrorMessage(response.error.message);
  }
  
  // Add development-specific information
  if (isDevelopment) {
    response.error.stack = err.stack;
    response.error.name = err.name;
    
    // Add original error for debugging
    if (err.isOperational === false) {
      response.error.type = 'ProgrammerError';
    }
  }
  
  return response;
}

/**
 * Sanitize error message to remove sensitive information
 * 
 * @param {string} message - Error message
 * @returns {string} Sanitized message
 */
function sanitizeErrorMessage(message) {
  if (!message) return message;
  
  // Remove file paths
  message = message.replace(/\/[^\s]+\.(js|ts|json)/gi, '[FILE_PATH]');
  
  // Remove email addresses
  message = message.replace(/[\w.-]+@[\w.-]+\.\w+/gi, '[EMAIL]');
  
  // Remove potential tokens or secrets (long alphanumeric strings)
  message = message.replace(/\b[a-f0-9]{32,}\b/gi, '[TOKEN]');
  
  // Remove IP addresses
  message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  
  return message;
}

module.exports = {
  asyncHandler,
  notFoundHandler,
  errorHandler
};
