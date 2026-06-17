const express = require('express');
const dotenv = require('dotenv');
const http = require('http');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const { createCorsMiddleware } = require('./src/middleware/security.middleware');
// Load environment variables FIRST
dotenv.config();
// Import new infrastructure components
const config = require('./src/config/config-manager');
// Load and validate configuration at startup
config.load();
// Import error middleware from new structure
const { errorHandler, notFoundHandler } = require('./src/middleware/error.middleware');
// Import bootstrap for DI container and Socket.IO initialization
const { bootstrap, initializeSocketIO } = require('./src/infrastructure/bootstrap');
// Import metrics middleware
const { createMetricsMiddleware, createErrorMetricsMiddleware } = require('./src/middleware/metrics.middleware');
// Bootstrap application (initialize DI container and services)
const { container } = bootstrap();
const logger = container.resolve('logger');
// Connect to database using new DatabaseConnection
const databaseConnection = container.resolve('databaseConnection');
databaseConnection.connect().catch(error => {
  logger.error('Failed to connect to database', { error: error.message });
  process.exit(1);
});
// Resolve metrics collector for middleware
const metricsCollector = container.resolve('metricsCollector');
const app = express();
const server = http.createServer(app);
// Trust proxy - Required for Render and other reverse proxies
app.set('trust proxy', 1);
// Initialize Socket.IO using the new SocketManager
const socketManager = initializeSocketIO(server);
const io = socketManager.getIO();
// Make io available to routes
app.set('io', io);
// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
// HTTPS enforcement in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
// CORS — delegated to the centralized security middleware (MED-5)
app.use(createCorsMiddleware(container));
// Request size limits
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
// NoSQL injection protection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn('Sanitized potentially malicious input', { key, path: req.path, method: req.method });
  }
}));
// Rate limiter for authentication endpoints (uses centralized security middleware)
const { createAuthRateLimitMiddleware } = require('./src/middleware/security.middleware');
const authLimiter = createAuthRateLimitMiddleware(container);
// Request logging
app.use((req, res, next) => {
  logger.debug('Incoming request', { method: req.method, path: req.path, origin: req.headers.origin || 'no-origin' });
  next();
});
// Metrics collection middleware
app.use(createMetricsMiddleware(metricsCollector));
// Request coalescing middleware
const requestCoalescingMiddleware = container.resolve('requestCoalescingMiddleware');
app.use(requestCoalescingMiddleware.middleware());
const { loadRoutes } = require('./src/routes');
loadRoutes(app, container, { authLimiter });
// Debug endpoints (development only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/cors', (req, res) => {
    res.json({ 
      message: 'CORS test successful',
      origin: req.headers.origin,
      allowedOrigins: config.get('cors.allowedOrigins'),
      timestamp: new Date().toISOString() 
    });
  });
  app.get('/api/debug/env', (req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      CLIENT_URL: process.env.CLIENT_URL,
      allowedOrigins: config.get('cors.allowedOrigins'),
      timestamp: new Date().toISOString()
    });
  });
  app.post('/api/debug/test-email', async (req, res) => {
    const emailService = container.resolve('emailService');
    try {
      const testEmail = req.body.email || 'test@example.com';
      const isHealthy = await emailService.checkHealth();
      const result = await emailService.sendEmail({
        to: testEmail,
        subject: 'Test Email - Mallakhamb Competition',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Test Email</h1>
          <p>This is a test email from the Mallakhamb Competition system.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p>If you received this email, the email service is working correctly!</p>
        </div>
        `
      });
      res.json({
        message: 'Email test completed',
        connectivityTest: { healthy: isHealthy },
        emailSent: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        message: 'Email test failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}
// 404 handler
app.use(notFoundHandler);
// Error metrics middleware
app.use(createErrorMetricsMiddleware(metricsCollector));
// Error handling middleware
app.use(errorHandler);
const PORT = config.get('server.port');
// Start server
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      environment: config.get('server.nodeEnv'),
      corsOrigins: config.get('server.corsOrigins')
    });
    // Register graceful shutdown handler
    const gracefulShutdownHandler = container.resolve('gracefulShutdownHandler');
    gracefulShutdownHandler.register({
      server: server,
      socketManager: socketManager,
      dbConnection: databaseConnection,
      metricsCollector: metricsCollector
    });
    logger.info('Graceful shutdown handler registered');
  });
}
// Export app for testing
module.exports = app;
