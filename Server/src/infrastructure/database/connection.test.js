/**
 * Unit tests for Database Connection Manager
 * 
 * Tests connection pool configuration, retry logic, and monitoring
 */

const mongoose = require('mongoose');
const DatabaseConnection = require('./connection');

// Mock mongoose
jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: {
    on: jest.fn(),
    close: jest.fn(),
    readyState: 1,
    host: 'localhost',
    name: 'test-db',
    db: null
  }
}));

describe('DatabaseConnection', () => {
  let dbConnection;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock config
    mockConfig = {
      get: jest.fn((path) => {
        if (path === 'database') {
          return {
            uri: 'mongodb://localhost:27017/test',
            poolSize: {
              min: 10,
              max: 100
            },
            timeouts: {
              connection: 10000,
              socket: 45000
            }
          };
        }
        return null;
      }),
      isDevelopment: jest.fn(() => true)
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    dbConnection = new DatabaseConnection(mockConfig, mockLogger);
  });

  describe('connect', () => {
    it('should connect with correct pool settings', async () => {
      mongoose.connect.mockResolvedValueOnce();

      await dbConnection.connect();

      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test',
        expect.objectContaining({
          minPoolSize: 10,
          maxPoolSize: 100,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000
        })
      );
    });

    it('should set isConnected to true on successful connection', async () => {
      mongoose.connect.mockResolvedValueOnce();

      await dbConnection.connect();

      expect(dbConnection.isConnected).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MongoDB connected successfully',
        expect.any(Object)
      );
    });

    it('should setup connection monitoring', async () => {
      mongoose.connect.mockResolvedValueOnce();

      await dbConnection.connect();

      expect(mongoose.connection.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
    });

    it('should retry on connection failure with exponential backoff', async () => {
      const error = new Error('Connection failed');
      mongoose.connect
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      // Mock sleep to avoid actual delays
      jest.spyOn(dbConnection, 'sleep').mockResolvedValue();

      await dbConnection.connect();

      expect(mongoose.connect).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Retrying database connection...',
        expect.objectContaining({
          retryCount: 1,
          maxRetries: 5
        })
      );
    });

    it('should exit process after max retries', async () => {
      const error = new Error('Connection failed');
      mongoose.connect.mockRejectedValue(error);
      
      // Mock sleep to avoid actual delays
      jest.spyOn(dbConnection, 'sleep').mockResolvedValue();
      
      // Mock process.exit
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      await dbConnection.connect();

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Max retry attempts reached. Exiting...',
        expect.any(Object)
      );

      mockExit.mockRestore();
    });

    it('should calculate exponential backoff correctly', async () => {
      const error = new Error('Connection failed');
      mongoose.connect
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      const sleepSpy = jest.spyOn(dbConnection, 'sleep').mockResolvedValue();

      await dbConnection.connect();

      // First retry: baseDelay * 2^0 = 1000ms (+ jitter)
      expect(sleepSpy).toHaveBeenNthCalledWith(1, expect.any(Number));
      const firstDelay = sleepSpy.mock.calls[0][0];
      expect(firstDelay).toBeGreaterThanOrEqual(1000);
      expect(firstDelay).toBeLessThanOrEqual(1200); // 1000 + 20% jitter

      // Second retry: baseDelay * 2^1 = 2000ms (+ jitter)
      expect(sleepSpy).toHaveBeenNthCalledWith(2, expect.any(Number));
      const secondDelay = sleepSpy.mock.calls[1][0];
      expect(secondDelay).toBeGreaterThanOrEqual(2000);
      expect(secondDelay).toBeLessThanOrEqual(2400); // 2000 + 20% jitter
    });

    it('should respect max retry delay', async () => {
      const error = new Error('Connection failed');
      mongoose.connect.mockRejectedValue(error);
      
      const sleepSpy = jest.spyOn(dbConnection, 'sleep').mockResolvedValue();
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();

      // Set high retry count to test max delay
      dbConnection.retryCount = 10;
      dbConnection.maxRetries = 15;

      await dbConnection.connect();

      // Should not exceed maxRetryDelay (30000ms + 20% jitter = 36000ms)
      const delays = sleepSpy.mock.calls.map(call => call[0]);
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(36000);
      });

      mockExit.mockRestore();
    });
  });

  describe('setupConnectionMonitoring', () => {
    it('should register all connection event handlers', () => {
      dbConnection.setupConnectionMonitoring();

      expect(mongoose.connection.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('reconnected', expect.any(Function));
      expect(mongoose.connection.on).toHaveBeenCalledWith('fullsetup', expect.any(Function));
    });

    it('should handle connected event', () => {
      dbConnection.setupConnectionMonitoring();

      // Get the connected event handler
      const connectedHandler = mongoose.connection.on.mock.calls.find(
        call => call[0] === 'connected'
      )[1];

      // Trigger the handler
      connectedHandler();

      expect(dbConnection.isConnected).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MongoDB connection established',
        expect.any(Object)
      );
    });

    it('should handle disconnected event', () => {
      dbConnection.isConnected = true;
      dbConnection.setupConnectionMonitoring();

      // Get the disconnected event handler
      const disconnectedHandler = mongoose.connection.on.mock.calls.find(
        call => call[0] === 'disconnected'
      )[1];

      // Trigger the handler
      disconnectedHandler();

      expect(dbConnection.isConnected).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MongoDB connection lost',
        expect.any(Object)
      );
    });

    it('should handle error event', () => {
      dbConnection.setupConnectionMonitoring();

      // Get the error event handler
      const errorHandler = mongoose.connection.on.mock.calls.find(
        call => call[0] === 'error'
      )[1];

      const error = new Error('Test error');
      errorHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'MongoDB connection error',
        expect.objectContaining({
          error: 'Test error'
        })
      );
    });

    it('should handle reconnected event', () => {
      dbConnection.isConnected = false;
      dbConnection.setupConnectionMonitoring();

      // Get the reconnected event handler
      const reconnectedHandler = mongoose.connection.on.mock.calls.find(
        call => call[0] === 'reconnected'
      )[1];

      reconnectedHandler();

      expect(dbConnection.isConnected).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MongoDB reconnected successfully',
        expect.any(Object)
      );
    });
  });

  describe('disconnect', () => {
    it('should close connection gracefully', async () => {
      dbConnection.isConnected = true;
      mongoose.connection.close.mockResolvedValueOnce();

      await dbConnection.disconnect();

      expect(mongoose.connection.close).toHaveBeenCalled();
      expect(dbConnection.isConnected).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('MongoDB connection closed successfully');
    });

    it('should handle already disconnected state', async () => {
      dbConnection.isConnected = false;

      await dbConnection.disconnect();

      expect(mongoose.connection.close).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('MongoDB already disconnected');
    });

    it('should handle disconnect errors', async () => {
      dbConnection.isConnected = true;
      const error = new Error('Disconnect failed');
      mongoose.connection.close.mockRejectedValueOnce(error);

      await expect(dbConnection.disconnect()).rejects.toThrow('Disconnect failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error closing MongoDB connection',
        expect.objectContaining({
          error: 'Disconnect failed'
        })
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('should return true when connected', () => {
      dbConnection.isConnected = true;
      mongoose.connection.readyState = 1;

      expect(dbConnection.getConnectionStatus()).toBe(true);
    });

    it('should return false when disconnected', () => {
      dbConnection.isConnected = false;
      mongoose.connection.readyState = 0;

      expect(dbConnection.getConnectionStatus()).toBe(false);
    });

    it('should return false when connection is in connecting state', () => {
      dbConnection.isConnected = true;
      mongoose.connection.readyState = 2; // connecting

      expect(dbConnection.getConnectionStatus()).toBe(false);
    });
  });

  describe('getPoolStats', () => {
    it('should return pool statistics when connected', () => {
      dbConnection.isConnected = true;
      mongoose.connection.db = {};

      const stats = dbConnection.getPoolStats();

      expect(stats).toEqual({
        connected: true,
        readyState: 1,
        host: 'localhost',
        database: 'test-db',
        poolSize: 'N/A'
      });
    });

    it('should return null when db is not available', () => {
      mongoose.connection.db = null;

      const stats = dbConnection.getPoolStats();

      expect(stats).toBeNull();
    });

    it('should handle errors gracefully', () => {
      dbConnection.isConnected = true;
      
      // Mock db to throw error
      Object.defineProperty(mongoose.connection, 'db', {
        get: () => {
          throw new Error('DB access error');
        },
        configurable: true
      });

      const stats = dbConnection.getPoolStats();

      expect(stats).toEqual({
        connected: true,
        readyState: 1,
        error: 'DB access error'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error getting pool stats',
        expect.any(Object)
      );
    });
  });

  describe('retryConnection', () => {
    it('should increment retry count', async () => {
      mongoose.connect.mockResolvedValueOnce();
      jest.spyOn(dbConnection, 'sleep').mockResolvedValue();

      const error = new Error('Connection failed');
      await dbConnection.retryConnection(error);

      expect(dbConnection.retryCount).toBe(1);
    });

    it('should call connect after delay', async () => {
      mongoose.connect.mockResolvedValueOnce();
      const sleepSpy = jest.spyOn(dbConnection, 'sleep').mockResolvedValue();

      const error = new Error('Connection failed');
      await dbConnection.retryConnection(error);

      expect(sleepSpy).toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalled();
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      jest.useFakeTimers();

      const sleepPromise = dbConnection.sleep(1000);
      
      jest.advanceTimersByTime(1000);
      
      await expect(sleepPromise).resolves.toBeUndefined();

      jest.useRealTimers();
    });
  });
});
