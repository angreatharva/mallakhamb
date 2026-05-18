/**
 * Database Connection Manager
 * 
 * Optimized MongoDB connection with:
 * - Production-grade connection pool settings
 * - Connection monitoring and event handling
 * - Retry logic with exponential backoff
 * - Graceful connection lifecycle management
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

const mongoose = require('mongoose');

class DatabaseConnection {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.baseRetryDelay = 1000; // 1 second
    this.maxRetryDelay = 30000; // 30 seconds
  }

  /**
   * Connect to MongoDB with optimized pool settings
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      const dbConfig = this.config.get('database');
      
      // Connection options with production-grade pool settings
      const options = {
        // Requirement 9.2: Set minimum pool size to 10 connections
        minPoolSize: dbConfig.poolSize.min,
        
        // Requirement 9.3: Set maximum pool size to 100 connections
        maxPoolSize: dbConfig.poolSize.max,
        
        // Requirement 9.4: Set connection timeout to 10 seconds
        serverSelectionTimeoutMS: dbConfig.timeouts.connection,
        
        // Requirement 9.5: Set socket timeout to 45 seconds
        socketTimeoutMS: dbConfig.timeouts.socket,
        
        // Connection monitoring settings
        heartbeatFrequencyMS: 10000, // Check server health every 10 seconds
        
        // Use IPv4 to avoid IPv6 issues
        family: 4,
        
        // Automatically create indexes
        autoIndex: this.config.isDevelopment(),
        
        // Buffer commands when disconnected (useful for reconnection)
        bufferCommands: true,
      };

      this.logger.info('Connecting to MongoDB...', {
        poolSize: { min: options.minPoolSize, max: options.maxPoolSize },
        timeouts: {
          connection: options.serverSelectionTimeoutMS,
          socket: options.socketTimeoutMS
        }
      });

      // Requirement 9.6: Enable connection monitoring
      this.setupConnectionMonitoring();

      // Connect to MongoDB
      await mongoose.connect(dbConfig.uri, options);

      this.isConnected = true;
      this.retryCount = 0;

      this.logger.info('MongoDB connected successfully', {
        host: mongoose.connection.host,
        database: mongoose.connection.name,
        poolSize: options.maxPoolSize
      });

    } catch (error) {
      this.isConnected = false;
      this.logger.error('MongoDB connection failed', {
        error: error.message,
        retryCount: this.retryCount
      });

      // Requirement 9.7: Implement retry with exponential backoff
      await this.retryConnection(error);
    }
  }

  /**
   * Retry connection with exponential backoff
   * Requirement 9.7: Implement retry with exponential backoff
   * @param {Error} error - Connection error
   * @returns {Promise<void>}
   */
  async retryConnection(error) {
    if (this.retryCount >= this.maxRetries) {
      this.logger.error('Max retry attempts reached. Exiting...', {
        maxRetries: this.maxRetries,
        lastError: error.message
      });
      process.exit(1);
    }

    this.retryCount++;

    // Calculate exponential backoff delay: baseDelay * 2^(retryCount - 1)
    // With jitter to prevent thundering herd
    const exponentialDelay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount - 1),
      this.maxRetryDelay
    );
    
    // Add random jitter (0-20% of delay)
    const jitter = Math.random() * exponentialDelay * 0.2;
    const delay = exponentialDelay + jitter;

    this.logger.warn('Retrying database connection...', {
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      delayMs: Math.round(delay)
    });

    await this.sleep(delay);
    await this.connect();
  }

  /**
   * Setup connection monitoring and event handlers
   * Requirement 9.6: Enable connection monitoring
   */
  setupConnectionMonitoring() {
    // Requirement 9.8: Emit events for connection lifecycle
    
    // Connected event
    mongoose.connection.on('connected', () => {
      this.isConnected = true;
      this.logger.info('MongoDB connection established', {
        host: mongoose.connection.host,
        database: mongoose.connection.name
      });
    });

    // Disconnected event
    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      this.logger.warn('MongoDB connection lost', {
        host: mongoose.connection.host
      });
    });

    // Error event
    mongoose.connection.on('error', (error) => {
      this.logger.error('MongoDB connection error', {
        error: error.message,
        stack: error.stack
      });
    });

    // Reconnected event
    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      this.logger.info('MongoDB reconnected successfully', {
        host: mongoose.connection.host
      });
    });

    // Connection pool monitoring
    mongoose.connection.on('fullsetup', () => {
      this.logger.info('MongoDB replica set fully connected');
    });

    // Monitor connection pool events (if available)
    if (mongoose.connection.db) {
      const poolEvents = ['connectionPoolCreated', 'connectionPoolClosed', 'connectionCreated', 'connectionClosed'];
      
      poolEvents.forEach(event => {
        mongoose.connection.db.on(event, (data) => {
          this.logger.debug(`MongoDB pool event: ${event}`, data);
        });
      });
    }
  }

  /**
   * Disconnect from MongoDB gracefully
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected) {
      this.logger.info('MongoDB already disconnected');
      return;
    }

    try {
      this.logger.info('Closing MongoDB connection...');
      
      // Close connection gracefully
      await mongoose.connection.close();
      
      this.isConnected = false;
      this.logger.info('MongoDB connection closed successfully');
    } catch (error) {
      this.logger.error('Error closing MongoDB connection', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get connection status
   * @returns {boolean}
   */
  getConnectionStatus() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get connection pool statistics
   * @returns {Object}
   */
  getPoolStats() {
    if (!mongoose.connection.db) {
      return null;
    }

    try {
      const serverStatus = mongoose.connection.db.serverConfig;
      
      return {
        connected: this.isConnected,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        database: mongoose.connection.name,
        // Additional pool stats if available
        poolSize: serverStatus?.s?.poolSize || 'N/A'
      };
    } catch (error) {
      this.logger.error('Error getting pool stats', { error: error.message });
      return {
        connected: this.isConnected,
        readyState: mongoose.connection.readyState,
        error: error.message
      };
    }
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DatabaseConnection;
