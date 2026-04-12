/**
 * Competition Controller
 * 
 * Handles HTTP requests for competition management operations.
 * Delegates business logic to CompetitionService and RegistrationService.
 * 
 * @module controllers/competition.controller
 */

const { asyncHandler } = require('../middleware/error.middleware');
const { 
  AuthenticationError, 
  AuthorizationError, 
  NotFoundError, 
  ValidationError,
  ConflictError 
} = require('../errors');

/**
 * Competition Controller Class
 */
class CompetitionController {
  /**
   * @param {Object} competitionService - Competition service instance
   * @param {Object} registrationService - Registration service instance
   * @param {Object} logger - Logger instance
   */
  constructor(competitionService, registrationService, logger) {
    this.competitionService = competitionService;
    this.registrationService = registrationService;
    this.logger = logger;
  }

  /**
   * Create a new competition
   * POST /api/competitions
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  createCompetition = asyncHandler(async (req, res) => {
    const { 
      name, 
      level, 
      place, 
      year, 
      startDate, 
      endDate, 
      description, 
      admins, 
      ageGroups, 
      competitionTypes 
    } = req.body;

    const createdBy = req.user._id;

    this.logger.info('Creating competition', { 
      name, 
      level, 
      place, 
      year, 
      createdBy 
    });

    const competition = await this.competitionService.createCompetition(
      {
        name,
        level,
        place,
        year,
        startDate,
        endDate,
        description,
        admins,
        ageGroups,
        competitionTypes
      },
      createdBy
    );

    this.logger.info('Competition created successfully', { 
      competitionId: competition._id 
    });

    res.status(201).json({
      message: 'Competition created successfully',
      competition
    });
  });

  /**
   * Get all competitions with filtering and pagination
   * GET /api/competitions
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getAllCompetitions = asyncHandler(async (req, res) => {
    const { 
      search, 
      level, 
      status, 
      year, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    
    if (search) {
      filters.search = search;
    }
    
    if (level) {
      filters.level = level;
    }
    
    if (status) {
      filters.status = status;
    }
    
    if (year) {
      filters.year = parseInt(year);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
    };

    this.logger.debug('Fetching competitions', { filters, options });

    const result = await this.competitionService.getCompetitions(filters, options);

    res.status(200).json({
      message: 'Competitions retrieved successfully',
      ...result
    });
  });

  /**
   * Get competition by ID
   * GET /api/competitions/:id
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getCompetitionById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    this.logger.debug('Fetching competition by ID', { competitionId: id });

    const competition = await this.competitionService.getCompetitionById(id);

    if (!competition) {
      throw new NotFoundError('Competition', id);
    }

    res.status(200).json({
      message: 'Competition retrieved successfully',
      competition
    });
  });

  /**
   * Update competition
   * PUT /api/competitions/:id
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  updateCompetition = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    this.logger.info('Updating competition', { 
      competitionId: id, 
      updates: Object.keys(updates) 
    });

    const competition = await this.competitionService.updateCompetition(id, updates);

    if (!competition) {
      throw new NotFoundError('Competition', id);
    }

    this.logger.info('Competition updated successfully', { competitionId: id });

    res.status(200).json({
      message: 'Competition updated successfully',
      competition
    });
  });

  /**
   * Delete competition
   * DELETE /api/competitions/:id
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  deleteCompetition = asyncHandler(async (req, res) => {
    const { id } = req.params;

    this.logger.info('Deleting competition', { competitionId: id });

    await this.competitionService.deleteCompetition(id);

    this.logger.info('Competition deleted successfully', { competitionId: id });

    res.status(200).json({
      message: 'Competition deleted successfully'
    });
  });

  /**
   * Update competition status
   * PATCH /api/competitions/:id/status
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  updateCompetitionStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      throw new ValidationError('Status is required');
    }

    this.logger.info('Updating competition status', { 
      competitionId: id, 
      newStatus: status 
    });

    const competition = await this.competitionService.updateCompetitionStatus(id, status);

    if (!competition) {
      throw new NotFoundError('Competition', id);
    }

    this.logger.info('Competition status updated successfully', { 
      competitionId: id, 
      status 
    });

    res.status(200).json({
      message: 'Competition status updated successfully',
      competition
    });
  });

  /**
   * Get upcoming competitions
   * GET /api/competitions/upcoming
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getUpcomingCompetitions = asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;

    const options = {
      limit: parseInt(limit)
    };

    this.logger.debug('Fetching upcoming competitions', { options });

    const competitions = await this.competitionService.getUpcomingCompetitions(options);

    res.status(200).json({
      message: 'Upcoming competitions retrieved successfully',
      competitions,
      count: competitions.length
    });
  });

  /**
   * Get competitions by status
   * GET /api/competitions/status/:status
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getCompetitionsByStatus = asyncHandler(async (req, res) => {
    const { status } = req.params;
    const { limit = 10, page = 1 } = req.query;

    const options = {
      limit: parseInt(limit),
      page: parseInt(page)
    };

    this.logger.debug('Fetching competitions by status', { status, options });

    const result = await this.competitionService.getCompetitionsByStatus(status, options);

    res.status(200).json({
      message: `${status} competitions retrieved successfully`,
      ...result
    });
  });

  /**
   * Register team for competition
   * POST /api/competitions/:competitionId/register
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  registerTeam = asyncHandler(async (req, res) => {
    const { competitionId } = req.params;
    const { teamId, coachId } = req.body;

    this.logger.info('Registering team for competition', { 
      competitionId, 
      teamId, 
      coachId 
    });

    const registration = await this.registrationService.registerTeam(
      competitionId,
      teamId,
      coachId
    );

    this.logger.info('Team registered successfully', { 
      competitionId, 
      teamId 
    });

    res.status(200).json({
      message: 'Team registered successfully',
      registration
    });
  });

  /**
   * Unregister team from competition
   * DELETE /api/competitions/:competitionId/register/:teamId
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  unregisterTeam = asyncHandler(async (req, res) => {
    const { competitionId, teamId } = req.params;
    const coachId = req.user._id;

    this.logger.info('Unregistering team from competition', { 
      competitionId, 
      teamId, 
      coachId 
    });

    await this.registrationService.unregisterTeam(
      competitionId,
      teamId,
      coachId
    );

    this.logger.info('Team unregistered successfully', { 
      competitionId, 
      teamId 
    });

    res.status(200).json({
      message: 'Team unregistered successfully'
    });
  });

  /**
   * Add player to competition team
   * POST /api/competitions/:competitionId/teams/:teamId/players
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  addPlayerToTeam = asyncHandler(async (req, res) => {
    const { competitionId, teamId } = req.params;
    const { playerId, ageGroup, gender } = req.body;

    this.logger.info('Adding player to competition team', { 
      competitionId, 
      teamId, 
      playerId 
    });

    const registration = await this.registrationService.addPlayerToRegistration(
      competitionId,
      teamId,
      playerId,
      ageGroup,
      gender
    );

    this.logger.info('Player added to team successfully', { 
      competitionId, 
      teamId, 
      playerId 
    });

    res.status(200).json({
      message: 'Player added to team successfully',
      registration
    });
  });

  /**
   * Remove player from competition team
   * DELETE /api/competitions/:competitionId/teams/:teamId/players/:playerId
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  removePlayerFromTeam = asyncHandler(async (req, res) => {
    const { competitionId, teamId, playerId } = req.params;

    this.logger.info('Removing player from competition team', { 
      competitionId, 
      teamId, 
      playerId 
    });

    await this.registrationService.removePlayerFromRegistration(
      competitionId,
      teamId,
      playerId
    );

    this.logger.info('Player removed from team successfully', { 
      competitionId, 
      teamId, 
      playerId 
    });

    res.status(200).json({
      message: 'Player removed from team successfully'
    });
  });

  /**
   * Get team registration details
   * GET /api/competitions/:competitionId/teams/:teamId
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getTeamRegistration = asyncHandler(async (req, res) => {
    const { competitionId, teamId } = req.params;

    this.logger.debug('Fetching team registration', { 
      competitionId, 
      teamId 
    });

    const registration = await this.registrationService.getTeamRegistration(
      competitionId,
      teamId
    );

    if (!registration) {
      throw new NotFoundError('Team registration');
    }

    res.status(200).json({
      message: 'Team registration retrieved successfully',
      registration
    });
  });

  /**
   * Get all registrations for a competition
   * GET /api/competitions/:competitionId/registrations
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getCompetitionRegistrations = asyncHandler(async (req, res) => {
    const { competitionId } = req.params;
    const { status, ageGroup, gender } = req.query;

    const filters = {};
    
    if (status) {
      filters.status = status;
    }
    
    if (ageGroup) {
      filters.ageGroup = ageGroup;
    }
    
    if (gender) {
      filters.gender = gender;
    }

    this.logger.debug('Fetching competition registrations', { 
      competitionId, 
      filters 
    });

    const registrations = await this.registrationService.getCompetitionRegistrations(
      competitionId,
      filters
    );

    res.status(200).json({
      message: 'Competition registrations retrieved successfully',
      registrations,
      count: registrations.length
    });
  });

  /**
   * Assign admin to competition
   * POST /api/competitions/:id/admins
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  assignAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      throw new ValidationError('Admin ID is required');
    }

    this.logger.info('Assigning admin to competition', { 
      competitionId: id, 
      adminId 
    });

    // This functionality would need to be added to CompetitionService
    // For now, we'll throw an error indicating it needs implementation
    throw new Error('Admin assignment functionality needs to be implemented in CompetitionService');
  });

  /**
   * Remove admin from competition
   * DELETE /api/competitions/:id/admins/:adminId
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  removeAdmin = asyncHandler(async (req, res) => {
    const { id, adminId } = req.params;

    this.logger.info('Removing admin from competition', { 
      competitionId: id, 
      adminId 
    });

    // This functionality would need to be added to CompetitionService
    // For now, we'll throw an error indicating it needs implementation
    throw new Error('Admin removal functionality needs to be implemented in CompetitionService');
  });
}

module.exports = CompetitionController;
