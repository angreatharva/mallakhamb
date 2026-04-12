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
const { authMiddleware } = require('../../middleware/authMiddleware');
const { handleExpressValidationErrors } = require('../../middleware/errorHandler');
const scoringValidators = require('../validators/scoring.validator');

// Import legacy controller (will be refactored in future tasks)
const {
  submitScore,
  updateScore,
  deleteScore,
  getScoreById,
  getScoresByCompetition,
  lockScore,
  unlockScore
} = require('../../controllers/scoringController');

/**
 * Initialize scoring routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createScoringRoutes(container) {
  const router = express.Router();

  // All scoring routes require authentication
  router.use(authMiddleware);

  /**
   * @route   POST /api/scoring
   * @desc    Submit a new score
   * @access  Authenticated users (judges, admins)
   */
  router.post(
    '/',
    scoringValidators.submitScore(),
    handleExpressValidationErrors,
    submitScore
  );

  /**
   * @route   GET /api/scoring/:scoreId
   * @desc    Get score by ID
   * @access  Authenticated users
   */
  router.get(
    '/:scoreId',
    scoringValidators.getScoreById(),
    handleExpressValidationErrors,
    getScoreById
  );

  /**
   * @route   PUT /api/scoring/:scoreId
   * @desc    Update existing score
   * @access  Authenticated users (judges, admins)
   */
  router.put(
    '/:scoreId',
    scoringValidators.updateScore(),
    handleExpressValidationErrors,
    updateScore
  );

  /**
   * @route   DELETE /api/scoring/:scoreId
   * @desc    Delete score
   * @access  Authenticated users (admins only)
   */
  router.delete(
    '/:scoreId',
    scoringValidators.deleteScore(),
    handleExpressValidationErrors,
    deleteScore
  );

  /**
   * @route   GET /api/scoring/competition/:competitionId
   * @desc    Get all scores for a competition
   * @access  Authenticated users
   */
  router.get(
    '/competition/:competitionId',
    scoringValidators.getScoresByCompetition(),
    handleExpressValidationErrors,
    getScoresByCompetition
  );

  /**
   * @route   PATCH /api/scoring/:scoreId/lock
   * @desc    Lock score to prevent further edits
   * @access  Authenticated users (admins only)
   */
  router.patch(
    '/:scoreId/lock',
    scoringValidators.getScoreById(),
    handleExpressValidationErrors,
    lockScore
  );

  /**
   * @route   PATCH /api/scoring/:scoreId/unlock
   * @desc    Unlock score to allow edits
   * @access  Authenticated users (admins only)
   */
  router.patch(
    '/:scoreId/unlock',
    scoringValidators.getScoreById(),
    handleExpressValidationErrors,
    unlockScore
  );

  return router;
}

module.exports = createScoringRoutes;
