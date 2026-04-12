/**
 * Health Monitor
 * 
 * Provides comprehensive health checking for system components:
 * - Database connectivity
 * - External service availability
 * - Memory usage and process uptime
 * - Liveness and readiness probes
 */

const mongoose = require('mongoose');

class HealthMonitor {
  constructor(config, logger, emailService) {
    this.config = config;
    this.logger = logger;
    this.emailService = emailService;
    this.startTime = Date.now();
  }

  /**
   * Perform comprehensive health check
   * @returns {Promise<Object>} Health status for all components
   */
  async checkHealth() {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      checks: {}
    };

    try {
      // Check database
      checks.checks.database = await this.checkDatabase();
      
      // Check memory
      checks.checks.memory = this.checkMemory();
      
      // Check email service (if enabled)
      if (this.emailService) {
        checks.checks.email = await this.checkEmailService();
      }

      // Determine overall status
      const hasFailures = Object.values(checks.checks).some(check => check.status === 'unhealthy');
      checks.status = hasFailures ? 'unhealthy' : 'healthy';

    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      checks.status = 'unhealthy';
      checks.error = error.message;
    }

    return checks;
  }

  /**
   * Liveness probe - checks if server is running
   * @returns {Object} Liveness status
   */
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime()
    };
  }

  /**
   * Readiness probe - checks if server is ready to accept traffic
   * @returns {Promise<Object>} Readiness status
   */
  async readiness() {
    try {
      // Check critical dependencies
      const dbStatus = await this.checkDatabase();
      
      const isReady = dbStatus.status === 'healthy';

      return {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbStatus
        }
      };
    } catch (error) {
      this.logger.error('Readiness check failed', { error: error.message });
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Check database connectivity
   * @returns {Promise<Object>} Database health status
   */
  async checkDatabase() {
    const timeout = 5000; // 5 second timeout
    
    try {
      const startTime = Date.now();
      
      // Check connection state
      const state = mongoose.connection.readyState;
      const stateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      if (state !== 1) {
        return {
          status: 'unhealthy',
          message: `Database ${stateMap[state]}`,
          responseTime: Date.now() - startTime
        };
      }

      // Perform a simple ping operation with timeout
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database ping timeout')), timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Database connected',
        responseTime,
        connections: {
          current: mongoose.connection.db.serverConfig?.s?.pool?.totalConnectionCount || 0
        }
      };
    } catch (error) {
      this.logger.error('Database health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.message
      };
    }
  }

  /**
   * Check memory usage
   * @returns {Object} Memory health status
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const maxMemory = 512 * 1024 * 1024; // 512MB threshold
    
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    const isHealthy = usage.heapUsed < maxMemory;

    return {
      status: isHealthy ? 'healthy' : 'warning',
      message: isHealthy ? 'Memory usage normal' : 'Memory usage high',
      usage: {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${heapTotalMB}MB`,
        rss: `${rssMB}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`
      },
      percentage: Math.round((usage.heapUsed / maxMemory) * 100)
    };
  }

  /**
   * Check email service availability
   * @returns {Promise<Object>} Email service health status
   */
  async checkEmailService() {
    try {
      // Simple check - verify email service is configured
      if (!this.emailService) {
        return {
          status: 'unhealthy',
          message: 'Email service not configured'
        };
      }

      // Check if email provider is configured
      const provider = typeof this.config.get === 'function'
        ? this.config.get('email.provider')
        : this.config.email?.provider;
      if (!provider) {
        return {
          status: 'unhealthy',
          message: 'Email provider not configured'
        };
      }

      return {
        status: 'healthy',
        message: 'Email service configured',
        provider
      };
    } catch (error) {
      this.logger.error('Email service health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        message: error.message,
        error: error.message
      };
    }
  }

  /**
   * Get process uptime in seconds
   * @returns {number} Uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get formatted uptime string
   * @returns {string} Formatted uptime
   */
  getFormattedUptime() {
    const uptime = this.getUptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }
}

module.exports = HealthMonitor;
