/**
 * Request Timing Middleware
 * 
 * Tracks request duration and logs slow requests
 * Helps identify performance bottlenecks
 * 
 * Requirements: 13.6, 20.3
 */

/**
 * Create request timing middleware
 * @param {Object} container - DI container
 * @param {Object} options - Configuration options
 * @param {number} options.slowRequestThreshold - Threshold in ms for slow request warning (default: 1000)
 * @returns {Function} Express middleware
 */
function createTimingMiddleware(container, options = {}) {
  const logger = container.resolve('logger');
  const slowRequestThreshold = options.slowRequestThreshold || 1000;

  return (req, res, next) => {
    // Record start time
    const startTime = Date.now();
    req.startTime = startTime;

    // Capture the original res.json to intercept response
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Function to log request completion
    const logCompletion = () => {
      const duration = Date.now() - startTime;
      const logData = {
        method: req.method,
        url: req.originalUrl,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userId: req.user?._id,
        userType: req.userType,
        correlationId: req.correlationId,
        ip: req.ip
      };

      // Determine log level based on duration and status code
      if (duration >= slowRequestThreshold) {
        logger.warn('Slow request detected', {
          ...logData,
          threshold: slowRequestThreshold
        });
      } else if (res.statusCode >= 500) {
        logger.error('Request completed with server error', logData);
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', logData);
      } else {
        logger.http('Request completed', logData);
      }

      // Add timing header to response
      res.setHeader('X-Response-Time', `${duration}ms`);
    };

    // Override res.json
    res.json = function(data) {
      logCompletion();
      return originalJson(data);
    };

    // Override res.send
    res.send = function(data) {
      logCompletion();
      return originalSend(data);
    };

    // Handle cases where response is ended without json/send
    res.on('finish', () => {
      // Only log if we haven't already (json/send not called)
      if (!res.headersSent || !res.getHeader('X-Response-Time')) {
        logCompletion();
      }
    });

    next();
  };
}

/**
 * Get request duration from request object
 * @param {Object} req - Express request object
 * @returns {number} Duration in milliseconds
 */
function getRequestDuration(req) {
  if (!req.startTime) {
    return 0;
  }
  return Date.now() - req.startTime;
}

module.exports = {
  createTimingMiddleware,
  getRequestDuration
};
