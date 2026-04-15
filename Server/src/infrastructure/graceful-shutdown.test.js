/**
 * Tests for GracefulShutdownHandler
 * 
 * Tests shutdown sequence and timeout handling
 * Requirements: 15.1
 */

const GracefulShutdownHandler = require('./graceful-shutdown');

describe('GracefulShutdownHandler', () => {
  let shutdownHandler;
  let mockLogger;
  let mockConfig;
  let mockServer;
  let mockSocketManager;
  let mockDbConnection;
  let mockMetricsCollector;
  let originalProcessExit;
  let originalProcessOn;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getLogger: jest.fn(() => ({
        end: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            setTimeout(callback, 10);
          }
        })
      }))
    };

    // Mock config
    mockConfig = {
      get: jest.fn((path) => {
        if (path === 'server.shutdownTimeout') return 30000;
        return undefined;
      })
    };

    // Mock HTTP server
    mockServer = {
      listening: true,
      close: jest.fn((callback) => {
        setTimeout(() => callback(), 10);
      })
    };

    // Mock Socket.IO manager
    mockSocketManager = {
      getIO: jest.fn(() => ({
        sockets: {
          sockets: new Map([
            ['socket1', { disconnect: jest.fn() }],
            ['socket2', { disconnect: jest.fn() }]
          ])
        },
        close: jest.fn()
      }))
    };

    // Mock database connection
    mockDbConnection = {
      close: jest.fn(() => Promise.resolve())
    };

    // Mock metrics collector
    mockMetricsCollector = {
      flush: jest.fn(() => Promise.resolve())
    };

    // Create shutdown handler
    shutdownHandler = new GracefulShutdownHandler(mockLogger, mockConfig);

    // Mock process.exit to prevent actual exit
    originalProcessExit = process.exit;
    process.exit = jest.fn();

    // Store original process.on
    originalProcessOn = process.on;
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalProcessExit;

    // Remove all listeners added during tests
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(shutdownHandler.isShuttingDown).toBe(false);
      expect(shutdownHandler.server).toBeNull();
      expect(shutdownHandler.socketManager).toBeNull();
      expect(shutdownHandler.dbConnection).toBeNull();
      expect(shutdownHandler.metricsCollector).toBeNull();
      expect(shutdownHandler.shutdownTimeout).toBe(30000);
    });

    it('should store logger and config', () => {
      expect(shutdownHandler.logger).toBe(mockLogger);
      expect(shutdownHandler.config).toBe(mockConfig);
    });
  });

  describe('register()', () => {
    it('should register all dependencies', () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      expect(shutdownHandler.server).toBe(mockServer);
      expect(shutdownHandler.socketManager).toBe(mockSocketManager);
      expect(shutdownHandler.dbConnection).toBe(mockDbConnection);
      expect(shutdownHandler.metricsCollector).toBe(mockMetricsCollector);
      expect(mockLogger.info).toHaveBeenCalledWith('Graceful shutdown handler registered');
    });

    it('should setup signal handlers', () => {
      const setupSpy = jest.spyOn(shutdownHandler, 'setupSignalHandlers');
      
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupSignalHandlers()', () => {
    it('should register SIGTERM handler', () => {
      const listeners = process.listeners('SIGTERM');
      const initialCount = listeners.length;

      shutdownHandler.setupSignalHandlers();

      const newListeners = process.listeners('SIGTERM');
      expect(newListeners.length).toBe(initialCount + 1);
    });

    it('should register SIGINT handler', () => {
      const listeners = process.listeners('SIGINT');
      const initialCount = listeners.length;

      shutdownHandler.setupSignalHandlers();

      const newListeners = process.listeners('SIGINT');
      expect(newListeners.length).toBe(initialCount + 1);
    });

    it('should register uncaughtException handler', () => {
      const listeners = process.listeners('uncaughtException');
      const initialCount = listeners.length;

      shutdownHandler.setupSignalHandlers();

      const newListeners = process.listeners('uncaughtException');
      expect(newListeners.length).toBe(initialCount + 1);
    });

    it('should register unhandledRejection handler', () => {
      const listeners = process.listeners('unhandledRejection');
      const initialCount = listeners.length;

      shutdownHandler.setupSignalHandlers();

      const newListeners = process.listeners('unhandledRejection');
      expect(newListeners.length).toBe(initialCount + 1);
    });
  });

  describe('shutdown()', () => {
    beforeEach(() => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });
    });

    it('should execute complete shutdown sequence', async () => {
      await shutdownHandler.shutdown('SIGTERM', 0);

      expect(mockLogger.info).toHaveBeenCalledWith('Starting graceful shutdown', { 
        signal: 'SIGTERM', 
        exitCode: 0 
      });
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockSocketManager.getIO).toHaveBeenCalled();
      expect(mockDbConnection.close).toHaveBeenCalled();
      expect(mockMetricsCollector.flush).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should prevent multiple shutdown attempts', async () => {
      // Start first shutdown
      const firstShutdown = shutdownHandler.shutdown('SIGTERM', 0);

      // Try second shutdown while first is in progress
      await shutdownHandler.shutdown('SIGINT', 0);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Shutdown already in progress, ignoring signal',
        { signal: 'SIGINT' }
      );

      await firstShutdown;
    });

    it('should exit with error code on shutdown failure', async () => {
      // Make database close fail
      mockDbConnection.close = jest.fn(() => Promise.reject(new Error('DB close failed')));

      await shutdownHandler.shutdown('SIGTERM', 0);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during graceful shutdown',
        expect.objectContaining({
          signal: 'SIGTERM',
          error: 'DB close failed'
        })
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log shutdown duration', async () => {
      await shutdownHandler.shutdown('SIGTERM', 0);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.objectContaining({
          signal: 'SIGTERM',
          duration: expect.any(Number),
          exitCode: 0
        })
      );
    });
  });

  describe('stopAcceptingConnections()', () => {
    it('should close server and stop accepting connections', async () => {
      shutdownHandler.server = mockServer;

      await shutdownHandler.stopAcceptingConnections();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping acceptance of new connections');
      expect(mockServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Server stopped accepting new connections');
    });

    it('should handle missing server gracefully', async () => {
      shutdownHandler.server = null;

      await shutdownHandler.stopAcceptingConnections();

      expect(mockLogger.warn).toHaveBeenCalledWith('No server instance to close');
    });

    it('should reject on server close error', async () => {
      mockServer.close = jest.fn((callback) => {
        callback(new Error('Server close failed'));
      });
      shutdownHandler.server = mockServer;

      await expect(shutdownHandler.stopAcceptingConnections()).rejects.toThrow('Server close failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing server', { 
        error: 'Server close failed' 
      });
    });
  });

  describe('waitForInFlightRequests()', () => {
    it('should wait for in-flight requests with timeout', async () => {
      shutdownHandler.shutdownTimeout = 100;
      shutdownHandler.server = null; // No server, should resolve immediately

      const startTime = Date.now();
      await shutdownHandler.waitForInFlightRequests();
      const duration = Date.now() - startTime;

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Waiting for in-flight requests to complete',
        { timeout: 100 }
      );
      expect(duration).toBeLessThan(150); // Should resolve quickly
    });

    it('should resolve immediately when server is not listening', async () => {
      shutdownHandler.shutdownTimeout = 50;
      shutdownHandler.server = { listening: false };

      await shutdownHandler.waitForInFlightRequests();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Waiting for in-flight requests to complete',
        { timeout: 50 }
      );
      // Should resolve immediately without warning since server is not listening
    });
  });

  describe('closeSocketConnections()', () => {
    it('should disconnect all Socket.IO clients', async () => {
      const mockSocket1 = { disconnect: jest.fn() };
      const mockSocket2 = { disconnect: jest.fn() };
      const mockClose = jest.fn();
      
      const mockIO = {
        sockets: {
          sockets: new Map([
            ['socket1', mockSocket1],
            ['socket2', mockSocket2]
          ])
        },
        close: mockClose
      };
      
      mockSocketManager.getIO = jest.fn(() => mockIO);
      
      shutdownHandler.socketManager = mockSocketManager;

      await shutdownHandler.closeSocketConnections();

      expect(mockLogger.info).toHaveBeenCalledWith('Closing Socket.IO connections');
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting Socket.IO clients', { 
        count: 2 
      });
      
      // Verify all sockets were disconnected
      expect(mockSocket1.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket2.disconnect).toHaveBeenCalledWith(true);
      
      expect(mockClose).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Socket.IO connections closed', { 
        count: 2 
      });
    });

    it('should handle missing Socket.IO manager', async () => {
      shutdownHandler.socketManager = null;

      await shutdownHandler.closeSocketConnections();

      expect(mockLogger.warn).toHaveBeenCalledWith('No Socket.IO manager to close');
    });

    it('should throw on Socket.IO close error', async () => {
      mockSocketManager.getIO = jest.fn(() => {
        throw new Error('Socket.IO error');
      });
      shutdownHandler.socketManager = mockSocketManager;

      await expect(shutdownHandler.closeSocketConnections()).rejects.toThrow('Socket.IO error');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing Socket.IO connections', { 
        error: 'Socket.IO error' 
      });
    });
  });

  describe('closeDatabaseConnections()', () => {
    it('should close database connection', async () => {
      shutdownHandler.dbConnection = mockDbConnection;

      await shutdownHandler.closeDatabaseConnections();

      expect(mockLogger.info).toHaveBeenCalledWith('Closing database connections');
      expect(mockDbConnection.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Database connections closed');
    });

    it('should handle missing database connection', async () => {
      shutdownHandler.dbConnection = null;

      await shutdownHandler.closeDatabaseConnections();

      expect(mockLogger.warn).toHaveBeenCalledWith('No database connection to close');
    });

    it('should throw on database close error', async () => {
      mockDbConnection.close = jest.fn(() => Promise.reject(new Error('DB close failed')));
      shutdownHandler.dbConnection = mockDbConnection;

      await expect(shutdownHandler.closeDatabaseConnections()).rejects.toThrow('DB close failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error closing database connections', { 
        error: 'DB close failed' 
      });
    });
  });

  describe('flushLogsAndMetrics()', () => {
    it('should flush metrics and logs', async () => {
      shutdownHandler.metricsCollector = mockMetricsCollector;

      await shutdownHandler.flushLogsAndMetrics();

      expect(mockLogger.info).toHaveBeenCalledWith('Flushing logs and metrics');
      expect(mockMetricsCollector.flush).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Metrics flushed');
      expect(mockLogger.getLogger).toHaveBeenCalled();
    });

    it('should handle missing metrics collector', async () => {
      shutdownHandler.metricsCollector = null;

      await shutdownHandler.flushLogsAndMetrics();

      expect(mockLogger.info).toHaveBeenCalledWith('Flushing logs and metrics');
      // Should not throw
    });

    it('should not throw on flush error', async () => {
      mockMetricsCollector.flush = jest.fn(() => Promise.reject(new Error('Flush failed')));
      shutdownHandler.metricsCollector = mockMetricsCollector;

      // Should not throw
      await expect(shutdownHandler.flushLogsAndMetrics()).resolves.not.toThrow();
    });
  });

  describe('isShutdownInProgress()', () => {
    it('should return false initially', () => {
      expect(shutdownHandler.isShutdownInProgress()).toBe(false);
    });

    it('should return true during shutdown', async () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      const shutdownPromise = shutdownHandler.shutdown('SIGTERM', 0);
      
      // Check immediately after starting shutdown
      expect(shutdownHandler.isShutdownInProgress()).toBe(true);

      await shutdownPromise;
    });
  });

  describe('setShutdownTimeout()', () => {
    it('should update shutdown timeout', () => {
      shutdownHandler.setShutdownTimeout(60000);

      expect(shutdownHandler.shutdownTimeout).toBe(60000);
      expect(mockLogger.info).toHaveBeenCalledWith('Shutdown timeout updated', { 
        timeout: 60000 
      });
    });
  });

  describe('Signal handling integration', () => {
    it('should handle SIGTERM signal', async () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      // Emit SIGTERM
      process.emit('SIGTERM');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith('SIGTERM signal received');
      expect(mockLogger.info).toHaveBeenCalledWith('Starting graceful shutdown', { 
        signal: 'SIGTERM', 
        exitCode: 0 
      });
    });

    it('should handle SIGINT signal', async () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      // Emit SIGINT
      process.emit('SIGINT');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith('SIGINT signal received');
      expect(mockLogger.info).toHaveBeenCalledWith('Starting graceful shutdown', { 
        signal: 'SIGINT', 
        exitCode: 0 
      });
    });

    it('should handle uncaughtException with error exit code', async () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      const testError = new Error('Test uncaught exception');

      // Emit uncaughtException
      process.emit('uncaughtException', testError);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught exception', { 
        error: 'Test uncaught exception',
        stack: expect.any(String)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Starting graceful shutdown', { 
        signal: 'uncaughtException', 
        exitCode: 1 
      });
    });

    it('should handle unhandledRejection with error exit code', async () => {
      shutdownHandler.register({
        server: mockServer,
        socketManager: mockSocketManager,
        dbConnection: mockDbConnection,
        metricsCollector: mockMetricsCollector
      });

      const testReason = 'Test unhandled rejection';
      const testPromise = Promise.resolve(); // Use resolved promise to avoid actual rejection

      // Emit unhandledRejection
      process.emit('unhandledRejection', testReason, testPromise);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled promise rejection', { 
        reason: testReason,
        promise: testPromise
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Starting graceful shutdown', { 
        signal: 'unhandledRejection', 
        exitCode: 1 
      });
    });
  });
});
