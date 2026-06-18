const express = require('express');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { createCorsMiddleware, createHelmetMiddleware, generateNonceMiddleware, createAuthRateLimitMiddleware } = require('../middleware/security.middleware');
const { errorHandler, notFoundHandler } = require('../middleware/error.middleware');
const { createMetricsMiddleware, createErrorMetricsMiddleware } = require('../middleware/metrics.middleware');
const { loadRoutes } = require('../routes');
const config = require('../config/config-manager');

function createApp(container) {
  const app = express();
  const logger = container.resolve('logger');
  const metricsCollector = container.resolve('metricsCollector');

  // Trust proxy - Required for Render and other reverse proxies
  app.set('trust proxy', 1);

  // Security Middleware
  app.use(generateNonceMiddleware);
  app.use(createHelmetMiddleware(container));
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

  // CORS
  app.use(createCorsMiddleware(container));

  // Request parsing and limits
  app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  
  // Cookie parsing
  app.use(cookieParser());

  // NoSQL injection protection
  app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      logger.warn('Sanitized potentially malicious input', { key, path: req.path, method: req.method });
    }
  }));

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

  // Load routes with auth limiter
  const authLimiter = createAuthRateLimitMiddleware(container);
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
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error metrics middleware
  app.use(createErrorMetricsMiddleware(metricsCollector));

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
