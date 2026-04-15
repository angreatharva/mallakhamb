# Graceful Shutdown Handler

## Overview

The `GracefulShutdownHandler` coordinates a clean shutdown of the server when termination signals are received. It ensures that:

- In-flight requests complete before shutdown
- Socket.IO connections are closed properly
- Database connections are closed cleanly
- Logs and metrics are flushed
- The process exits with the appropriate code

## Requirements Fulfilled

This implementation satisfies the following requirements from the spec:

- **10.1**: Handle SIGTERM and SIGINT signals
- **10.2**: Stop accepting new connections
- **10.3**: Wait for in-flight requests (max 30s)
- **10.4**: Close Socket.IO connections
- **10.5**: Close database connections
- **10.6**: Flush logs and metrics
- **10.7**: Exit with appropriate code
- **10.8**: Log shutdown progress at each stage

## Usage

### Registration

The graceful shutdown handler is automatically registered during server startup in `server.js`:

```javascript
const { bootstrap } = require('./src/infrastructure/bootstrap');
const { container } = bootstrap();

// After server starts
const gracefulShutdownHandler = container.resolve('gracefulShutdownHandler');
const mongoose = require('mongoose');

gracefulShutdownHandler.register({
  server: server,
  socketManager: socketManager,
  dbConnection: mongoose.connection,
  metricsCollector: metricsCollector
});
```

### Signal Handling

The handler automatically sets up listeners for:

- **SIGTERM**: Sent by process managers (PM2, Docker, Kubernetes)
- **SIGINT**: Sent by Ctrl+C in terminal
- **uncaughtException**: Unhandled exceptions
- **unhandledRejection**: Unhandled promise rejections

### Shutdown Sequence

When a termination signal is received, the handler executes the following sequence:

1. **Stop Accepting Connections**: Closes the HTTP server to prevent new connections
2. **Wait for In-Flight Requests**: Waits up to 30 seconds for active requests to complete
3. **Close Socket.IO**: Disconnects all Socket.IO clients and closes the server
4. **Close Database**: Closes MongoDB connections
5. **Flush Logs and Metrics**: Ensures all logs and metrics are written
6. **Exit**: Exits the process with appropriate code (0 for clean, 1 for error)

## Configuration

### Shutdown Timeout

The default timeout for waiting for in-flight requests is 30 seconds. You can customize this:

```javascript
gracefulShutdownHandler.setShutdownTimeout(60000); // 60 seconds
```

## API

### `register(options)`

Registers the server and dependencies for shutdown.

**Parameters:**
- `options.server` (http.Server): HTTP server instance
- `options.socketManager` (SocketManager): Socket.IO manager
- `options.dbConnection` (mongoose.Connection): Database connection
- `options.metricsCollector` (MetricsCollector): Metrics collector

**Example:**
```javascript
gracefulShutdownHandler.register({
  server: httpServer,
  socketManager: socketManager,
  dbConnection: mongoose.connection,
  metricsCollector: metricsCollector
});
```

### `shutdown(signal, exitCode)`

Manually trigger a graceful shutdown.

**Parameters:**
- `signal` (string): Signal name (e.g., 'SIGTERM', 'SIGINT')
- `exitCode` (number): Exit code (0 for success, 1 for error)

**Example:**
```javascript
await gracefulShutdownHandler.shutdown('SIGTERM', 0);
```

### `isShutdownInProgress()`

Check if shutdown is currently in progress.

**Returns:** `boolean`

**Example:**
```javascript
if (gracefulShutdownHandler.isShutdownInProgress()) {
  console.log('Shutdown in progress, rejecting new requests');
}
```

### `setShutdownTimeout(timeout)`

Set the maximum time to wait for in-flight requests.

**Parameters:**
- `timeout` (number): Timeout in milliseconds

**Example:**
```javascript
gracefulShutdownHandler.setShutdownTimeout(60000); // 60 seconds
```

## Logging

The handler logs each stage of the shutdown process:

