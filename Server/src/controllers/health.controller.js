/**
 * Health Controller
 *
 * Infrastructure controller for Kubernetes probes and Prometheus metrics.
 * Intentionally kept as a class — it is not a business domain controller and
 * has no DI container requirement. Dependencies are passed directly via constructor.
 *
 * Endpoints:
 *   GET /health/live    — liveness probe
 *   GET /health/ready   — readiness probe
 *   GET /health         — detailed component health
 *   GET /health/metrics — JSON or Prometheus-format metrics
 *
 * @module controllers/health.controller
 */

class HealthController {
  /**
   * @param {Object} healthMonitor     - Service that checks component health
   * @param {Object} metricsCollector  - Service that collects performance metrics
   * @param {Object} logger            - Logger instance
   */
  constructor(healthMonitor, metricsCollector, logger) {
    this.healthMonitor = healthMonitor;
    this.metricsCollector = metricsCollector;
    this.logger = logger;
  }

  /**
   * Liveness probe — returns 200 if the process is running.
   * @route GET /health/live
   */
  async liveness(req, res) {
    try {
      const status = this.healthMonitor.liveness();
      return res.status(200).json(status);
    } catch (error) {
      this.logger.error('Liveness probe failed', { error: error.message });
      return res.status(503).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Readiness probe — returns 200 only when all dependencies (DB, etc.) are reachable.
   * @route GET /health/ready
   */
  async readiness(req, res) {
    try {
      const status = await this.healthMonitor.readiness();
      const code = status.status === 'ready' ? 200 : 503;
      return res.status(code).json(status);
    } catch (error) {
      this.logger.error('Readiness probe failed', { error: error.message });
      return res.status(503).json({ status: 'not_ready', message: error.message });
    }
  }

  /**
   * Detailed health check — reports per-component status.
   * @route GET /health
   */
  async health(req, res) {
    try {
      const health = await this.healthMonitor.checkHealth();
      const code = health.status === 'healthy' ? 200 : 503;
      return res.status(code).json(health);
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      return res.status(503).json({
        status: 'unhealthy',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Metrics endpoint — supports JSON (default) and Prometheus text format.
   * @route GET /health/metrics
   * @query {string} [format=json] — 'json' or 'prometheus'
   */
  async metrics(req, res) {
    try {
      if (req.query.format === 'prometheus') {
        const output = this.metricsCollector.toPrometheusFormat();
        res.set('Content-Type', 'text/plain; version=0.0.4');
        return res.status(200).send(output);
      }

      const metrics = this.metricsCollector.getMetrics();
      return res.status(200).json(metrics);
    } catch (error) {
      this.logger.error('Metrics endpoint failed', { error: error.message });
      return res.status(500).json({
        error: 'Failed to retrieve metrics',
        message: error.message,
      });
    }
  }
}

module.exports = HealthController;
