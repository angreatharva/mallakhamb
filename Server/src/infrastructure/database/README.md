# Database Connection Pool Optimization

## Overview

This module implements production-grade MongoDB connection pool management with optimized settings, connection monitoring, and retry logic with exponential backoff.

## Features

### 1. Optimized Connection Pool Settings

The connection pool is configured with production-appropriate settings:

- **Minimum Pool Size**: 10 connections (Requirement 9.2)
  - Maintains a baseline of connections ready for immediate use
  - Reduces latency for incoming requests
  
- **Maximum Pool Size**: 100 connections (Requirement 9.3)
  - Allows scaling under high load
  - Prevents connection exhaustion
  
- **Connection Timeout**: 10 seconds (Requirement 9.4)
  - Time to wait for initial connection establishment
  - Fails fast if MongoDB is unreachable
  
- **Socket Timeout**: 45 seconds (Requirement 9.5)
  - Time to wait for socket operations
  - Prevents hanging queries

### 2. Connection Monitoring (Requirement 9.6)

The module monitors all connection lifecycle events:

- **connected**: Initial connection established
- **disconnected**: Connection lost
- **reconnected**: Connection re-established after loss
- **error**: Connection errors
- **fullsetup**: Replica set fully connected (if applicable)

All events are logged with appropriate severity levels for observability.

### 3. Retry Logic with Exponential Backoff (Requirement 9.7)

When connection fails, the module automatically retries with exponential backoff:

- **Base Delay**: 1 second
- **Max Delay**: 30 seconds
- **Max Retries**: 5 attempts
- **Jitter**: 0-20% random jitter to prevent thundering herd

**Backoff Formula**: `delay = min(baseDelay * 2^(retryCount - 1) + jitter, maxDelay)`

**Example Retry Sequence**:
1. First retry: ~1 second
2. Second retry: ~2 seconds
3. Third retry: ~4 seconds
4. Fourth retry: ~8 seconds
5. Fifth retry: ~16 seconds

After 5 failed attempts, the process exits with code 1.

### 4. Connection Lifecycle Events (Requirement 9.8)

The module emits events for all connection state changes, enabling:
- Real-time monitoring
- Alerting on connection issues
- Debugging connection problems
- Performance tracking

## Configuration

Configure via environment variables:

```bash
# MongoDB connection URI (required)
MONGODB_URI=mongodb://localhost:27017/mydb

# Pool settings (optional - defaults shown)
DB_POOL_MIN=10
DB_POOL_MAX=100
DB_CONNECT_TIMEOUT=10000
DB_SOCKET_TIMEOUT=45000
```

## Usage

### Basic Usage

```javascript
const DatabaseConnection = require('./src/infrastructure/database/connection');
const configManager = require('./src/config/config-manager');
const logger = require('./src/infrastructure/logger');

// Create instance
const dbConnection = new DatabaseConnection(configManager, logger);

// Connect
await dbConnection.connect();

// Check status
const isConnected = dbConnection.getConnectionStatus();

// Get pool statistics
const stats = dbConnection.getPoolStats();

// Disconnect
await dbConnection.disconnect();
```

### Integration with DI Container

```javascript
const { bootstrap } = require('./src/infrastructure/bootstrap');

// Bootstrap registers databaseConnection in DI container
const { container } = bootstrap();

// Resolve and connect
const databaseConnection = container.resolve('databaseConnection');
await databaseConnection.connect();
```

### Integration with Graceful Shutdown

```javascript
const gracefulShutdownHandler = container.resolve('gracefulShutdownHandler');

gracefulShutdownHandler.register({
  server: httpServer,
  socketManager: socketManager,
  dbConnection: databaseConnection,
  metricsCollector: metricsCollector
});
```

## Connection Pool Statistics

Get real-time pool statistics:

```javascript
const stats = dbConnection.getPoolStats();
console.log(stats);
// {
//   connected: true,
//   readyState: 1,
//   host: 'localhost',
//   database: 'mydb',
//   poolSize: 'N/A'
// }
```

