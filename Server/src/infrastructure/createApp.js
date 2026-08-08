const express = require('express');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { createCorsMiddleware, createHelmetMiddleware, generateNonceMiddleware, createAuthRateLimitMiddleware, createUserRateLimitMiddleware, createJudgeLoginRateLimitMiddleware } = require('../middleware/security.middleware');
const { createCsrfMiddleware } = require('../middleware/csrf.middleware');
const { createCorrelationMiddleware } = require('../middleware/correlation.middleware');
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

  /**
   * MED-4: correlation IDs. The CORS config already advertises
   * `X-Correlation-ID` in both the allow and expose lists
   * (security.middleware.js), but nothing generated one — so the header was
   * promised to clients and never sent, and the logger's request-tracing story
   * was aspirational. Mounted early so every downstream log line and error can
   * carry the id, and it also provides `req.logger`.
   */
  app.use(createCorrelationMiddleware(container));

  // Cookie parsing
  app.use(cookieParser());

  // CSRF protection (CRIT-3). ENABLED by default as of 2026-08-08.
  //
  // It was gated off while the SPA did not send X-CSRF-Token: api-client only
  // attaches `Authorization: Bearer` when a token exists in sessionStorage, so
  // a fresh tab with a live cookie produced a cookie-only write that the Bearer
  // exemption below does NOT cover, and enabling it would have 403'd real users
  // mid-competition. The client now fetches /api/csrf-token and attaches the
  // header on every state-changing request, with a one-shot retry when the
  // token has expired.
  //
  // The client reads the token from the RESPONSE BODY rather than
  // document.cookie, because the SPA is a separate static origin from the API
  // (render.yaml) and JS cannot read another origin's cookies.
  //
  // Set CSRF_ENABLED=false to switch it off if a deployment needs to.
  const appConfig = container.resolve('config');
  if (appConfig.get('security.csrfEnabled')) {
    app.use(createCsrfMiddleware());
    logger.info('CSRF protection enabled (double-submit cookie)');
  }

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

  // Audit middleware
  const { createAuditMiddleware } = require('../middleware/audit.middleware');
  app.use(createAuditMiddleware(container));

  // Load routes with rate limiters (MED-2).
  // NOTE: there is deliberately NO global/per-IP rate limiter. At a venue every judge
  // tablet shares one NAT address, so a five-judge panel presents as a single IP and
  // would blow through the 100 req / 15 min general IP limit mid-competition.
  // `createIpRateLimitMiddleware` is reserved for unauthenticated endpoints only.
  // The user limiter is keyed by the authenticated principal (req.user, or the access
  // token when it runs ahead of the router's own auth middleware) and skips anonymous
  // requests entirely — it never falls back to an IP key.
  // Judge login gets its own limiter keyed by username rather than sharing the
  // per-IP `authLimiter` bucket — otherwise one venue's NAT address would put the
  // whole panel on a single 10-per-15-min budget at sign-in. See
  // createJudgeLoginRateLimitMiddleware.
  const authLimiter = createAuthRateLimitMiddleware(container);
  const userLimiter = createUserRateLimitMiddleware(container);
  const judgeLoginLimiter = createJudgeLoginRateLimitMiddleware(container);
  loadRoutes(app, container, { authLimiter, userLimiter, judgeLoginLimiter });

  /**
   * LOW-3: these were gated on `NODE_ENV !== 'production'`, which meant they
   * were live in staging — a real, internet-reachable environment. They leak
   * no secrets, but they do leak configuration (allowed origins, CLIENT_URL),
   * and "not production" is not a security boundary.
   *
   * Now off unless ENABLE_DEBUG_ROUTES is explicitly true, and never available
   * in production regardless of that flag.
   */
  const debugRoutesEnabled =
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEBUG_ROUTES === 'true';

  if (debugRoutesEnabled) {
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
