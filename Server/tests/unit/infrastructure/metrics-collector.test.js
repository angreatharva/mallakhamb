/**
 * Unit tests for MetricsCollector
 * 
 * Tests metric tracking, percentile calculation, and Prometheus export
 * Requirements: 15.1
 */

const MetricsCollector = require('../../../src/infrastructure/metrics-collector');

describe('MetricsCollector', () => {
  let metricsCollector;
  let mockLogger;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    metricsCollector = new MetricsCollector(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Request Metrics', () => {
    test('should record HTTP request with all parameters', () => {
      metricsCollector.recordRequest('GET', '/api/users/123', 200, 150);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.byEndpoint['GET /api/users/:id']).toBe(1);
      expect(metrics.requests.byStatus['200']).toBe(1);
    });

    test('should normalize paths with MongoDB ObjectIds', () => {
      metricsCollector.recordRequest('GET', '/api/users/507f1f77bcf86cd799439011', 200, 100);
      metricsCollector.recordRequest('GET', '/api/users/507f191e810c19729de860ea', 200, 120);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.byEndpoint['GET /api/users/:id']).toBe(2);
    });

    test('should normalize paths with numeric IDs', () => {
      metricsCollector.recordRequest('GET', '/api/posts/123', 200, 100);
      metricsCollector.recordRequest('GET', '/api/posts/456', 200, 120);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.byEndpoint['GET /api/posts/:id']).toBe(2);
    });

    test('should track requests by status code', () => {
      metricsCollector.recordRequest('GET', '/api/users', 200, 100);
      metricsCollector.recordRequest('GET', '/api/users', 200, 120);
      metricsCollector.recordRequest('GET', '/api/users', 404, 50);
      metricsCollector.recordRequest('POST', '/api/users', 500, 200);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.byStatus['200']).toBe(2);
      expect(metrics.requests.byStatus['404']).toBe(1);
      expect(metrics.requests.byStatus['500']).toBe(1);
    });

    test('should calculate response time percentiles', () => {
      // Record multiple requests with varying response times
      const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      times.forEach(time => {
        metricsCollector.recordRequest('GET', '/api/users', 200, time);
      });

      const metrics = metricsCollector.getMetrics();
      const responseTimes = metrics.requests.responseTimes['GET|||/api/users'];
      
      expect(responseTimes).toBeDefined();
      expect(responseTimes.p50).toBeGreaterThan(0);
      expect(responseTimes.p95).toBeGreaterThan(responseTimes.p50);
      expect(responseTimes.p99).toBeGreaterThan(responseTimes.p95);
      expect(responseTimes.min).toBe(10);
      expect(responseTimes.max).toBe(100);
    });

    test('should handle recording errors gracefully', () => {
      // Pass invalid data
      metricsCollector.recordRequest(null, null, null, null);

      // Should not throw and should log error
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Error Metrics', () => {
    test('should record errors by type', () => {
      metricsCollector.recordError('ValidationError');
      metricsCollector.recordError('ValidationError');
      metricsCollector.recordError('AuthenticationError');

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.errors.total).toBe(3);
      expect(metrics.errors.byType['ValidationError']).toBe(2);
      expect(metrics.errors.byType['AuthenticationError']).toBe(1);
    });

    test('should handle recording error gracefully', () => {
      metricsCollector.recordError(null);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Database Metrics', () => {
    test('should record successful database queries', () => {
      metricsCollector.recordDatabaseQuery(50, true);
      metricsCollector.recordDatabaseQuery(75, true);
      metricsCollector.recordDatabaseQuery(100, true);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.database.queryCount).toBe(3);
      expect(metrics.database.errorCount).toBe(0);
      expect(metrics.database.queryTimes).toBeDefined();
      expect(metrics.database.queryTimes.p50).toBeGreaterThan(0);
    });

    test('should record failed database queries', () => {
      metricsCollector.recordDatabaseQuery(50, true);
      metricsCollector.recordDatabaseQuery(0, false);
      metricsCollector.recordDatabaseQuery(0, false);

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.database.queryCount).toBe(3);
      expect(metrics.database.errorCount).toBe(2);
      expect(metrics.database.errorRate).toBe('66.67%');
    });

    test('should calculate database query percentiles', () => {
      const times = [10, 20, 30, 40, 50];
      times.forEach(time => {
        metricsCollector.recordDatabaseQuery(time, true);
      });

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.database.queryTimes.p50).toBe(30);
      expect(metrics.database.queryTimes.min).toBe(10);
      expect(metrics.database.queryTimes.max).toBe(50);
    });
  });

  describe('Cache Metrics', () => {
    test('should record cache hits and misses', () => {
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheMiss();

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.cache.hits).toBe(3);
      expect(metrics.cache.misses).toBe(1);
      expect(metrics.cache.total).toBe(4);
      expect(metrics.cache.hitRate).toBe('75.00%');
    });

    test('should calculate 0% hit rate when no cache operations', () => {
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.cache.hitRate).toBe('0%');
    });

    test('should calculate 100% hit rate when all hits', () => {
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheHit();

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.cache.hitRate).toBe('100.00%');
    });
  });

  describe('Socket.IO Metrics', () => {
    test('should track socket connections', () => {
      metricsCollector.recordSocketConnection();
      metricsCollector.recordSocketConnection();
      metricsCollector.recordSocketConnection();

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.sockets.active).toBe(3);
      expect(metrics.sockets.totalConnections).toBe(3);
      expect(metrics.sockets.totalDisconnections).toBe(0);
    });

    test('should track socket disconnections', () => {
      metricsCollector.recordSocketConnection();
      metricsCollector.recordSocketConnection();
      metricsCollector.recordSocketDisconnection();

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.sockets.active).toBe(1);
      expect(metrics.sockets.totalConnections).toBe(2);
      expect(metrics.sockets.totalDisconnections).toBe(1);
    });

    test('should not allow negative active connections', () => {
      metricsCollector.recordSocketDisconnection();
      metricsCollector.recordSocketDisconnection();

      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.sockets.active).toBe(0);
    });
  });

  describe('Prometheus Export', () => {
    test('should export metrics in Prometheus format', () => {
      metricsCollector.recordRequest('GET', '/api/users', 200, 100);
      metricsCollector.recordError('ValidationError');
      metricsCollector.recordDatabaseQuery(50, true);
      metricsCollector.recordCacheHit();
      metricsCollector.recordSocketConnection();

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('# HELP app_uptime_seconds');
      expect(prometheus).toContain('# TYPE app_uptime_seconds gauge');
      expect(prometheus).toContain('# HELP http_requests_total');
      expect(prometheus).toContain('# TYPE http_requests_total counter');
      expect(prometheus).toContain('# HELP http_response_time_milliseconds');
      expect(prometheus).toContain('# HELP app_errors_total');
      expect(prometheus).toContain('# HELP db_queries_total');
      expect(prometheus).toContain('# HELP cache_hits_total');
      expect(prometheus).toContain('# HELP socket_connections_active');
    });

    test('should include request metrics in Prometheus format', () => {
      metricsCollector.recordRequest('GET', '/api/users/123', 200, 100);

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('http_requests_total{method="GET",path="/api/users/:id",status="200"} 1');
    });

    test('should include response time percentiles in Prometheus format', () => {
      metricsCollector.recordRequest('GET', '/api/users', 200, 100);
      metricsCollector.recordRequest('GET', '/api/users', 200, 200);

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('http_response_time_milliseconds{method="GET",path="/api/users",quantile="0.5"}');
      expect(prometheus).toContain('http_response_time_milliseconds{method="GET",path="/api/users",quantile="0.95"}');
      expect(prometheus).toContain('http_response_time_milliseconds{method="GET",path="/api/users",quantile="0.99"}');
    });

    test('should include error counts in Prometheus format', () => {
      metricsCollector.recordError('ValidationError');
      metricsCollector.recordError('AuthenticationError');

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('app_errors_total{type="ValidationError"} 1');
      expect(prometheus).toContain('app_errors_total{type="AuthenticationError"} 1');
    });

    test('should include cache metrics in Prometheus format', () => {
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheHit();
      metricsCollector.recordCacheMiss();

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('cache_hits_total 2');
      expect(prometheus).toContain('cache_misses_total 1');
      expect(prometheus).toContain('cache_hit_rate');
    });

    test('should handle export errors gracefully', () => {
      // Force an error by corrupting internal state
      metricsCollector.requestCounts = null;

      const prometheus = metricsCollector.exportPrometheus();
      
      expect(prometheus).toContain('# Error exporting metrics');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Percentile Calculation', () => {
    test('should calculate percentiles correctly', () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const percentiles = metricsCollector.calculatePercentiles(values);

      expect(percentiles.p50).toBe(55); // Median of 10 values
      expect(percentiles.p95).toBeGreaterThan(90);
      expect(percentiles.p99).toBeGreaterThan(95);
      expect(percentiles.min).toBe(10);
      expect(percentiles.max).toBe(100);
      expect(percentiles.avg).toBe(55);
    });

    test('should handle single value', () => {
      const values = [42];
      const percentiles = metricsCollector.calculatePercentiles(values);

      expect(percentiles.p50).toBe(42);
      expect(percentiles.p95).toBe(42);
      expect(percentiles.p99).toBe(42);
      expect(percentiles.min).toBe(42);
      expect(percentiles.max).toBe(42);
      expect(percentiles.avg).toBe(42);
    });

    test('should handle empty array', () => {
      const values = [];
      const percentiles = metricsCollector.calculatePercentiles(values);

      expect(percentiles.p50).toBe(0);
      expect(percentiles.p95).toBe(0);
      expect(percentiles.p99).toBe(0);
      expect(percentiles.min).toBe(0);
      expect(percentiles.max).toBe(0);
      expect(percentiles.avg).toBe(0);
    });

    test('should round percentiles to 2 decimal places', () => {
      const values = [1.111, 2.222, 3.333];
      const percentiles = metricsCollector.calculatePercentiles(values);

      expect(percentiles.p50).toBe(2.22);
      expect(percentiles.avg).toBe(2.22);
    });
  });

  describe('Path Normalization', () => {
    test('should normalize MongoDB ObjectIds', () => {
      const path = '/api/users/507f1f77bcf86cd799439011/posts';
      const normalized = metricsCollector.normalizePath(path);

      expect(normalized).toBe('/api/users/:id/posts');
    });

    test('should normalize UUIDs', () => {
      const path = '/api/users/550e8400-e29b-41d4-a716-446655440000';
      const normalized = metricsCollector.normalizePath(path);

      expect(normalized).toBe('/api/users/:id');
    });

    test('should normalize numeric IDs', () => {
      const path = '/api/posts/123/comments/456';
      const normalized = metricsCollector.normalizePath(path);

      expect(normalized).toBe('/api/posts/:id/comments/:id');
    });

    test('should remove query strings', () => {
      const path = '/api/users?page=1&limit=10';
      const normalized = metricsCollector.normalizePath(path);

      expect(normalized).toBe('/api/users');
    });

    test('should handle paths without IDs', () => {
      const path = '/api/users/profile';
      const normalized = metricsCollector.normalizePath(path);

      expect(normalized).toBe('/api/users/profile');
    });
  });

  describe('Reset Functionality', () => {
    test('should reset all metrics', () => {
      // Record various metrics
      metricsCollector.recordRequest('GET', '/api/users', 200, 100);
      metricsCollector.recordError('ValidationError');
      metricsCollector.recordDatabaseQuery(50, true);
      metricsCollector.recordCacheHit();
      metricsCollector.recordSocketConnection();

      // Reset
      metricsCollector.reset();

      // Verify all metrics are reset
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.total).toBe(0);
      expect(metrics.errors.total).toBe(0);
      expect(metrics.database.queryCount).toBe(0);
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.sockets.active).toBe(0);
    });

    test('should log reset action', () => {
      metricsCollector.reset();

      expect(mockLogger.info).toHaveBeenCalledWith('Metrics reset');
    });
  });

  describe('Get Metrics', () => {
    test('should return all metrics with uptime', () => {
      const metrics = metricsCollector.getMetrics();

      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('sockets');
      expect(typeof metrics.uptime).toBe('number');
    });

    test('should handle errors gracefully', () => {
      // Force an error
      metricsCollector.getRequestMetrics = () => {
        throw new Error('Test error');
      };

      const metrics = metricsCollector.getMetrics();

      expect(metrics).toHaveProperty('error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    test('should limit response time samples to prevent memory issues', () => {
      // Record more than maxResponseTimeSamples
      for (let i = 0; i < 11000; i++) {
        metricsCollector.recordRequest('GET', '/api/users', 200, 100);
      }

      const times = metricsCollector.responseTimes.get('GET|||/api/users');
      
      expect(times.length).toBeLessThanOrEqual(10000);
    });

    test('should limit database query samples to prevent memory issues', () => {
      // Record more than maxDbQuerySamples
      for (let i = 0; i < 11000; i++) {
        metricsCollector.recordDatabaseQuery(50, true);
      }

      expect(metricsCollector.dbQueryTimes.length).toBeLessThanOrEqual(10000);
    });
  });
});
