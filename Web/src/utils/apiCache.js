// Simple API response caching
class APICache {
  constructor(ttl = 60000) { // Default 1 minute TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  generateKey(url, params) {
    return `${url}:${JSON.stringify(params || {})}`;
  }
  
  get(url, params) {
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
    const key = this.generateKey(url, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
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
