/**
 * Metrics Collector
 * 
 * Tracks and exposes performance metrics:
 * - Request count by endpoint and status
 * - Response time percentiles (p50, p95, p99)
 * - Error rates by type
 * - Database query performance
 * - Cache hit/miss rates
 * - Active Socket.IO connections
 * - Prometheus format export
 */

class MetricsCollector {
  constructor(logger) {
    this.logger = logger;
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: new Map(),
        byStatus: new Map()
      },
      responseTimes: [],
      errors: {
        total: 0,
        byType: new Map()
      },
      database: {
        queries: 0,
        totalTime: 0,
        errors: 0
      },
      cache: {
        hits: 0,
        misses: 0
      },
      socketio: {
        connections: 0,
        events: 0
      }
    };
    this.startTime = Date.now();
  }

  /**
   * Track HTTP request
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {number} statusCode - Response status code
   * @param {number} responseTime - Response time in ms
   */
  trackRequest(method, path, statusCode, responseTime) {
    // Increment total requests
    this.metrics.requests.total++;

    // Track by endpoint
    const endpoint = `${method} ${path}`;
    const endpointCount = this.metrics.requests.byEndpoint.get(endpoint) || 0;
    this.metrics.requests.byEndpoint.set(endpoint, endpointCount + 1);

    // Track by status code
    const statusCount = this.metrics.requests.byStatus.get(statusCode) || 0;
    this.metrics.requests.byStatus.set(statusCode, statusCount + 1);

    // Track response time
    this.metrics.responseTimes.push(responseTime);

    // Keep only last 1000 response times for percentile calculation
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
  }

  /**
   * Track error
   * @param {string} errorType - Type of error
   */
  trackError(errorType) {
    this.metrics.errors.total++;
    const errorCount = this.metrics.errors.byType.get(errorType) || 0;
    this.metrics.errors.byType.set(errorType, errorCount + 1);
  }

  /**
   * Track database query
   * @param {number} queryTime - Query execution time in ms
   * @param {boolean} isError - Whether query resulted in error
   */
  trackDatabaseQuery(queryTime, isError = false) {
    this.metrics.database.queries++;
    this.metrics.database.totalTime += queryTime;
    if (isError) {
      this.metrics.database.errors++;
    }
  }

  /**
   * Track cache hit
   */
  trackCacheHit() {
    this.metrics.cache.hits++;
  }

  /**
   * Track cache miss
   */
  trackCacheMiss() {
    this.metrics.cache.misses++;
  }

  /**
   * Track Socket.IO connection
   * @param {number} delta - Change in connections (+1 or -1)
   */
  trackSocketConnection(delta) {
    this.metrics.socketio.connections += delta;
  }

  /**
   * Track Socket.IO event
   */
  trackSocketEvent() {
    this.metrics.socketio.events++;
  }

  /**
   * Calculate response time percentile
   * @param {number} percentile - Percentile to calculate (50, 95, 99)
   * @returns {number} Response time at percentile
   */
  calculatePercentile(percentile) {
    if (this.metrics.responseTimes.length === 0) {
      return 0;
    }

    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get cache hit rate
   * @returns {number} Hit rate as percentage
   */
  getCacheHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    if (total === 0) return 0;
    return Math.round((this.metrics.cache.hits / total) * 100);
  }

  /**
   * Get average database query time
   * @returns {number} Average query time in ms
   */
  getAverageDatabaseQueryTime() {
    if (this.metrics.database.queries === 0) return 0;
    return Math.round(this.metrics.database.totalTime / this.metrics.database.queries);
  }

  /**
   * Get error rate
   * @returns {number} Error rate as percentage
   */
  getErrorRate() {
    if (this.metrics.requests.total === 0) return 0;
    return Math.round((this.metrics.errors.total / this.metrics.requests.total) * 100);
  }

  /**
   * Get all metrics
   * @returns {Object} All collected metrics
   */
  getMetrics() {
    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      requests: {
        total: this.metrics.requests.total,
        byEndpoint: Object.fromEntries(this.metrics.requests.byEndpoint),
        byStatus: Object.fromEntries(this.metrics.requests.byStatus)
      },
      responseTimes: {
        p50: this.calculatePercentile(50),
        p95: this.calculatePercentile(95),
        p99: this.calculatePercentile(99),
        count: this.metrics.responseTimes.length
      },
      errors: {
        total: this.metrics.errors.total,
        rate: this.getErrorRate(),
        byType: Object.fromEntries(this.metrics.errors.byType)
      },
      database: {
        queries: this.metrics.database.queries,
        averageTime: this.getAverageDatabaseQueryTime(),
        errors: this.metrics.database.errors
      },
      cache: {
        hits: this.metrics.cache.hits,
        misses: this.metrics.cache.misses,
        hitRate: this.getCacheHitRate()
      },
      socketio: {
        activeConnections: this.metrics.socketio.connections,
        totalEvents: this.metrics.socketio.events
      }
    };
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string} Metrics in Prometheus text format
   */
  toPrometheusFormat() {
    const lines = [];

    // Uptime
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`);
    lines.push('');

    // Total requests
    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    lines.push(`http_requests_total ${this.metrics.requests.total}`);
    lines.push('');

    // Requests by status
    lines.push('# HELP http_requests_by_status_total HTTP requests by status code');
    lines.push('# TYPE http_requests_by_status_total counter');
    for (const [status, count] of this.metrics.requests.byStatus) {
      lines.push(`http_requests_by_status_total{status="${status}"} ${count}`);
    }
    lines.push('');

    // Response time percentiles
    lines.push('# HELP http_response_time_ms HTTP response time in milliseconds');
    lines.push('# TYPE http_response_time_ms summary');
    lines.push(`http_response_time_ms{quantile="0.5"} ${this.calculatePercentile(50)}`);
    lines.push(`http_response_time_ms{quantile="0.95"} ${this.calculatePercentile(95)}`);
    lines.push(`http_response_time_ms{quantile="0.99"} ${this.calculatePercentile(99)}`);
    lines.push('');

    // Errors
    lines.push('# HELP http_errors_total Total number of errors');
    lines.push('# TYPE http_errors_total counter');
    lines.push(`http_errors_total ${this.metrics.errors.total}`);
    lines.push('');

    // Database queries
    lines.push('# HELP database_queries_total Total number of database queries');
    lines.push('# TYPE database_queries_total counter');
    lines.push(`database_queries_total ${this.metrics.database.queries}`);
    lines.push('');

    lines.push('# HELP database_query_time_ms Average database query time in milliseconds');
    lines.push('# TYPE database_query_time_ms gauge');
    lines.push(`database_query_time_ms ${this.getAverageDatabaseQueryTime()}`);
    lines.push('');

    // Cache metrics
    lines.push('# HELP cache_hits_total Total number of cache hits');
    lines.push('# TYPE cache_hits_total counter');
    lines.push(`cache_hits_total ${this.metrics.cache.hits}`);
    lines.push('');

    lines.push('# HELP cache_misses_total Total number of cache misses');
    lines.push('# TYPE cache_misses_total counter');
    lines.push(`cache_misses_total ${this.metrics.cache.misses}`);
    lines.push('');

    lines.push('# HELP cache_hit_rate Cache hit rate percentage');
    lines.push('# TYPE cache_hit_rate gauge');
    lines.push(`cache_hit_rate ${this.getCacheHitRate()}`);
    lines.push('');

    // Socket.IO metrics
    lines.push('# HELP socketio_connections Active Socket.IO connections');
    lines.push('# TYPE socketio_connections gauge');
    lines.push(`socketio_connections ${this.metrics.socketio.connections}`);
    lines.push('');

    lines.push('# HELP socketio_events_total Total Socket.IO events');
    lines.push('# TYPE socketio_events_total counter');
    lines.push(`socketio_events_total ${this.metrics.socketio.events}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byEndpoint: new Map(),
        byStatus: new Map()
      },
      responseTimes: [],
      errors: {
        total: 0,
        byType: new Map()
      },
      database: {
        queries: 0,
        totalTime: 0,
        errors: 0
      },
      cache: {
        hits: 0,
        misses: 0
      },
      socketio: {
        connections: 0,
        events: 0
      }
    };
    this.startTime = Date.now();
  }
}

module.exports = MetricsCollector;
