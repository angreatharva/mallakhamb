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
const { stripSensitiveFields } = require('../../utils/data/user-projection.util');
const { emailTypeOf } = require('../../utils/data/player-login-id.util');
const { teamAtLevel } = require('../../utils/data/player-team.util');

class PlayerService extends UserService {
  /**
   * Create a player service
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   * @param {AuthenticationService|null} authenticationService - Authentication service (optional)
   * @param {CompetitionRepository|null} competitionRepository - Competition repository (optional)
   */
  constructor(
    playerRepository,
    teamRepository,
    logger,
    cacheService = null,
    authenticationService = null,
    competitionRepository = null
  ) {
    super(playerRepository, logger, 'player', cacheService);
    this.teamRepository = teamRepository;
    this.authenticationService = authenticationService;
    this.competitionRepository = competitionRepository;
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
    const profile = await this.getProfile(playerId);
    
    // If ageGroup is null, try to get it from competition registrations
    if (!profile.ageGroup) {
      try {
        // Get competitions where this player is registered
        const competitionRepository = this.competitionRepository || 
          (this.authenticationService && this.authenticationService.competitionRepository);
        
        if (competitionRepository) {
          const competitions = await competitionRepository.find({
            'registeredTeams.players.player': playerId,
            'registeredTeams.isActive': true
          });
          
          // Find the first competition with this player and extract their age group
          for (const competition of competitions) {
            for (const registeredTeam of competition.registeredTeams || []) {
              if (!registeredTeam.isActive) continue;
              
              const playerEntry = (registeredTeam.players || []).find(
                p => p.player && p.player.toString() === playerId.toString()
              );
              
              if (playerEntry && playerEntry.ageGroup) {
                profile.ageGroup = playerEntry.ageGroup;
                break;
              }
            }
            if (profile.ageGroup) break;
          }
        }
      } catch (error) {
        this.logger.warn('Failed to populate age group from competitions', { 
          playerId, 
          error: error.message 
        });
        // Continue without age group - not critical
      }
    }
    
    return profile;
  }

  /**
   * The player's team for this meet: their team at the meet's level, else
   * (a level not chosen yet) their old single team.
   */
  async getPlayerTeam(playerId, competitionId) {
    const player = await this.repository.findById(playerId, { populate: 'team' });
    if (!player) {
      throw new NotFoundError('Player');
    }
    const level = competitionId && this.competitionRepository
      ? (await this.competitionRepository.findById(competitionId, { select: 'level' }))?.level
      : null;
    const atLevel = level ? teamAtLevel(player, level) : null;
    if (atLevel && atLevel !== String(player.team?._id || player.team || '')) {
      return { competitionId, team: await this.teamRepository.findById(atLevel) };
    }
    return { competitionId, team: player.team || null };
  }

  /**
   * The player's team at one level, for the Level → Team step: final when
   * set, otherwise their old team as a suggestion.
   * @returns {Promise<{level: string, team: Object|null, final: boolean, suggested: Object|null}>}
   */
  async getTeamAtLevel(playerId, level) {
    const player = await this.repository.findById(playerId);
    if (!player) throw new NotFoundError('Player');
    const card = async (id) => {
      if (!id) return null;
      const team = await this.teamRepository.findById(id, { populate: { path: 'coach', select: 'firstName lastName' } });
      return team ? { _id: team._id, name: team.name, coach: team.coach ? { name: [team.coach.firstName, team.coach.lastName].filter(Boolean).join(' ') } : null } : null;
    };
    const held = teamAtLevel(player, level);
    if (held) return { level, team: await card(held), final: true, suggested: null };
    return { level, team: null, final: false, suggested: await card(player.team) };
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
  async joinTeam(playerId, teamId, competitionId = null, { level = null } = {}) {
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

      /*
       * A player's team is final at each level. With a level (the player chose
       * it on the level step, or the meet names one) the team becomes theirs
       * there — refused if another team already is. Without one, joining is
       * only allowed while the player is on no team at all: it never moves them.
       */
      let joinLevel = level;
      if (!joinLevel && competitionId && this.competitionRepository) {
        joinLevel = (await this.competitionRepository.findById(competitionId, { select: 'level' }))?.level || null;
      }
      let updatedPlayer;
      if (joinLevel && this.playerTeamService) {
        ({ player: updatedPlayer } = await this.playerTeamService.setTeamAtLevel({
          player, teamId, level: joinLevel, actor: { id: playerId, type: 'player' }, via: 'join-team',
        }));
      } else {
        await this.playerTeamService?.assertRosterAdd(player, teamId);
        updatedPlayer = await this.repository.updateById(playerId, { team: teamId });
      }
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

      // A player with no email has no inbox for their Player ID; the coach of
      // the team they just joined gets it instead. Only on a real change of
      // team, so re-joining the same team does not mail the coach again.
      if (emailTypeOf(player) === 'none' && team.coach && String(player.team || '') !== String(teamId)) {
        this.authenticationService?.otpService?.notifyCoachOfPlayerId?.(team.coach, updatedPlayer, 'joined-team', team.name);
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
          team: updatedPlayer.team || teamId,
          levelTeams: updatedPlayer.levelTeams || []
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
      const profile = stripSensitiveFields(player);

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
      const profile = stripSensitiveFields(updatedPlayer);

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
      const profile = stripSensitiveFields(updatedPlayer);

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
        const profile = stripSensitiveFields(player);
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
        const profile = stripSensitiveFields(player);
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
        const profile = stripSensitiveFields(player);
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

