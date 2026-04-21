/**
 * Public Routes
 *
 * Serves unauthenticated public endpoints under /api/public.
 * Optional JWT parsing is applied via optionalAuth middleware so that
 * endpoints that benefit from competition context can use it.
 *
 * Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 *
 * @module routes/public.routes
 */

const express = require('express');
const jwt = require('jsonwebtoken');

/**
 * Optional authentication middleware.
 * Attempts JWT verification from the Authorization: Bearer header.
 * If valid, populates req.user and req.competitionId.
 * If absent or invalid, calls next() without error.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = {
        _id: decoded.id || decoded.userId,
        role: decoded.role || decoded.userType,
      };

      if (decoded.currentCompetition) {
        req.competitionId = decoded.currentCompetition;
      } else if (decoded.competitionId) {
        req.competitionId = decoded.competitionId;
      }

      next();
    } catch (tokenError) {
      // Token is invalid — continue without auth context
      next();
    }
  } catch (error) {
    // Any unexpected error — continue without auth context
    next();
  }
}

/**
 * Initialize public routes with dependencies from DI container.
 *
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createPublicRoutes(container) {
  const router = express.Router();

  const adminController = container.resolve('adminController');
  const paymentController = container.resolve('paymentController');

  /**
   * @route   GET /api/public/competitions
   * @desc    Get all active competitions (no auth required)
   * @access  Public
   */
  router.get('/competitions', adminController.getPublicCompetitions);

  /**
   * @route   GET /api/public/judges
   * @desc    Get judge information (optional competition context)
   * @access  Public (optional auth)
   */
  router.get('/judges', optionalAuth, adminController.getJudges);

  /**
   * @route   GET /api/public/submitted-teams
   * @desc    Get submitted teams (optional competition context)
   * @access  Public (optional auth)
   */
  router.get('/submitted-teams', optionalAuth, adminController.getSubmittedTeams);

  /**
   * @route   GET /api/public/teams
   * @desc    Get public team listings
   * @access  Public
   */
  router.get('/teams', adminController.getPublicTeams);

  /**
   * @route   GET /api/public/scores
   * @desc    Get public score data
   * @access  Public
   */
  router.get('/scores', adminController.getPublicScores);

  /**
   * @route   POST /api/public/save-score
   * @desc    Submit a score (optional auth for competition context)
   * @access  Public (optional auth)
   */
  router.post('/save-score', optionalAuth, adminController.saveScores);

  /**
   * @route   POST /api/public/payments/razorpay/webhook
   * @desc    Razorpay webhook reconciliation
   * @access  Public (verified by HMAC signature)
   */
  router.post('/payments/razorpay/webhook', paymentController.reconcileRazorpayWebhook);

  return router;
}

module.exports = createPublicRoutes;
