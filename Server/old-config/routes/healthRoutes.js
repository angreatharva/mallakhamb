/**
 * Health Check Routes
 * Provides health and readiness endpoints for monitoring
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * Health check endpoint
 * Returns overall system health status
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {}
  };
  
  // Database check
  try {
    await mongoose.connection.db.admin().ping();
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
    console.error('Database health check failed:', error);
  }
  
  // Memory check
  const memUsage = process.memoryUsage();
  health.checks.memory = {
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
  };
  
  // Environment check
  health.checks.environment = process.env.NODE_ENV || 'development';
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Readiness check endpoint
 * Returns whether the service is ready to accept traffic
 * Useful for Kubernetes readiness probes
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Check database connection
    await mongoose.connection.db.admin().ping();
    
    res.status(200).json({ 
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Readiness check failed:', error);
    res.status(503).json({ 
      status: 'not ready',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Liveness check endpoint
 * Returns whether the service is alive
 * Useful for Kubernetes liveness probes
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
