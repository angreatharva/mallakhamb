# Configuration Manager

The Configuration Manager provides centralized configuration management with environment variable loading, validation, and typed access to configuration values.

## Features

- **Environment Variable Loading**: Automatically loads configuration from environment variables
- **Type Safety**: Typed getters for strings, numbers, booleans, and arrays
- **Validation**: Validates required fields and value ranges at startup
- **Environment-Specific**: Supports different configurations for development, production, and test
- **DI Integration**: Registered as a singleton in the DI container

## Usage

### Basic Usage

```javascript
const configManager = require('./config/config-manager');

// Load configuration (must be called before accessing config)
const config = configManager.load();

// Access configuration values
console.log(config.server.port);
console.log(config.database.uri);
console.log(config.jwt.secret);
```

### Using with DI Container

```javascript
const { bootstrap } = require('./infrastructure/bootstrap');

// Bootstrap application (loads config and registers services)
const { container, config } = bootstrap();

// Resolve config from container
const configManager = container.resolve('config');

// Access configuration
const port = configManager.get('server.port');
const dbUri = configManager.get('database.uri');
```

### Accessing Nested Configuration

```javascript
// Using dot notation
const poolMin = configManager.get('database.poolSize.min');
const jwtExpiry = configManager.get('jwt.expiresIn');

// Direct access after loading
const config = configManager.load();
console.log(config.database.poolSize.min);
console.log(config.jwt.expiresIn);
```

### Environment Helpers

```javascript
if (configManager.isDevelopment()) {
  console.log('Running in development mode');
}

if (configManager.isProduction()) {
  console.log('Running in production mode');
}

if (configManager.isTest()) {
  console.log('Running in test mode');
}
```

## Configuration Structure

The configuration is organized into logical groups:

### Server Configuration
- `server.port` - Server port (default: 5000)
- `server.nodeEnv` - Environment (development, production, test)
- `server.corsOrigins` - Allowed CORS origins
- `server.clientUrl` - Client application URL
- `server.frontendUrl` - Frontend application URL
- `server.productionUrl` - Production URL

### Database Configuration
- `database.uri` - MongoDB connection URI (required)
- `database.poolSize.min` - Minimum pool size (default: 10)
- `database.poolSize.max` - Maximum pool size (default: 100)
- `database.timeouts.connection` - Connection timeout in ms (default: 10000)
- `database.timeouts.socket` - Socket timeout in ms (default: 45000)

### JWT Configuration
- `jwt.secret` - JWT secret key (required, min 32 characters)
- `jwt.expiresIn` - Token expiration time (default: '24h')

### Email Configuration
- `email.provider` - Email provider ('nodemailer' or 'resend')
- `email.from` - From email address
- `email.nodemailer.*` - Nodemailer-specific settings
- `email.resend.*` - Resend-specific settings

### Security Configuration
- `security.bcryptRounds` - Bcrypt hashing rounds (default: 12)
- `security.otpLength` - OTP code length (default: 6)
- `security.otpExpiry` - OTP expiry in minutes (default: 10)
- `security.maxLoginAttempts` - Max login attempts (default: 5)
- `security.lockoutDuration` - Lockout duration in minutes (default: 15)

### Cache Configuration
- `cache.ttl` - Cache TTL in seconds (default: 300)
- `cache.maxSize` - Maximum cache size (default: 1000)

### Feature Flags
- `features.enableCaching` - Enable caching (default: true)
- `features.enableMetrics` - Enable metrics collection (default: true)
- `features.enableNgrok` - Enable ngrok tunnel (default: false)

## Environment Variables

### Required Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/mydb

# JWT (must be at least 32 characters)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
```

### Optional Variables

```bash
# Server
PORT=5000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Database Pool
DB_POOL_MIN=10
DB_POOL_MAX=100
DB_CONNECT_TIMEOUT=10000
DB_SOCKET_TIMEOUT=45000

# JWT
JWT_EXPIRES_IN=24h

# Email (Nodemailer)
EMAIL_PROVIDER=nodemailer
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587

# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Security
BCRYPT_ROUNDS=12
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=10
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# Cache
CACHE_TTL_SECONDS=300
CACHE_MAX_SIZE=1000

# Features
ENABLE_CACHING=true
ENABLE_METRICS=true
NGROK_ENABLED=false
NGROK_AUTH_TOKEN=your-ngrok-token
```

## Validation

The Configuration Manager validates configuration at startup and throws descriptive errors if:

- Required environment variables are missing
- JWT secret is less than 32 characters
- Port is out of valid range (1-65535)
- Database pool sizes are invalid
- Timeouts are too low
- Bcrypt rounds are out of recommended range (10-15)
- OTP length is out of range (4-8)
- Production-specific requirements are not met

## Type Conversion Methods

The Configuration Manager provides typed getter methods:

### getString(key, defaultValue)
Returns string value or default if not set.

```javascript
const host = configManager.getString('EMAIL_HOST', 'smtp.gmail.com');
```

### getNumber(key, defaultValue)
Returns number value or default if not set or invalid.

```javascript
const port = configManager.getNumber('PORT', 5000);
```

### getBoolean(key, defaultValue)
Returns boolean value. Accepts 'true', '1' as true, everything else as false.

```javascript
const enableCache = configManager.getBoolean('ENABLE_CACHING', true);
```

### getArray(key, defaultValue)
Returns array from comma-separated string. Trims whitespace and filters empty values.

```javascript
const origins = configManager.getArray('CORS_ORIGINS', []);
// "http://localhost:5173, http://localhost:3000" -> ['http://localhost:5173', 'http://localhost:3000']
```

### getRequired(key)
Returns value or throws error if not set.

```javascript
const dbUri = configManager.getRequired('MONGODB_URI');
// Throws: "Required environment variable MONGODB_URI is not set"
```

## Testing

The Configuration Manager includes comprehensive unit tests covering:

- Configuration loading with default values
- Environment variable parsing
- Type conversion (string, number, boolean, array)
- Required field validation
- Value range validation
- Production-specific validation
- Nested configuration access
- Environment helpers

Run tests:

```bash
npm test -- src/config/config-manager.test.js
```

## Integration with DI Container

The Configuration Manager is registered as a singleton in the DI container during application bootstrap:

```javascript
// In bootstrap.js
const config = configManager.load();
container.register('config', () => configManager, 'singleton');
```

Services can then depend on the config manager:

```javascript
container.register('logger', (c) => {
  const config = c.resolve('config');
  return new Logger(config);
}, 'singleton');
```

## Best Practices

1. **Load Early**: Call `configManager.load()` at application startup before registering services
2. **Validate First**: Configuration validation happens automatically during load
3. **Use Typed Getters**: Use appropriate typed getters for type safety
4. **Environment-Specific**: Use environment variables for environment-specific configuration
5. **Secure Secrets**: Never commit secrets to version control, use environment variables
6. **Document Variables**: Document all environment variables in `.env.example`

## Requirements Satisfied

This implementation satisfies the following requirements:

- **5.1**: Configuration Manager loads and validates environment variables
- **5.2**: Provides typed access to configuration values
- **5.3**: Validates required fields and throws descriptive errors at startup
- **5.4**: Supports default values for optional configuration
- **5.5**: Organizes configuration into logical groups
- **5.6**: Validates configuration values (ranges, formats)
- **23.1**: Supports environment-specific overrides (development, production, test)
- **15.1**: Comprehensive unit tests for configuration management