```
INFO: SIGTERM signal received
INFO: Starting graceful shutdown { signal: 'SIGTERM', exitCode: 0 }
INFO: Stopping acceptance of new connections
INFO: Server stopped accepting new connections
INFO: Waiting for in-flight requests to complete { timeout: 30000 }
INFO: Closing Socket.IO connections
INFO: Disconnecting Socket.IO clients { count: 5 }
INFO: Socket.IO connections closed { count: 5 }
INFO: Closing database connections
INFO: Database connections closed
INFO: Flushing logs and metrics
INFO: Metrics flushed
INFO: Logs flushed
INFO: Graceful shutdown completed { signal: 'SIGTERM', duration: 1234, exitCode: 0 }
```

## Error Handling

If an error occurs during shutdown:

1. The error is logged with full context
2. The shutdown continues to the next stage
3. The process exits with code 1

Example error log:
```
ERROR: Error during graceful shutdown {
  signal: 'SIGTERM',
  duration: 567,
  error: 'Database close failed',
  stack: '...'
}
```

## Testing

The handler includes comprehensive unit tests covering:

- Signal handling (SIGTERM, SIGINT, uncaughtException, unhandledRejection)
- Shutdown sequence execution
- Error handling
- Timeout behavior
- Multiple shutdown prevention
- Component cleanup

Run tests:
```bash
npm test -- graceful-shutdown.test.js
```

## Production Deployment

### Docker

When running in Docker, ensure your container handles signals properly:

```dockerfile
# Use exec form to ensure signals are passed to Node.js
CMD ["node", "server.js"]

# Or use tini as init system
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

### Kubernetes

Configure appropriate termination grace period:

```yaml
spec:
  terminationGracePeriodSeconds: 60  # Should be > shutdownTimeout
  containers:
  - name: api
    image: your-image
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 5"]  # Allow time for load balancer to update
```

### PM2

PM2 automatically sends SIGINT on shutdown. Configure kill timeout:

```json
{
  "apps": [{
    "name": "api",
    "script": "server.js",
    "kill_timeout": 60000  // Should be > shutdownTimeout
  }]
}
```

## Best Practices

1. **Set appropriate timeout**: Ensure `shutdownTimeout` is long enough for your longest requests
2. **Monitor shutdown duration**: Track shutdown duration in logs to identify issues
3. **Test shutdown behavior**: Regularly test shutdown in staging environments
4. **Configure container orchestrators**: Ensure termination grace periods are longer than shutdown timeout
5. **Handle shutdown in middleware**: Check `isShutdownInProgress()` to reject new requests during shutdown

## Troubleshooting

### Shutdown takes too long

- Check for long-running requests or background jobs
- Increase `shutdownTimeout` if needed
- Review logs to identify which stage is slow

### Process exits immediately

- Ensure signal handlers are registered before server starts
- Check that `register()` is called with all dependencies
- Verify no other code is calling `process.exit()`

### Database connections not closing

- Ensure `mongoose.connection` is passed to `register()`
- Check for active queries or transactions
- Review database connection pool settings

### Socket.IO clients not disconnecting

- Ensure `socketManager` is passed to `register()`
- Check for client reconnection logic
- Verify Socket.IO server is properly initialized

## Migration from Legacy Handlers

The old shutdown handlers in `server.js` have been replaced with this centralized handler. The legacy handlers are temporarily kept with warning logs:

```javascript
// Legacy handler (will be removed)
process.on('SIGINT', async () => {
  console.log('\n⚠️ Legacy SIGINT handler - will be removed after GracefulShutdownHandler is verified');
});
```

Once the new handler is verified in production, remove the legacy handlers completely.

## Related Components

- **HealthMonitor**: Provides health check endpoints
- **MetricsCollector**: Tracks performance metrics
- **Logger**: Structured logging system
- **SocketManager**: Socket.IO connection management

## References

- [Node.js Process Signals](https://nodejs.org/api/process.html#process_signal_events)
- [Graceful Shutdown in Node.js](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Kubernetes Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
