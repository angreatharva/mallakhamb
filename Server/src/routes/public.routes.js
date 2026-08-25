/**
 * Public Routes
 *
 * Serves the anonymous public endpoints under /api/public
 * (competitions, teams, scores, Razorpay webhook).
 *
 * The three judge-facing endpoints that also live under this prefix
 * (/judges, /submitted-teams, /save-score) are NOT public: they require a
 * valid JWT and a scoring role. They stay mounted here for backward
 * compatibility with the deployed judge client, which already sends
 * `Authorization: Bearer <token>` to all three (CRIT-1, CRIT-2, CRIT-4).
 *
 * Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 *
 * @module routes/public.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/auth.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const publicValidator = require('../validators/public.validator');

/**
 * Authorization guard for the scoring endpoints hosted under /api/public.
 *
 * Admits every judge role (Senior Judge, Judge 1-4 and Scorer — `judgeType`
 * is not part of the JWT userType) plus admins and super admins, because the
 * same controller handlers back the authenticated admin and judge routers.
 * Anonymous callers are rejected with 401 by requireRole.
 */
const requireScoringAccess = requireRole('judge', 'admin', 'superadmin');

/**
 * Initialize public routes with dependencies from DI container.
 *
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createPublicRoutes(container) {
  const router = express.Router();

  const adminController = container.resolve('adminController');
  const publicController = container.resolve('publicController');
  const paymentController = container.resolve('paymentController');
  const authenticate = createAuthMiddleware(container);

  /**
   * @route   GET /api/public/competitions
   * @desc    Get all active competitions (no auth required)
   * @access  Public
   */
  router.get('/competitions', publicController.getPublicCompetitions);

  /**
   * @route   GET /api/public/cop-rules
   * @desc    COP Nov 2022 scoring constants — ceilings, element values,
   *          difficulty mixes, tolerance tiers, the 90s time-deduction table
   *          and the per-apparatus combination checklists.
   * @access  Public — deliberately anonymous. This is reference data with no
   *          competition, team or athlete information in it, and the judge
   *          client needs it before a session exists. It is declared here,
   *          above the authenticated routes below, so it is never caught by a
   *          later guard.
   *
   * Exists so `Web/src/utils/scoring/copRules.js` can stop mirroring these
   * tables by hand (MED-7). The duplication matters because the client
   * computes the slip total and posts it while the server only range-checks
   * it, so drift silently persists WRONG SCORES.
   */
  router.get('/cop-rules', publicController.getCopRules);

  /**
   * @route   GET /api/public/judges
   * @desc    Get the judge panel assigned to a competition/category
   * @access  Judge (any judgeType), Admin, SuperAdmin — 401 when anonymous
   */
  router.get('/judges', authenticate, requireScoringAccess, adminController.getJudges);

  /**
   * @route   GET /api/public/submitted-teams
   * @desc    Get submitted teams for a competition
   * @access  Judge (any judgeType), Admin, SuperAdmin — 401 when anonymous
   */
  router.get('/submitted-teams', authenticate, requireScoringAccess, adminController.getSubmittedTeams);

  /**
   * @route   GET /api/public/teams
   * @desc    Get public team listings
   * @access  Public
   */
  router.get(
    '/teams',
    publicValidator.getPublicTeams(),
    handleValidationErrors,
    publicController.getPublicTeams
  );

  /**
   * @route   GET /api/public/scores
   * @desc    Get public score data
   * @access  Public
   */
  router.get(
    '/scores',
    publicValidator.getPublicScores(),
    handleValidationErrors,
    publicController.getPublicScores
  );

  /**
   * @route   POST /api/public/save-score
   * @desc    Submit a score slip for a team/player
   * @access  Judge (any judgeType), Admin, SuperAdmin — 401 when anonymous
   */
  router.post('/save-score', authenticate, requireScoringAccess, adminController.saveScores);

  /**
   * @route   POST /api/public/payments/razorpay/webhook
   * @desc    Razorpay webhook reconciliation
   * @access  Public (verified by HMAC signature)
   */
  router.post('/payments/razorpay/webhook', paymentController.reconcileRazorpayWebhook);

  return router;
}

module.exports = createPublicRoutes;
