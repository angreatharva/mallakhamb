const Logger = require('./logger');
const winston = require('winston');

// Mock winston
jest.mock('winston', () => {
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn()
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(),
      colorize: jest.fn(),
      timestamp: jest.fn(),
      printf: jest.fn(),
      errors: jest.fn(),
      json: jest.fn()
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});

// Mock winston-daily-rotate-file
jest.mock('winston-daily-rotate-file', () => {
  return jest.fn();
});

describe('Logger', () => {
  let logger;
  let mockConfig;
  let mockWinstonLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      server: {
        nodeEnv: 'development'
      }
    };

    mockWinstonLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      http: jest.fn()
    };

    winston.createLogger.mockReturnValue(mockWinstonLogger);
    
    logger = new Logger(mockConfig);
  });

  describe('constructor', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(winston.createLogger).toHaveBeenCalled();
    });

    it('should create logger with development configuration', () => {
      const devConfig = {
        server: { nodeEnv: 'development' }
      };
      
      new Logger(devConfig);
      
      expect(winston.createLogger).toHaveBeenCalled();
    });

    it('should create logger with production configuration', () => {
      const prodConfig = {
        server: { nodeEnv: 'production' }
      };
      
      new Logger(prodConfig);
      
      expect(winston.createLogger).toHaveBeenCalled();
    });
  });

  describe('log levels', () => {
    it('should log error messages', () => {
      const message = 'Test error';
      const meta = { userId: '123' };
      
      logger.error(message, meta);
      
      expect(mockWinstonLogger.error).toHaveBeenCalledWith(message, meta);
    });

    it('should log warning messages', () => {
      const message = 'Test warning';
      const meta = { action: 'test' };
      
      logger.warn(message, meta);
      
      expect(mockWinstonLogger.warn).toHaveBeenCalledWith(message, meta);
    });

    it('should log info messages', () => {
      const message = 'Test info';
      const meta = { status: 'success' };
      
      logger.info(message, meta);
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith(message, meta);
    });

    it('should log debug messages', () => {
      const message = 'Test debug';
      const meta = { data: 'test' };
      
      logger.debug(message, meta);
      
      expect(mockWinstonLogger.debug).toHaveBeenCalledWith(message, meta);
    });

    it('should log http messages', () => {
      const message = 'Test http';
      const meta = { method: 'GET', path: '/api/test' };
      
      logger.http(message, meta);
      
      expect(mockWinstonLogger.http).toHaveBeenCalledWith(message, meta);
    });

    it('should handle logging without metadata', () => {
      const message = 'Test message';
      
      logger.info(message);
      
      expect(mockWinstonLogger.info).toHaveBeenCalledWith(message, {});
    });
  });

  describe('sensitive data redaction', () => {
    it('should redact password field', () => {
      const data = {
        username: 'testuser',
        password: 'secret123',
        email: 'test@example.com'
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.username).toBe('testuser');
      expect(redacted.email).toBe('test@example.com');
    });

    it('should redact token field', () => {
      const data = {
        userId: '123',
        token: 'jwt-token-here',
        role: 'admin'
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.userId).toBe('123');
      expect(redacted.role).toBe('admin');
    });

    it('should redact multiple sensitive fields', () => {
      const data = {
        password: 'secret',
        token: 'jwt-token',
        apiKey: 'api-key-123',
        username: 'testuser'
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.username).toBe('testuser');
    });

    it('should redact nested sensitive fields', () => {
      const data = {
        user: {
          username: 'testuser',
          password: 'secret123',
          profile: {
            email: 'test@example.com',
            resetPasswordToken: 'reset-token'
          }
        }
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.user.password).toBe('[REDACTED]');
      expect(redacted.user.profile.resetPasswordToken).toBe('[REDACTED]');
      expect(redacted.user.username).toBe('testuser');
      expect(redacted.user.profile.email).toBe('test@example.com');
    });

    it('should redact fields with case-insensitive matching', () => {
      const data = {
        Password: 'secret',
        TOKEN: 'jwt-token',
        ApiKey: 'api-key'
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.Password).toBe('[REDACTED]');
      expect(redacted.TOKEN).toBe('[REDACTED]');
      expect(redacted.ApiKey).toBe('[REDACTED]');
    });

    it('should redact fields containing sensitive keywords', () => {
      const data = {
        userPassword: 'secret',
        authToken: 'jwt-token',
        apiKeyValue: 'api-key'
      };
      
      const redacted = logger.redact(data);
      
      expect(redacted.userPassword).toBe('[REDACTED]');
      expect(redacted.authToken).toBe('[REDACTED]');
      expect(redacted.apiKeyValue).toBe('[REDACTED]');
    });

    it('should handle arrays with sensitive data', () => {
      const data = [
        { username: 'user1', password: 'pass1' },
        { username: 'user2', password: 'pass2' }
      ];
      
      const redacted = logger.redact(data);
      
      expect(redacted[0].password).toBe('[REDACTED]');
      expect(redacted[1].password).toBe('[REDACTED]');
      expect(redacted[0].username).toBe('user1');
      expect(redacted[1].username).toBe('user2');
    });

    it('should handle null and undefined values', () => {
      expect(logger.redact(null)).toBe(null);
      expect(logger.redact(undefined)).toBe(undefined);
    });

    it('should handle non-object values', () => {
      expect(logger.redact('string')).toBe('string');
      expect(logger.redact(123)).toBe(123);
      expect(logger.redact(true)).toBe(true);
    });

    it('should not modify original object', () => {
      const data = {
        username: 'testuser',
        password: 'secret123'
      };
      
      const original = { ...data };
      logger.redact(data);
      
      expect(data).toEqual(original);
    });

    it('should redact all common sensitive fields', () => {
      const data = {
        password: 'pass',
        token: 'token',
        secret: 'secret',
        apiKey: 'key',
        authorization: 'auth',
        jwt: 'jwt',
        accessToken: 'access',
        refreshToken: 'refresh',
        resetPasswordToken: 'reset',
        otp: '123456',
        pin: '1234',
        ssn: '123-45-6789',
        creditCard: '1234-5678-9012-3456',
        cvv: '123',
        accountNumber: '123456789'
      };
      
      const redacted = logger.redact(data);
      
      Object.keys(data).forEach(key => {
        expect(redacted[key]).toBe('[REDACTED]');
      });
    });
  });

  describe('integration with Winston', () => {
    it('should pass redacted data to Winston logger', () => {
      const message = 'User login';
      const meta = {
        userId: '123',
        password: 'secret123',
        email: 'test@example.com'
      };
      
      logger.info(message, meta);
      
      const calledWith = mockWinstonLogger.info.mock.calls[0][1];
      expect(calledWith.password).toBe('[REDACTED]');
      expect(calledWith.userId).toBe('123');
      expect(calledWith.email).toBe('test@example.com');
    });

    it('should handle complex nested structures', () => {
      const message = 'Complex operation';
      const meta = {
        request: {
          headers: {
            authorization: 'Bearer token123'
          },
          body: {
            username: 'testuser',
            password: 'secret'
          }
        },
        response: {
          token: 'jwt-token',
          user: {
            id: '123',
            email: 'test@example.com'
          }
        }
      };
      
      logger.info(message, meta);
      
      const calledWith = mockWinstonLogger.info.mock.calls[0][1];
      expect(calledWith.request.headers.authorization).toBe('[REDACTED]');
      expect(calledWith.request.body.password).toBe('[REDACTED]');
      expect(calledWith.response.token).toBe('[REDACTED]');
      expect(calledWith.request.body.username).toBe('testuser');
      expect(calledWith.response.user.email).toBe('test@example.com');
    });
  });

  describe('getLogger', () => {
    it('should return the underlying Winston logger instance', () => {
      const winstonLogger = logger.getLogger();
      
      expect(winstonLogger).toBe(mockWinstonLogger);
    });
  });
});
