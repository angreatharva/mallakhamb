const http = require('http');
const dotenv = require('dotenv');

// Load environment variables FIRST
dotenv.config();

const config = require('./src/config/config-manager');
// Load and validate configuration at startup
config.load();

const { bootstrap, initializeSocketIO } = require('./src/infrastructure/bootstrap');
const { createApp } = require('./src/infrastructure/createApp');

// Bootstrap application (initialize DI container and services)
const { container } = bootstrap();
const logger = container.resolve('logger');

// Connect to database
const databaseConnection = container.resolve('databaseConnection');
databaseConnection.connect().catch(error => {
  logger.error('Failed to connect to database', { error: error.message });
  process.exit(1);
});

// Create Express app
const app = createApp(container);
const server = http.createServer(app);

// Initialize Socket.IO
const socketManager = initializeSocketIO(server);
const io = socketManager.getIO();
app.set('io', io); // Make io available to routes

const PORT = config.get('server.port');

// Start server
if (require.main === module) {
  server.listen(PORT, async () => {
    logger.info('Server started', {
      port: PORT,
      environment: config.get('server.nodeEnv'),
      corsOrigins: config.get('server.corsOrigins')
    });

    // Connect Redis for token invalidation (Phase 2A, Item 2.4)
    // Non-blocking: falls back to in-memory if Redis is unavailable
    const redisClient = container.resolve('redisClient');
    await redisClient.connect().catch((err) => {
      logger.warn('Redis connection failed at startup — using in-memory fallback', { error: err.message });
    });
    
    // Eagerly resolve the token invalidation service so the shim is wired
    container.resolve('tokenInvalidationService');

    // Register graceful shutdown handler
    const gracefulShutdownHandler = container.resolve('gracefulShutdownHandler');
    gracefulShutdownHandler.register({
      server: server,
      socketManager: socketManager,
      dbConnection: databaseConnection,
      metricsCollector: container.resolve('metricsCollector'),
      redisClient: redisClient,
    });
    logger.info('Graceful shutdown handler registered');
  });
}

// Export app for testing
module.exports = app;
