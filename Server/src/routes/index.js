/**
 * Route Loader Module
 * 
 * Centralizes route registration and applies middleware in the correct order:
 * security → logging → parsing → authentication → routes → error handling
 * 
 * Routes are organized by domain and loaded from the DI container
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.7
 * 
 * @module routes/index
 */

const express = require('express');
const createHealthRoutes = require('./health.routes');
const createAuthRoutes = require('./auth.routes');
const createPlayerRoutes = require('./player.routes');
const createCoachRoutes = require('./coach.routes');
const createAdminRoutes = require('./admin.routes');
const createCompetitionRoutes = require('./competition.routes');
const createTeamRoutes = require('./team.routes');
const createScoringRoutes = require('./scoring.routes');
const createJudgeRoutes = require('./judge.routes');
const createSuperAdminRoutes = require('./super-admin.routes');
const createPaymentRoutes = require('./payment.routes');
const createPublicRoutes = require('./public.routes');
const createDocsRoutes = require('./docs.routes');

// CSRF token endpoint
const { csrfTokenHandler } = require('../middleware/csrf.middleware');

/**
 * Current API version prefix (LOW-2). Every route is served at both
 * `/api/<version>/...` and the unversioned `/api/...`; the unversioned alias
 * exists so the deployed client keeps working and should be retired one
 * release after clients move over.
 */
const API_VERSION = 'v1';

/**
 * Load and register all application routes
 * 
 * Routes are grouped by domain with appropriate prefixes:
 * - /api/health - Health check and metrics endpoints
 * - /api/auth - Authentication and authorization
 * - /api/players - Player management
 * - /api/coaches - Coach management
 * - /api/admin - Admin management
 * - /api/competitions - Competition management
 * - /api/teams - Team management
 * - /api/scoring - Scoring operations
 * 
 * Middleware is applied in the correct order for each route group
 * 
 * @param {express.Application} app - Express application instance
 * @param {Object} options - Configuration options
 * @param {Function} options.authLimiter - Rate limiter for authentication endpoints (per IP)
 * @param {Function} options.userLimiter - Rate limiter for authenticated traffic (per user)
 * @param {Function} options.judgeLoginLimiter - Rate limiter for judge login (per username)
 * @returns {void}
 */
