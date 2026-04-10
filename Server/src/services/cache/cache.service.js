/**
 * Cache Service
 * 
 * In-memory caching with LRU eviction, TTL expiration, and statistics tracking.
 * Provides unified caching interface for frequently accessed data.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

class CacheService {
  /**
   * Create a cache service
   * @param {Object} config - Configuration object
   * @param {Logger} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.cache = new Map();
    this.ttls = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null if not found/expired
   */
  get(key) {
    // Check if key exists
    if (!this.cache.has(key)) {
      this.misses++;
      this.logger.debug('Cache miss', { key });
      return null;
    }

    // Check if expired
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.delete(key);
      this.misses++;
      this.logger.debug('Cache miss (expired)', { key });
      return null;
    }

    // Update access order for LRU
    this.accessOrder.set(key, Date.now());

    this.hits++;
    this.logger.debug('Cache hit', { key });
    return this.cache.get(key);
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  set(key, value, ttl = null) {
    // Enforce max cache size with LRU eviction
    if (this.cache.size >= this.config.cache.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, value);
    this.accessOrder.set(key, Date.now());

    // Set TTL
    if (ttl !== null) {
      this.ttls.set(key, Date.now() + (ttl * 1000));
    } else if (this.config.cache.ttl) {
      this.ttls.set(key, Date.now() + (this.config.cache.ttl * 1000));
    }

    this.logger.debug('Cache set', { key, ttl: ttl || this.config.cache.ttl });
  }

  /**
   * Delete key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.ttls.delete(key);
    this.accessOrder.delete(key);

    if (existed) {
      this.logger.debug('Cache delete', { key });
    }

    return existed;
  }

  /**
   * Delete keys matching pattern
   * @param {string} pattern - Pattern to match (supports wildcards with *)
   * @returns {number} Number of keys deleted
   */
  deletePattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keysToDelete = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));

    this.logger.info('Cache pattern delete', { 
      pattern, 
      count: keysToDelete.length,
      keys: keysToDelete 
    });

    return keysToDelete.length;
  }

  /**
   * Clear all cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.ttls.clear();
    this.accessOrder.clear();

    this.logger.info('Cache cleared', { entriesCleared: size });
  }

  /**
   * Get cache statistics
   * @returns {Object} { hits, misses, hitRate, size, maxSize }
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? parseFloat((this.hits / total * 100).toFixed(2)) : 0,
      size: this.cache.size,
      maxSize: this.config.cache.maxSize
    };
  }

  /**
   * Wrap a function with caching
   * Executes function only on cache miss, caches result
   * @param {string} key - Cache key
   * @param {Function} fn - Function to execute if cache miss (can be async)
   * @param {number} ttl - TTL in seconds (optional)
   * @returns {Promise<*>} Cached or computed value
   */
  async wrap(key, fn, ttl = null) {
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    this.logger.debug('Cache wrap: executing function', { key });
    const result = await fn();
    this.set(key, result, ttl);
    return result;
  }

  /**
   * Evict least recently used entry
   * @private
   */
  evictLRU() {
    if (this.accessOrder.size === 0) {
      return;
    }

    // Find the key with the oldest (smallest) timestamp
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.logger.debug('LRU eviction', { key: oldestKey });
    }
  }

  /**
   * Check if key exists in cache (without affecting stats)
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    // Check if expired
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get all cache keys
   * @returns {Array<string>} Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.cache.size;
  }
}

module.exports = CacheService;
