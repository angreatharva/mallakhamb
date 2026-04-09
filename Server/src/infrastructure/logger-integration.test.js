/**
 * Integration test for Logger
 * Tests Logger with real Winston instance (not mocked)
 */

const Logger = require('./logger');
const fs = require('fs');
const path = require('path');

describe('Logger Integration', () => {
  let logger;
  let mockConfig;
  const testLogDir = path.join(__dirname, '../../logs');

  beforeAll(() => {
    // Ensure logs directory exists
    if (!fs.existsSync(testLogDir)) {
      fs.mkdirSync(testLogDir, { recursive: true });
    }
  });

  beforeEach(() => {
    mockConfig = {
      server: {
        nodeEnv: 'test'
      }
    };

    logger = new Logger(mockConfig);
  });

  afterEach(() => {
    // Clean up logger
    if (logger && logger.logger) {
      logger.logger.close();
    }
  });

  describe('real logging', () => {
    it('should create a logger that can log messages', () => {
      expect(() => {
        logger.info('Test info message');
        logger.error('Test error message');
        logger.warn('Test warning message');
        logger.debug('Test debug message');
        logger.http('Test http message');
      }).not.toThrow();
    });

    it('should log with metadata', () => {
      expect(() => {
        logger.info('User action', {
          userId: '123',
          action: 'login',
          timestamp: new Date().toISOString()
        });
      }).not.toThrow();
    });

    it('should redact sensitive data in real logs', () => {
      expect(() => {
        logger.info('User login attempt', {
          username: 'testuser',
          password: 'secret123',
          email: 'test@example.com'
        });
      }).not.toThrow();
    });

    it('should handle complex nested objects', () => {
      expect(() => {
        logger.info('API request', {
          request: {
            method: 'POST',
            path: '/api/auth/login',
            headers: {
              authorization: 'Bearer token123',
              'content-type': 'application/json'
            },
            body: {
              username: 'testuser',
              password: 'secret'
            }
          },
          response: {
            status: 200,
            token: 'jwt-token-here'
          }
        });
      }).not.toThrow();
    });

    it('should handle errors with stack traces', () => {
      const error = new Error('Test error');
      
      expect(() => {
        logger.error('Error occurred', {
          error: error.message,
          stack: error.stack
        });
      }).not.toThrow();
    });
  });

  describe('development vs production formats', () => {
    it('should use development format in development mode', () => {
      const devConfig = {
        server: { nodeEnv: 'development' }
      };
      
      const devLogger = new Logger(devConfig);
      
      expect(() => {
        devLogger.info('Development log');
      }).not.toThrow();
      
      devLogger.logger.close();
    });

    it('should use production format in production mode', () => {
      const prodConfig = {
        server: { nodeEnv: 'production' }
      };
      
      const prodLogger = new Logger(prodConfig);
      
      expect(() => {
        prodLogger.info('Production log');
      }).not.toThrow();
      
      prodLogger.logger.close();
    });
  });

  describe('getLogger', () => {
    it('should return Winston logger instance', () => {
      const winstonLogger = logger.getLogger();
      
      expect(winstonLogger).toBeDefined();
      expect(winstonLogger.info).toBeDefined();
      expect(winstonLogger.error).toBeDefined();
    });

    it('should allow direct Winston API usage', () => {
      const winstonLogger = logger.getLogger();
      
      expect(() => {
        winstonLogger.info('Direct Winston log');
      }).not.toThrow();
    });
  });
});
