/**
 * Error Middleware Unit Tests
 * 
 * Tests error handling middleware functionality including:
 * - asyncHandler wrapper
 * - notFoundHandler
 * - errorHandler with various error types
 * - Environment-specific formatting
 * 
 * Requirements: 15.1
 */

const { asyncHandler, notFoundHandler, errorHandler } = require('./error.middleware');
const { 
  ValidationError, 
  AuthenticationError, 
  AuthorizationError, 
  NotFoundError,
  ConflictError,
  BusinessRuleError 
} = require('../errors');

describe('Error Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Mock request object
    req = {
      method: 'GET',
      originalUrl: '/api/test',
      url: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn((header) => {
        if (header === 'user-agent') return 'test-agent';
        return null;
      }),
      correlationId: 'test-correlation-id',
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
      }
    };

    // Mock response object
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock next function
    next = jest.fn();

    // Store original NODE_ENV
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('asyncHandler', () => {
    it('should call the wrapped function and pass through result', async () => {
      const mockHandler = jest.fn(async (req, res) => {
        res.json({ success: true });
      });

      const wrappedHandler = asyncHandler(mockHandler);
      await wrappedHandler(req, res, next);

      expect(mockHandler).toHaveBeenCalledWith(req, res, next);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch errors from async functions and pass to next', async () => {
      const error = new Error('Async error');
      const mockHandler = jest.fn(async () => {
        throw error;
      });

      const wrappedHandler = asyncHandler(mockHandler);
      await wrappedHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should catch rejected promises and pass to next', async () => {
      const error = new Error('Promise rejection');
      const mockHandler = jest.fn(() => Promise.reject(error));

      const wrappedHandler = asyncHandler(mockHandler);
      await wrappedHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous errors thrown in async context', async () => {
      const error = new Error('Sync error');
      const mockHandler = jest.fn(async () => {
        throw error;
      });

      const wrappedHandler = asyncHandler(mockHandler);
      await wrappedHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('notFoundHandler', () => {
    it('should create 404 error with route information', () => {
      req.method = 'POST';
      req.originalUrl = '/api/nonexistent';

      notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route not found: POST /api/nonexistent',
          statusCode: 404,
          code: 'ROUTE_NOT_FOUND'
        })
      );
    });

    it('should handle different HTTP methods', () => {
      req.method = 'DELETE';
      req.originalUrl = '/api/users/123';

      notFoundHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route not found: DELETE /api/users/123'
        })
      );
    });
  });

  describe('errorHandler', () => {
    describe('Domain Errors', () => {
      it('should handle ValidationError with 400 status', () => {
        const error = new ValidationError('Invalid input', { 
          email: 'Invalid email format',
          age: 'Must be a positive number'
        });

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Invalid input',
              code: 'VALIDATION_ERROR',
              details: {
                email: 'Invalid email format',
                age: 'Must be a positive number'
              }
            })
          })
        );
      });

      it('should handle AuthenticationError with 401 status', () => {
        const error = new AuthenticationError('Invalid credentials');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Invalid credentials',
              code: 'AUTHENTICATION_ERROR'
            })
          })
        );
      });

      it('should handle AuthorizationError with 403 status', () => {
        const error = new AuthorizationError('Insufficient permissions');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Insufficient permissions',
              code: 'AUTHORIZATION_ERROR'
            })
          })
        );
      });

      it('should handle NotFoundError with 404 status', () => {
        const error = new NotFoundError('Player', '123');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: "Player with id '123' not found",
              code: 'NOT_FOUND'
            })
          })
        );
      });

      it('should handle ConflictError with 409 status', () => {
        const error = new ConflictError('Email already exists');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Email already exists',
              code: 'CONFLICT'
            })
          })
        );
      });

      it('should handle BusinessRuleError with 422 status', () => {
        const error = new BusinessRuleError('Cannot register after deadline');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              message: 'Cannot register after deadline',
              code: 'BUSINESS_RULE_VIOLATION'
            })
          })
        );
      });
    });

    describe('Mongoose Errors', () => {
      it('should handle Mongoose ValidationError', () => {
        const error = new Error('Validation failed');
        error.name = 'ValidationError';
        error.errors = {
          email: { message: 'Email is required' },
          name: { message: 'Name must be at least 3 characters' }
        };

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'VALIDATION_ERROR',
              details: {
                email: 'Email is required',
                name: 'Name must be at least 3 characters'
              }
            })
          })
        );
      });

      it('should handle Mongoose CastError', () => {
        const error = new Error('Cast to ObjectId failed');
        error.name = 'CastError';
        error.path = '_id';
        error.value = 'invalid-id';

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'INVALID_INPUT',
              message: 'Invalid _id: invalid-id'
            })
          })
        );
      });

      it('should handle MongoDB duplicate key error', () => {
        const error = new Error('Duplicate key error');
        error.code = 11000;
        error.keyValue = { email: 'test@example.com' };

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'DUPLICATE_ENTRY',
              message: 'email already exists'
            })
          })
        );
      });
    });

    describe('JWT Errors', () => {
      it('should handle JsonWebTokenError', () => {
        const error = new Error('jwt malformed');
        error.name = 'JsonWebTokenError';

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'TOKEN_INVALID',
              message: 'Invalid authentication token'
            })
          })
        );
      });

      it('should handle TokenExpiredError', () => {
        const error = new Error('jwt expired');
        error.name = 'TokenExpiredError';

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              code: 'TOKEN_EXPIRED',
              message: 'Authentication token has expired'
            })
          })
        );
      });
    });

    describe('Logging', () => {
      it('should log errors with warn level for 4xx errors', () => {
        const error = new ValidationError('Invalid input');

        errorHandler(error, req, res, next);

        expect(req.logger.warn).toHaveBeenCalledWith(
          'Error occurred: Invalid input',
          expect.objectContaining({
            correlationId: 'test-correlation-id',
            method: 'GET',
            url: '/api/test',
            statusCode: 400,
            errorCode: 'VALIDATION_ERROR'
          })
        );
      });

      it('should log errors with error level for 5xx errors', () => {
        const error = new Error('Internal server error');
        error.statusCode = 500;

        errorHandler(error, req, res, next);

        expect(req.logger.error).toHaveBeenCalledWith(
          'Error occurred: Internal server error',
          expect.objectContaining({
            correlationId: 'test-correlation-id',
            statusCode: 500,
            stack: expect.any(String)
          })
        );
      });

      it('should include user information in logs if available', () => {
        req.user = { id: 'user-123', role: 'player' };
        const error = new ValidationError('Invalid input');

        errorHandler(error, req, res, next);

        expect(req.logger.warn).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            userId: 'user-123'
          })
        );
      });

      it('should use console if logger is not available', () => {
        delete req.logger;
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const error = new Error('Test error');

        errorHandler(error, req, res, next);

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });

      it('should include correlation ID in response', () => {
        const error = new ValidationError('Invalid input');

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              correlationId: 'test-correlation-id'
            })
          })
        );
      });
    });

    describe('Environment-Specific Behavior', () => {
      it('should include stack trace in development mode', () => {
        process.env.NODE_ENV = 'development';
        const error = new Error('Test error');

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              stack: expect.any(String),
              name: 'Error'
            })
          })
        );
      });

      it('should not include stack trace in production mode', () => {
        process.env.NODE_ENV = 'production';
        const error = new ValidationError('Invalid input');

        errorHandler(error, req, res, next);

        const response = res.json.mock.calls[0][0];
        expect(response.error.stack).toBeUndefined();
      });

      it('should sanitize 500 errors in production', () => {
        process.env.NODE_ENV = 'production';
        const error = new Error('Database connection failed at /var/app/db.js');
        error.statusCode = 500;

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'An internal server error occurred'
            })
          })
        );
      });

      it('should show detailed error messages in development', () => {
        process.env.NODE_ENV = 'development';
        const error = new Error('Database connection failed at /var/app/db.js');
        error.statusCode = 500;

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'Database connection failed at /var/app/db.js'
            })
          })
        );
      });

      it('should sanitize sensitive information in production', () => {
        process.env.NODE_ENV = 'production';
        const error = new ValidationError('Invalid email: user@example.com');

        errorHandler(error, req, res, next);

        const response = res.json.mock.calls[0][0];
        expect(response.error.message).toContain('[EMAIL]');
        expect(response.error.message).not.toContain('user@example.com');
      });
    });

    describe('Error Response Format', () => {
      it('should return consistent error response structure', () => {
        const error = new ValidationError('Invalid input');

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: expect.objectContaining({
            message: expect.any(String),
            code: expect.any(String),
            correlationId: expect.any(String)
          })
        });
      });

      it('should include error details when available', () => {
        const error = new ValidationError('Validation failed', {
          field1: 'Error 1',
          field2: 'Error 2'
        });

        errorHandler(error, req, res, next);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              details: {
                field1: 'Error 1',
                field2: 'Error 2'
              }
            })
          })
        );
      });

      it('should default to 500 status for unknown errors', () => {
        const error = new Error('Unknown error');

        errorHandler(error, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
      });
    });
  });
});
