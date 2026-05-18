/**
 * Metrics Collector
 * 
 * Collects and exposes application metrics in Prometheus format.
 * Tracks request counts, response times, error rates, database performance,
 * cache statistics, and Socket.IO connections.
 * 
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8
 */
class MetricsCollector {
  constructor(logger) {
    this.logger = logger;
    this.startTime = Date.now();

    // ---- Internal state (used by old "record*" API and tests/unit/ tests) ----
    // Request metrics
    this.requestCounts = new Map(); // key: "method|||path|||status", value: count
    this.responseTimes = new Map(); // key: "method|||path", value: array of times

    // Error metrics
    this.errorCounts = new Map(); // key: errorType, value: count

    // Database metrics
    this.dbQueryTimes = []; // array of query times
    this.dbQueryCounts = 0;
    this.dbErrorCounts = 0;

    // Cache metrics
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Socket.IO metrics
    this.activeSocketConnections = 0;
    this.totalSocketConnections = 0;
    this.socketDisconnections = 0;
    this.socketEvents = 0;

    // Configuration
    this.maxResponseTimeSamples = 10000;
    this.maxDbQuerySamples = 10000;

    // ---- Simple internal state (used by new "track*" API and src/ tests) ----
    this._simple = {
      responseTimes: [], // flat array capped at 1000
      requestTotal: 0,
      requestByEndpoint: {},
      requestByStatus: {},
      errorTotal: 0,
      errorByType: {},
      dbQueries: 0,
      dbErrors: 0,
      dbTotalTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      socketActiveConnections: 0,
      socketTotalEvents: 0
    };
  }

  // ============================================================
  // Path normalization (used by old API)
  // ============================================================

  normalizePath(path) {
    const pathWithoutQuery = path.split('?')[0];
    let normalized = pathWithoutQuery.replace(/\/[0-9a-f]{24}/gi, '/:id');
    normalized = normalized.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
    normalized = normalized.replace(/\/\d+/g, '/:id');
    return normalized;
  }

  // ============================================================
  // OLD "record*" API (used by tests/unit/ tests)
  // ============================================================

  recordRequest(method, path, statusCode, responseTime) {
    try {
      if (!method || !path) {
        throw new Error('Invalid request parameters');
      }
      const normalizedPath = this.normalizePath(path);
      const countKey = `${method}|||${normalizedPath}|||${statusCode}`;
      this.requestCounts.set(countKey, (this.requestCounts.get(countKey) || 0) + 1);

      const timeKey = `${method}|||${normalizedPath}`;
      if (!this.responseTimes.has(timeKey)) {
        this.responseTimes.set(timeKey, []);
      }
      const times = this.responseTimes.get(timeKey);
      times.push(responseTime);
      if (times.length > this.maxResponseTimeSamples) {
        times.shift();
      }

      // Also update simple state
      const endpoint = `${method} ${normalizedPath}`;
      this._simple.requestTotal++;
      this._simple.requestByEndpoint[endpoint] = (this._simple.requestByEndpoint[endpoint] || 0) + 1;
      this._simple.requestByStatus[statusCode] = (this._simple.requestByStatus[statusCode] || 0) + 1;
      this._simple.responseTimes.push(responseTime);
      if (this._simple.responseTimes.length > 1000) {
        this._simple.responseTimes.shift();
      }

      this.logger && this.logger.debug && this.logger.debug('Request recorded', { method, path: normalizedPath, statusCode, responseTime });
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording request metric', { error: error.message });
    }
  }

  recordError(errorType) {
    try {
      if (!errorType || typeof errorType !== 'string') {
        throw new Error('Invalid error type');
      }
      this.errorCounts.set(errorType, (this.errorCounts.get(errorType) || 0) + 1);
      this._simple.errorTotal++;
      this._simple.errorByType[errorType] = (this._simple.errorByType[errorType] || 0) + 1;
      this.logger && this.logger.debug && this.logger.debug('Error recorded', { errorType });
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording error metric', { error: error.message });
    }
  }

