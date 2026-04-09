const {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ERROR_CODES
} = require('./index');

describe('Error Classes', () => {
  describe('BaseError', () => {
    it('should create a base error with all properties', () => {
      const message = 'Test error';
      const statusCode = 500;
      const code = 'TEST_ERROR';
      const details = { field: 'test' };

      const error = new BaseError(message, statusCode, code, details);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.details).toEqual(details);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('BaseError');
    });

    it('should create a base error with default empty details', () => {
      const error = new BaseError('Test', 500, 'TEST');

      expect(error.details).toEqual({});
    });

    it('should capture stack trace', () => {
      const error = new BaseError('Test', 500, 'TEST');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should serialize to JSON correctly', () => {
      const message = 'Test error';
      const code = 'TEST_ERROR';
      const details = { field: 'test', value: 123 };
      const error = new BaseError(message, 500, code, details);

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'BaseError',
        message: message,
        code: code,
        details: details
      });
    });

    it('should not include statusCode in JSON serialization', () => {
      const error = new BaseError('Test', 500, 'TEST');
      const json = error.toJSON();

      expect(json.statusCode).toBeUndefined();
    });

    it('should not include stack in JSON serialization', () => {
      const error = new BaseError('Test', 500, 'TEST');
      const json = error.toJSON();

      expect(json.stack).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error with correct properties', () => {
      const message = 'Validation failed';
      const details = { email: 'Invalid email format' };

      const error = new ValidationError(message, details);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('ValidationError');
    });

    it('should create a validation error with default empty details', () => {
      const error = new ValidationError('Validation failed');

      expect(error.details).toEqual({});
    });

    it('should serialize validation error correctly', () => {
      const message = 'Invalid input';
      const details = { field: 'email', reason: 'Invalid format' };
      const error = new ValidationError(message, details);

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'ValidationError',
        message: message,
        code: ERROR_CODES.VALIDATION_ERROR,
        details: details
      });
    });

    it('should handle multiple field validation errors', () => {
      const details = {
        email: 'Invalid email format',
        password: 'Password too short',
        age: 'Must be a number'
      };
      const error = new ValidationError('Multiple validation errors', details);

      expect(error.details).toEqual(details);
      expect(Object.keys(error.details)).toHaveLength(3);
    });
  });

  describe('AuthenticationError', () => {
    it('should create an authentication error with custom message', () => {
      const message = 'Invalid credentials';
      const error = new AuthenticationError(message);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ERROR_CODES.AUTHENTICATION_ERROR);
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create an authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
    });

    it('should serialize authentication error correctly', () => {
      const error = new AuthenticationError('Token expired');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'AuthenticationError',
        message: 'Token expired',
        code: ERROR_CODES.AUTHENTICATION_ERROR,
        details: {}
      });
    });
  });

  describe('AuthorizationError', () => {
    it('should create an authorization error with custom message', () => {
      const message = 'Insufficient permissions';
      const error = new AuthorizationError(message);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ERROR_CODES.AUTHORIZATION_ERROR);
      expect(error.name).toBe('AuthorizationError');
    });

    it('should create an authorization error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should serialize authorization error correctly', () => {
      const error = new AuthorizationError('Admin access required');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'AuthorizationError',
        message: 'Admin access required',
        code: ERROR_CODES.AUTHORIZATION_ERROR,
        details: {}
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create a not found error with resource and id', () => {
      const resource = 'Player';
      const id = '123456';
      const error = new NotFoundError(resource, id);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe(`${resource} with id '${id}' not found`);
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create a not found error with resource only', () => {
      const resource = 'Competition';
      const error = new NotFoundError(resource);

      expect(error.message).toBe(`${resource} not found`);
      expect(error.statusCode).toBe(404);
    });

    it('should create a not found error with null id', () => {
      const resource = 'Team';
      const error = new NotFoundError(resource, null);

      expect(error.message).toBe(`${resource} not found`);
    });

    it('should serialize not found error correctly', () => {
      const error = new NotFoundError('User', '789');
      const json = error.toJSON();

      expect(json).toEqual({
        error: 'NotFoundError',
        message: "User with id '789' not found",
        code: ERROR_CODES.NOT_FOUND,
        details: {}
      });
    });
  });

  describe('ConflictError', () => {
    it('should create a conflict error with message and details', () => {
      const message = 'Email already exists';
      const details = { email: 'test@example.com' };
      const error = new ConflictError(message, details);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe(ERROR_CODES.CONFLICT);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('ConflictError');
    });

    it('should create a conflict error with default empty details', () => {
      const error = new ConflictError('Duplicate entry');

      expect(error.details).toEqual({});
    });

    it('should serialize conflict error correctly', () => {
      const message = 'Resource already exists';
      const details = { field: 'username', value: 'john_doe' };
      const error = new ConflictError(message, details);

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'ConflictError',
        message: message,
        code: ERROR_CODES.CONFLICT,
        details: details
      });
    });
  });

  describe('BusinessRuleError', () => {
    it('should create a business rule error with message and details', () => {
      const message = 'Cannot register after deadline';
      const details = { deadline: '2024-01-01', attemptedDate: '2024-01-02' };
      const error = new BusinessRuleError(message, details);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(BusinessRuleError);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION);
      expect(error.details).toEqual(details);
      expect(error.name).toBe('BusinessRuleError');
    });

    it('should create a business rule error with default empty details', () => {
      const error = new BusinessRuleError('Invalid operation');

      expect(error.details).toEqual({});
    });

    it('should serialize business rule error correctly', () => {
      const message = 'Team is full';
      const details = { maxPlayers: 10, currentPlayers: 10 };
      const error = new BusinessRuleError(message, details);

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'BusinessRuleError',
        message: message,
        code: ERROR_CODES.BUSINESS_RULE_VIOLATION,
        details: details
      });
    });
  });

  describe('ERROR_CODES', () => {
    it('should export all error code constants', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR');
      expect(ERROR_CODES.AUTHORIZATION_ERROR).toBe('AUTHORIZATION_ERROR');
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
      expect(ERROR_CODES.CONFLICT).toBe('CONFLICT');
      expect(ERROR_CODES.BUSINESS_RULE_VIOLATION).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('should have unique error codes', () => {
      const codes = Object.values(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should have all expected error code categories', () => {
      expect(ERROR_CODES).toHaveProperty('VALIDATION_ERROR');
      expect(ERROR_CODES).toHaveProperty('AUTHENTICATION_ERROR');
      expect(ERROR_CODES).toHaveProperty('AUTHORIZATION_ERROR');
      expect(ERROR_CODES).toHaveProperty('NOT_FOUND');
      expect(ERROR_CODES).toHaveProperty('CONFLICT');
      expect(ERROR_CODES).toHaveProperty('BUSINESS_RULE_VIOLATION');
      expect(ERROR_CODES).toHaveProperty('INTERNAL_SERVER_ERROR');
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for ValidationError', () => {
      const error = new ValidationError('Test');
      
      expect(error instanceof Error).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });

    it('should maintain proper inheritance for all error types', () => {
      const errors = [
        new ValidationError('Test'),
        new AuthenticationError('Test'),
        new AuthorizationError('Test'),
        new NotFoundError('Resource'),
        new ConflictError('Test'),
        new BusinessRuleError('Test')
      ];

      errors.forEach(error => {
        expect(error instanceof Error).toBe(true);
        expect(error instanceof BaseError).toBe(true);
      });
    });
  });

  describe('Error properties consistency', () => {
    it('should have consistent property structure across all error types', () => {
      const errors = [
        new ValidationError('Test', { field: 'test' }),
        new AuthenticationError('Test'),
        new AuthorizationError('Test'),
        new NotFoundError('Resource', '123'),
        new ConflictError('Test', { field: 'test' }),
        new BusinessRuleError('Test', { rule: 'test' })
      ];

      errors.forEach(error => {
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('statusCode');
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('details');
        expect(error).toHaveProperty('isOperational');
        expect(error).toHaveProperty('name');
        expect(error).toHaveProperty('stack');
      });
    });

    it('should have correct HTTP status codes', () => {
      expect(new ValidationError('Test').statusCode).toBe(400);
      expect(new AuthenticationError('Test').statusCode).toBe(401);
      expect(new AuthorizationError('Test').statusCode).toBe(403);
      expect(new NotFoundError('Resource').statusCode).toBe(404);
      expect(new ConflictError('Test').statusCode).toBe(409);
      expect(new BusinessRuleError('Test').statusCode).toBe(422);
    });

    it('should all be marked as operational errors', () => {
      const errors = [
        new ValidationError('Test'),
        new AuthenticationError('Test'),
        new AuthorizationError('Test'),
        new NotFoundError('Resource'),
        new ConflictError('Test'),
        new BusinessRuleError('Test')
      ];

      errors.forEach(error => {
        expect(error.isOperational).toBe(true);
      });
    });
  });

  describe('JSON serialization consistency', () => {
    it('should have consistent JSON structure across all error types', () => {
      const errors = [
        new ValidationError('Test', { field: 'test' }),
        new AuthenticationError('Test'),
        new AuthorizationError('Test'),
        new NotFoundError('Resource', '123'),
        new ConflictError('Test', { field: 'test' }),
        new BusinessRuleError('Test', { rule: 'test' })
      ];

      errors.forEach(error => {
        const json = error.toJSON();
        expect(json).toHaveProperty('error');
        expect(json).toHaveProperty('message');
        expect(json).toHaveProperty('code');
        expect(json).toHaveProperty('details');
        expect(json).not.toHaveProperty('statusCode');
        expect(json).not.toHaveProperty('stack');
        expect(json).not.toHaveProperty('isOperational');
      });
    });
  });
});
