/**
 * Coach Service
 * 
 * Service for coach-specific operations.
 * Extends UserService with coach-specific functionality.
 * 
 * Requirements: 1.5, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError } = require('../../errors');

class CoachService extends UserService {
  /**
   * Create a coach service
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   */
  constructor(coachRepository, teamRepository, logger, cacheService = null) {
    super(coachRepository, logger, 'coach', cacheService);
    this.teamRepository = teamRepository;
  }

  /**
   * Get coach profile with team information
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Coach profile with team details
   * @throws {NotFoundError} If coach not found
   */
  async getProfile(coachId) {
    try {
      const coach = await this.repository.findById(coachId, {
        populate: 'team'
      });

      if (!coach) {
        this.logger.warn('Get coach profile failed: Coach not found', { coachId });
        throw new NotFoundError('Coach not found');
      }

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = coach;

      this.logger.info('Coach profile retrieved', { coachId });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get coach profile error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Assign coach to a team
   * @param {string} coachId - Coach ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Updated coach profile
   * @throws {NotFoundError} If coach or team not found
   * @throws {ValidationError} If coach is already assigned to a team
   */
  async assignToTeam(coachId, teamId) {
    try {
      // Check if coach exists
      const coach = await this.repository.findById(coachId);

      if (!coach) {
        this.logger.warn('Assign to team failed: Coach not found', { coachId });
        throw new NotFoundError('Coach not found');
      }

      // Check if coach is already assigned to a team
      if (coach.team) {
        this.logger.warn('Assign to team failed: Coach already assigned to a team', { 
          coachId, 
          currentTeam: coach.team 
        });
        throw new ValidationError('Coach is already assigned to a team');
      }

      // Check if team exists
      const team = await this.teamRepository.findById(teamId);

      if (!team) {
        this.logger.warn('Assign to team failed: Team not found', { teamId });
        throw new NotFoundError('Team not found');
      }

      // Check if team already has a coach
      if (team.coach) {
        this.logger.warn('Assign to team failed: Team already has a coach', { 
          teamId, 
          existingCoach: team.coach 
        });
        throw new ValidationError('Team already has a coach assigned');
      }

      // Update coach's team
      const updatedCoach = await this.repository.updateById(coachId, {
        team: teamId
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedCoach;

      this.logger.info('Coach assigned to team', { 
        coachId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Assign to team error', { 
        coachId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove coach from team
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Updated coach profile
   * @throws {NotFoundError} If coach not found
   * @throws {ValidationError} If coach is not assigned to a team
   */
  async removeFromTeam(coachId) {
    try {
      // Check if coach exists
      const coach = await this.repository.findById(coachId);

      if (!coach) {
        this.logger.warn('Remove from team failed: Coach not found', { coachId });
        throw new NotFoundError('Coach not found');
      }

      // Check if coach is assigned to a team
      if (!coach.team) {
        this.logger.warn('Remove from team failed: Coach not assigned to any team', { coachId });
        throw new ValidationError('Coach is not assigned to any team');
      }

      const teamId = coach.team;

      // Update coach's team to null
      const updatedCoach = await this.repository.updateById(coachId, {
        team: null
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedCoach;

      this.logger.info('Coach removed from team', { 
        coachId, 
        teamId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Remove from team error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get coach's team with players
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object|null>} Team with players or null if no team
   * @throws {NotFoundError} If coach not found
   */
  async getTeam(coachId) {
    try {
      // Check if coach exists
      const coach = await this.repository.findById(coachId);

      if (!coach) {
        this.logger.warn('Get team failed: Coach not found', { coachId });
        throw new NotFoundError('Coach not found');
      }

      // If coach has no team, return null
      if (!coach.team) {
        this.logger.info('Coach has no team', { coachId });
        return null;
      }

      // Get team with players
      const team = await this.teamRepository.findById(coach.team, {
        populate: 'players coach'
      });

      this.logger.info('Coach team retrieved', { 
        coachId, 
        teamId: coach.team 
      });

      return team;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get team error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all active coaches
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of active coaches
   */
  async getActiveCoaches(options = {}) {
    try {
      const coaches = await this.repository.findActive(options);

      // Remove passwords from response
      const coachesWithoutPasswords = coaches.map(coach => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = coach;
        return profile;
      });

      this.logger.info('Active coaches retrieved', { 
        count: coachesWithoutPasswords.length 
      });

      return coachesWithoutPasswords;
    } catch (error) {
      this.logger.error('Get active coaches error', { 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = CoachService;
