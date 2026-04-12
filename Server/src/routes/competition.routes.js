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
const router = express.Router();
const container = require('../infrastructure/di-container');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const {
  createCompetition,
  updateCompetition,
  getCompetitionById,
  deleteCompetition,
  registerTeam,
  addPlayerToTeam,
  startAgeGroup
} = require('../validators/competition.validator');

// Get controller from DI container
const getController = () => container.resolve('competitionController');

/**
 * @route   POST /api/competitions
 * @desc    Create a new competition
 * @access  Super Admin only
 */
router.post(
  '/',
  createCompetition(),
  handleValidationErrors,
  (req, res, next) => getController().createCompetition(req, res, next)
);

/**
 * @route   GET /api/competitions
 * @desc    Get all competitions with filtering and pagination
 * @access  Authenticated users
 */
router.get(
  '/',
  (req, res, next) => getController().getAllCompetitions(req, res, next)
);

/**
 * @route   GET /api/competitions/upcoming
 * @desc    Get upcoming competitions
 * @access  Public
 */
router.get(
  '/upcoming',
  (req, res, next) => getController().getUpcomingCompetitions(req, res, next)
);

/**
 * @route   GET /api/competitions/status/:status
 * @desc    Get competitions by status
 * @access  Authenticated users
 */
router.get(
  '/status/:status',
  (req, res, next) => getController().getCompetitionsByStatus(req, res, next)
);

/**
 * @route   GET /api/competitions/:id
 * @desc    Get competition by ID
 * @access  Authenticated users
 */
router.get(
  '/:id',
  getCompetitionById(),
  handleValidationErrors,
  (req, res, next) => getController().getCompetitionById(req, res, next)
);

/**
 * @route   PUT /api/competitions/:id
 * @desc    Update competition
 * @access  Super Admin only
 */
router.put(
  '/:id',
  updateCompetition(),
  handleValidationErrors,
  (req, res, next) => getController().updateCompetition(req, res, next)
);

/**
 * @route   DELETE /api/competitions/:id
 * @desc    Delete competition
 * @access  Super Admin only
 */
router.delete(
  '/:id',
  deleteCompetition(),
  handleValidationErrors,
  (req, res, next) => getController().deleteCompetition(req, res, next)
);

/**
 * @route   PATCH /api/competitions/:id/status
 * @desc    Update competition status
 * @access  Admin only
 */
router.patch(
  '/:id/status',
  (req, res, next) => getController().updateCompetitionStatus(req, res, next)
);

/**
 * @route   POST /api/competitions/:competitionId/register
 * @desc    Register team for competition
 * @access  Coach only
 */
router.post(
  '/:competitionId/register',
  registerTeam(),
  handleValidationErrors,
  (req, res, next) => getController().registerTeam(req, res, next)
);

/**
 * @route   DELETE /api/competitions/:competitionId/register/:teamId
 * @desc    Unregister team from competition
 * @access  Coach only
 */
router.delete(
  '/:competitionId/register/:teamId',
  (req, res, next) => getController().unregisterTeam(req, res, next)
);

/**
 * @route   POST /api/competitions/:competitionId/teams/:teamId/players
 * @desc    Add player to competition team
 * @access  Coach only
 */
router.post(
  '/:competitionId/teams/:teamId/players',
  addPlayerToTeam(),
  handleValidationErrors,
  (req, res, next) => getController().addPlayerToTeam(req, res, next)
);

/**
 * @route   DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId
 * @desc    Remove player from competition team
 * @access  Coach only
 */
router.delete(
  '/:competitionId/teams/:teamId/players/:playerId',
  (req, res, next) => getController().removePlayerFromTeam(req, res, next)
);

/**
 * @route   GET /api/competitions/:competitionId/teams/:teamId
 * @desc    Get team registration details
 * @access  Authenticated users
 */
router.get(
  '/:competitionId/teams/:teamId',
  (req, res, next) => getController().getTeamRegistration(req, res, next)
);

/**
 * @route   GET /api/competitions/:competitionId/registrations
 * @desc    Get all registrations for a competition
 * @access  Admin only
 */
router.get(
  '/:competitionId/registrations',
  (req, res, next) => getController().getCompetitionRegistrations(req, res, next)
);

/**
 * @route   POST /api/competitions/:id/admins
 * @desc    Assign admin to competition
 * @access  Super Admin only
 */
router.post(
  '/:id/admins',
  (req, res, next) => getController().assignAdmin(req, res, next)
);

/**
 * @route   DELETE /api/competitions/:id/admins/:adminId
 * @desc    Remove admin from competition
 * @access  Super Admin only
 */
router.delete(
  '/:id/admins/:adminId',
  (req, res, next) => getController().removeAdmin(req, res, next)
);

module.exports = router;
