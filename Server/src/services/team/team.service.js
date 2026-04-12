/**
 * Team Service
 * 
 * Handles team management operations including CRUD operations,
 * player management, and team validation.
 * 
 * Requirements: 1.5, 1.7, 1.8
 */

const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../errors');

class TeamService {
  /**
   * Create a team service
   * @param {TeamRepository} teamRepository - Team repository
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {CacheService} cacheService - Cache service
   * @param {SocketManager} socketManager - Socket.IO manager (optional)
   * @param {Logger} logger - Logger instance
   */
  constructor(teamRepository, playerRepository, competitionRepository, cacheService, socketManager, logger) {
    this.teamRepository = teamRepository;
    this.playerRepository = playerRepository;
    this.competitionRepository = competitionRepository;
    this.cacheService = cacheService;
    this.socketManager = socketManager;
    this.logger = logger;
  }

  /**
   * Create a new team
   * @param {Object} teamData - Team data
   * @param {string} coachId - Coach ID creating the team
   * @returns {Promise<Object>} Created team
   * @throws {ValidationError} If validation fails
   * @throws {ConflictError} If team name already exists for coach
   */
  async createTeam(teamData, coachId) {
    try {
      // Validate team name
      if (!teamData.name || teamData.name.trim().length === 0) {
        throw new ValidationError('Team name is required');
      }

      // Check for duplicate team name for this coach
      const existing = await this.teamRepository.findOne({
        name: teamData.name,
        coach: coachId,
        isActive: true
      });

      if (existing) {
        this.logger.warn('Team creation failed: Duplicate team name for coach', {
          name: teamData.name,
          coachId
        });
        throw new ConflictError('Team with this name already exists for this coach');
      }

      // Create team
      const team = await this.teamRepository.create({
        ...teamData,
        coach: coachId,
        isActive: true
      });

      // Invalidate cache
      this.cacheService.deletePattern(`teams:coach:${coachId}:*`);
      this.cacheService.deletePattern('teams:*');

      this.logger.info('Team created', {
        teamId: team._id,
        name: team.name,
        coachId
      });

      // Emit Socket.IO event for real-time team creation
      if (this.socketManager) {
        this.socketManager.emitToUser(coachId, 'team_created', {
          teamId: team._id,
          name: team.name,
          coachId,
          timestamp: new Date()
        });
      }

      return team;
    } catch (error) {
      if (error instanceof ConflictError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Create team error', {
        teamData,
        coachId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update team
   * @param {string} teamId - Team ID
   * @param {string} coachId - Coach ID (for authorization)
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated team
   * @throws {NotFoundError} If team not found
   * @throws {ValidationError} If validation fails
   * @throws {BusinessRuleError} If team is not active
   */
  async updateTeam(teamId, coachId, updates) {
    try {
      // Find team
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        this.logger.warn('Team update failed: Not found or inactive', { teamId });
        throw new NotFoundError('Team', teamId);
      }

      // Verify coach ownership
      if (team.coach.toString() !== coachId.toString()) {
        this.logger.warn('Team update failed: Unauthorized', { teamId, coachId });
        throw new BusinessRuleError('You can only update your own teams');
      }

      // Check for duplicate name if name is being updated
      if (updates.name && updates.name !== team.name) {
        const existing = await this.teamRepository.findOne({
          name: updates.name,
          coach: coachId,
          isActive: true,
          _id: { $ne: teamId }
        });

        if (existing) {
          this.logger.warn('Team update failed: Duplicate team name', {
            teamId,
            name: updates.name
          });
          throw new ConflictError('Team with this name already exists for this coach');
        }
      }

      // Don't allow updating certain fields
      const { _id, coach, isActive, createdAt, updatedAt, ...allowedUpdates } = updates;

      // Update team
      const updated = await this.teamRepository.updateById(teamId, allowedUpdates);

      // Invalidate cache
      this.cacheService.delete(`team:${teamId}`);
      this.cacheService.deletePattern(`teams:coach:${coachId}:*`);
      this.cacheService.deletePattern('teams:*');

      this.logger.info('Team updated', {
        teamId,
        updates: Object.keys(allowedUpdates)
      });

      // Emit Socket.IO event for real-time team update
      if (this.socketManager) {
        this.socketManager.emitToUser(coachId, 'team_updated', {
          teamId,
          updates: allowedUpdates,
          timestamp: new Date()
        });
      }

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ValidationError || 
          error instanceof BusinessRuleError ||
          error instanceof ConflictError) {
        throw error;
      }
      this.logger.error('Update team error', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete team (soft delete)
   * @param {string} teamId - Team ID
   * @param {string} coachId - Coach ID (for authorization)
   * @returns {Promise<boolean>} True if deleted
   * @throws {NotFoundError} If team not found
   * @throws {BusinessRuleError} If team has players or is registered in competitions
   */
  async deleteTeam(teamId, coachId) {
    try {
      // Find team
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        this.logger.warn('Team delete failed: Not found or inactive', { teamId });
        throw new NotFoundError('Team', teamId);
      }

      // Verify coach ownership
      if (team.coach.toString() !== coachId.toString()) {
        this.logger.warn('Team delete failed: Unauthorized', { teamId, coachId });
        throw new BusinessRuleError('You can only delete your own teams');
      }

      // Check if team has players
      const players = await this.playerRepository.findByTeam(teamId);
      if (players && players.length > 0) {
        this.logger.warn('Team delete failed: Team has players', {
          teamId,
          playerCount: players.length
        });
        throw new BusinessRuleError(
          'Cannot delete team with players. Remove all players first.',
          { playerCount: players.length }
        );
      }

      // Soft delete
      await this.teamRepository.updateById(teamId, { isActive: false });

      // Invalidate cache
      this.cacheService.delete(`team:${teamId}`);
      this.cacheService.deletePattern(`teams:coach:${coachId}:*`);
      this.cacheService.deletePattern('teams:*');

      this.logger.info('Team deleted', { teamId });

      return true;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Delete team error', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get team by ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Team
   * @throws {NotFoundError} If team not found
   */
  async getTeamById(teamId) {
    try {
      // Try cache first
      const cacheKey = `team:${teamId}`;
      const cached = this.cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Fetch from database
      const team = await this.teamRepository.findById(teamId, {
        populate: [
          { path: 'coach', select: 'firstName lastName email' }
        ]
      });

      if (!team || !team.isActive) {
        this.logger.warn('Team not found', { teamId });
        throw new NotFoundError('Team', teamId);
      }

      // Cache result
      this.cacheService.set(cacheKey, team, 300); // 5 minutes

      return team;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get team error', {
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get teams by coach
   * @param {string} coachId - Coach ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Teams
   */
  async getTeamsByCoach(coachId, options = {}) {
    try {
      // Try cache first
      const cacheKey = `teams:coach:${coachId}:${JSON.stringify(options)}`;
      const cached = this.cacheService.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Fetch from database
      const teams = await this.teamRepository.findByCoach(coachId, options);

      // Cache result
      this.cacheService.set(cacheKey, teams, 300); // 5 minutes

      this.logger.debug('Teams fetched for coach', {
        coachId,
        count: teams.length
      });

      return teams;
    } catch (error) {
      this.logger.error('Get teams by coach error', {
        coachId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add player to team
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @param {string} coachId - Coach ID (for authorization)
   * @returns {Promise<Object>} Updated team
   * @throws {NotFoundError} If team or player not found
   * @throws {BusinessRuleError} If validation fails
   */
  async addPlayer(teamId, playerId, coachId) {
    try {
      // Find team
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        this.logger.warn('Add player failed: Team not found or inactive', { teamId });
        throw new NotFoundError('Team', teamId);
      }

      // Verify coach ownership
      if (team.coach.toString() !== coachId.toString()) {
        this.logger.warn('Add player failed: Unauthorized', { teamId, coachId });
        throw new BusinessRuleError('You can only add players to your own teams');
      }

      // Find player
      const player = await this.playerRepository.findById(playerId);

      if (!player || !player.isActive) {
        this.logger.warn('Add player failed: Player not found or inactive', { playerId });
        throw new NotFoundError('Player', playerId);
      }

      // Check if player is already on another team
      if (player.team && player.team.toString() !== teamId.toString()) {
        this.logger.warn('Add player failed: Player already on another team', {
          playerId,
          currentTeam: player.team
        });
        throw new BusinessRuleError(
          'Player is already on another team. Remove from current team first.',
          { currentTeam: player.team }
        );
      }

      // Check if player is already on this team
      if (player.team && player.team.toString() === teamId.toString()) {
        this.logger.info('Player already on this team', { playerId, teamId });
        return team;
      }

      // Add player to team
      await this.teamRepository.addPlayer(teamId, playerId);

      // Invalidate cache
      this.cacheService.delete(`team:${teamId}`);
      this.cacheService.deletePattern(`teams:coach:${coachId}:*`);
      this.cacheService.deletePattern('teams:*');

      this.logger.info('Player added to team', {
        teamId,
        playerId
      });

      // Emit Socket.IO event for real-time team roster update
      if (this.socketManager) {
        this.socketManager.emitToUser(coachId, 'team_player_added', {
          teamId,
          playerId,
          timestamp: new Date()
        });
      }

      // Return updated team
      return await this.getTeamById(teamId);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Add player error', {
        teamId,
        playerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove player from team
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @param {string} coachId - Coach ID (for authorization)
   * @returns {Promise<Object>} Updated team
   * @throws {NotFoundError} If team or player not found
   * @throws {BusinessRuleError} If validation fails
   */
  async removePlayer(teamId, playerId, coachId) {
    try {
      // Find team
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        this.logger.warn('Remove player failed: Team not found or inactive', { teamId });
        throw new NotFoundError('Team', teamId);
      }

      // Verify coach ownership
      if (team.coach.toString() !== coachId.toString()) {
        this.logger.warn('Remove player failed: Unauthorized', { teamId, coachId });
        throw new BusinessRuleError('You can only remove players from your own teams');
      }

      // Find player
      const player = await this.playerRepository.findById(playerId);

      if (!player) {
        this.logger.warn('Remove player failed: Player not found', { playerId });
        throw new NotFoundError('Player', playerId);
      }

      // Check if player is on this team
      if (!player.team || player.team.toString() !== teamId.toString()) {
        this.logger.warn('Remove player failed: Player not on this team', {
          playerId,
          teamId,
          playerTeam: player.team
        });
        throw new BusinessRuleError('Player is not on this team');
      }

      // Remove player from team
      await this.teamRepository.removePlayer(teamId, playerId);

      // Invalidate cache
      this.cacheService.delete(`team:${teamId}`);
      this.cacheService.deletePattern(`teams:coach:${coachId}:*`);
      this.cacheService.deletePattern('teams:*');

      this.logger.info('Player removed from team', {
        teamId,
        playerId
      });

      // Emit Socket.IO event for real-time team roster update
      if (this.socketManager) {
        this.socketManager.emitToUser(coachId, 'team_player_removed', {
          teamId,
          playerId,
          timestamp: new Date()
        });
      }

      // Return updated team
      return await this.getTeamById(teamId);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Remove player error', {
        teamId,
        playerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate team for competition registration
   * @param {string} teamId - Team ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Validation result { valid: boolean, errors: Array }
   */
  async validateTeamForCompetition(teamId, competitionId) {
    try {
      const errors = [];

      // Find team
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        errors.push('Team not found or inactive');
        return { valid: false, errors };
      }

      // Find competition
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        errors.push('Competition not found or deleted');
        return { valid: false, errors };
      }

      // Get team players
      const players = await this.playerRepository.findByTeam(teamId);

      if (!players || players.length === 0) {
        errors.push('Team has no players');
      }

      // Validate player eligibility (age group and gender matching competition requirements)
      if (competition.ageGroups && competition.ageGroups.length > 0) {
        const eligiblePlayers = players.filter(player => {
          return competition.ageGroups.some(ag => 
            ag.ageGroup === player.ageGroup && ag.gender === player.gender
          );
        });

        if (eligiblePlayers.length === 0) {
          errors.push('No players match competition age group and gender requirements');
        }
      }

      const valid = errors.length === 0;

      this.logger.debug('Team validation for competition', {
        teamId,
        competitionId,
        valid,
        errors
      });

      return { valid, errors };
    } catch (error) {
      this.logger.error('Validate team for competition error', {
        teamId,
        competitionId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TeamService;
