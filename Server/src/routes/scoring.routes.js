/**
 * Scoring Routes
 * 
 * Defines routes for scoring operations:
 * - Submit, update, and delete scores
 * - Retrieve scores by competition
 * - Lock and unlock scores
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/scoring.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireAdmin, requireJudge } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const scoringValidators = require('../validators/scoring.validator');

/**
 * Initialize scoring routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createScoringRoutes(container) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container);
  const scoringService = container.resolve('scoringService');

  router.use(authMiddleware);

  /**
   * @route   POST /api/scoring
   * @desc    Submit a new score
   * @access  Authenticated users (judges, admins)
   */
  router.post(
    '/',
    scoringValidators.submitScore(),
    handleValidationErrors,
    requireJudge,
    asyncHandler(async (req, res) => {
      const score = await scoringService.submitScore(req.body);
      res.status(201).json({ success: true, data: score });
    })
  );

  /**
   * @route   GET /api/scoring/:scoreId
   * @desc    Get score by ID
   * @access  Authenticated users
   */
  router.get(
    '/:scoreId',
    scoringValidators.getScoreById(),
    handleValidationErrors,
    asyncHandler(async (req, res) => {
      const score = await scoringService.getScoreById(req.params.scoreId);
      res.json({ success: true, data: score });
    })
  );

  /**
   * @route   PUT /api/scoring/:scoreId
   * @desc    Update existing score
   * @access  Authenticated users (judges, admins)
   */
  router.put(
    '/:scoreId',
    scoringValidators.updateScore(),
    handleValidationErrors,
    requireJudge,
    asyncHandler(async (req, res) => {
      const score = await scoringService.updateScore(req.params.scoreId, req.body);
      res.json({ success: true, data: score });
    })
  );

  /**
   * @route   DELETE /api/scoring/:scoreId
   * @desc    Delete score
   * @access  Authenticated users (admins only)
   */
  router.delete(
    '/:scoreId',
    scoringValidators.deleteScore(),
    handleValidationErrors,
    requireAdmin,
    asyncHandler(async (req, res) => {
      await scoringService.deleteScore(req.params.scoreId);
      res.json({ success: true, message: 'Score deleted successfully' });
    })
  );

  /**
   * @route   GET /api/scoring/competition/:competitionId
   * @desc    Get all scores for a competition
   * @access  Authenticated users
   */
  router.get(
    '/competition/:competitionId',
    scoringValidators.getScoresByCompetition(),
    handleValidationErrors,
    asyncHandler(async (req, res) => {
      const scores = await scoringService.getScoresByCompetition(req.params.competitionId, req.query);
      res.json({ success: true, data: scores });
    })
  );

  /**
   * @route   PATCH /api/scoring/:scoreId/lock
   * @desc    Lock score to prevent further edits
   * @access  Authenticated users (admins only)
   */
  router.patch(
    '/:scoreId/lock',
    scoringValidators.getScoreById(),
    handleValidationErrors,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const score = await scoringService.lockScore(req.params.scoreId);
      res.json({ success: true, data: score });
    })
  );

  /**
   * @route   PATCH /api/scoring/:scoreId/unlock
   * @desc    Unlock score to allow edits
   * @access  Authenticated users (admins only)
   */
  router.patch(
    '/:scoreId/unlock',
    scoringValidators.getScoreById(),
    handleValidationErrors,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const score = await scoringService.unlockScore(req.params.scoreId);
      res.json({ success: true, data: score });
    })
  );

  return router;
}

module.exports = createScoringRoutes;
