const http = require('http');
const dotenv = require('dotenv');

// Load environment variables FIRST
dotenv.config();

const config = require('./src/config/config-manager');
// Load and validate configuration at startup
config.load();

const { bootstrap, initializeSocketIO, warmCache } = require('./src/infrastructure/bootstrap');
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

/**
 * Keep-alive timeouts.
 *
 * Node closes an idle keep-alive socket after 5 seconds by default. A client
 * that reuses a socket in the instant the server is closing it gets ECONNRESET
 * with no response — the request never reached the app, so nothing is logged
 * server-side and the caller sees an unexplained network error. It shows up
 * under sustained sequential traffic: bulk seeding hit it twice, and a judge
 * scoring steadily through a session is the same access pattern.
 *
 * 65s outlives the 60s idle timeout used by common proxies (Render, ALB), so
 * the proxy discards the connection first, on its own terms. headersTimeout
 * must exceed keepAliveTimeout or the race simply moves one layer up.
 */
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

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

    // Warm frequently-accessed caches (active/upcoming competitions, teams).
    // Non-blocking and non-fatal: warmCache() already catches its own errors
    // and returns a stats object rather than throwing, so a slow or failing
    // warm-up never delays or blocks the server from serving.
    warmCache()
      .then((stats) => {
        logger.info('Cache warmed', stats);
      })
      .catch((err) => {
        logger.error('Cache warming failed to start', { error: err.message });
      });

    /*
     * Bring every finished meet's `status` up to date, then keep it that way.
     *
     * Runs here rather than at bootstrap so importing the app for a test never
     * arms a timer. The startup sweep is what catches meets that ended while
     * this process was down or being redeployed; after that the service wakes
     * itself at each UTC midnight.
     *
     * Non-blocking and non-fatal: the read-only lock is computed from `endDate`
     * per request and does not depend on this having run.
     */
    const competitionStatusService = container.resolve('competitionStatusService');
    competitionStatusService.start()
      .then(({ completed }) => {
        logger.info('Competition status sweeper started', { completedAtStartup: completed });
      })
      .catch((err) => {
        logger.error('Competition status sweeper failed to start', { error: err.message });
      });

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
