/**
 * Health Check Routes
 * 
 * Provides endpoints for health monitoring and metrics
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize health routes with controller from DI container
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createHealthRoutes(container) {
  const healthController = container.resolve('healthController');

  /**
   * @route GET /health/live
   * @desc Liveness probe - checks if server is running
   * @access Public
   */
  router.get('/live', (req, res) => healthController.liveness(req, res));

  /**
   * @route GET|HEAD /health/ping
   * @desc Uptime-pinger target (keeps Render's free plan awake). Same answer as
   *       /live — no auth, no database — and never cached, so every ping
   *       reaches the process rather than a proxy's copy.
   * @access Public
   */
  router.get('/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    return healthController.liveness(req, res);
  });

  /**
   * @route GET /health/ready
   * @desc Readiness probe - checks if server is ready for traffic
   * @access Public
   */
  router.get('/ready', (req, res) => healthController.readiness(req, res));

  /**
   * @route GET /health
   * @desc Detailed health check - returns status of all components
   * @access Public
   */
  router.get('/', (req, res) => healthController.health(req, res));

  /**
   * @route GET /health/metrics
   * @desc Performance metrics - returns metrics in JSON or Prometheus format
   * @query {string} format - 'json' (default) or 'prometheus'
   * @access Public
   */
  router.get('/metrics', (req, res) => healthController.metrics(req, res));

  return router;
}

module.exports = createHealthRoutes;
