/**
 * Team Routes
 * 
 * Defines routes for team management endpoints
 * Uses refactored TeamController with validation middleware
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireCoach } = require('../middleware/auth.middleware');
const teamValidator = require('../validators/team.validator');
const { validationResult } = require('express-validator');

/**
 * Create team routes with dependencies from DI container
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createTeamRoutes(container) {
  const router = express.Router();

  // Create middleware instances
  const authFactory =
    createAuthMiddleware.createAuthMiddleware ||
    createAuthMiddleware.default ||
    createAuthMiddleware;
  const authMiddleware = authFactory(container);
  const coachAuth = requireCoach;

  // Get controller from DI container
  const getTeamController = () => container.resolve('teamController');

  // Validation middleware to check validation results
  const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array().reduce((acc, err) => {
            acc[err.param] = err.msg;
            return acc;
          }, {})
        }
      });
    }
    next();
  };

  /**
   * LOW-5: this sat under a "Public routes" comment with no auth middleware,
   * but `teamController.getAllTeams` calls
   * `teamService.getTeamsByCoach(req.user._id)`. With no authenticated user
   * that threw a TypeError and returned 500 — the route was broken for the
   * anonymous callers the comment invited.
   *
   * The handler is coach-scoped, so the handler was right and the comment was
   * wrong. Guarded to match. Nothing consumed it anonymously: `teamAPI.getAll`
   * in the web client is re-exported by the service barrels and imported by
   * no component; the admin and superadmin team lists use /admin/teams and
   * /superadmin/teams instead.
   */
  router.get('/', authMiddleware, coachAuth, (req, res, next) => getTeamController().getAllTeams(req, res, next));

  /**
   * These two sat under a "Public routes" comment with no auth middleware, and
   * `getTeamById` returns a full roster. Team rosters are largely minors, and
   * their ids are anonymously discoverable via GET /api/public/teams, so the
   * pair formed a walkable chain to every athlete's record.
   *
   * The payload is now allow-listed in teamService.getTeamById, but that alone
   * would still publish the roster to anyone; authentication is the other half.
   * Nothing consumed these anonymously — `teamAPI.getById`/`getStats` are
   * re-exported by the web service barrels and imported by no component — so
   * requiring a session breaks no shipped caller. Deliberately NOT coach-scoped
   * like `GET /`: admins, superadmins and judges legitimately read team detail.
   */
  router.get('/:id', authMiddleware, teamValidator.getTeamById(), validate, (req, res, next) =>
    getTeamController().getTeamById(req, res, next)
  );
  router.get('/:id/stats', authMiddleware, teamValidator.getTeamStats(), validate, (req, res, next) =>
    getTeamController().getTeamStats(req, res, next)
  );

  // Protected routes (coach only)
  router.post('/', 
    authMiddleware, 
    coachAuth, 
    teamValidator.createTeam(), 
    validate, 
    (req, res, next) => getTeamController().createTeam(req, res, next)
  );

  router.put('/:id', 
    authMiddleware, 
    coachAuth, 
    teamValidator.updateTeam(), 
    validate, 
    (req, res, next) => getTeamController().updateTeam(req, res, next)
  );

  router.delete('/:id', 
    authMiddleware, 
    coachAuth, 
    teamValidator.deleteTeam(), 
    validate, 
    (req, res, next) => getTeamController().deleteTeam(req, res, next)
  );

  // Player management routes
  router.post('/:id/players', 
    authMiddleware, 
    coachAuth, 
    teamValidator.addPlayer(), 
    validate, 
    (req, res, next) => getTeamController().addPlayer(req, res, next)
  );

  router.delete('/:id/players', 
    authMiddleware, 
    coachAuth, 
    teamValidator.removePlayer(), 
    validate, 
    (req, res, next) => getTeamController().removePlayer(req, res, next)
  );

  return router;
}

const defaultContainer = require('../infrastructure/di-container');

function teamRoutes(containerOrReq, maybeRes, maybeNext) {
  if (
    containerOrReq &&
    typeof containerOrReq === 'object' &&
    typeof containerOrReq.method === 'string' &&
    maybeRes &&
    maybeNext
  ) {
    const router = createTeamRoutes(defaultContainer);
    return router(containerOrReq, maybeRes, maybeNext);
  }
  return createTeamRoutes(containerOrReq || defaultContainer);
}

module.exports = teamRoutes;
module.exports.createTeamRoutes = createTeamRoutes;
