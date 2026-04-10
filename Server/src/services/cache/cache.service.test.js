/**
 * Cache Service Unit Tests
 * 
 * Tests cache operations, TTL expiration, LRU eviction, and statistics tracking.
 * Requirements: 15.1, 15.6
 */

const CacheService = require('./cache.service');

describe('CacheService', () => {
  let cacheService;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      cache: {
        ttl: 300, // 5 minutes default TTL
        maxSize: 5 // Small size for testing LRU
      }
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Create service instance
    cacheService = new CacheService(mockConfig, mockLogger);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('get and set', () => {
    it('should set and get a value', () => {
      cacheService.set('key1', 'value1');
      const result = cacheService.get('key1');

      expect(result).toBe('value1');
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache set', expect.any(Object));
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache hit', { key: 'key1' });
    });

    it('should return null for non-existent key', () => {
      const result = cacheService.get('nonexistent');

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache miss', { key: 'nonexistent' });
    });

    it('should cache different data types', () => {
      cacheService.set('string', 'text');
      cacheService.set('number', 42);
      cacheService.set('object', { name: 'test' });
      cacheService.set('array', [1, 2, 3]);
      cacheService.set('boolean', true);

      expect(cacheService.get('string')).toBe('text');
      expect(cacheService.get('number')).toBe(42);
      expect(cacheService.get('object')).toEqual({ name: 'test' });
      expect(cacheService.get('array')).toEqual([1, 2, 3]);
      expect(cacheService.get('boolean')).toBe(true);
    });

    it('should update existing key', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key1', 'value2');

      expect(cacheService.get('key1')).toBe('value2');
    });
  });

  describe('TTL expiration', () => {
    it('should expire entry after TTL', async () => {
      cacheService.set('key1', 'value1', 0.1); // 100ms TTL

      // Should exist immediately
      expect(cacheService.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const result = cacheService.get('key1');
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache miss (expired)', { key: 'key1' });
    });

    it('should use default TTL when not specified', () => {
      cacheService.set('key1', 'value1');

      // Check that TTL was set
      expect(cacheService.ttls.has('key1')).toBe(true);
      const ttl = cacheService.ttls.get('key1');
      const expectedTTL = Date.now() + (mockConfig.cache.ttl * 1000);
      
      // Allow 100ms tolerance for test execution time
      expect(ttl).toBeGreaterThan(expectedTTL - 100);
      expect(ttl).toBeLessThan(expectedTTL + 100);
    });

    it('should use custom TTL when specified', () => {
      cacheService.set('key1', 'value1', 60); // 60 seconds

      const ttl = cacheService.ttls.get('key1');
      const expectedTTL = Date.now() + (60 * 1000);
      
      expect(ttl).toBeGreaterThan(expectedTTL - 100);
      expect(ttl).toBeLessThan(expectedTTL + 100);
    });

    it('should not expire entry without TTL', async () => {
      // Set without TTL by using config with no default TTL
      const noTTLConfig = { cache: { maxSize: 10 } };
      const noTTLCache = new CacheService(noTTLConfig, mockLogger);

      noTTLCache.set('key1', 'value1');

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(noTTLCache.get('key1')).toBe('value1');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      // Fill cache to max size
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.set('key3', 'value3');
      cacheService.set('key4', 'value4');
      cacheService.set('key5', 'value5');

      expect(cacheService.size()).toBe(5);

      // Add one more - should evict key1 (oldest)
      cacheService.set('key6', 'value6');

      expect(cacheService.size()).toBe(5);
      expect(cacheService.get('key1')).toBeNull(); // Evicted
      expect(cacheService.get('key6')).toBe('value6'); // New entry
      expect(mockLogger.debug).toHaveBeenCalledWith('LRU eviction', { key: 'key1' });
    });

    it('should update access order on get', async () => {
      cacheService.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.set('key3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.set('key4', 'value4');
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.set('key5', 'value5');

      // Access key1 to make it most recently used
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.get('key1');

      // Add new entry - should evict key2 (now oldest)
      await new Promise(resolve => setTimeout(resolve, 10));
      cacheService.set('key6', 'value6');

      expect(cacheService.get('key1')).toBe('value1'); // Still exists
      expect(cacheService.get('key2')).toBeNull(); // Evicted
    });

    it('should not evict when updating existing key', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.set('key3', 'value3');
      cacheService.set('key4', 'value4');
      cacheService.set('key5', 'value5');

      // Update existing key - should not trigger eviction
      cacheService.set('key3', 'value3-updated');

      expect(cacheService.size()).toBe(5);
      expect(cacheService.get('key1')).toBe('value1');
      expect(cacheService.get('key3')).toBe('value3-updated');
    });
  });

  describe('delete', () => {
    it('should delete a key', () => {
      cacheService.set('key1', 'value1');
      const deleted = cacheService.delete('key1');

      expect(deleted).toBe(true);
      expect(cacheService.get('key1')).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Cache delete', { key: 'key1' });
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cacheService.delete('nonexistent');

      expect(deleted).toBe(false);
    });

    it('should remove TTL when deleting', () => {
      cacheService.set('key1', 'value1', 60);
      cacheService.delete('key1');

      expect(cacheService.ttls.has('key1')).toBe(false);
    });
  });

  describe('deletePattern', () => {
    beforeEach(() => {
      cacheService.set('user:1', 'user1');
      cacheService.set('user:2', 'user2');
      cacheService.set('user:3', 'user3');
      cacheService.set('team:1', 'team1');
      cacheService.set('team:2', 'team2');
    });

    it('should delete keys matching pattern with wildcard', () => {
      const count = cacheService.deletePattern('user:*');

      expect(count).toBe(3);
      expect(cacheService.get('user:1')).toBeNull();
      expect(cacheService.get('user:2')).toBeNull();
      expect(cacheService.get('user:3')).toBeNull();
      expect(cacheService.get('team:1')).toBe('team1');
      expect(cacheService.get('team:2')).toBe('team2');
    });

    it('should delete keys matching exact pattern', () => {
      const count = cacheService.deletePattern('user:1');

      expect(count).toBe(1);
      expect(cacheService.get('user:1')).toBeNull();
      expect(cacheService.get('user:2')).toBe('user2');
    });

    it('should delete all keys with wildcard only', () => {
      const count = cacheService.deletePattern('*');

      expect(count).toBe(5);
      expect(cacheService.size()).toBe(0);
    });

    it('should return 0 when no keys match pattern', () => {
      const count = cacheService.deletePattern('nonexistent:*');

      expect(count).toBe(0);
    });

    it('should log pattern deletion', () => {
      cacheService.deletePattern('user:*');

      expect(mockLogger.info).toHaveBeenCalledWith('Cache pattern delete', {
        pattern: 'user:*',
        count: 3,
        keys: expect.arrayContaining(['user:1', 'user:2', 'user:3'])
      });
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.set('key3', 'value3');

      cacheService.clear();

      expect(cacheService.size()).toBe(0);
      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toBeNull();
      expect(cacheService.get('key3')).toBeNull();
    });

    it('should clear TTLs', () => {
      cacheService.set('key1', 'value1', 60);
      cacheService.clear();

      expect(cacheService.ttls.size).toBe(0);
    });

    it('should log clear operation', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.clear();

      expect(mockLogger.info).toHaveBeenCalledWith('Cache cleared', { entriesCleared: 2 });
    });
  });

  describe('statistics tracking', () => {
    it('should track cache hits', () => {
      cacheService.set('key1', 'value1');
      cacheService.get('key1');
      cacheService.get('key1');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });

    it('should track cache misses', () => {
      cacheService.get('nonexistent1');
      cacheService.get('nonexistent2');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cacheService.set('key1', 'value1');
      cacheService.get('key1'); // hit
      cacheService.get('key1'); // hit
      cacheService.get('nonexistent'); // miss

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(66.67); // 2/3 * 100
    });

    it('should return 0 hit rate when no requests', () => {
      const stats = cacheService.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should include cache size in stats', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');

      const stats = cacheService.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });

    it('should count expired entries as misses', async () => {
      cacheService.set('key1', 'value1', 0.1);
      await new Promise(resolve => setTimeout(resolve, 150));
      cacheService.get('key1');

      const stats = cacheService.getStats();
      expect(stats.misses).toBe(1);
    });
  });

  describe('wrap helper', () => {
    it('should execute function on cache miss', async () => {
      const fn = jest.fn().mockResolvedValue('computed-value');

      const result = await cacheService.wrap('key1', fn);

      expect(result).toBe('computed-value');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(cacheService.get('key1')).toBe('computed-value');
    });

    it('should return cached value without executing function', async () => {
      const fn = jest.fn().mockResolvedValue('computed-value');

      cacheService.set('key1', 'cached-value');
      const result = await cacheService.wrap('key1', fn);

      expect(result).toBe('cached-value');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should support custom TTL', async () => {
      const fn = jest.fn().mockResolvedValue('value');

      await cacheService.wrap('key1', fn, 120);

      const ttl = cacheService.ttls.get('key1');
      const expectedTTL = Date.now() + (120 * 1000);
      
      expect(ttl).toBeGreaterThan(expectedTTL - 100);
      expect(ttl).toBeLessThan(expectedTTL + 100);
    });

    it('should handle async functions', async () => {
      const fn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-value';
      };

      const result = await cacheService.wrap('key1', fn);

      expect(result).toBe('async-value');
      expect(cacheService.get('key1')).toBe('async-value');
    });

    it('should handle synchronous functions', async () => {
      const fn = () => 'sync-value';

      const result = await cacheService.wrap('key1', fn);

      expect(result).toBe('sync-value');
    });

    it('should propagate function errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(cacheService.wrap('key1', fn)).rejects.toThrow('Function error');
      expect(cacheService.get('key1')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      cacheService.set('key1', 'value1');

      expect(cacheService.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cacheService.has('nonexistent')).toBe(false);
    });

    it('should return false for expired key', async () => {
      cacheService.set('key1', 'value1', 0.1);
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cacheService.has('key1')).toBe(false);
    });

    it('should not affect hit/miss statistics', () => {
      cacheService.set('key1', 'value1');
      cacheService.has('key1');
      cacheService.has('nonexistent');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('keys', () => {
    it('should return all cache keys', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      cacheService.set('key3', 'value3');

      const keys = cacheService.keys();

      expect(keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
      expect(keys.length).toBe(3);
    });

    it('should return empty array when cache is empty', () => {
      const keys = cacheService.keys();

      expect(keys).toEqual([]);
    });
  });

  describe('size', () => {
    it('should return current cache size', () => {
      expect(cacheService.size()).toBe(0);

      cacheService.set('key1', 'value1');
      expect(cacheService.size()).toBe(1);

      cacheService.set('key2', 'value2');
      expect(cacheService.size()).toBe(2);

      cacheService.delete('key1');
      expect(cacheService.size()).toBe(1);
    });
  });
});
