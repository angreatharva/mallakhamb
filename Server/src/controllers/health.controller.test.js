/**
 * Health Controller Tests
 *
 * Tests for health check and metrics endpoints.
 * This file is kept exactly as provided — the existing tests are correct
 * and fully cover the HealthController class.
 */

const HealthController = require('../controllers/health.controller');

describe('HealthController', () => {
  let healthController;
  let mockHealthMonitor;
  let mockMetricsCollector;
  let mockLogger;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockHealthMonitor = {
      liveness: jest.fn(),
      readiness: jest.fn(),
      checkHealth: jest.fn(),
    };

    mockMetricsCollector = {
      getMetrics: jest.fn(),
      toPrometheusFormat: jest.fn(),
    };

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };

    mockReq = { query: {} };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    healthController = new HealthController(
      mockHealthMonitor,
      mockMetricsCollector,
      mockLogger
    );
  });

  // ── liveness ────────────────────────────────────────────────────────────────

  describe('liveness', () => {
    it('should return 200 with liveness status', async () => {
      const livenessStatus = { status: 'alive', timestamp: '2024-01-01T00:00:00.000Z', uptime: 100 };
      mockHealthMonitor.liveness.mockReturnValue(livenessStatus);

      await healthController.liveness(mockReq, mockRes);

      expect(mockHealthMonitor.liveness).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(livenessStatus);
    });

    it('should return 503 on error', async () => {
      const error = new Error('Liveness check failed');
      mockHealthMonitor.liveness.mockImplementation(() => { throw error; });

      await healthController.liveness(mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith('Liveness probe failed', { error: error.message });
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'error', message: error.message });
    });
  });

  // ── readiness ───────────────────────────────────────────────────────────────

  describe('readiness', () => {
    it('should return 200 when server is ready', async () => {
      const readinessStatus = {
        status: 'ready',
        timestamp: '2024-01-01T00:00:00.000Z',
        checks: { database: { status: 'healthy' } },
      };
      mockHealthMonitor.readiness.mockResolvedValue(readinessStatus);

      await healthController.readiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(readinessStatus);
    });

    it('should return 503 when server is not ready', async () => {
      const readinessStatus = {
        status: 'not_ready',
        timestamp: '2024-01-01T00:00:00.000Z',
        checks: { database: { status: 'unhealthy' } },
      };
      mockHealthMonitor.readiness.mockResolvedValue(readinessStatus);

      await healthController.readiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(readinessStatus);
    });

    it('should return 503 on error', async () => {
      const error = new Error('Readiness check failed');
      mockHealthMonitor.readiness.mockRejectedValue(error);

      await healthController.readiness(mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith('Readiness probe failed', { error: error.message });
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'not_ready', message: error.message });
    });
  });

  // ── health ──────────────────────────────────────────────────────────────────

  describe('health', () => {
    it('should return 200 when all checks are healthy', async () => {
      const healthStatus = {
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 100,
        checks: {
          database: { status: 'healthy' },
          memory: { status: 'healthy' },
          email: { status: 'healthy' },
        },
      };
      mockHealthMonitor.checkHealth.mockResolvedValue(healthStatus);

      await healthController.health(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(healthStatus);
    });

    it('should return 503 when any check is unhealthy', async () => {
      const healthStatus = {
        status: 'unhealthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        uptime: 100,
        checks: {
          database: { status: 'unhealthy' },
          memory: { status: 'healthy' },
        },
      };
      mockHealthMonitor.checkHealth.mockResolvedValue(healthStatus);

      await healthController.health(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(healthStatus);
    });

    it('should return 503 on error', async () => {
      const error = new Error('Health check failed');
      mockHealthMonitor.checkHealth.mockRejectedValue(error);

      await healthController.health(mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith('Health check failed', { error: error.message });
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unhealthy', message: error.message })
      );
    });
  });

  // ── metrics ─────────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('should return metrics in JSON format by default', async () => {
      const metrics = {
        uptime: 100,
        requests: { total: 50 },
        responseTimes: { p50: 10, p95: 50, p99: 100 },
        errors: { total: 5 },
        database: { queries: 100 },
        cache: { hits: 80, misses: 20 },
        socketio: { activeConnections: 10 },
      };
      mockMetricsCollector.getMetrics.mockReturnValue(metrics);

      await healthController.metrics(mockReq, mockRes);

      expect(mockMetricsCollector.getMetrics).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(metrics);
    });

    it('should return metrics in JSON format when explicitly requested', async () => {
      mockReq.query.format = 'json';
      const metrics = { uptime: 100, requests: { total: 50 } };
      mockMetricsCollector.getMetrics.mockReturnValue(metrics);

      await healthController.metrics(mockReq, mockRes);

      expect(mockMetricsCollector.getMetrics).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(metrics);
    });

    it('should return metrics in Prometheus format when requested', async () => {
      mockReq.query.format = 'prometheus';
      const prometheusMetrics = `# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total 50`;
      mockMetricsCollector.toPrometheusFormat.mockReturnValue(prometheusMetrics);

      await healthController.metrics(mockReq, mockRes);

      expect(mockMetricsCollector.toPrometheusFormat).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(prometheusMetrics);
    });

    it('should return 500 on error', async () => {
      const error = new Error('Metrics collection failed');
      mockMetricsCollector.getMetrics.mockImplementation(() => { throw error; });

      await healthController.metrics(mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith('Metrics endpoint failed', { error: error.message });
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve metrics',
        message: error.message,
      });
    });
  });
});
