const express = require('express');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { createCorsMiddleware, createHelmetMiddleware, generateNonceMiddleware, createAuthRateLimitMiddleware, createUserRateLimitMiddleware, createJudgeLoginRateLimitMiddleware, createAccountGuessLimiters } = require('../middleware/security.middleware');
const { createCsrfMiddleware } = require('../middleware/csrf.middleware');
const { createCorrelationMiddleware } = require('../middleware/correlation.middleware');
const { errorHandler, notFoundHandler } = require('../middleware/error.middleware');
const { createPrometheusMiddleware } = require('../middleware/prometheus.middleware');
const { createMetricsAuthMiddleware } = require('../middleware/metrics-auth.middleware');
const { loadRoutes } = require('../routes');
const config = require('../config/config-manager');

function createApp(container) {
  const app = express();
  const logger = container.resolve('logger');

  // Wire the token-invalidation service before any route can check a logout.
  // Resolving it is what connects the auth middleware to the durable store;
  // left to server.js alone, any other way of building the app (a test, a
  // script) silently kept logouts in a per-process map (audit 2026-10-31, M4).
  try {
    container.resolve('tokenInvalidationService');
  } catch (error) {
    logger.warn('Token invalidation service unavailable; logouts are per-process', { error: error.message });
  }

  // Trust proxy - Required for Render and other reverse proxies
  app.set('trust proxy', 1);

  // Security Middleware
  app.use(generateNonceMiddleware);
  app.use(createHelmetMiddleware(container));
  app.use(compression());

  // HTTPS enforcement in production
  if (process.env.NODE_ENV === 'production') {
    // The redirect target is built from the Host header, which the client
    // controls; only a well-formed host name is echoed back, so the redirect
    // cannot be bent into a URL of the caller's choosing (security audit
    // 2026-10-31, L6). Caddy and Render answer plain HTTP themselves, so this
    // is a backstop.
    const SAFE_HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;
    app.use((req, res, next) => {
      if (req.header('x-forwarded-proto') !== 'https') {
        const host = req.header('host') || '';
        if (!SAFE_HOST.test(host)) {
          return res.status(400).json({ success: false, error: { message: 'Bad Host header', code: 'BAD_HOST' } });
        }
        return res.redirect(`https://${host}${req.url}`);
      }
      next();
    });
  }

  /**
   * GET /metrics — the Prometheus scrape target for Grafana Cloud
   * (deploy/monitoring/PLAN.md).
   *
   * Mounted here, ahead of CORS, CSRF, request coalescing and audit, on
   * purpose: the scraper is a server-to-server GET with a bearer token, none of
   * those layers apply to it, and request coalescing in particular must never
   * see an auth-dependent response. Closed unless METRICS_TOKEN is set.
   */
  const metrics = container.resolve('metrics');
  const metricsAuth = createMetricsAuthMiddleware(
    () => container.resolve('config').get('observability.metricsTokens')
  );
  app.get('/metrics', metricsAuth, async (req, res, next) => {
    try {
      const body = await metrics.metrics();
      res.set('Content-Type', metrics.contentType);
      res.set('Cache-Control', 'no-store');
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  // Request metrics. Ahead of every router so the matched route pattern is
  // captured as Express assigns it (see prometheus/route-label.js).
  app.use(createPrometheusMiddleware(metrics, { logger }));

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
  /*
   * One switch for every limiter (security.rateLimitEnabled).
   *
   * Off by default in development and test: the limits are sized for humans and
   * they get in the way of the load harness, the e2e walk and UI seeding, where
   * a 429 tells you nothing except that you are testing. On by default in
   * production and staging, where judge login and password reset are genuine
   * guessing surfaces.
   *
   * Passing `undefined` is what loadRoutes already treats as "no limiter", so
   * disabling attaches nothing at all rather than attaching a permissive one.
   */
  const rateLimitEnabled = appConfig.get('security.rateLimitEnabled');
  const authLimiter = rateLimitEnabled ? createAuthRateLimitMiddleware(container) : undefined;
  const userLimiter = rateLimitEnabled ? createUserRateLimitMiddleware(container) : undefined;
  const judgeLoginLimiter = rateLimitEnabled
    ? createJudgeLoginRateLimitMiddleware(container)
    : undefined;

  if (!rateLimitEnabled) {
    logger.warn('Rate limiting is DISABLED', {
      environment: process.env.NODE_ENV,
      hint: 'Set RATE_LIMIT_ENABLED=true to turn it back on.',
    });
  }

  // Per-account guessing limits: their own switch, on even where the per-IP
  // limiters above are off (see createAccountGuessLimiters).
  const accountLimiters = appConfig.get('security.accountRateLimitEnabled')
    ? createAccountGuessLimiters(container)
    : undefined;

  loadRoutes(app, container, { authLimiter, userLimiter, judgeLoginLimiter, accountLimiters });

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

  /**
   * The service root.
   *
   * Render's port detector and health check both request `/`, and without a
   * handler every one of those fell through to `notFoundHandler` — which logs a
   * warning WITH A STACK TRACE. A platform probing an otherwise healthy service
   * every few seconds should not look like a stream of errors; real 404s stop
   * being noticeable when they share the log with expected ones.
   *
   * Deliberately says almost nothing. This is the one route reachable without
   * knowing anything about the API, so it names the service and points at the
   * probes rather than advertising the surface.
   */
  app.get('/', (req, res) => {
    res.json({
      service: 'mallakhamb-api',
      status: 'ok',
      health: '/api/health/live',
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
