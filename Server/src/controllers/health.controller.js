/**
 * Health Controller
 *
 * Infrastructure controller for liveness, readiness and component health.
 * Intentionally kept as a class — it is not a business domain controller and
 * has no DI container requirement. Dependencies are passed directly via constructor.
 *
 * Endpoints:
 *   GET /health/live    — liveness probe
 *   GET /health/ready   — readiness probe
 *   GET /health         — detailed component health
 *
 * Metrics live at the root-level GET /metrics (prom-client), not here.
 *
 * @module controllers/health.controller
 */

/**
 * The public face of a readiness/health report: the overall status and each
 * check's status, nothing else (security audit 2026-10-31, M6). The full body
 * names the database host and database, the Node version, the PID and the
 * mail provider — an anonymous map of the deployment, and on Render it named
 * an Atlas cluster that accepts connections from anywhere. Probes only ever
 * read the HTTP status, which is unchanged.
 * @param {Object} report
 * @returns {Object}
 */
function publicSummary(report) {
  const checks = {};
  for (const [name, check] of Object.entries(report?.checks || {})) {
    checks[name] = { status: check?.status };
  }
  return { status: report?.status, timestamp: report?.timestamp, checks };
}

class HealthController {
  /**
   * @param {Object} healthMonitor - Service that checks component health
   * @param {Object} logger        - Logger instance
   * @param {(req: import('express').Request) => boolean} [isTrusted] - true
   *   when the caller may see the full report (the metrics bearer token)
   */
  constructor(healthMonitor, logger, isTrusted = () => false) {
    this.healthMonitor = healthMonitor;
    this.logger = logger;
    this.isTrusted = isTrusted;
  }

  /** Full report for a trusted caller, the summary for everyone else. */
  _shape(req, report) {
    return this.isTrusted(req) ? report : publicSummary(report);
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
      return res.status(code).json(this._shape(req, status));
    } catch (error) {
      this.logger.error('Readiness probe failed', { error: error.message });
      return res.status(503).json({ status: 'not_ready' });
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
      return res.status(code).json(this._shape(req, health));
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      return res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

module.exports = HealthController;
