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
  router.put('/:id', authMiddleware, requireAdmin, updateCompetition(), handleValidationErrors, controller.updateCompetition);

/**
 * @route   DELETE /api/competitions/:id
 * @desc    Delete competition
 * @access  Super Admin only
 */
  router.delete('/:id', authMiddleware, requireAdmin, deleteCompetition(), handleValidationErrors, controller.deleteCompetition);

/**
 * @route   PATCH /api/competitions/:id/status
 * @desc    Update competition status
 * @access  Admin only
 */
  router.patch('/:id/status', authMiddleware, requireAdmin, updateCompetitionStatus(), handleValidationErrors, controller.updateCompetitionStatus);

/**
 * @route   POST /api/competitions/:competitionId/register
 * @desc    Register team for competition
 * @access  Coach only
 */
  router.post('/:competitionId/register', authMiddleware, requireCoach, registerTeam(), handleValidationErrors, controller.registerTeam);

/**
 * @route   DELETE /api/competitions/:competitionId/register/:teamId
 * @desc    Unregister team from competition
 * @access  Coach only
 */
  router.delete('/:competitionId/register/:teamId', authMiddleware, requireCoach, controller.unregisterTeam);

/**
 * @route   POST /api/competitions/:competitionId/teams/:teamId/players
 * @desc    Add player to competition team
 * @access  Coach only
 */
  router.post('/:competitionId/teams/:teamId/players', authMiddleware, requireCoach, addPlayerToTeam(), handleValidationErrors, controller.addPlayerToTeam);

/**
 * @route   DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId
 * @desc    Remove player from competition team
 * @access  Coach only
 */
  router.delete('/:competitionId/teams/:teamId/players/:playerId', authMiddleware, requireCoach, controller.removePlayerFromTeam);

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
  router.post('/:id/admins', authMiddleware, requireAdmin, controller.assignAdmin);

/**
 * @route   DELETE /api/competitions/:id/admins/:adminId
 * @desc    Remove admin from competition
 * @access  Super Admin only
 */
  router.delete('/:id/admins/:adminId', authMiddleware, requireAdmin, controller.removeAdmin);

  return router;
}

module.exports = createCompetitionRoutes;
