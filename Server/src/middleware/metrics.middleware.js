/**
 * Metrics Middleware
 * 
 * Tracks HTTP request metrics including response times, status codes, and errors.
 * Integrates with MetricsCollector to provide observability.
 * 
 * Requirements: 20.2, 20.3, 20.4
 */

/**
 * Create metrics middleware
 * @param {MetricsCollector} metricsCollector - Metrics collector instance
 * @returns {Function} Express middleware
 */
function createMetricsMiddleware(metricsCollector) {
  return (req, res, next) => {
    // Record request start time
    const startTime = Date.now();

    // Store original end function
    const originalEnd = res.end;

    // Override end function to capture metrics
    res.end = function(...args) {
      // Calculate response time
      const responseTime = Date.now() - startTime;

      // Record request metrics
      metricsCollector.trackRequest(
        req.method,
        req.path || req.url,
        res.statusCode,
        responseTime
      );

      // Record error if status code indicates error
      if (res.statusCode >= 400) {
        // Try to get error type from response locals
        const errorType = res.locals.errorType || 
                         (res.statusCode >= 500 ? 'InternalServerError' : 'ClientError');
        metricsCollector.trackError(errorType);
      }

      // Call original end function
      return originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Create metrics endpoint middleware
 * Returns metrics in JSON format
 * @param {MetricsCollector} metricsCollector - Metrics collector instance
 * @returns {Function} Express middleware
 */
function createMetricsEndpoint(metricsCollector) {
  return (req, res) => {
    try {
      const metrics = metricsCollector.getMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        message: error.message
      });
    }
  };
}

/**
 * Create Prometheus metrics endpoint middleware
 * Returns metrics in Prometheus text format
 * @param {MetricsCollector} metricsCollector - Metrics collector instance
 * @returns {Function} Express middleware
 */
function createPrometheusEndpoint(metricsCollector) {
  return (req, res) => {
    try {
      const prometheusMetrics = metricsCollector.toPrometheusFormat();
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(prometheusMetrics);
    } catch (error) {
      res.status(500).send('# Error exporting metrics\n');
    }
  };
}

/**
 * Middleware to track errors with metrics collector
 * Should be used in error handling middleware
 * @param {MetricsCollector} metricsCollector - Metrics collector instance
 * @returns {Function} Express error middleware
 */
function createErrorMetricsMiddleware(metricsCollector) {
  return (err, req, res, next) => {
    // Record error type
    const errorType = err.constructor.name || 'UnknownError';
    metricsCollector.trackError(errorType);

    // Store error type in response locals for metrics middleware
    res.locals.errorType = errorType;

    // Pass to next error handler
    next(err);
  };
}

module.exports = {
  createMetricsMiddleware,
  createMetricsEndpoint,
  createPrometheusEndpoint,
  createErrorMetricsMiddleware
};
