/**
 * Judge Routes
 * 
 * Route definitions for judge endpoints.
 * 
 * Requirements: 14.1, 14.2, 14.3
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireJudge, requireSequenceManager } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const judgeValidator = require('../validators/judge.validator');
const performanceOrderValidator = require('../validators/performance-order.validator');

/**
 * Initialize judge routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createJudgeRoutes(container) {
  const router = express.Router();
  const judgeController = container.resolve('judgeController');
  const adminController = container.resolve('adminController');
  const performanceOrderController = container.resolve('performanceOrderController');
  const authenticate = createAuthMiddleware(container);

  // Authentication
  router.post('/login',
    judgeValidator.login(),
    handleValidationErrors,
    judgeController.login
  );

  /**
   * @route  POST /api/judge/register
   * @desc   Judge self-registration, the same way a coach or player registers.
   * @access Public — a new account holds no assignments, and an account with
   *         no assignments can read nothing about any competition.
   */
  router.post('/register',
    judgeValidator.register(),
    handleValidationErrors,
    judgeController.register
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

  router.put('/profile/password',
    authenticate,
    requireJudge,
    judgeValidator.changePassword(),
    handleValidationErrors,
    judgeController.changePassword
  );

  /**
   * @route  GET /api/judge/assignments
   * @desc   Every panel this judge sits on, across competitions.
   * @access The judge themselves.
   */
  router.get('/assignments',
    authenticate,
    requireJudge,
    judgeController.getAssignments
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
  /*
   * GET /api/judge/teams is gone.
   *
   * It queried `Team` by competition, ageGroup, gender and isSubmitted — none
   * of which are paths on Team, because entry is recorded in
   * `Competition.registeredTeams`. It therefore returned an empty list to every
   * caller for its whole existence, via an unindexed collection scan.
   *
   * Not rewritten, because the working equivalent already exists and is what
   * the judge client actually calls: GET /api/public/submitted-teams (see
   * Web/src/services/public/judge.api.js, which has no binding for this path at
   * all). Two endpoints for one question, one of which never answered it, is
   * worse than one.
   */

  router.get('/teams/:teamId/players',
    authenticate,
    requireJudge,
    judgeValidator.getTeamPlayers(),
    handleValidationErrors,
    judgeController.getTeamPlayers
  );

  /*
   * POST /api/judge/scores, PUT /api/judge/scores/:scoreId and
   * GET /api/judge/scores/my are gone.
   *
   * They were a SECOND, incompatible way to write the score collection: a flat
   * `{ player, judge, score }` document on a 0-100 scale, against a schema that
   * has none of those paths and stores marks 0-10 inside
   * `playerScores[].judgeScores`. Strict mode dropped every field on write and
   * the `my` read threw StrictPopulateError, so one endpoint stored nothing and
   * the other answered 500 — for their entire existence.
   *
   * Not rewritten, because the working equivalent is right below and is what the
   * judge client calls: POST /scores/save, the shared COP handler that resolves
   * the caller's panel seat, merges judgeSlips by role and honours the finalize
   * lock. See judge.service.js for the full note.
   */

  // Scorer interface endpoints
  router.get('/scores/team',
    authenticate,
    requireJudge,
    adminController.getTeamScores
  );

  router.get('/judges',
    authenticate,
    requireJudge,
    adminController.getJudges
  );

  router.get('/judges/summary',
    authenticate,
    requireJudge,
    adminController.getAllJudgesSummary
  );

  router.post('/scores/save',
    authenticate,
    requireJudge,
    adminController.saveScores
  );

  // ==================== Running Order ====================

  /**
   * @route  GET /api/judge/lots
   * @desc   The category's running order.
   * @access ANY judge on the panel — the four evaluation judges have to be
   *         able to read the order they are judging to, they just cannot
   *         change it. `requireJudge`, not `requireSequenceManager`.
   */
  router.get('/lots',
    authenticate,
    requireJudge,
    performanceOrderValidator.getOrder(),
    handleValidationErrors,
    performanceOrderController.getOrder
  );

  /**
   * @route  PUT /api/judge/lots/teams
   * @desc   Re-sequence the teams by drag-and-drop.
   * @access Senior Judge / Scorer of THIS panel. The middleware checks the
   *         role; the controller then calls
   *         `assertJudgeMaySequence`, which checks the assignment. Both are
   *         needed — see the note on requireSequenceManager.
   */
  router.put('/lots/teams',
    authenticate,
    requireJudge,
    requireSequenceManager,
    performanceOrderValidator.setTeamOrder(),
    handleValidationErrors,
    performanceOrderController.setTeamOrder
  );

  /**
   * @route  PUT /api/judge/lots/players
   * @desc   Re-sequence one team's athletes by drag-and-drop.
   * @access Senior Judge / Scorer of THIS panel (see above).
   */
  router.put('/lots/players',
    authenticate,
    requireJudge,
    requireSequenceManager,
    performanceOrderValidator.setPlayerOrder(),
    handleValidationErrors,
    performanceOrderController.setPlayerOrder
  );

  return router;
}

module.exports = createJudgeRoutes;