  recordDatabaseQuery(queryTime, success = true) {
    try {
      this.dbQueryCounts++;
      this._simple.dbQueries++;
      if (success) {
        this.dbQueryTimes.push(queryTime);
        if (this.dbQueryTimes.length > this.maxDbQuerySamples) {
          this.dbQueryTimes.shift();
        }
        this._simple.dbTotalTime += queryTime;
      } else {
        this.dbErrorCounts++;
        this._simple.dbErrors++;
      }
      this.logger && this.logger.debug && this.logger.debug('Database query recorded', { queryTime, success });
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording database metric', { error: error.message });
    }
  }

  recordCacheHit() {
    try {
      this.cacheHits++;
      this._simple.cacheHits++;
      this.logger && this.logger.debug && this.logger.debug('Cache hit recorded');
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording cache hit', { error: error.message });
    }
  }

  recordCacheMiss() {
    try {
      this.cacheMisses++;
      this._simple.cacheMisses++;
      this.logger && this.logger.debug && this.logger.debug('Cache miss recorded');
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording cache miss', { error: error.message });
    }
  }

  recordSocketConnection() {
    try {
      this.activeSocketConnections++;
      this.totalSocketConnections++;
      this._simple.socketActiveConnections++;
      this.logger && this.logger.debug && this.logger.debug('Socket connection recorded', { active: this.activeSocketConnections });
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording socket connection', { error: error.message });
    }
  }

  recordSocketDisconnection() {
    try {
      this.activeSocketConnections = Math.max(0, this.activeSocketConnections - 1);
      this.socketDisconnections++;
      this._simple.socketActiveConnections = Math.max(0, this._simple.socketActiveConnections - 1);
      this.logger && this.logger.debug && this.logger.debug('Socket disconnection recorded', { active: this.activeSocketConnections });
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error recording socket disconnection', { error: error.message });
    }
  }

  // ============================================================
  // NEW "track*" API (used by src/ tests and socket manager)
  // ============================================================

  trackRequest(method, path, statusCode, responseTime) {
    return this.recordRequest(method, path, statusCode, responseTime);
  }

  trackError(errorType) {
    return this.recordError(errorType);
  }

  trackDatabaseQuery(queryTime, isError = false) {
    return this.recordDatabaseQuery(queryTime, !isError);
  }

  trackCacheHit() {
    return this.recordCacheHit();
  }

  trackCacheMiss() {
    return this.recordCacheMiss();
  }

  trackSocketConnection(delta) {
    if (delta > 0) {
      this.recordSocketConnection();
    } else if (delta < 0) {
      this.recordSocketDisconnection();
    }
  }

  trackSocketEvent() {
    this.socketEvents++;
    this._simple.socketTotalEvents++;
  }

  // ============================================================
  // Percentile calculation
  // ============================================================

