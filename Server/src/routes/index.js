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

// CSRF token endpoint
const { csrfTokenHandler } = require('../middleware/csrf.middleware');

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

  // ============================================================
  // HEALTH CHECK ROUTES (no authentication required)
  // ============================================================
  // These should be registered first for quick access by load balancers
  const healthRouter = createHealthRoutes(container);
  app.use('/api/health', healthRouter);

  // ============================================================
  // CSRF TOKEN ENDPOINT (Requirement 17.3)
  // ============================================================
  // Clients that use cookie-based sessions can fetch a CSRF token here.
  // Bearer-token (JWT) clients are automatically exempt from CSRF checks.
  app.get('/api/csrf-token', csrfTokenHandler);

  // ============================================================
  // AUTHENTICATION ROUTES (with rate limiting)
  // ============================================================
  // Apply rate limiting to prevent brute force attacks
  const authRouter = createAuthRoutes(container);
  if (authLimiter) {
    app.use('/api/auth', authLimiter, authRouter);
  } else {
    app.use('/api/auth', authRouter);
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
    app.use('/api/players', playerAuthRouter);
  }
  if (userLimiter) {
    app.use('/api/players', userLimiter);
  }
  app.use('/api/players', playerRouter);

  // Coach routes
  const coachRouter = createCoachRoutes(container);
  if (authLimiter) {
    const coachAuthRouter = express.Router();
    coachAuthRouter.post('/register', authLimiter);
    coachAuthRouter.post('/login', authLimiter);
    app.use('/api/coaches', coachAuthRouter);
  }
  if (userLimiter) {
    app.use('/api/coaches', userLimiter);
  }
  app.use('/api/coaches', coachRouter);

  // Admin routes
  const adminRouter = createAdminRoutes(container);
  if (authLimiter) {
    const adminAuthRouter = express.Router();
    adminAuthRouter.post('/register', authLimiter);
    adminAuthRouter.post('/login', authLimiter);
    app.use('/api/admin', adminAuthRouter);
  }
  app.use('/api/admin', adminRouter);

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
    app.use('/api/judge', judgeAuthRouter);
  }
  app.use('/api/superadmin', superAdminRoutes);
  app.use('/api/judge', judgeRoutes);

  // ============================================================
  // PUBLIC ROUTES (no authentication required)
  // ============================================================
  const publicRouter = createPublicRoutes(container);
  app.use('/api/public', publicRouter);

  // ============================================================
  // COMPETITION ROUTES
  // ============================================================
  if (userLimiter) {
    app.use('/api/competitions', userLimiter);
  }
  app.use('/api/competitions', createCompetitionRoutes(container));

  // ============================================================
  // TEAM ROUTES
  // ============================================================
  if (userLimiter) {
    app.use('/api/teams', userLimiter);
  }
  app.use('/api/teams', createTeamRoutes(container));
  app.use('/api/scoring', createScoringRoutes(container));
  app.use('/api/webhooks', createPaymentRoutes(container));

  // ============================================================
  // LEGACY ENDPOINTS (backward compatibility)
  // ============================================================
  app.get('/api/health-legacy', (req, res) => {
    res.json({ 
      message: 'Sports Event API is running!', 
      timestamp: new Date().toISOString() 
    });
  });
}

/**
 * Get route groups for documentation or testing
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
  getRouteGroups
};