**Ready States**:
- `0`: Disconnected
- `1`: Connected
- `2`: Connecting
- `3`: Disconnecting

## Error Handling

The module handles various error scenarios:

### Connection Failures
- Logs error with context
- Automatically retries with exponential backoff
- Exits after max retries

### Disconnections
- Logs warning
- Mongoose automatically attempts reconnection
- Connection monitoring tracks reconnection

### Timeout Errors
- Connection timeout: Fails fast if MongoDB unreachable
- Socket timeout: Prevents hanging queries

## Monitoring and Observability

### Log Events

All connection events are logged:

```javascript
// Connection established
logger.info('MongoDB connected successfully', { host, database, poolSize });

// Connection lost
logger.warn('MongoDB connection lost', { host });

// Reconnected
logger.info('MongoDB reconnected successfully', { host });

// Error
logger.error('MongoDB connection error', { error, stack });

// Retry attempt
logger.warn('Retrying database connection...', { retryCount, maxRetries, delayMs });
```

### Health Checks

The connection status is exposed via health check endpoints:

```bash
GET /api/health
```

Response includes database connectivity status.

## Performance Considerations

### Pool Size Tuning

The default pool sizes (min: 10, max: 100) are suitable for most applications. Adjust based on:

- **Concurrent Users**: More users = larger pool
- **Query Complexity**: Complex queries = larger pool
- **MongoDB Resources**: Don't exceed MongoDB connection limits
- **Application Memory**: Each connection consumes memory

### Connection Reuse

The pool automatically reuses connections, reducing overhead:
- No need to create/destroy connections per request
- Connections are kept alive and ready
- Significant performance improvement over connection-per-request

### Monitoring Pool Utilization

Monitor pool statistics to optimize settings:
- If pool frequently hits max size, increase `DB_POOL_MAX`
- If pool rarely exceeds min size, decrease `DB_POOL_MIN`
- Track connection wait times in metrics

## Testing

Unit tests cover:
- Connection with correct pool settings
- Retry logic with exponential backoff
- Connection monitoring event handlers
- Graceful disconnection
- Error handling
- Pool statistics

Run tests:
```bash
npm test -- src/infrastructure/database/connection.test.js
```

## Migration from Legacy Connection

### Before (config/db.js)
```javascript
const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000
  });
};
```

### After (src/infrastructure/database/connection.js)
```javascript
const databaseConnection = container.resolve('databaseConnection');
await databaseConnection.connect();
```

### Benefits of New Implementation
- ✅ Production-grade pool settings (min: 10, max: 100)
- ✅ Comprehensive connection monitoring
- ✅ Retry logic with exponential backoff
- ✅ Better error handling and logging
- ✅ Integration with DI container
- ✅ Graceful shutdown support
- ✅ Pool statistics and observability

## Troubleshooting

### Connection Timeouts
- Check MongoDB is running and accessible
- Verify `MONGODB_URI` is correct
- Check network connectivity
- Review firewall rules

### Pool Exhaustion
- Increase `DB_POOL_MAX`
- Optimize slow queries
- Check for connection leaks
- Monitor query execution times

### Frequent Disconnections
- Check MongoDB server stability
- Review network reliability
- Check MongoDB logs for issues
- Consider increasing socket timeout

## References

- [Mongoose Connection Options](https://mongoosejs.com/docs/connections.html)
- [MongoDB Connection Pool](https://www.mongodb.com/docs/manual/reference/connection-string/#connection-pool-options)
- [Requirements Document](../../specs/server-architecture-refactoring/requirements.md) - Requirement 9

## Related Components

- **ConfigManager**: Loads database configuration
- **Logger**: Logs connection events
- **HealthMonitor**: Checks database connectivity
- **GracefulShutdownHandler**: Closes connections on shutdown
- **Bootstrap**: Registers in DI container
