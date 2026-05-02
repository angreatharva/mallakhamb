/**
 * Player Service
 * 
 * Service for player-specific operations.
 * Extends UserService with player-specific functionality.
 * 
 * Requirements: 1.5, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, ConflictError } = require('../../errors');

class PlayerService extends UserService {
  /**
   * Create a player service
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   */
  constructor(
    playerRepository,
    teamRepository,
    logger,
    cacheService = null,
    authenticationService = null
  ) {
    super(playerRepository, logger, 'player', cacheService);
    this.teamRepository = teamRepository;
    this.authenticationService = authenticationService;
  }

  async registerPlayer(payload) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    return this.authenticationService.register(payload, 'player');
  }

  async loginPlayer(email, password) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    return this.authenticationService.login(email, password, 'player');
  }

  async getPlayerProfile(playerId) {
    return this.getProfile(playerId);
  }

  async getPlayerTeam(playerId, competitionId) {
    const player = await this.repository.findById(playerId, { populate: 'team' });
    if (!player) {
      throw new NotFoundError('Player');
    }
    return { competitionId, team: player.team || null };
  }

  async getAvailableTeams() {
    return this.teamRepository.find(
      { isActive: true }, 
      { 
        sort: { createdAt: -1 }, 
        limit: 50,
        populate: 'coach' // Populate coach information
      }
    );
  }

  /**
   * Join a team (assign player to team)
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID
   * @param {string} competitionId - Competition ID (optional for now)
   * @returns {Promise<Object>} Result with token and team info
   */
  async joinTeam(playerId, teamId, competitionId = null) {
    try {
      // Check if player exists
      const player = await this.repository.findById(playerId);
      if (!player) {
        this.logger.warn('Join team failed: Player not found', { playerId });
        throw new NotFoundError('Player');
      }

      // Check if team exists
      const team = await this.teamRepository.findById(teamId);
      if (!team) {
        this.logger.warn('Join team failed: Team not found', { teamId });
        throw new NotFoundError('Team');
      }

      // Update player's team
      const updatedPlayer = await this.repository.updateById(playerId, { team: teamId });
      if (!updatedPlayer) {
        throw new Error('Failed to update player team');
      }

      // Generate new token with team context if authentication service is available
      let token = null;
      if (this.authenticationService) {
        try {
          // Create a new token with updated user data
          const tokenData = await this.authenticationService.generateToken({
            _id: updatedPlayer._id,
            email: updatedPlayer.email,
            team: teamId,
            competitionId: competitionId
          }, 'player');
          token = tokenData.token;
        } catch (error) {
          this.logger.warn('Failed to generate new token after joining team', { 
            playerId, 
            teamId, 
            error: error.message 
          });
          // Continue without token - not critical for the join operation
        }
      }

      this.logger.info('Player joined team successfully', { 
        playerId, 
        teamId, 
        competitionId 
      });

      return {
        token,
        team: {
          id: teamId,
          name: team.name,
          description: team.description
        },
        player: {
          id: updatedPlayer._id,
          firstName: updatedPlayer.firstName,
          lastName: updatedPlayer.lastName,
          email: updatedPlayer.email,
          team: teamId
        }
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Join team error', { 
        playerId, 
        teamId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get player profile with team information
   * @param {string} playerId - Player ID
   * @returns {Promise<Object>} Player profile with team details
   * @throws {NotFoundError} If player not found
   */
  async getProfile(playerId) {
    try {
      const player = await this.repository.findById(playerId, {
        populate: 'team'
      });

      if (!player) {
        this.logger.warn('Get player profile failed: Player not found', { playerId });
        throw new NotFoundError('Player');
      }

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = player;

      this.logger.info('Player profile retrieved', { playerId });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get player profile error', { 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Assign player to a team
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Updated player profile
   * @throws {NotFoundError} If player or team not found
   * @throws {ValidationError} If player is already in a team or team validation fails
   */
  async assignToTeam(playerId, teamId) {
    try {
      // Check if player exists
      const player = await this.repository.findById(playerId);

      if (!player) {
        this.logger.warn('Assign to team failed: Player not found', { playerId });
        throw new NotFoundError('Player');
      }

      // Check if player is already in a team
      if (player.team) {
        this.logger.warn('Assign to team failed: Player already in a team', { 
          playerId, 
          currentTeam: player.team 
        });
        throw new ValidationError('Player is already assigned to a team');
      }

      // Check if team exists
      const team = await this.teamRepository.findById(teamId);

      if (!team) {
        this.logger.warn('Assign to team failed: Team not found', { teamId });
        throw new NotFoundError('Team');
      }

      // Validate player eligibility for team (age group and gender)
      if (team.ageGroup && player.ageGroup !== team.ageGroup) {
        this.logger.warn('Assign to team failed: Age group mismatch', { 
          playerId, 
          teamId,
          playerAgeGroup: player.ageGroup,
          teamAgeGroup: team.ageGroup
        });
        throw new ValidationError(`Player age group (${player.ageGroup}) does not match team age group (${team.ageGroup})`);
      }

      if (team.gender && player.gender !== team.gender) {
        this.logger.warn('Assign to team failed: Gender mismatch', { 
          playerId, 
          teamId,
          playerGender: player.gender,
          teamGender: team.gender
        });
        throw new ValidationError(`Player gender (${player.gender}) does not match team gender (${team.gender})`);
      }

      // Update player's team
      const updatedPlayer = await this.repository.updateTeam(playerId, teamId);

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedPlayer;

      this.logger.info('Player assigned to team', { 
        playerId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Assign to team error', { 
        playerId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove player from team
   * @param {string} playerId - Player ID
   * @returns {Promise<Object>} Updated player profile
   * @throws {NotFoundError} If player not found
   * @throws {ValidationError} If player is not in a team
   */
  async removeFromTeam(playerId) {
    try {
      // Check if player exists
      const player = await this.repository.findById(playerId);

      if (!player) {
        this.logger.warn('Remove from team failed: Player not found', { playerId });
        throw new NotFoundError('Player');
      }

      // Check if player is in a team
      if (!player.team) {
        this.logger.warn('Remove from team failed: Player not in a team', { playerId });
        throw new ValidationError('Player is not assigned to any team');
      }

      const teamId = player.team;

      // Update player's team to null
      const updatedPlayer = await this.repository.updateTeam(playerId, null);

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedPlayer;

      this.logger.info('Player removed from team', { 
        playerId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Remove from team error', { 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get players by age group and gender
   * @param {string} ageGroup - Age group
   * @param {string} gender - Gender
   * @returns {Promise<Array>} Array of players
   */
  async getPlayersByAgeGroupAndGender(ageGroup, gender) {
    try {
      const players = await this.repository.findByAgeGroupAndGender(ageGroup, gender);

      // Remove passwords from response
      const playersWithoutPasswords = players.map(player => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = player;
        return profile;
      });

      this.logger.info('Players retrieved by age group and gender', { 
        ageGroup, 
        gender, 
        count: playersWithoutPasswords.length 
      });

      return playersWithoutPasswords;
    } catch (error) {
      this.logger.error('Get players by age group and gender error', { 
        ageGroup, 
        gender, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get players by team
   * @param {string} teamId - Team ID
   * @returns {Promise<Array>} Array of players in the team
   */
  async getPlayersByTeam(teamId) {
    try {
      const players = await this.repository.findByTeam(teamId);

      // Remove passwords from response
      const playersWithoutPasswords = players.map(player => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = player;
        return profile;
      });

      this.logger.info('Players retrieved by team', { 
        teamId, 
        count: playersWithoutPasswords.length 
      });

      return playersWithoutPasswords;
    } catch (error) {
      this.logger.error('Get players by team error', { 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all active players
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of active players
   */
  async getActivePlayers(options = {}) {
    try {
      const players = await this.repository.findActive(options);

      // Remove passwords from response
      const playersWithoutPasswords = players.map(player => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = player;
        return profile;
      });

      this.logger.info('Active players retrieved', { 
        count: playersWithoutPasswords.length 
      });

      return playersWithoutPasswords;
    } catch (error) {
      this.logger.error('Get active players error', { 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = PlayerService;

