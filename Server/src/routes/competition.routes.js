/**
 * Competition Routes
 * 
 * Defines routes for competition management operations
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.8
 * 
 * @module routes/competition.routes
 */

const express = require('express');
const createAuthMiddleware = require('../middleware/auth.middleware');
const { requireAdmin, requireCoach } = require('../middleware/auth.middleware');
const { createCompetitionLockGuard } = require('../middleware/competition-lock.middleware');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const {
  createCompetition,
  updateCompetition,
  getCompetitionById,
  deleteCompetition,
  updateCompetitionStatus,
  registerTeam,
  addPlayerToTeam,
  startAgeGroup
} = require('../validators/competition.validator');

function createCompetitionRoutes(container) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(container);
  const controller = container.resolve('competitionController');
  /*
   * Every route here names its meet in the PATH, so the guard is told which
   * param to read rather than left to the token/header/body chain — an admin
   * scoped to a live meet must not be able to edit a closed one by putting its
   * id in the URL while their token still names the live one.
   *
   * The one exception is POST '/' below: there is no competition yet, so there
   * is nothing to be locked out of. A meet whose end date is already in the
   * past can still be CREATED — that is a superadmin-shaped mistake to make,
   * not a state to defend against, and it locks itself the moment it exists.
   */
  const requireUnlockedCompetition = createCompetitionLockGuard(container);

  router.post('/', authMiddleware, requireAdmin, createCompetition(), handleValidationErrors, controller.createCompetition);

/**
 * @route   GET /api/competitions
 * @desc    Get all competitions with filtering and pagination
 * @access  Authenticated users
 */
  router.get('/', authMiddleware, controller.getAllCompetitions);

/**
 * @route   GET /api/competitions/upcoming
 * @desc    Get upcoming competitions
 * @access  Public
 */
  router.get('/upcoming', controller.getUpcomingCompetitions);

/**
 * @route   GET /api/competitions/status/:status
 * @desc    Get competitions by status
 * @access  Authenticated users
 */
  router.get('/status/:status', authMiddleware, controller.getCompetitionsByStatus);

/**
 * @route   GET /api/competitions/:id
 * @desc    Get competition by ID
 * @access  Authenticated users
 */
  router.get('/:id', authMiddleware, getCompetitionById(), handleValidationErrors, controller.getCompetitionById);

/**
 * @route   PUT /api/competitions/:id
 * @desc    Update competition
 * @access  Super Admin only
 */
  router.put('/:id', authMiddleware, requireAdmin, requireUnlockedCompetition({ param: 'id' }), updateCompetition(), handleValidationErrors, controller.updateCompetition);

/**
 * @route   DELETE /api/competitions/:id
 * @desc    Delete competition
 * @access  Super Admin only
 */
  router.delete('/:id', authMiddleware, requireAdmin, requireUnlockedCompetition({ param: 'id' }), deleteCompetition(), handleValidationErrors, controller.deleteCompetition);

/**
 * @route   PATCH /api/competitions/:id/status
 * @desc    Update competition status
 * @access  Admin only
 */
  router.patch('/:id/status', authMiddleware, requireAdmin, requireUnlockedCompetition({ param: 'id' }), updateCompetitionStatus(), handleValidationErrors, controller.updateCompetitionStatus);

/**
 * @route   POST /api/competitions/:competitionId/register
 * @desc    Register team for competition
 * @access  Coach only
 */
  router.post('/:competitionId/register', authMiddleware, requireCoach, requireUnlockedCompetition({ param: 'competitionId' }), registerTeam(), handleValidationErrors, controller.registerTeam);

/**
 * @route   DELETE /api/competitions/:competitionId/register/:teamId
 * @desc    Unregister team from competition
 * @access  Coach only
 */
  router.delete('/:competitionId/register/:teamId', authMiddleware, requireCoach, requireUnlockedCompetition({ param: 'competitionId' }), controller.unregisterTeam);

/**
 * @route   POST /api/competitions/:competitionId/teams/:teamId/players
 * @desc    Add player to competition team
 * @access  Coach only
 */
  router.post('/:competitionId/teams/:teamId/players', authMiddleware, requireCoach, requireUnlockedCompetition({ param: 'competitionId' }), addPlayerToTeam(), handleValidationErrors, controller.addPlayerToTeam);

/**
 * @route   DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId
 * @desc    Remove player from competition team
 * @access  Coach only
 */
  router.delete('/:competitionId/teams/:teamId/players/:playerId', authMiddleware, requireCoach, requireUnlockedCompetition({ param: 'competitionId' }), controller.removePlayerFromTeam);

/**
 * @route   GET /api/competitions/:competitionId/teams/:teamId
 * @desc    Get team registration details
 * @access  Authenticated users
 */
  router.get('/:competitionId/teams/:teamId', authMiddleware, controller.getTeamRegistration);

/**
 * @route   GET /api/competitions/:competitionId/registrations
 * @desc    Get all registrations for a competition
 * @access  Admin only
 */
  router.get('/:competitionId/registrations', authMiddleware, requireAdmin, controller.getCompetitionRegistrations);

/**
 * @route   POST /api/competitions/:id/admins
 * @desc    Assign admin to competition
 * @access  Super Admin only
 */
  router.post('/:id/admins', authMiddleware, requireAdmin, requireUnlockedCompetition({ param: 'id' }), controller.assignAdmin);

/**
 * @route   DELETE /api/competitions/:id/admins/:adminId
 * @desc    Remove admin from competition
 * @access  Super Admin only
 */
  router.delete('/:id/admins/:adminId', authMiddleware, requireAdmin, requireUnlockedCompetition({ param: 'id' }), controller.removeAdmin);

  return router;
}

module.exports = createCompetitionRoutes;
