/**
 * Metrics Collector Tests
 * 
 * Tests for metrics collection and reporting
 */

const MetricsCollector = require('./metrics-collector');

describe('MetricsCollector', () => {
  let metricsCollector;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };

    metricsCollector = new MetricsCollector(mockLogger);
  });

  describe('trackRequest', () => {
    it('should track request metrics', () => {
      metricsCollector.trackRequest('GET', '/api/users', 200, 50);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.byEndpoint['GET /api/users']).toBe(1);
      expect(metrics.requests.byStatus[200]).toBe(1);
      expect(metrics.responseTimes.count).toBe(1);
    });

    it('should track multiple requests', () => {
      metricsCollector.trackRequest('GET', '/api/users', 200, 50);
      metricsCollector.trackRequest('POST', '/api/users', 201, 100);
      metricsCollector.trackRequest('GET', '/api/users', 200, 75);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.requests.total).toBe(3);
      expect(metrics.requests.byEndpoint['GET /api/users']).toBe(2);
      expect(metrics.requests.byEndpoint['POST /api/users']).toBe(1);
      expect(metrics.requests.byStatus[200]).toBe(2);
      expect(metrics.requests.byStatus[201]).toBe(1);
    });

    it('should limit response times to last 1000 entries', () => {
      // Track 1500 requests
      for (let i = 0; i < 1500; i++) {
        metricsCollector.trackRequest('GET', '/api/test', 200, i);
      }

      expect(metricsCollector.metrics.responseTimes.length).toBe(1000);
    });
  });

  describe('trackError', () => {
    it('should track error metrics', () => {
      metricsCollector.trackError('ValidationError');

      const metrics = metricsCollector.getMetrics();

      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.byType.ValidationError).toBe(1);
    });

    it('should track multiple errors by type', () => {
      metricsCollector.trackError('ValidationError');
      metricsCollector.trackError('AuthenticationError');
      metricsCollector.trackError('ValidationError');

      const metrics = metricsCollector.getMetrics();

      expect(metrics.errors.total).toBe(3);
      expect(metrics.errors.byType.ValidationError).toBe(2);
      expect(metrics.errors.byType.AuthenticationError).toBe(1);
    });
  });

  describe('trackDatabaseQuery', () => {
    it('should track database query metrics', () => {
      metricsCollector.trackDatabaseQuery(25);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.database.queries).toBe(1);
      expect(metrics.database.averageTime).toBe(25);
      expect(metrics.database.errors).toBe(0);
    });

    it('should track database query errors', () => {
      metricsCollector.trackDatabaseQuery(50, true);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.database.queries).toBe(1);
      expect(metrics.database.errors).toBe(1);
    });

    it('should calculate average query time', () => {
      metricsCollector.trackDatabaseQuery(10);
      metricsCollector.trackDatabaseQuery(20);
      metricsCollector.trackDatabaseQuery(30);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.database.queries).toBe(3);
      expect(metrics.database.averageTime).toBe(20);
    });
  });

  describe('trackCacheHit and trackCacheMiss', () => {
    it('should track cache hits', () => {
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheHit();

      const metrics = metricsCollector.getMetrics();

      expect(metrics.cache.hits).toBe(2);
      expect(metrics.cache.misses).toBe(0);
    });

    it('should track cache misses', () => {
      metricsCollector.trackCacheMiss();
      metricsCollector.trackCacheMiss();
      metricsCollector.trackCacheMiss();

      const metrics = metricsCollector.getMetrics();

      expect(metrics.cache.hits).toBe(0);
      expect(metrics.cache.misses).toBe(3);
    });

    it('should calculate cache hit rate', () => {
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheMiss();

      const metrics = metricsCollector.getMetrics();

      expect(metrics.cache.hitRate).toBe(80); // 4 hits out of 5 total = 80%
    });

    it('should return 0 hit rate when no cache operations', () => {
      const metrics = metricsCollector.getMetrics();

      expect(metrics.cache.hitRate).toBe(0);
    });
  });

  describe('trackSocketConnection', () => {
    it('should track socket connections', () => {
      metricsCollector.trackSocketConnection(1);
      metricsCollector.trackSocketConnection(1);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.socketio.activeConnections).toBe(2);
    });

    it('should track socket disconnections', () => {
      metricsCollector.trackSocketConnection(1);
      metricsCollector.trackSocketConnection(1);
      metricsCollector.trackSocketConnection(-1);

      const metrics = metricsCollector.getMetrics();

      expect(metrics.socketio.activeConnections).toBe(1);
    });
  });

  describe('trackSocketEvent', () => {
    it('should track socket events', () => {
      metricsCollector.trackSocketEvent();
      metricsCollector.trackSocketEvent();
      metricsCollector.trackSocketEvent();

      const metrics = metricsCollector.getMetrics();

      expect(metrics.socketio.totalEvents).toBe(3);
    });
  });

  describe('calculatePercentile', () => {
    it('should calculate p50 correctly', () => {
      const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      times.forEach(time => {
        metricsCollector.trackRequest('GET', '/test', 200, time);
      });

      const p50 = metricsCollector.calculatePercentile(50);

      expect(p50).toBe(50);
    });

    it('should calculate p95 correctly', () => {
      const times = Array.from({ length: 100 }, (_, i) => i + 1);
      times.forEach(time => {
        metricsCollector.trackRequest('GET', '/test', 200, time);
      });

      const p95 = metricsCollector.calculatePercentile(95);

      expect(p95).toBe(95);
    });

    it('should calculate p99 correctly', () => {
      const times = Array.from({ length: 100 }, (_, i) => i + 1);
      times.forEach(time => {
        metricsCollector.trackRequest('GET', '/test', 200, time);
      });

      const p99 = metricsCollector.calculatePercentile(99);

      expect(p99).toBe(99);
    });

    it('should return 0 when no response times', () => {
      const p50 = metricsCollector.calculatePercentile(50);

      expect(p50).toBe(0);
    });
  });

  describe('getErrorRate', () => {
    it('should calculate error rate correctly', () => {
      metricsCollector.trackRequest('GET', '/test', 200, 50);
      metricsCollector.trackRequest('GET', '/test', 200, 50);
      metricsCollector.trackRequest('GET', '/test', 200, 50);
      metricsCollector.trackRequest('GET', '/test', 200, 50);
      metricsCollector.trackError('ValidationError');

      const errorRate = metricsCollector.getErrorRate();

      expect(errorRate).toBe(25); // 1 error out of 4 requests = 25%
    });

    it('should return 0 when no requests', () => {
      const errorRate = metricsCollector.getErrorRate();

      expect(errorRate).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return all metrics', () => {
      metricsCollector.trackRequest('GET', '/api/users', 200, 50);
      metricsCollector.trackError('ValidationError');
      metricsCollector.trackDatabaseQuery(25);
      metricsCollector.trackCacheHit();
      metricsCollector.trackSocketConnection(1);

      const metrics = metricsCollector.getMetrics();

      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('responseTimes');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('socketio');
    });
  });

  describe('toPrometheusFormat', () => {
    it('should export metrics in Prometheus format', () => {
      metricsCollector.trackRequest('GET', '/api/users', 200, 50);
      metricsCollector.trackRequest('POST', '/api/users', 201, 100);
      metricsCollector.trackError('ValidationError');
      metricsCollector.trackDatabaseQuery(25);
      metricsCollector.trackCacheHit();
      metricsCollector.trackCacheMiss();
      metricsCollector.trackSocketConnection(1);

      const prometheus = metricsCollector.toPrometheusFormat();

      expect(prometheus).toContain('# HELP process_uptime_seconds');
      expect(prometheus).toContain('# TYPE process_uptime_seconds gauge');
      expect(prometheus).toContain('# HELP http_requests_total');
      expect(prometheus).toContain('# TYPE http_requests_total counter');
      expect(prometheus).toContain('http_requests_total 2');
      expect(prometheus).toContain('http_requests_by_status_total{status="200"} 1');
      expect(prometheus).toContain('http_requests_by_status_total{status="201"} 1');
      expect(prometheus).toContain('# HELP http_response_time_ms');
      expect(prometheus).toContain('# TYPE http_response_time_ms summary');
      expect(prometheus).toContain('http_response_time_ms{quantile="0.5"}');
      expect(prometheus).toContain('http_response_time_ms{quantile="0.95"}');
      expect(prometheus).toContain('http_response_time_ms{quantile="0.99"}');
      expect(prometheus).toContain('# HELP http_errors_total');
      expect(prometheus).toContain('http_errors_total 1');
      expect(prometheus).toContain('# HELP database_queries_total');
      expect(prometheus).toContain('database_queries_total 1');
      expect(prometheus).toContain('# HELP cache_hits_total');
      expect(prometheus).toContain('cache_hits_total 1');
      expect(prometheus).toContain('# HELP cache_misses_total');
      expect(prometheus).toContain('cache_misses_total 1');
      expect(prometheus).toContain('# HELP socketio_connections');
      expect(prometheus).toContain('socketio_connections 1');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metricsCollector.trackRequest('GET', '/api/users', 200, 50);
      metricsCollector.trackError('ValidationError');
      metricsCollector.trackDatabaseQuery(25);
      metricsCollector.trackCacheHit();
      metricsCollector.trackSocketConnection(1);

      metricsCollector.reset();

      const metrics = metricsCollector.getMetrics();

      expect(metrics.requests.total).toBe(0);
      expect(metrics.errors.total).toBe(0);
      expect(metrics.database.queries).toBe(0);
      expect(metrics.cache.hits).toBe(0);
      expect(metrics.socketio.activeConnections).toBe(0);
    });
  });
});
