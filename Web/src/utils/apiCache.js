// Simple API response caching with security controls
class APICache {
  constructor(ttl = 60000) {
    // Default 1 minute TTL
    this.cache = new Map();
    this.ttl = ttl;

    // Whitelist of cacheable endpoints (only public data)
    this.cacheableEndpoints = [
      '/public/competitions',
      '/public/scores',
      '/public/teams',
      '/public/judges',
      '/public/submitted-teams',
    ];
  }

  generateKey(url, params) {
    return `${url}:${JSON.stringify(params || {})}`;
  }

  isCacheable(url) {
    // Only cache whitelisted public endpoints
    return this.cacheableEndpoints.some((endpoint) => url.includes(endpoint));
  }

  get(url, params) {
    if (!this.isCacheable(url)) return null;

    const key = this.generateKey(url, params);
    const cached = this.cache.get(key);

    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  set(url, params, data) {
    if (!this.isCacheable(url)) return;

    const key = this.generateKey(url, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }

  clearPattern(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new APICache(60000); // 1 minute cache

export const clearCachePattern = (pattern) => {
  apiCache.clearPattern(pattern);
};
