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
 * @param {Function} options.authLimiter - Rate limiter for authentication endpoints
 * @returns {void}
 */
function loadRoutes(app, container, options = {}) {
  const { authLimiter } = options;

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
  // Apply rate limiting to registration and login endpoints
  
  // Player routes
  const playerRouter = createPlayerRoutes(container);
  if (authLimiter) {
    // Create a separate router for rate-limited endpoints
    const playerAuthRouter = express.Router();
    playerAuthRouter.post('/register', authLimiter);
    playerAuthRouter.post('/login', authLimiter);
    app.use('/api/players', playerAuthRouter);
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
  if (authLimiter) {
    const superAdminAuthRouter = express.Router();
    superAdminAuthRouter.post('/login', authLimiter);
    app.use('/api/superadmin', superAdminAuthRouter);
    
    const judgeAuthRouter = express.Router();
    judgeAuthRouter.post('/login', authLimiter);
    app.use('/api/judge', judgeAuthRouter);
  }
  
  app.use('/api/super-admin', superAdminRoutes);
  app.use('/api/judge', judgeRoutes);

  // ============================================================
  // COMPETITION ROUTES
  // ============================================================
  app.use('/api/competitions', createCompetitionRoutes(container));

  // ============================================================
  // TEAM ROUTES
  // ============================================================
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
    players: '/api/players',
    coaches: '/api/coaches',
    admin: '/api/admin',
    superadmin: '/api/super-admin',
    judge: '/api/judge',
    competitions: '/api/competitions',
    teams: '/api/teams',
    scoring: '/api/scoring'
  };
}

module.exports = {
  loadRoutes,
  getRouteGroups
};
