const mongoose = require('mongoose');
const os = require('os');

/**
 * Health Monitor
 * 
 * Provides comprehensive health checking and monitoring for the application.
 * Supports liveness and readiness probes for container orchestration.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8
 */
class HealthMonitor {
  /**
   * @param {Object} config - Plain config object or ConfigManager instance
   * @param {Object} logger - Logger instance
   * @param {Object|null} emailService - Email service instance
   */
  constructor(config, logger, emailService = null) {
    this.config = config;
    this.logger = logger;
    this.emailService = emailService;
    this.startTime = Date.now();
    this.lastHealthCheck = null;
    this.healthStatus = {
      status: 'unknown',
      checks: {}
    };
  }

  /**
   * Get a config value, supporting both plain objects and ConfigManager instances
   */
  _getConfig(key, defaultValue) {
    if (this.config && typeof this.config.get === 'function') {
      try {
        const val = this.config.get(key);
        return val !== undefined && val !== null ? val : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    }
    if (this.config) {
      const parts = key.split('.');
      let val = this.config;
      for (const part of parts) {
        if (val == null) return defaultValue;
        val = val[part];
      }
      return val !== undefined && val !== null ? val : defaultValue;
    }
    return defaultValue;
  }

  // ============================================================
  // Liveness probe
  // ============================================================

  /**
   * Synchronous liveness check (new API, used by src/ tests)
   */
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: this.getUptimeSeconds()
    };
  }

  /**
   * Async liveness check (old API, used by tests/unit/ tests)
   */
  async checkLiveness() {
    try {
      const uptime = process.uptime();
      return {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        pid: process.pid
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Liveness check failed', { error: error.message });
      return {
        status: 'dead',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // ============================================================
  // Readiness probe
  // ============================================================

  /**
   * Readiness probe (new API, used by src/ tests)
   * Returns checks.database as an object
   */
  async readiness() {
    try {
      const dbCheck = await this.checkDatabase();
      const isReady = dbCheck.status === 'healthy';

      return {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbCheck
        }
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Readiness check failed', { error: error.message });
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message,
        checks: {
          database: { status: 'unhealthy', error: error.message }
        }
      };
    }
  }

  /**
   * Readiness probe (old API, used by tests/unit/ tests)
   * Returns checks.database as a string
   */
  async checkReadiness() {
    try {
      const databaseReady = await this.isDatabaseReady();
      return {
        status: databaseReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseReady ? 'ready' : 'not_ready'
        }
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Readiness check failed', { error: error.message });
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message,
        checks: {
          database: 'not_ready'
        }
      };
    }
  }

  // ============================================================
  // Full health check
  // ============================================================

  async checkHealth() {
    const startTime = Date.now();
    const checks = {};

    try {
      const [databaseResult, memoryResult, emailResult] = await Promise.allSettled([
        this.checkDatabase(),
        Promise.resolve(this.checkMemory()),
        this.checkEmailService()
      ]);

      checks.database = databaseResult.status === 'fulfilled'
        ? databaseResult.value
        : { status: 'unhealthy', error: databaseResult.reason?.message };

      checks.memory = memoryResult.status === 'fulfilled'
        ? memoryResult.value
        : { status: 'unhealthy', error: memoryResult.reason?.message };

      checks.email = emailResult.status === 'fulfilled'
        ? emailResult.value
        : { status: 'unhealthy', error: emailResult.reason?.message };

      // Add uptime and process info (for tests/unit/ tests)
      checks.uptime = this.getUptimeObject();
      checks.process = this.getProcessInfo();

      // Determine overall status
      const criticalChecks = [checks.database, checks.memory, checks.email];
      const allHealthy = criticalChecks.every(c => c.status === 'healthy' || c.status === 'degraded');
      const overallStatus = allHealthy ? 'healthy' : 'unhealthy';

      this.healthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: this.getUptimeSeconds(),
        duration: Date.now() - startTime,
        checks
      };

      this.lastHealthCheck = Date.now();

      if (overallStatus === 'unhealthy') {
        this.logger && this.logger.warn && this.logger.warn('Health check failed', { healthStatus: this.healthStatus });
      } else {
        this.logger && this.logger.debug && this.logger.debug('Health check passed', { healthStatus: this.healthStatus });
      }

      return this.healthStatus;
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Health check error', { error: error.message });
      this.healthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: this.getUptimeSeconds(),
        duration: Date.now() - startTime,
        error: error.message,
        checks
      };
      return this.healthStatus;
    }
  }

  // ============================================================
  // Database check
  // ============================================================

  async checkDatabase() {
    const timeout = this._getConfig('database.timeouts.connection', 5000);

    try {
      const state = mongoose.connection.readyState;

      if (state === 0) {
        return {
          status: 'unhealthy',
          message: 'Database disconnected',
          state: 'disconnected',
          error: 'Database not connected. State: disconnected'
        };
      }
      if (state === 2) {
        return {
          status: 'unhealthy',
          message: 'Database connecting',
          state: 'connecting',
          error: 'Database not connected. State: connecting'
        };
      }
      if (state === 3) {
        return {
          status: 'unhealthy',
          message: 'Database disconnecting',
          state: 'disconnecting',
          error: 'Database not connected. State: disconnecting'
        };
      }

      // state === 1: connected — do a ping with timeout
      const startTime = Date.now();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database check timeout')), timeout)
      );

      const pingPromise = mongoose.connection.db.admin().ping();

      await Promise.race([pingPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;

      // Try to get connection count
      let connectionCount = 0;
      try {
        connectionCount = mongoose.connection.db.serverConfig?.s?.pool?.totalConnectionCount || 0;
      } catch (e) {
        // ignore
      }

      return {
        status: 'healthy',
        message: 'Database connected',
        state: 'connected',
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        responseTime,
        connections: {
          current: connectionCount
        }
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Database health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        message: error.message.includes('timeout') ? 'Database check timeout' : error.message,
        state: this.getConnectionStateName(mongoose.connection.readyState),
        error: error.message
      };
    }
  }

  async isDatabaseReady() {
    try {
      const state = mongoose.connection.readyState;
      if (state !== 1) return false;
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  getConnectionStateName(state) {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[state] || 'unknown';
  }

  // ============================================================
  // Memory check
  // ============================================================

  checkMemory() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);
      const externalMB = Math.round((memUsage.external || 0) / 1024 / 1024);

      const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

      // System memory
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const systemUsagePercent = Math.round((usedMemory / totalMemory) * 100);

      // Determine status
      let status = 'healthy';
      let warning = null;

      if (heapUsagePercent > 90) {
        status = 'unhealthy';
        warning = 'Critical: Heap usage above 90%';
      } else if (heapUsagePercent > 80) {
        status = 'degraded';
        warning = 'Warning: Heap usage above 80%';
      }

      if (systemUsagePercent > 95) {
        status = 'unhealthy';
        warning = (warning ? warning + '; ' : '') + 'Critical: System memory usage above 95%';
      }

      // Threshold for src/ tests: 512MB heap used
      const threshold = 512;
      const percentage = Math.round((heapUsedMB / threshold) * 100);
      const isHighSimple = heapUsedMB > threshold;

      return {
        // Old API fields (tests/unit/)
        status: status === 'healthy' && isHighSimple ? 'warning' : status,
        warning,
        heap: {
          used: heapUsedMB,
          total: heapTotalMB,
          usagePercent: heapUsagePercent
        },
        rss: rssMB,
        external: externalMB,
        system: {
          used: Math.round(usedMemory / 1024 / 1024),
          total: Math.round(totalMemory / 1024 / 1024),
          free: Math.round(freeMemory / 1024 / 1024),
          usagePercent: systemUsagePercent
        },
        // New API fields (src/)
        message: isHighSimple ? 'Memory usage high' : 'Memory usage normal',
        percentage,
        usage: {
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          rss: `${rssMB}MB`
        }
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Memory health check failed', { error: error.message });
      return { status: 'unhealthy', error: error.message };
    }
  }

  // ============================================================
  // Email service check
  // ============================================================

  async checkEmailService() {
    try {
      if (!this.emailService) {
        return {
          status: 'healthy',
          configured: false,
          message: 'Email service not configured'
        };
      }

      const provider = this._getConfig('email.provider', null);

      if (typeof this.emailService.checkHealth === 'function') {
        const result = await this.emailService.checkHealth();
        return {
          status: result.healthy ? 'healthy' : 'unhealthy',
          configured: true,
          healthy: result.healthy,
          provider: result.provider || provider,
          ...result
        };
      }

      // No health check method — assume healthy if service exists
      return {
        status: 'healthy',
        configured: true,
        message: 'Email service configured (no health check available)',
        provider
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Email service health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        configured: true,
        error: error.message
      };
    }
  }

  // ============================================================
  // Uptime
  // ============================================================

  /**
   * Get uptime as an object — primary API
   */
  getUptime() {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const processUptimeSeconds = Math.floor(process.uptime());

    return {
      application: this.formatUptime(uptimeSeconds),
      applicationSeconds: uptimeSeconds,
      process: this.formatUptime(processUptimeSeconds),
      processSeconds: processUptimeSeconds,
      startTime: new Date(this.startTime).toISOString()
    };
  }

  /**
   * Get uptime in seconds as a number (internal helper)
   */
  getUptimeSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get uptime as an object — old API for tests/unit/ tests
   */
  getUptimeObject() {
    return this.getUptime();
  }

  /**
   * Format uptime in human-readable format
   */
  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Get formatted uptime string — new API for src/ tests
   */
  getFormattedUptime() {
    return this.formatUptime(this.getUptimeSeconds());
  }

  // ============================================================
  // Process info
  // ============================================================

  getProcessInfo() {
    return {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuUsage: process.cpuUsage(),
      environment: this._getConfig('server.nodeEnv', process.env.NODE_ENV || 'unknown')
    };
  }

  // ============================================================
  // Health check state management
  // ============================================================

  getLastHealthCheck() {
    return this.healthStatus;
  }

  getTimeSinceLastCheck() {
    if (!this.lastHealthCheck) return null;
    return Date.now() - this.lastHealthCheck;
  }

  isHealthCheckStale(thresholdMs = 60000) {
    const timeSinceCheck = this.getTimeSinceLastCheck();
    if (timeSinceCheck === null) return true;
    return timeSinceCheck > thresholdMs;
  }
}

module.exports = HealthMonitor;
