/**
 * Token Invalidation Service
 *
 * Provides a unified interface for tracking token invalidation across:
 *  - Admin competition assignment changes
 *  - User logouts
 *
 * When Redis is available, uses Redis SET commands with TTL matching JWT expiry
 * so invalidation records survive server restarts and work across multiple
 * server instances.
 *
 * When Redis is unavailable, falls back to the in-memory Map store for
 * single-instance deployments.
 *
 * Requirements: HIGH-5 (Redis-backed token invalidation — Phase 2A, Item 2.4)
 */

/**
 * Redis key prefixes
 * @readonly
 */
const KEYS = {
  LOGOUT: 'token_invalidation:logout:',
  ASSIGNMENT: 'token_invalidation:assignment:',
};

/**
 * Default TTL for invalidation records in seconds.
 * Should be >= the maximum JWT lifetime so records outlive any token
 * that could reference them. With refresh tokens the max lifetime
 * of an access token is 15 min, but we use a generous 24 h buffer.
 */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

class TokenInvalidationService {
  /**
   * @param {import('../infrastructure/redis-client')|null} redisClient - RedisClient wrapper (may be null)
   * @param {Object} logger - Logger instance
   */
  constructor(redisClient, logger) {
    this.redisClient = redisClient;
    this.logger = logger;

    // In-memory fallback stores
    this._logoutTimestamps = new Map();
    this._assignmentChanges = new Map();
  }

  // ------------------------------------------------------------------
  //  Private helpers
  // ------------------------------------------------------------------

  /** @returns {boolean} */
  _isRedisAvailable() {
    return !!(this.redisClient && this.redisClient.isConnected && this.redisClient.getClient());
  }

  /** @returns {Redis} */
  _redis() {
    return this.redisClient.getClient();
  }

  // ------------------------------------------------------------------
  //  Logout tracking
  // ------------------------------------------------------------------

  /**
   * Record that a user has logged out.
   * Any token issued before this timestamp is considered invalid.
   *
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async recordLogout(userId) {
    const id = String(userId);
    const now = Date.now();

    if (this._isRedisAvailable()) {
      try {
        await this._redis().set(
          `${KEYS.LOGOUT}${id}`,
          String(now),
          'EX',
          DEFAULT_TTL_SECONDS,
        );
        return;
      } catch (error) {
        this.logger.warn('Redis recordLogout failed, using in-memory fallback', {
          error: error.message,
        });
      }
    }

    // In-memory fallback
    this._logoutTimestamps.set(id, now);
  }

  /**
   * Check if a token was issued before the user's last logout.
   *
   * @param {string} userId
   * @param {number} tokenIssuedAt - JWT `iat` in **seconds**
   * @returns {Promise<boolean>} true if the token should be rejected
   */
  async isTokenLoggedOut(userId, tokenIssuedAt) {
    const id = String(userId);

    if (this._isRedisAvailable()) {
      try {
        const logoutMs = await this._redis().get(`${KEYS.LOGOUT}${id}`);
        if (!logoutMs) return false;
        return tokenIssuedAt * 1000 < Number(logoutMs);
      } catch (error) {
        this.logger.warn('Redis isTokenLoggedOut failed, using in-memory fallback', {
          error: error.message,
        });
      }
    }

    // In-memory fallback
    const logoutTimestamp = this._logoutTimestamps.get(id);
    if (!logoutTimestamp) return false;
    return tokenIssuedAt * 1000 < logoutTimestamp;
  }

  /**
   * Clear the logout record for a user (e.g. after re-authentication).
   *
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async clearLogoutRecord(userId) {
    const id = String(userId);

    if (this._isRedisAvailable()) {
      try {
        await this._redis().del(`${KEYS.LOGOUT}${id}`);
      } catch (error) {
        this.logger.warn('Redis clearLogoutRecord failed', { error: error.message });
      }
    }

    this._logoutTimestamps.delete(id);
  }

  // ------------------------------------------------------------------
  //  Admin assignment tracking
  // ------------------------------------------------------------------

  /**
   * Record that an admin's competition assignments have changed.
   *
   * @param {string} adminId
   * @returns {Promise<void>}
   */
  async recordAdminAssignmentChange(adminId) {
    const id = String(adminId);
    const now = Date.now();

    if (this._isRedisAvailable()) {
      try {
        await this._redis().set(
          `${KEYS.ASSIGNMENT}${id}`,
          String(now),
          'EX',
          DEFAULT_TTL_SECONDS,
        );
        return;
      } catch (error) {
        this.logger.warn('Redis recordAdminAssignmentChange failed, using in-memory fallback', {
          error: error.message,
        });
      }
    }

    this._assignmentChanges.set(id, now);
  }

  /**
   * Check if a token was issued before the admin's assignments changed.
   *
   * @param {string} adminId
   * @param {number} tokenIssuedAt - JWT `iat` in **seconds**
   * @returns {Promise<boolean>}
   */
  async isTokenInvalidated(adminId, tokenIssuedAt) {
    const id = String(adminId);

    if (this._isRedisAvailable()) {
      try {
        const changeMs = await this._redis().get(`${KEYS.ASSIGNMENT}${id}`);
        if (!changeMs) return false;
        return tokenIssuedAt * 1000 < Number(changeMs);
      } catch (error) {
        this.logger.warn('Redis isTokenInvalidated failed, using in-memory fallback', {
          error: error.message,
        });
      }
    }

    const changeTimestamp = this._assignmentChanges.get(id);
    if (!changeTimestamp) return false;
    return tokenIssuedAt * 1000 < changeTimestamp;
  }

  /**
   * Clear assignment change record for an admin.
   *
   * @param {string} adminId
   * @returns {Promise<void>}
   */
  async clearAdminAssignmentChange(adminId) {
    const id = String(adminId);

    if (this._isRedisAvailable()) {
      try {
        await this._redis().del(`${KEYS.ASSIGNMENT}${id}`);
      } catch (error) {
        this.logger.warn('Redis clearAdminAssignmentChange failed', { error: error.message });
      }
    }

    this._assignmentChanges.delete(id);
  }

  // ------------------------------------------------------------------
  //  Bulk / test helpers
  // ------------------------------------------------------------------

  /**
   * Get all admin IDs with pending assignment changes.
   * Only reliable when using in-memory store; with Redis, scan would be needed.
   *
   * @returns {string[]}
   */
  getAdminsWithPendingChanges() {
    return Array.from(this._assignmentChanges.keys());
  }

  /**
   * Clear all records (testing only).
   * @returns {Promise<void>}
   */
  async clearAll() {
    this._logoutTimestamps.clear();
    this._assignmentChanges.clear();

    if (this._isRedisAvailable()) {
      try {
        // Use SCAN to avoid blocking; clear only our prefixed keys
        const client = this._redis();
        for (const prefix of [KEYS.LOGOUT, KEYS.ASSIGNMENT]) {
          let cursor = '0';
          do {
            const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
              await client.del(...keys);
            }
          } while (cursor !== '0');
        }
      } catch (error) {
        this.logger.warn('Redis clearAll failed', { error: error.message });
      }
    }
  }
}

module.exports = TokenInvalidationService;
