/**
 * Judge Routes
 * 
 * Route definitions for judge endpoints.
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireJudge } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const judgeValidator = require('../validators/judge.validator');

/**
 * Initialize judge routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createJudgeRoutes(container) {
  const router = express.Router();
  const judgeController = container.resolve('judgeController');
  const authenticate = createAuthMiddleware(container);

  // Authentication
  router.post('/login',
    judgeValidator.login(),
    handleValidationErrors,
    judgeController.login
  );

  // Profile Management
  router.get('/profile',
    authenticate,
    requireJudge,
    judgeController.getProfile
  );

  router.put('/profile',
    authenticate,
    requireJudge,
    judgeValidator.updateProfile(),
    handleValidationErrors,
    judgeController.updateProfile
  );

  // Competition Management
  router.get('/competitions',
    authenticate,
    requireJudge,
    judgeController.getAssignedCompetitions
  );

  router.put('/competition/:competitionId/set',
    authenticate,
    requireJudge,
    judgeValidator.setCompetitionContext(),
    handleValidationErrors,
    judgeController.setCompetitionContext
  );

  router.get('/competition/:competitionId',
    authenticate,
    requireJudge,
    judgeValidator.getCompetitionDetails(),
    handleValidationErrors,
    judgeController.getCompetitionDetails
  );

  // Scoring Interface
  router.get('/teams',
    authenticate,
    requireJudge,
    judgeValidator.getAvailableTeams(),
    handleValidationErrors,
    judgeController.getAvailableTeams
  );

  router.get('/teams/:teamId/players',
    authenticate,
    requireJudge,
    judgeValidator.getTeamPlayers(),
    handleValidationErrors,
    judgeController.getTeamPlayers
  );

  router.post('/scores',
    authenticate,
    requireJudge,
    judgeValidator.saveIndividualScore(),
    handleValidationErrors,
    judgeController.saveIndividualScore
  );

  router.put('/scores/:scoreId',
    authenticate,
    requireJudge,
    judgeValidator.updateIndividualScore(),
    handleValidationErrors,
    judgeController.updateIndividualScore
  );

  router.get('/scores/my',
    authenticate,
    requireJudge,
    judgeController.getMyScores
  );

  return router;
}

module.exports = createJudgeRoutes;
