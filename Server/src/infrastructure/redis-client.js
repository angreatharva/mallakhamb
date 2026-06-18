/**
 * Redis Client
 *
 * Provides a managed Redis connection with automatic reconnection,
 * health checking, and graceful fallback when Redis is unavailable.
 *
 * Used by TokenInvalidationService for cross-instance token invalidation.
 *
 * Requirements: HIGH-5 (Redis-backed token invalidation)
 */

const Redis = require('ioredis');

class RedisClient {
  /**
   * @param {Object} config - ConfigManager instance
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Connect to Redis.
   * If REDIS_URL is not configured, this is a no-op and the client
   * remains null, allowing callers to fall back to in-memory stores.
   *
   * @returns {Promise<boolean>} true if connected, false otherwise
   */
  async connect() {
    const redisUrl = this.config.get('redis.url');

    if (!redisUrl) {
      this.logger.info('Redis URL not configured — token invalidation will use in-memory store');
      return false;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          // Exponential backoff capped at 5 seconds
          const delay = Math.min(times * 200, 5000);
          return delay;
        },
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 10000,
      });

      // Event handlers
      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.info('Redis connected');
      });

      this.client.on('error', (err) => {
        this.logger.error('Redis connection error', { error: err.message });
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', (delay) => {
        this.logger.info('Redis reconnecting', { delay });
      });

      await this.client.connect();
      this.isConnected = true;

      return true;
    } catch (error) {
      this.logger.warn('Failed to connect to Redis — falling back to in-memory store', {
        error: error.message,
      });
      this.client = null;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check if the Redis connection is healthy.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    if (!this.client || !this.isConnected) return false;

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get the underlying ioredis client.
   * Returns null if Redis is not configured or not connected.
   * @returns {Redis|null}
   */
  getClient() {
    return this.client;
  }

  /**
   * Disconnect from Redis gracefully.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.info('Redis disconnected gracefully');
      } catch (error) {
        this.logger.warn('Error disconnecting Redis, forcing disconnect', {
          error: error.message,
        });
        this.client.disconnect();
      }
      this.client = null;
      this.isConnected = false;
    }
  }
}

module.exports = RedisClient;
