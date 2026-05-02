/**
 * Admin Routes
 * 
 * Defines routes for admin operations:
 * - Dashboard and statistics
 * - Team management
 * - Player management
 * - Judge management
 * - Score management
 * - Age group management
 * - Transaction management
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/admin.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/auth.middleware');
const { validateCompetitionContext } = require('../middleware/competition-context.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const adminValidator = require('../validators/admin.validator');

/**
 * Initialize admin routes with dependencies from DI container
 * 
 * @param {Object} container - DI container
 * @returns {Router} Express router
 */
function createAdminRoutes(container) {
  const router = express.Router();
  
  // Get middleware from container
  const authMiddleware = createAuthMiddleware(container);
  const authorize = requireAdmin;
  
  // Get controller from DI container
  const adminController = container.resolve('adminController');

  // ==================== Public Authentication Routes ====================

  /**
   * @route   POST /api/admin/register
   * @desc    Register a new admin
   * @access  Public
   */
  router.post('/register', adminController.registerAdmin);

  /**
   * @route   POST /api/admin/login
   * @desc    Login an admin
   * @access  Public
   */
  router.post('/login', adminController.loginAdmin);

  // ==================== Dashboard & Statistics ====================

  /**
   * @route   GET /api/admin/dashboard
   * @desc    Get dashboard (alias for /dashboard/stats)
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/dashboard',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getDashboardStats
  );

  /**
   * @route   GET /api/admin/dashboard/stats
   * @desc    Get dashboard statistics
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/dashboard/stats',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getDashboardStats
  );

  /**
   * @route   GET /api/admin/dashboard/competition/:competitionId
   * @desc    Get competition overview
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/dashboard/competition/:competitionId',
    authMiddleware,
    authorize,
    adminController.getCompetitionOverview
  );

  /**
   * @route   GET /api/admin/system/health
   * @desc    Get system health status
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/system/health',
    authMiddleware,
    authorize,
    adminController.getSystemHealth
  );

  // ==================== Team Management ====================

  /**
   * @route   GET /api/admin/teams/submitted
   * @desc    Get submitted teams
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/teams/submitted',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getSubmittedTeams
  );

  /**
   * @route   GET /api/admin/teams
   * @desc    Get all teams with filters and pagination
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/teams',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getAllTeams(),
    handleValidationErrors,
    adminController.getAllTeams
  );

  /**
   * @route   GET /api/admin/teams/:teamId
   * @desc    Get team details
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/teams/:teamId',
    authMiddleware,
    authorize,
    adminValidator.getTeamDetails(),
    handleValidationErrors,
    adminController.getTeamDetails
  );

  /**
   * @route   PUT /api/admin/teams/:teamId/approve
   * @desc    Approve team
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/teams/:teamId/approve',
    authMiddleware,
    authorize,
    adminValidator.approveTeam(),
    handleValidationErrors,
    adminController.approveTeam
  );

  /**
   * @route   PUT /api/admin/teams/:teamId/reject
   * @desc    Reject team
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/teams/:teamId/reject',
    authMiddleware,
    authorize,
    adminValidator.rejectTeam(),
    handleValidationErrors,
    adminController.rejectTeam
  );

  // ==================== Player Management ====================

  /**
   * @route   GET /api/admin/players
   * @desc    Get all players with filters and pagination
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/players',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getAllPlayers(),
    handleValidationErrors,
    adminController.getAllPlayers
  );

  /**
   * @route   GET /api/admin/players/:playerId
   * @desc    Get player details
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/players/:playerId',
    authMiddleware,
    authorize,
    adminValidator.getPlayerDetails(),
    handleValidationErrors,
    adminController.getPlayerDetails
  );

  /**
   * @route   PUT /api/admin/players/:playerId/status
   * @desc    Update player status
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/players/:playerId/status',
    authMiddleware,
    authorize,
    adminValidator.updatePlayerStatus(),
    handleValidationErrors,
    adminController.updatePlayerStatus
  );

  /**
   * @route   PUT /api/admin/players/:playerId/team
   * @desc    Assign player to team
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/players/:playerId/team',
    authMiddleware,
    authorize,
    adminValidator.assignPlayerToTeam(),
    handleValidationErrors,
    adminController.assignPlayerToTeam
  );

  // ==================== Judge Management ====================

  /**
   * @route   POST /api/admin/judges/bulk
   * @desc    Bulk save judges
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/judges/bulk',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.saveJudges(),
    handleValidationErrors,
    adminController.saveJudges
  );

  /**
   * @route   GET /api/admin/judges/summary
   * @desc    Get all judges summary
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/judges/summary',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getAllJudgesSummary
  );

  /**
   * @route   GET /api/admin/judges
   * @desc    Get all judges for competition
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/judges',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getJudges
  );

  /**
   * @route   POST /api/admin/judges
   * @desc    Create single judge
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/judges',
    authMiddleware,
    authorize,
    adminValidator.createSingleJudge(),
    handleValidationErrors,
    adminController.createSingleJudge
  );

  /**
   * @route   PUT /api/admin/judges/:judgeId
   * @desc    Update judge
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/judges/:judgeId',
    authMiddleware,
    authorize,
    adminValidator.updateJudge(),
    handleValidationErrors,
    adminController.updateJudge
  );

  /**
   * @route   DELETE /api/admin/judges/:judgeId
   * @desc    Delete judge
   * @access  Admin, SuperAdmin
   */
  router.delete(
    '/judges/:judgeId',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.deleteJudge(),
    handleValidationErrors,
    adminController.deleteJudge
  );

  // ==================== Score Management ====================

  /**
   * @route   PUT /api/admin/scores/unlock
   * @desc    Unlock scores for editing
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/scores/unlock',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.unlockScores(),
    handleValidationErrors,
    adminController.unlockScores
  );

  /**
   * @route   PUT /api/admin/scores/lock
   * @desc    Lock scores
   * @access  Admin, SuperAdmin
   */
  router.put(
    '/scores/lock',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.lockScores(),
    handleValidationErrors,
    adminController.lockScores
  );

  /**
   * @route   GET /api/admin/scores/team
   * @desc    Get team scores
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/scores/team',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getTeamScores(),
    handleValidationErrors,
    adminController.getTeamScores
  );

  /**
   * @route   GET /api/admin/scores/individual
   * @desc    Get individual scores
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/scores/individual',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getIndividualScores(),
    handleValidationErrors,
    adminController.getIndividualScores
  );

  /**
   * @route   POST /api/admin/scores/save
   * @desc    Save scores for a team
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/scores/save',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.saveScores
  );

  /**
   * @route   GET /api/admin/rankings/team
   * @desc    Get team rankings
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/rankings/team',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getTeamRankings(),
    handleValidationErrors,
    adminController.getTeamRankings
  );

  /**
   * @route   GET /api/admin/scores/team-rankings
   * @desc    Get team rankings (alias for /rankings/team)
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/scores/team-rankings',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getTeamRankings(),
    handleValidationErrors,
    adminController.getTeamRankings
  );

  /**
   * @route   GET /api/admin/rankings/individual
   * @desc    Get individual rankings
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/rankings/individual',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getIndividualRankings(),
    handleValidationErrors,
    adminController.getIndividualRankings
  );

  /**
   * @route   POST /api/admin/scores/recalculate
   * @desc    Recalculate scores
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/scores/recalculate',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.recalculateScores(),
    handleValidationErrors,
    adminController.recalculateScores
  );

  // ==================== Age Group Management ====================

  /**
   * @route   POST /api/admin/age-groups/:ageGroup/start
   * @desc    Start age group
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/age-groups/:ageGroup/start',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.startAgeGroup(),
    handleValidationErrors,
    adminController.startAgeGroup
  );

  /**
   * @route   POST /api/admin/age-groups/:ageGroup/end
   * @desc    End age group
   * @access  Admin, SuperAdmin
   */
  router.post(
    '/age-groups/:ageGroup/end',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.endAgeGroup(),
    handleValidationErrors,
    adminController.endAgeGroup
  );

  /**
   * @route   GET /api/admin/age-groups/status
   * @desc    Get age group status
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/age-groups/status',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getAgeGroupStatus
  );

  // ==================== Transaction Management ====================

  /**
   * @route   GET /api/admin/transactions/summary
   * @desc    Get payment summary
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/transactions/summary',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminController.getPaymentSummary
  );

  /**
   * @route   GET /api/admin/transactions
   * @desc    Get transactions with filters and pagination
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/transactions',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getTransactions(),
    handleValidationErrors,
    adminController.getTransactions
  );

  /**
   * @route   GET /api/admin/transactions/:transactionId
   * @desc    Get transaction details
   * @access  Admin, SuperAdmin
   */
  router.get(
    '/transactions/:transactionId',
    authMiddleware,
    authorize,
    validateCompetitionContext,
    adminValidator.getTransactionDetails(),
    handleValidationErrors,
    adminController.getTransactionDetails
  );

  return router;
}

module.exports = createAdminRoutes;
