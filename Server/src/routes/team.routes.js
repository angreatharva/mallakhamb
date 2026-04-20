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

  // Public routes
  router.get('/', (req, res, next) => getTeamController().getAllTeams(req, res, next));
  router.get('/:id', teamValidator.getTeamById(), validate, (req, res, next) => 
    getTeamController().getTeamById(req, res, next)
  );
  router.get('/:id/stats', teamValidator.getTeamStats(), validate, (req, res, next) => 
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
