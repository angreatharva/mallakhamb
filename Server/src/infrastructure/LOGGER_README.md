# Logger

Structured logging implementation using Winston with sensitive data redaction and environment-specific formatting.

## Features

- **Structured Logging**: JSON format for production, human-readable for development
- **Log Levels**: error, warn, info, debug, http
- **Sensitive Data Redaction**: Automatically redacts passwords, tokens, API keys, and other sensitive information
- **File Rotation**: Daily log rotation with configurable retention
- **Correlation IDs**: Support for request correlation tracking
- **Environment-Specific**: Different configurations for development and production

## Usage

### Basic Logging

```javascript
const { bootstrap } = require('./infrastructure/bootstrap');
const { container } = bootstrap();

const logger = container.resolve('logger');

// Log at different levels
logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', { error: err.message });
logger.warn('Rate limit approaching', { userId: '123', requestCount: 95 });
logger.debug('Processing request', { requestId: 'abc-123' });
logger.http('GET /api/users', { statusCode: 200, duration: 45 });
```

### With Metadata

```javascript
logger.info('API request completed', {
  method: 'POST',
  path: '/api/auth/login',
  statusCode: 200,
  duration: 123,
  userId: '123',
  correlationId: 'req-abc-123'
});
```

### Sensitive Data Redaction

The logger automatically redacts sensitive fields:

```javascript
logger.info('User authentication', {
  username: 'testuser',
  password: 'secret123',      // Will be redacted
  token: 'jwt-token-here',    // Will be redacted
  email: 'user@example.com'   // Will NOT be redacted
});

// Output:
// {
//   "username": "testuser",
//   "password": "[REDACTED]",
//   "token": "[REDACTED]",
//   "email": "user@example.com"
// }
```

### Redacted Fields

The following fields are automatically redacted:
- password
- token
- secret
- apiKey
- authorization
- jwt
- accessToken
- refreshToken
- resetPasswordToken
- otp
- pin
- ssn
- creditCard
- cvv
- accountNumber

Fields are matched case-insensitively and support partial matching (e.g., `userPassword`, `authToken`).

### Nested Objects

Redaction works recursively on nested objects:

```javascript
logger.info('Request details', {
  request: {
    headers: {
      authorization: 'Bearer token123',  // Will be redacted
      'content-type': 'application/json'
    },
    body: {
      username: 'testuser',
      password: 'secret'  // Will be redacted
    }
  }
});
```

## Configuration

The logger is configured through the ConfigManager:

```javascript
{
  server: {
    nodeEnv: 'development' | 'production' | 'test'
  }
}
```

### Development Mode

- Human-readable, colorized output to console
- Debug level logging
- Simple file transports (5MB max, 5 files)

Example output:
```
2024-01-15 10:30:45 [info]: User logged in {
  "userId": "123",
  "email": "user@example.com"
}
```

### Production Mode

- JSON structured output
- Info level logging
- Daily rotating file transports (20MB max, 14 days retention)

Example output:
```json
{
  "level": "info",
  "message": "User logged in",
  "userId": "123",
  "email": "user@example.com",
  "service": "mallakhamb-api",
  "environment": "production",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Log Files

### Development
- `logs/error.log` - Error level logs only
- `logs/combined.log` - All logs

### Production
- `logs/error-YYYY-MM-DD.log` - Error level logs with daily rotation
- `logs/combined-YYYY-MM-DD.log` - All logs with daily rotation

## Integration with DI Container

The logger is registered as a singleton in the DI container:

```javascript
// In bootstrap.js
container.register('logger', (c) => new Logger(c.resolve('config')), 'singleton');

// Usage in services
class UserService {
  constructor(userRepository, logger) {
    this.userRepository = userRepository;
    this.logger = logger;
  }

  async createUser(userData) {
    this.logger.info('Creating user', { email: userData.email });
    
    try {
      const user = await this.userRepository.create(userData);
      this.logger.info('User created successfully', { userId: user._id });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', { 
        error: error.message,
        email: userData.email 
      });
      throw error;
    }
  }
}
```

## Best Practices

### 1. Include Context

Always include relevant context in log metadata:

```javascript
// Good
logger.info('User action completed', {
  userId: user._id,
  action: 'updateProfile',
  correlationId: req.correlationId
});

// Bad
logger.info('Action completed');
```

### 2. Use Appropriate Log Levels

- **error**: Errors that require immediate attention
- **warn**: Warning conditions that should be reviewed
- **info**: General informational messages
- **debug**: Detailed debugging information
- **http**: HTTP request/response logging

### 3. Don't Log Sensitive Data Directly

While the logger redacts known sensitive fields, avoid logging sensitive data when possible:

```javascript
// Good
logger.info('Password reset requested', { userId: user._id });

// Avoid
logger.info('Password reset', { oldPassword: '...', newPassword: '...' });
```

### 4. Include Error Stack Traces

When logging errors, include the stack trace:

```javascript
try {
  // ... operation
} catch (error) {
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
    userId: user._id
  });
}
```

### 5. Use Correlation IDs

Include correlation IDs to trace requests across services:

```javascript
logger.info('Processing request', {
  correlationId: req.correlationId,
  userId: req.user._id,
  path: req.path
});
```

## Testing

### Unit Tests

Mock the logger in unit tests:

```javascript
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  http: jest.fn()
};

const service = new UserService(mockUserRepository, mockLogger);

// Verify logging
expect(mockLogger.info).toHaveBeenCalledWith(
  'User created',
  expect.objectContaining({ userId: '123' })
);
```

### Integration Tests

Use the real logger in integration tests:

```javascript
const { bootstrap } = require('./infrastructure/bootstrap');
const { container } = bootstrap();

const logger = container.resolve('logger');

// Logger will output to console and files during tests
```

## Requirements Satisfied

This implementation satisfies the following requirements:

- **12.1**: Provides structured logging with log levels (error, warn, info, debug, http)
- **12.2**: Includes context in log entries (timestamp, level, message, metadata)
- **12.3**: Writes logs in JSON format for production
- **12.4**: Writes human-readable logs for development
- **12.5**: Supports log rotation and archival
- **12.6**: Redacts sensitive information from logs
- **12.7**: Provides correlation IDs for tracing requests (via metadata)

## Related Components

- **ConfigManager**: Provides configuration for logger
- **DI Container**: Manages logger lifecycle
- **Bootstrap**: Registers logger in DI container
- **Middleware**: Will use logger for request logging
- **Services**: Use logger for business logic logging