  calculatePercentiles(values) {
    if (!values || values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const len = sorted.length;

    const getPercentile = (p) => {
      const index = (len - 1) * p;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index - lower;
      if (lower === upper) return sorted[lower];
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    const p50 = getPercentile(0.50);
    const p95 = getPercentile(0.95);
    const p99 = getPercentile(0.99);
    const min = sorted[0];
    const max = sorted[len - 1];
    const avg = values.reduce((sum, val) => sum + val, 0) / len;

    return {
      p50: Math.round(p50 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      avg: Math.round(avg * 100) / 100
    };
  }

  /**
   * Calculate a single percentile from stored response times (new API)
   */
  calculatePercentile(percentile) {
    const times = this._simple.responseTimes;
    if (!times || times.length === 0) return 0;
    const sorted = [...times].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // ============================================================
  // getMetrics() — returns structure satisfying both test suites
  // ============================================================

  getRequestMetrics() {
    const metrics = {
      total: 0,
      byEndpoint: {},
      byStatus: {},
      responseTimes: {}
    };

    for (const [key, count] of this.requestCounts.entries()) {
      const parts = key.split('|||');
      if (parts.length !== 3) continue;
      const method = parts[0];
      const path = parts[1];
      const status = parts[2];
      const endpoint = `${method} ${path}`;

      metrics.total += count;
      metrics.byEndpoint[endpoint] = (metrics.byEndpoint[endpoint] || 0) + count;
      metrics.byStatus[status] = (metrics.byStatus[status] || 0) + count;
    }

    for (const [key, times] of this.responseTimes.entries()) {
      if (times.length > 0) {
        metrics.responseTimes[key] = this.calculatePercentiles(times);
      }
    }

    return metrics;
  }

  getErrorMetrics() {
    const metrics = { total: 0, byType: {} };
    for (const [errorType, count] of this.errorCounts.entries()) {
      metrics.total += count;
      metrics.byType[errorType] = count;
    }
    return metrics;
  }

  getDatabaseMetrics() {
    const metrics = {
      queryCount: this.dbQueryCounts,
      errorCount: this.dbErrorCounts,
      errorRate: this.dbQueryCounts > 0
        ? (this.dbErrorCounts / this.dbQueryCounts * 100).toFixed(2) + '%'
        : '0%'
    };
    if (this.dbQueryTimes.length > 0) {
      metrics.queryTimes = this.calculatePercentiles(this.dbQueryTimes);
    }
    return metrics;
  }

  getCacheMetrics() {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0
      ? (this.cacheHits / total * 100).toFixed(2) + '%'
      : '0%';
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      total,
      hitRate
    };
  }

  getSocketMetrics() {
    return {
      active: this.activeSocketConnections,
      totalConnections: this.totalSocketConnections,
      totalDisconnections: this.socketDisconnections
    };
  }

  getMetrics() {
    try {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const requestMetrics = this.getRequestMetrics();
      const errorMetrics = this.getErrorMetrics();
      const dbMetrics = this.getDatabaseMetrics();
      const cacheMetrics = this.getCacheMetrics();
      const socketMetrics = this.getSocketMetrics();

      // Also compute simple cache hit rate as number (for src/ tests)
      const simpleCacheTotal = this._simple.cacheHits + this._simple.cacheMisses;
      const simpleCacheHitRate = simpleCacheTotal > 0
        ? Math.round((this._simple.cacheHits / simpleCacheTotal) * 100)
        : 0;

      // Simple db average time
      const dbSuccessful = this._simple.dbQueries - this._simple.dbErrors;
      const dbAverageTime = dbSuccessful > 0
        ? Math.round(this._simple.dbTotalTime / dbSuccessful)
        : 0;

      return {
        uptime,
        // Request metrics (compatible with both test suites)
        requests: {
          total: requestMetrics.total,
          byEndpoint: requestMetrics.byEndpoint,
          byStatus: requestMetrics.byStatus,
          responseTimes: requestMetrics.responseTimes
        },
        // Simple response times (for src/ tests)
        responseTimes: {
          count: this._simple.responseTimes.length,
          p50: this.calculatePercentile(50),
          p95: this.calculatePercentile(95),
          p99: this.calculatePercentile(99)
        },
        errors: errorMetrics,
        // Database metrics with both old and new field names
        database: {
          // Old API fields (tests/unit/)
          queryCount: dbMetrics.queryCount,
          errorCount: dbMetrics.errorCount,
          errorRate: dbMetrics.errorRate,
          queryTimes: dbMetrics.queryTimes,
          // New API fields (src/)
          queries: this._simple.dbQueries,
          errors: this._simple.dbErrors,
          averageTime: dbAverageTime
        },
        // Cache metrics with both old and new formats
        cache: {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          total: this.cacheHits + this.cacheMisses,
          hitRate: cacheMetrics.hitRate  // string format for tests/unit/
        },
        // Socket metrics with both old and new keys
        sockets: socketMetrics,
        socketio: {
          activeConnections: this._simple.socketActiveConnections,
          totalEvents: this._simple.socketTotalEvents
        }
      };
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error getting metrics', { error: error.message });
      return {
        error: 'Failed to collect metrics',
        message: error.message
      };
    }
  }

  // ============================================================
  // getErrorRate() — new API
  // ============================================================

  getErrorRate() {
    if (this._simple.requestTotal === 0) return 0;
    return Math.round((this._simple.errorTotal / this._simple.requestTotal) * 100);
  }

  // ============================================================
  // Prometheus export — OLD format (for tests/unit/ tests)
  // ============================================================

  exportPrometheus() {
    try {
      const lines = [];
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      lines.push('# HELP app_uptime_seconds Application uptime in seconds');
      lines.push('# TYPE app_uptime_seconds gauge');
      lines.push(`app_uptime_seconds ${uptime}`);
      lines.push('');

      lines.push('# HELP http_requests_total Total number of HTTP requests');
      lines.push('# TYPE http_requests_total counter');
      for (const [key, count] of this.requestCounts.entries()) {
        const parts = key.split('|||');
        if (parts.length !== 3) continue;
        const method = parts[0];
        const path = parts[1];
        const status = parts[2];
        lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
      }
      lines.push('');

      lines.push('# HELP http_response_time_milliseconds HTTP response time in milliseconds');
      lines.push('# TYPE http_response_time_milliseconds summary');
      for (const [key, times] of this.responseTimes.entries()) {
        if (times.length > 0) {
          const parts = key.split('|||');
          if (parts.length !== 2) continue;
          const method = parts[0];
          const path = parts[1];
          const percentiles = this.calculatePercentiles(times);
          lines.push(`http_response_time_milliseconds{method="${method}",path="${path}",quantile="0.5"} ${percentiles.p50}`);
          lines.push(`http_response_time_milliseconds{method="${method}",path="${path}",quantile="0.95"} ${percentiles.p95}`);
          lines.push(`http_response_time_milliseconds{method="${method}",path="${path}",quantile="0.99"} ${percentiles.p99}`);
          lines.push(`http_response_time_milliseconds_count{method="${method}",path="${path}"} ${times.length}`);
        }
      }
      lines.push('');

      lines.push('# HELP app_errors_total Total number of errors by type');
      lines.push('# TYPE app_errors_total counter');
      for (const [errorType, count] of this.errorCounts.entries()) {
        lines.push(`app_errors_total{type="${errorType}"} ${count}`);
      }
      lines.push('');

      lines.push('# HELP db_queries_total Total number of database queries');
      lines.push('# TYPE db_queries_total counter');
      lines.push(`db_queries_total ${this.dbQueryCounts}`);
      lines.push('');

      lines.push('# HELP db_errors_total Total number of database errors');
      lines.push('# TYPE db_errors_total counter');
      lines.push(`db_errors_total ${this.dbErrorCounts}`);
      lines.push('');

      if (this.dbQueryTimes.length > 0) {
        const percentiles = this.calculatePercentiles(this.dbQueryTimes);
        lines.push('# HELP db_query_time_milliseconds Database query time in milliseconds');
        lines.push('# TYPE db_query_time_milliseconds summary');
        lines.push(`db_query_time_milliseconds{quantile="0.5"} ${percentiles.p50}`);
        lines.push(`db_query_time_milliseconds{quantile="0.95"} ${percentiles.p95}`);
        lines.push(`db_query_time_milliseconds{quantile="0.99"} ${percentiles.p99}`);
        lines.push(`db_query_time_milliseconds_count ${this.dbQueryTimes.length}`);
        lines.push('');
      }

      lines.push('# HELP cache_hits_total Total number of cache hits');
      lines.push('# TYPE cache_hits_total counter');
      lines.push(`cache_hits_total ${this.cacheHits}`);
      lines.push('');

      lines.push('# HELP cache_misses_total Total number of cache misses');
      lines.push('# TYPE cache_misses_total counter');
      lines.push(`cache_misses_total ${this.cacheMisses}`);
      lines.push('');

      const cacheTotal = this.cacheHits + this.cacheMisses;
      const cacheHitRate = cacheTotal > 0 ? (this.cacheHits / cacheTotal) : 0;
      lines.push('# HELP cache_hit_rate Cache hit rate (0-1)');
      lines.push('# TYPE cache_hit_rate gauge');
      lines.push(`cache_hit_rate ${cacheHitRate.toFixed(4)}`);
      lines.push('');

      lines.push('# HELP socket_connections_active Active Socket.IO connections');
      lines.push('# TYPE socket_connections_active gauge');
      lines.push(`socket_connections_active ${this.activeSocketConnections}`);
      lines.push('');

      lines.push('# HELP socket_connections_total Total Socket.IO connections');
      lines.push('# TYPE socket_connections_total counter');
      lines.push(`socket_connections_total ${this.totalSocketConnections}`);
      lines.push('');

      lines.push('# HELP socket_disconnections_total Total Socket.IO disconnections');
      lines.push('# TYPE socket_disconnections_total counter');
      lines.push(`socket_disconnections_total ${this.socketDisconnections}`);
      lines.push('');

      return lines.join('\n');
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error exporting Prometheus metrics', { error: error.message });
      return '# Error exporting metrics\n';
    }
  }

  // ============================================================
  // Prometheus export — NEW format (for src/ tests)
  // ============================================================

  toPrometheusFormat() {
    try {
      const lines = [];
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);

      lines.push('# HELP process_uptime_seconds Process uptime in seconds');
      lines.push('# TYPE process_uptime_seconds gauge');
      lines.push(`process_uptime_seconds ${uptime}`);
      lines.push('');

      lines.push('# HELP http_requests_total Total number of HTTP requests');
      lines.push('# TYPE http_requests_total counter');
      lines.push(`http_requests_total ${this._simple.requestTotal}`);
      for (const [status, count] of Object.entries(this._simple.requestByStatus)) {
        lines.push(`http_requests_by_status_total{status="${status}"} ${count}`);
      }
      lines.push('');

      lines.push('# HELP http_response_time_ms HTTP response time in milliseconds');
      lines.push('# TYPE http_response_time_ms summary');
      lines.push(`http_response_time_ms{quantile="0.5"} ${this.calculatePercentile(50)}`);
      lines.push(`http_response_time_ms{quantile="0.95"} ${this.calculatePercentile(95)}`);
      lines.push(`http_response_time_ms{quantile="0.99"} ${this.calculatePercentile(99)}`);
      lines.push(`http_response_time_ms_count ${this._simple.responseTimes.length}`);
      lines.push('');

      lines.push('# HELP http_errors_total Total number of errors');
      lines.push('# TYPE http_errors_total counter');
      lines.push(`http_errors_total ${this._simple.errorTotal}`);
      for (const [type, count] of Object.entries(this._simple.errorByType)) {
        lines.push(`http_errors_by_type_total{type="${type}"} ${count}`);
      }
      lines.push('');

      lines.push('# HELP database_queries_total Total number of database queries');
      lines.push('# TYPE database_queries_total counter');
      lines.push(`database_queries_total ${this._simple.dbQueries}`);
      lines.push('');

      lines.push('# HELP cache_hits_total Total number of cache hits');
      lines.push('# TYPE cache_hits_total counter');
      lines.push(`cache_hits_total ${this._simple.cacheHits}`);
      lines.push('');

      lines.push('# HELP cache_misses_total Total number of cache misses');
      lines.push('# TYPE cache_misses_total counter');
      lines.push(`cache_misses_total ${this._simple.cacheMisses}`);
      lines.push('');

      lines.push('# HELP socketio_connections Active Socket.IO connections');
      lines.push('# TYPE socketio_connections gauge');
      lines.push(`socketio_connections ${this._simple.socketActiveConnections}`);
      lines.push('');

      return lines.join('\n');
    } catch (error) {
      this.logger && this.logger.error && this.logger.error('Error exporting Prometheus metrics', { error: error.message });
      return '# Error exporting metrics\n';
    }
  }

  // ============================================================
  // Reset
  // ============================================================

  reset() {
    this.requestCounts.clear();
    this.responseTimes.clear();
    this.errorCounts.clear();
    this.dbQueryTimes = [];
    this.dbQueryCounts = 0;
    this.dbErrorCounts = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.activeSocketConnections = 0;
    this.totalSocketConnections = 0;
    this.socketDisconnections = 0;
    this.socketEvents = 0;

    this._simple = {
      responseTimes: [],
      requestTotal: 0,
      requestByEndpoint: {},
      requestByStatus: {},
      errorTotal: 0,
      errorByType: {},
      dbQueries: 0,
      dbErrors: 0,
      dbTotalTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      socketActiveConnections: 0,
      socketTotalEvents: 0
    };

    this.startTime = Date.now();
    this.logger && this.logger.info && this.logger.info('Metrics reset');
  }
}

module.exports = MetricsCollector;
