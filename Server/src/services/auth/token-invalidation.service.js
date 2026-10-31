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
 * of an access token is 24h, and we use this same buffer.
 */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * How long a logout must be remembered: long enough that every token issued
 * before it has expired. Tokens live JWT_EXPIRES_IN (24h); a week is generous
 * and keeps the collection tiny.
 */
const REVOCATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

class TokenInvalidationService {
  /**
   * @param {import('../infrastructure/redis-client')|null} redisClient - RedisClient wrapper (may be null)
   * @param {Object} logger - Logger instance
   * @param {Object|null} [store] - durable copy of logouts (security audit
   *   2026-10-31, M4): `{ load(now) -> [{_id, revokedAt}], save(id, revokedAt, expiresAt) }`.
   *   Without one, logouts live only in this process, as before.
   */
  constructor(redisClient, logger, store = null) {
    this.redisClient = redisClient;
    this.logger = logger;
    this.store = store;
    this._hydration = null;

    // In-memory fallback stores
    this._logoutTimestamps = new Map();
    this._assignmentChanges = new Map();
  }

  /**
   * Load the durable logouts into memory, once per process. Called lazily by
   * the first check, so a request that arrives while the process is still
   * starting waits for it rather than being let through on an empty map.
   * Never rejects: a store that cannot be read leaves the process exactly as
   * it was before there was a store.
   * @returns {Promise<void>}
   */
  hydrate() {
    if (!this.store) return Promise.resolve();
    if (!this._hydration) {
      this._hydration = (async () => {
        try {
          const records = await this.store.load(new Date());
          for (const record of records || []) {
            const at = new Date(record.revokedAt).getTime();
            const id = String(record._id);
            if (!(this._logoutTimestamps.get(id) >= at)) this._logoutTimestamps.set(id, at);
          }
          this.logger.info('Session revocations loaded', { count: (records || []).length });
        } catch (error) {
          this.logger.error('Could not load session revocations', { error: error.message });
        }
      })();
    }
    return this._hydration;
  }

  /** Write a logout through to the durable store. Logged, never thrown. */
  async _persistLogout(id, at) {
    if (!this.store) return;
    try {
      await this.store.save(id, new Date(at), new Date(at + REVOCATION_RETENTION_MS));
    } catch (error) {
      this.logger.error('Could not persist session revocation', { error: error.message });
    }
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

    await this._persistLogout(id, now);

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
    await this.hydrate();

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
