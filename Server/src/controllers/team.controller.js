/**
 * Team Controller
 * 
 * Handles HTTP requests for team management endpoints.
 * Delegates business logic to TeamService.
 * 
 * Requirements: 1.2, 1.5, 19.1, 19.2
 */

const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../errors');

class TeamController {
  constructor(teamService, logger) {
    this.teamService = teamService;
    this.logger = logger;
  }

  /**
   * Get all teams
   * GET /api/teams
   */
  getAllTeams = asyncHandler(async (req, res) => {
    const teams = await this.teamService.getTeamsByCoach(req.user._id);
    
    res.json({ teams });
  });

  /**
   * Get team by ID
   * GET /api/teams/:id
   */
  getTeamById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const team = await this.teamService.getTeamById(id);
    
    if (!team) {
      throw new NotFoundError('Team');
    }
    
    res.json({ team });
  });

  /**
   * Create new team
   * POST /api/teams
   */
  createTeam = asyncHandler(async (req, res) => {
    const teamData = req.body;
    const coachId = req.user._id;
    
    const team = await this.teamService.createTeam(teamData, coachId);
    
    res.status(201).json({
      message: 'Team created successfully',
      team
    });
  });

  /**
   * Update team
   * PUT /api/teams/:id
   */
  updateTeam = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const coachId = req.user._id;
    
    const team = await this.teamService.updateTeam(id, coachId, updates);
    
    res.json({
      message: 'Team updated successfully',
      team
    });
  });

  /**
   * Delete team
   * DELETE /api/teams/:id
   */
  deleteTeam = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const coachId = req.user._id;
    
    await this.teamService.deleteTeam(id, coachId);
    
    res.json({ message: 'Team deleted successfully' });
  });

  /**
   * Add player to team
   * POST /api/teams/:id/players
   */
  addPlayer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { playerId } = req.body;
    const coachId = req.user._id;
    
    const team = await this.teamService.addPlayer(id, playerId, coachId);
    
    res.json({
      message: 'Player added to team successfully',
      team
    });
  });

  /**
   * Remove player from team
   * DELETE /api/teams/:id/players
   */
  removePlayer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { playerId } = req.body;
    const coachId = req.user._id;
    
    const team = await this.teamService.removePlayer(id, playerId, coachId);
    
    res.json({
      message: 'Player removed from team successfully',
      team
    });
  });

  /**
   * Get team statistics
   * GET /api/teams/:id/stats
   */
  getTeamStats = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const team = await this.teamService.getTeamById(id);
    
    if (!team) {
      throw new NotFoundError('Team');
    }
    
    // Calculate statistics
    const stats = {
      totalPlayers: team.players.length,
      byGender: {
        male: 0,
        female: 0
      },
      byAgeGroup: {
        Under10: 0,
        Under12: 0,
        Under14: 0,
        Under16: 0,
        Under18: 0,
        Above18: 0,
        Above16: 0
      }
    };
    
    team.players.forEach(playerEntry => {
      const player = playerEntry.player;
      
      // Count by gender
      if (player.gender === 'Male') stats.byGender.male++;
      if (player.gender === 'Female') stats.byGender.female++;
      
      // Count by age group
      if (player.ageGroup && stats.byAgeGroup[player.ageGroup] !== undefined) {
        stats.byAgeGroup[player.ageGroup]++;
      }
    });
    
    res.json({ stats });
  });
}

module.exports = TeamController;
