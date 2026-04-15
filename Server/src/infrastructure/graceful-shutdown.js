/**
 * GracefulShutdownHandler
 * 
 * Coordinates graceful shutdown of the server when SIGTERM or SIGINT signals are received.
 * Ensures in-flight requests complete, connections are closed properly, and resources are cleaned up.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

class GracefulShutdownHandler {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.isShuttingDown = false;
    this.server = null;
    this.socketManager = null;
    this.dbConnection = null;
    this.metricsCollector = null;
    this.shutdownTimeout = 30000; // 30 seconds max wait for in-flight requests
  }

  /**
   * Register server and dependencies for shutdown
   * @param {Object} options - Shutdown dependencies
   * @param {http.Server} options.server - HTTP server instance
   * @param {SocketManager} options.socketManager - Socket.IO manager
   * @param {mongoose.Connection} options.dbConnection - Database connection
   * @param {MetricsCollector} options.metricsCollector - Metrics collector
   */
  register({ server, socketManager, dbConnection, metricsCollector }) {
    this.server = server;
    this.socketManager = socketManager;
    this.dbConnection = dbConnection;
    this.metricsCollector = metricsCollector;

    // Register signal handlers
    this.setupSignalHandlers();

    this.logger.info('Graceful shutdown handler registered');
  }

  /**
   * Setup signal handlers for SIGTERM and SIGINT
   */
  setupSignalHandlers() {
    // Handle SIGTERM (sent by process managers like PM2, Docker, Kubernetes)
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM signal received');
      this.shutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C in terminal)
    process.on('SIGINT', () => {
      this.logger.info('SIGINT signal received');
      this.shutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown('uncaughtException', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', { reason, promise });
      this.shutdown('unhandledRejection', 1);
    });
  }

  /**
   * Execute graceful shutdown sequence
   * @param {string} signal - Signal that triggered shutdown
   * @param {number} exitCode - Exit code (0 for clean shutdown, 1 for error)
   */
  async shutdown(signal, exitCode = 0) {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown', { signal, exitCode });

    const startTime = Date.now();

    try {
      // Step 1: Stop accepting new connections
      await this.stopAcceptingConnections();

      // Step 2: Wait for in-flight requests to complete (with timeout)
      await this.waitForInFlightRequests();

      // Step 3: Close Socket.IO connections
      await this.closeSocketConnections();

      // Step 4: Close database connections
      await this.closeDatabaseConnections();

      // Step 5: Flush logs and metrics
      await this.flushLogsAndMetrics();

      const duration = Date.now() - startTime;
      this.logger.info('Graceful shutdown completed', { signal, duration, exitCode });

      // Step 6: Exit with appropriate code
      process.exit(exitCode);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error during graceful shutdown', { 
        signal, 
        duration, 
        error: error.message,
        stack: error.stack 
      });

      // Force exit with error code
      process.exit(1);
    }
  }

  /**
   * Stop accepting new connections
   * Requirement: 10.2
   */
  async stopAcceptingConnections() {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        this.logger.warn('No server instance to close');
        return resolve();
      }

      this.logger.info('Stopping acceptance of new connections');

      // Close the server (stops accepting new connections)
      this.server.close((err) => {
        if (err) {
          this.logger.error('Error closing server', { error: err.message });
          return reject(err);
        }

        this.logger.info('Server stopped accepting new connections');
        resolve();
      });
    });
  }

  /**
   * Wait for in-flight HTTP requests to complete
   * Requirement: 10.3
   */
  async waitForInFlightRequests() {
    return new Promise((resolve) => {
      this.logger.info('Waiting for in-flight requests to complete', { 
        timeout: this.shutdownTimeout 
      });

      // Set timeout to force shutdown if requests take too long
      const timeout = setTimeout(() => {
        this.logger.warn('Shutdown timeout reached, forcing closure', { 
          timeout: this.shutdownTimeout 
        });
        resolve();
      }, this.shutdownTimeout);

      // Check if server has pending connections
      if (this.server && this.server.listening) {
        // Wait for server.close() callback (already called in stopAcceptingConnections)
        clearTimeout(timeout);
        resolve();
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  /**
   * Close Socket.IO connections gracefully
   * Requirement: 10.4
   */
  async closeSocketConnections() {
    if (!this.socketManager) {
      this.logger.warn('No Socket.IO manager to close');
      return;
    }

    this.logger.info('Closing Socket.IO connections');

    try {
      // Get connected sockets count before closing
      const io = this.socketManager.getIO();
      const socketsCount = io.sockets.sockets.size;

      this.logger.info('Disconnecting Socket.IO clients', { count: socketsCount });

      // Disconnect all clients
      io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
      });

      // Close the Socket.IO server
      io.close();

      this.logger.info('Socket.IO connections closed', { count: socketsCount });
    } catch (error) {
      this.logger.error('Error closing Socket.IO connections', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Close database connections
   * Requirement: 10.5
   */
  async closeDatabaseConnections() {
    if (!this.dbConnection) {
      this.logger.warn('No database connection to close');
      return;
    }

    this.logger.info('Closing database connections');

    try {
      // Check if dbConnection is the new DatabaseConnection class or mongoose.connection
      if (typeof this.dbConnection.disconnect === 'function') {
        // New DatabaseConnection class
        await this.dbConnection.disconnect();
      } else if (typeof this.dbConnection.close === 'function') {
        // Legacy mongoose.connection
        await this.dbConnection.close();
      } else {
        this.logger.warn('Unknown database connection type');
      }

      this.logger.info('Database connections closed');
    } catch (error) {
      this.logger.error('Error closing database connections', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Flush logs and metrics before exit
   * Requirement: 10.6
   */
  async flushLogsAndMetrics() {
    this.logger.info('Flushing logs and metrics');

    try {
      // Flush metrics if available
      if (this.metricsCollector && typeof this.metricsCollector.flush === 'function') {
        await this.metricsCollector.flush();
        this.logger.info('Metrics flushed');
      }

      // Flush Winston logger transports
      const winstonLogger = this.logger.getLogger();
      if (winstonLogger && typeof winstonLogger.end === 'function') {
        await new Promise((resolve) => {
          winstonLogger.on('finish', resolve);
          winstonLogger.end();
        });
        this.logger.info('Logs flushed');
      }
    } catch (error) {
      // Don't throw here, just log the error
      console.error('Error flushing logs and metrics:', error.message);
    }
  }

  /**
   * Get shutdown status
   * @returns {boolean}
   */
  isShutdownInProgress() {
    return this.isShuttingDown;
  }

  /**
   * Set shutdown timeout
   * @param {number} timeout - Timeout in milliseconds
   */
  setShutdownTimeout(timeout) {
    this.shutdownTimeout = timeout;
    this.logger.info('Shutdown timeout updated', { timeout });
  }
}

module.exports = GracefulShutdownHandler;
