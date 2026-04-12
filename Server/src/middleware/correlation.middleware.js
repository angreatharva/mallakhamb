/**
 * Correlation ID Middleware
 * 
 * Generates unique ID for each request and attaches to request object and logs
 * Enables request tracing across services
 * 
 * Requirements: 12.8, 13.5
 */

const crypto = require('crypto');

/**
 * Generate a unique correlation ID
 * @returns {string} Correlation ID
 */
function generateCorrelationId() {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Create correlation ID middleware
 * @param {Object} container - DI container
 * @returns {Function} Express middleware
 */
function createCorrelationMiddleware(container) {
  const logger = container.resolve('logger');

  return (req, res, next) => {
    // Check if correlation ID already exists in headers (from upstream service)
    let correlationId = req.headers['x-correlation-id'] || 
                        req.headers['x-request-id'];

    // Generate new correlation ID if not present
    if (!correlationId) {
      correlationId = generateCorrelationId();
    }

    // Attach correlation ID to request
    req.correlationId = correlationId;
    req.id = correlationId; // Alias for compatibility

    // Attach correlation ID to response headers
    res.setHeader('X-Correlation-ID', correlationId);

    // Create a child logger with correlation ID context
    req.logger = {
      error: (message, meta = {}) => {
        logger.error(message, { ...meta, correlationId });
      },
      warn: (message, meta = {}) => {
        logger.warn(message, { ...meta, correlationId });
      },
      info: (message, meta = {}) => {
        logger.info(message, { ...meta, correlationId });
      },
      debug: (message, meta = {}) => {
        logger.debug(message, { ...meta, correlationId });
      },
      http: (message, meta = {}) => {
        logger.http(message, { ...meta, correlationId });
      }
    };

    // Log incoming request
    req.logger.http('Incoming request', {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?._id,
      userType: req.userType
    });

    next();
  };
}

module.exports = {
  createCorrelationMiddleware,
  generateCorrelationId
};
