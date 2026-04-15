const HealthMonitor = require('../../../src/infrastructure/health-monitor');

// Create mock ping function
const mockPing = jest.fn();

// Mock mongoose
jest.mock('mongoose', () => ({
  connection: {
    readyState: 1,
    host: 'localhost',
    name: 'test-db',
    db: {
      admin: () => ({
        ping: mockPing
      })
    }
  }
}));

const mongoose = require('mongoose');

describe('HealthMonitor', () => {
  let healthMonitor;
  let mockConfig;
  let mockLogger;
  let mockEmailService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockPing.mockReset();

    // Mock config
    mockConfig = {
      get: jest.fn((path) => {
        const config = {
          'database.timeouts.connection': 10000,
          'server.nodeEnv': 'test'
        };
        return config[path];
      })
    };

    // Mock logger
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    };

    // Mock email service
    mockEmailService = {
      checkHealth: jest.fn()
    };

    healthMonitor = new HealthMonitor(mockConfig, mockLogger, mockEmailService);
  });

  describe('checkHealth', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful database ping
      mockPing.mockResolvedValue({});
      mongoose.connection.readyState = 1;

      // Mock successful email service check
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      // Mock memory usage to ensure healthy status
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024,
        rss: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }));

      const result = await healthMonitor.checkHealth();
      process.memoryUsage = originalMemoryUsage;

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('healthy');
      expect(result.checks.memory.status).toBe('healthy');
      expect(result.checks.email.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when database check fails', async () => {
      // Mock failed database ping
      mockPing.mockRejectedValue(new Error('Connection failed'));
      mongoose.connection.readyState = 1;

      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      const result = await healthMonitor.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('unhealthy');
      expect(result.checks.database.error).toBe('Connection failed');
      expect(mockLogger.warn).toHaveBeenCalledWith('Health check failed', expect.any(Object));
    });

    it('should return unhealthy status when email service check fails', async () => {
      mockPing.mockResolvedValue({});
      mongoose.connection.readyState = 1;

      // Mock failed email service check
      mockEmailService.checkHealth.mockResolvedValue({ healthy: false });

      const result = await healthMonitor.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.email.status).toBe('unhealthy');
    });

    it('should include uptime and process info in health check', async () => {
      mockPing.mockResolvedValue({});
      mongoose.connection.readyState = 1;
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      const result = await healthMonitor.checkHealth();

      expect(result.checks.uptime).toBeDefined();
      expect(result.checks.uptime.applicationSeconds).toBeGreaterThanOrEqual(0);
      expect(result.checks.uptime.processSeconds).toBeGreaterThanOrEqual(0);
      expect(result.checks.process).toBeDefined();
      expect(result.checks.process.pid).toBe(process.pid);
      expect(result.checks.process.nodeVersion).toBe(process.version);
    });

    it('should handle errors gracefully', async () => {
      // Mock database check to throw error
      mockPing.mockRejectedValue(new Error('Database error'));
      mongoose.connection.readyState = 1;

      const result = await healthMonitor.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('checkLiveness', () => {
    it('should return alive status', async () => {
      const result = await healthMonitor.checkLiveness();

      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.pid).toBe(process.pid);
    });

    it('should handle errors and return dead status', async () => {
      // Force an error by making process.uptime throw
      const originalUptime = process.uptime;
      process.uptime = () => {
        throw new Error('Process error');
      };

      const result = await healthMonitor.checkLiveness();

      expect(result.status).toBe('dead');
      expect(result.error).toBe('Process error');
      expect(mockLogger.error).toHaveBeenCalledWith('Liveness check failed', expect.any(Object));

      // Restore original function
      process.uptime = originalUptime;
    });
  });

  describe('checkReadiness', () => {
    beforeEach(() => {
      // Ensure readyState is reset
      mongoose.connection.readyState = 1;
    });

    it('should return ready status when database is connected', async () => {
      mockPing.mockResolvedValue({});

      const result = await healthMonitor.checkReadiness();

      expect(result.status).toBe('ready');
      expect(result.checks.database).toBe('ready');
      expect(result.timestamp).toBeDefined();
    });

    it('should return not_ready status when database is disconnected', async () => {
      mongoose.connection.readyState = 0;

      const result = await healthMonitor.checkReadiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.database).toBe('not_ready');
    });

    it('should return not_ready status when database ping fails', async () => {
      mockPing.mockRejectedValue(new Error('Ping failed'));

      const result = await healthMonitor.checkReadiness();

      expect(result.status).toBe('not_ready');
      expect(result.checks.database).toBe('not_ready');
    });

    it('should handle errors gracefully', async () => {
      // Create a new health monitor for this test to avoid affecting others
      const testMonitor = new HealthMonitor(mockConfig, mockLogger, mockEmailService);
      
      // Save original readyState descriptor
      const originalDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
      
      try {
        // Mock readyState to throw error
        Object.defineProperty(mongoose.connection, 'readyState', {
          get: () => {
            throw new Error('Connection error');
          },
          configurable: true
        });

        const result = await testMonitor.checkReadiness();

        // Should return not_ready status when error occurs
        expect(result.status).toBe('not_ready');
      } finally {
        // Restore readyState
        if (originalDescriptor) {
          Object.defineProperty(mongoose.connection, 'readyState', originalDescriptor);
        } else {
          Object.defineProperty(mongoose.connection, 'readyState', {
            value: 1,
            writable: true,
            configurable: true
          });
        }
      }
    });
  });

  describe('checkDatabase', () => {
    let originalReadyState;

    beforeEach(() => {
      // Save and reset readyState before each test
      originalReadyState = mongoose.connection.readyState;
      mongoose.connection.readyState = 1;
    });

    afterEach(() => {
      // Restore original readyState after each test
      if (originalReadyState !== undefined) {
        mongoose.connection.readyState = originalReadyState;
      }
    });

    it('should return healthy status when database is connected', async () => {
      mockPing.mockResolvedValue({});

      const result = await healthMonitor.checkDatabase();

      expect(result.status).toBe('healthy');
      expect(result.state).toBe('connected');
      expect(result.host).toBe('localhost');
      expect(result.name).toBe('test-db');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when database is disconnected', async () => {
      mongoose.connection.readyState = 0;

      const result = await healthMonitor.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.state).toBe('disconnected');
      expect(result.error).toContain('Database not connected');
    });

    it('should return unhealthy status when database is connecting', async () => {
      mongoose.connection.readyState = 2;

      const result = await healthMonitor.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.state).toBe('connecting');
    });

    it('should return unhealthy status when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('Ping failed'));

      const result = await healthMonitor.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Ping failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Database health check failed', expect.any(Object));
    });

    it('should timeout if database check takes too long', async () => {
      // Mock ping to take longer than timeout
      mockPing.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 15000))
      );

      const result = await healthMonitor.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Database check timeout');
    }, 15000);
  });

  describe('checkMemory', () => {
    it('should return healthy status with normal memory usage', async () => {
      // Mock memory usage to simulate low heap usage (below 80% threshold)
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 100 * 1024 * 1024,  // 100 MB
        heapTotal: 500 * 1024 * 1024, // 500 MB (20% usage)
        rss: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }));

      const result = await healthMonitor.checkMemory();

      process.memoryUsage = originalMemoryUsage;

      expect(result.status).toBe('healthy');
      expect(result.heap).toBeDefined();
      expect(result.heap.used).toBeGreaterThan(0);
      expect(result.heap.total).toBeGreaterThan(0);
      expect(result.heap.usagePercent).toBeGreaterThanOrEqual(0);
      expect(result.heap.usagePercent).toBeLessThanOrEqual(100);
      expect(result.rss).toBeGreaterThan(0);
      expect(result.system).toBeDefined();
      expect(result.system.total).toBeGreaterThan(0);
    });

    it('should return degraded status when heap usage is above 80%', async () => {
      // Mock memory usage to simulate high heap usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 850 * 1024 * 1024, // 850 MB
        heapTotal: 1000 * 1024 * 1024, // 1000 MB (85% usage)
        rss: 1200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }));

      const result = await healthMonitor.checkMemory();

      expect(result.status).toBe('degraded');
      expect(result.warning).toContain('Heap usage above 80%');
      expect(result.heap.usagePercent).toBeGreaterThan(80);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should return unhealthy status when heap usage is above 90%', async () => {
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 950 * 1024 * 1024, // 950 MB
        heapTotal: 1000 * 1024 * 1024, // 1000 MB (95% usage)
        rss: 1200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }));

      const result = await healthMonitor.checkMemory();

      expect(result.status).toBe('unhealthy');
      expect(result.warning).toContain('Heap usage above 90%');
      expect(result.heap.usagePercent).toBeGreaterThan(90);

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('checkEmailService', () => {
    it('should return healthy status when email service is configured and healthy', async () => {
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true, provider: 'nodemailer' });

      const result = await healthMonitor.checkEmailService();

      expect(result.status).toBe('healthy');
      expect(result.configured).toBe(true);
      expect(result.healthy).toBe(true);
    });

    it('should return unhealthy status when email service check fails', async () => {
      mockEmailService.checkHealth.mockResolvedValue({ healthy: false, error: 'Connection failed' });

      const result = await healthMonitor.checkEmailService();

      expect(result.status).toBe('unhealthy');
      expect(result.configured).toBe(true);
    });

    it('should return healthy status when email service is not configured', async () => {
      const monitor = new HealthMonitor(mockConfig, mockLogger, null);

      const result = await monitor.checkEmailService();

      expect(result.status).toBe('healthy');
      expect(result.configured).toBe(false);
      expect(result.message).toContain('not configured');
    });

    it('should return healthy status when email service has no health check method', async () => {
      const emailServiceWithoutHealthCheck = {};
      const monitor = new HealthMonitor(mockConfig, mockLogger, emailServiceWithoutHealthCheck);

      const result = await monitor.checkEmailService();

      expect(result.status).toBe('healthy');
      expect(result.configured).toBe(true);
      expect(result.message).toContain('no health check available');
    });

    it('should handle errors gracefully', async () => {
      mockEmailService.checkHealth.mockRejectedValue(new Error('Service error'));

      const result = await healthMonitor.checkEmailService();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Service error');
      expect(mockLogger.error).toHaveBeenCalledWith('Email service health check failed', expect.any(Object));
    });
  });

  describe('getUptime', () => {
    it('should return uptime information', () => {
      const result = healthMonitor.getUptime();

      expect(result.applicationSeconds).toBeGreaterThanOrEqual(0);
      expect(result.processSeconds).toBeGreaterThanOrEqual(0);
      expect(result.application).toBeDefined();
      expect(result.process).toBeDefined();
      expect(result.startTime).toBeDefined();
    });

    it('should format uptime correctly', () => {
      const formatted = healthMonitor.formatUptime(90061); // 1 day, 1 hour, 1 minute, 1 second

      expect(formatted).toBe('1d 1h 1m 1s');
    });

    it('should format uptime with only seconds', () => {
      const formatted = healthMonitor.formatUptime(45);

      expect(formatted).toBe('45s');
    });

    it('should format uptime with hours and minutes', () => {
      const formatted = healthMonitor.formatUptime(3661); // 1 hour, 1 minute, 1 second

      expect(formatted).toBe('1h 1m 1s');
    });
  });

  describe('getProcessInfo', () => {
    it('should return process information', () => {
      const result = healthMonitor.getProcessInfo();

      expect(result.pid).toBe(process.pid);
      expect(result.nodeVersion).toBe(process.version);
      expect(result.platform).toBe(process.platform);
      expect(result.arch).toBe(process.arch);
      expect(result.cpuUsage).toBeDefined();
      expect(result.environment).toBe('test');
    });
  });

  describe('getLastHealthCheck', () => {
    beforeEach(() => {
      // Ensure readyState is reset
      mongoose.connection.readyState = 1;
    });

    it('should return null before first health check', () => {
      const result = healthMonitor.getLastHealthCheck();

      expect(result.status).toBe('unknown');
    });

    it('should return last health check result after check', async () => {
      // Create fresh monitor for this test
      const testMonitor = new HealthMonitor(mockConfig, mockLogger, mockEmailService);
      
      mockPing.mockResolvedValue({});
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      // Mock memory usage to ensure healthy status
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024,
        rss: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      }));

      await testMonitor.checkHealth();
      process.memoryUsage = originalMemoryUsage;
      const result = testMonitor.getLastHealthCheck();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getTimeSinceLastCheck', () => {
    it('should return null before first health check', () => {
      const result = healthMonitor.getTimeSinceLastCheck();

      expect(result).toBeNull();
    });

    it('should return time since last check', async () => {
      mongoose.connection.readyState = 1;
      mockPing.mockResolvedValue({});
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      await healthMonitor.checkHealth();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = healthMonitor.getTimeSinceLastCheck();

      expect(result).toBeGreaterThanOrEqual(100);
    });
  });

  describe('isHealthCheckStale', () => {
    it('should return true before first health check', () => {
      const result = healthMonitor.isHealthCheckStale();

      expect(result).toBe(true);
    });

    it('should return false for recent health check', async () => {
      mongoose.connection.readyState = 1;
      mockPing.mockResolvedValue({});
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      await healthMonitor.checkHealth();
      const result = healthMonitor.isHealthCheckStale(60000);

      expect(result).toBe(false);
    });

    it('should return true for stale health check', async () => {
      mongoose.connection.readyState = 1;
      mockPing.mockResolvedValue({});
      mockEmailService.checkHealth.mockResolvedValue({ healthy: true });

      await healthMonitor.checkHealth();
      
      // Wait a bit to ensure time passes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check with very short threshold
      const result = healthMonitor.isHealthCheckStale(1);

      expect(result).toBe(true);
    });
  });

  describe('getConnectionStateName', () => {
    it('should return correct state names', () => {
      expect(healthMonitor.getConnectionStateName(0)).toBe('disconnected');
      expect(healthMonitor.getConnectionStateName(1)).toBe('connected');
      expect(healthMonitor.getConnectionStateName(2)).toBe('connecting');
      expect(healthMonitor.getConnectionStateName(3)).toBe('disconnecting');
      expect(healthMonitor.getConnectionStateName(99)).toBe('unknown');
    });
  });
});
