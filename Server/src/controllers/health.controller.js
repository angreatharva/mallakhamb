/**
 * Health Controller
 * 
 * Provides health check and metrics endpoints for monitoring:
 * - /health/live - Liveness probe (is server running)
 * - /health/ready - Readiness probe (is server ready for traffic)
 * - /health - Detailed health status
 * - /health/metrics - Performance metrics
 */

class HealthController {
  constructor(healthMonitor, metricsCollector, logger) {
    this.healthMonitor = healthMonitor;
    this.metricsCollector = metricsCollector;
    this.logger = logger;
  }

  /**
   * Liveness probe endpoint
   * Returns 200 if server is running
   * 
   * @route GET /health/live
   * @returns {Object} Liveness status
   */
  async liveness(req, res) {
    try {
      const status = this.healthMonitor.liveness();
      return res.status(200).json(status);
    } catch (error) {
      this.logger.error('Liveness probe failed', { error: error.message });
      return res.status(503).json({
        status: 'error',
        message: error.message
      });
    }
  }

  /**
   * Readiness probe endpoint
   * Returns 200 if server is ready to accept traffic
   * 
   * @route GET /health/ready
   * @returns {Object} Readiness status
   */
  async readiness(req, res) {
    try {
      const status = await this.healthMonitor.readiness();
      
      const statusCode = status.status === 'ready' ? 200 : 503;
      return res.status(statusCode).json(status);
    } catch (error) {
      this.logger.error('Readiness probe failed', { error: error.message });
      return res.status(503).json({
        status: 'not_ready',
        message: error.message
      });
    }
  }

  /**
   * Detailed health check endpoint
   * Returns comprehensive health status for all components
   * 
   * @route GET /health
   * @returns {Object} Detailed health status
   */
  async health(req, res) {
    try {
      const health = await this.healthMonitor.checkHealth();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      return res.status(statusCode).json(health);
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      return res.status(503).json({
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Metrics endpoint
   * Returns performance metrics in JSON or Prometheus format
   * 
   * @route GET /health/metrics
   * @query {string} format - Response format ('json' or 'prometheus')
   * @returns {Object|string} Performance metrics
   */
  async metrics(req, res) {
    try {
      const format = req.query.format || 'json';

      if (format === 'prometheus') {
        const prometheusMetrics = this.metricsCollector.toPrometheusFormat();
        res.set('Content-Type', 'text/plain; version=0.0.4');
        return res.status(200).send(prometheusMetrics);
      }

      // Default to JSON format
      const metrics = this.metricsCollector.getMetrics();
      return res.status(200).json(metrics);
    } catch (error) {
      this.logger.error('Metrics endpoint failed', { error: error.message });
      return res.status(500).json({
        error: 'Failed to retrieve metrics',
        message: error.message
      });
    }
  }
}

module.exports = HealthController;