function loadRoutes(app, container, options = {}) {
  const { authLimiter, userLimiter, judgeLoginLimiter } = options;

  /**
   * LOW-2 / task 4.1 — API versioning.
   *
   * Everything used to be mounted directly on `app` under `/api/*`, so any
   * breaking payload change would break every deployed client at once. Routes
   * are now registered on ONE router that is mounted at both `/api/v1` and
   * `/api`, so `/api/v1/...` is available for new clients while the
   * unversioned paths keep working for the currently deployed bundle.
   *
   * Built once and mounted twice on purpose: constructing two routers would
   * also construct two rate limiters, giving each logical route two
   * independent buckets and doubling the effective limit.
   *
   * Order matters. `/api/v1` is mounted FIRST because `app.use('/api', ...)`
   * also matches `/api/v1/...`. With the versioned mount first, a versioned
   * request is handled there and never reaches the unversioned mount, so no
   * request can traverse the limiter chain twice.
   */
  const apiRouter = express.Router();

  // ============================================================
  // HEALTH CHECK ROUTES (no authentication required)
  // ============================================================
  // These should be registered first for quick access by load balancers
  const healthRouter = createHealthRoutes(container);
  apiRouter.use('/health', healthRouter);

  // ============================================================
  // API DOCUMENTATION (Swagger UI)
  // ============================================================
  // Off unless ENABLE_API_DOCS=true, and never in production, for the same
  // reason as the debug routes in createApp: the document is a complete map of
  // every route, role and required header, and publishing it anonymously hands
  // that map to everyone. Mounted on `apiRouter` so it is reachable at both
  // /api/docs and /api/v1/docs.
  const docsEnabled =
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_API_DOCS === 'true';
  if (docsEnabled) {
    apiRouter.use('/docs', createDocsRoutes(container));
  }

  // ============================================================
  // CSRF TOKEN ENDPOINT (Requirement 17.3)
  // ============================================================
  // Clients that use cookie-based sessions can fetch a CSRF token here.
  // Bearer-token (JWT) clients are automatically exempt from CSRF checks.
  apiRouter.get('/csrf-token', csrfTokenHandler);

  // ============================================================
  // AUTHENTICATION ROUTES (with rate limiting)
  // ============================================================
  // Apply rate limiting to prevent brute force attacks
  const authRouter = createAuthRoutes(container);
  if (authLimiter) {
    apiRouter.use('/auth', authLimiter, authRouter);
  } else {
    apiRouter.use('/auth', authRouter);
  }

  // ============================================================
  // USER ROUTES (players, coaches, admins)
  // ============================================================
  // Apply rate limiting to registration and login endpoints.
  //
  // MED-2 — per-user rate limiting (userLimiter) is applied ONLY to the registration and
  // management surface: /api/players, /api/coaches, /api/teams and /api/competitions.
  // It is deliberately NOT applied to /api/judge, /api/scoring, /api/public,
  // /api/admin or /api/superadmin, because each of those carries live scoring traffic
  // (/api/admin/scores/save, /api/superadmin/scores/save, /api/public/save-score and the
  // judge submit path). Throttling those during an event is a worse failure than the
  // abuse the limiter prevents. There is no global or per-IP limiter anywhere.

  // Player routes
  const playerRouter = createPlayerRoutes(container);
  if (authLimiter) {
    // Create a separate router for rate-limited endpoints
    const playerAuthRouter = express.Router();
    playerAuthRouter.post('/register', authLimiter);
    playerAuthRouter.post('/login', authLimiter);
    apiRouter.use('/players', playerAuthRouter);
  }
  if (userLimiter) {
    apiRouter.use('/players', userLimiter);
  }
  apiRouter.use('/players', playerRouter);

  // Coach routes
  const coachRouter = createCoachRoutes(container);
  if (authLimiter) {
    const coachAuthRouter = express.Router();
    coachAuthRouter.post('/register', authLimiter);
    coachAuthRouter.post('/login', authLimiter);
    apiRouter.use('/coaches', coachAuthRouter);
  }
  if (userLimiter) {
    apiRouter.use('/coaches', userLimiter);
  }
  apiRouter.use('/coaches', coachRouter);

  // Admin routes
  const adminRouter = createAdminRoutes(container);
  if (authLimiter) {
    const adminAuthRouter = express.Router();
    adminAuthRouter.post('/register', authLimiter);
    adminAuthRouter.post('/login', authLimiter);
    apiRouter.use('/admin', adminAuthRouter);
  }
  apiRouter.use('/admin', adminRouter);

  const superAdminRoutes = createSuperAdminRoutes(container);
  const judgeRoutes = createJudgeRoutes(container);

  // MED-2: judge login is now rate limited. The previous note here said rate limiting
  // was skipped for judges and superadmins "per requirement"; that left the only
  // credential-guessing surface for the judge panel wide open (see CRIT-2 — judge
  // usernames were publicly disclosed). The limiter is applied ONLY to POST
  // /api/judge/login, which is unauthenticated. The rest of /api/judge — every scoring
  // read and write a panel performs during an event — is deliberately left unlimited.
  // Keyed by username, NOT by IP: a five-judge panel behind one venue NAT address
  // must never throttle itself at sign-in, while guessing against any single judge
  // account is still capped per window.
  if (judgeLoginLimiter) {
    const judgeAuthRouter = express.Router();
    judgeAuthRouter.post('/login', judgeLoginLimiter);
    apiRouter.use('/judge', judgeAuthRouter);
  }
  apiRouter.use('/superadmin', superAdminRoutes);
  apiRouter.use('/judge', judgeRoutes);

  // ============================================================
  // PUBLIC ROUTES (no authentication required)
  // ============================================================
  const publicRouter = createPublicRoutes(container);
  apiRouter.use('/public', publicRouter);

  // ============================================================
  // COMPETITION ROUTES
  // ============================================================
  if (userLimiter) {
    apiRouter.use('/competitions', userLimiter);
  }
  apiRouter.use('/competitions', createCompetitionRoutes(container));

  // ============================================================
  // TEAM ROUTES
  // ============================================================
  if (userLimiter) {
    apiRouter.use('/teams', userLimiter);
  }
  apiRouter.use('/teams', createTeamRoutes(container));
  apiRouter.use('/scoring', createScoringRoutes(container));
  apiRouter.use('/webhooks', createPaymentRoutes(container));

  // ============================================================
  // LEGACY ENDPOINTS (backward compatibility)
  // ============================================================
  apiRouter.get('/health-legacy', (req, res) => {
    res.json({
      message: 'Sports Event API is running!',
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================
  // MOUNT (LOW-2)
  // ============================================================
  // Versioned first — see the note at the top of this function. Mounting the
  // unversioned prefix first would let `/api/v1/...` fall through the `/api`
  // mount before reaching its own, traversing the limiter chain twice.
  app.use(`/api/${API_VERSION}`, apiRouter);
  app.use('/api', apiRouter);
}

/**
 * Get route groups for documentation or testing.
 *
 * These are the UNVERSIONED paths. Every one of them is also served under
 * `/api/v1/...` (LOW-2); the unversioned form is kept as an alias for the
 * currently deployed client and should be retired one release after clients
 * move over.
 *
 * @returns {Object} Route groups organized by domain
 */
function getRouteGroups() {
  return {
    health: '/api/health',
    auth: '/api/auth',
    public: '/api/csrf-token',
    players: '/api/players',
    coaches: '/api/coaches',
    admin: '/api/admin',
    superadmin: '/api/superadmin',
    judge: '/api/judge',
    competitions: '/api/competitions',
    teams: '/api/teams',
    scoring: '/api/scoring',
    webhooks: '/api/webhooks'
  };
}

module.exports = {
  loadRoutes,
  getRouteGroups,
  API_VERSION
};
