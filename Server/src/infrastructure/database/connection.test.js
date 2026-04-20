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
  
  afterEach(() => {
    // Clean up
    dbConnection = null;
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
    });

    it('should retry on connection failure', async () => {
      const error = new Error('Connection failed');
      mongoose.connect
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce();

      jest.spyOn(dbConnection, 'sleep').mockResolvedValue();

      await dbConnection.connect();

      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('disconnect', () => {
    it('should close connection gracefully', async () => {
      dbConnection.isConnected = true;
      mongoose.connection.close.mockResolvedValueOnce();

      await dbConnection.disconnect();

      expect(mongoose.connection.close).toHaveBeenCalled();
      expect(dbConnection.isConnected).toBe(false);
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
  });
});
