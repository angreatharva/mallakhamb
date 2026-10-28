/**
 * Registration Service
 * 
 * Handles team registration for competitions including registration,
 * unregistration, validation, and status tracking.
 * 
 * Requirements: 1.5, 1.7, 1.8
 */

const { 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  BusinessRuleError,
  AuthorizationError
} = require('../../errors');
const { pageMeta } = require('../../utils/data/pagination.util');
const { assertAgeGroup } = require('../../utils/data/age-eligibility.util');

class RegistrationService {
  /**
   * Create a registration service
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {CacheService} cacheService - Cache service
   * @param {Logger} logger - Logger instance
   */
  constructor(competitionRepository, teamRepository, cacheService, logger) {
    this.competitionRepository = competitionRepository;
    this.teamRepository = teamRepository;
    this.cacheService = cacheService;
    this.logger = logger;
  }

  /**
   * Register team for competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Updated competition with registration
   * @throws {NotFoundError} If competition or team not found
   * @throws {ConflictError} If team already registered
   * @throws {BusinessRuleError} If registration validation fails
   */
  async registerTeam(competitionId, teamId, coachId) {
    try {
      // Validate competition exists and is open for registration
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        this.logger.warn('Team registration failed: Competition not found', {
          competitionId
        });
        throw new NotFoundError('Competition', competitionId);
      }

      // Validate team exists
      const team = await this.teamRepository.findById(teamId);

      if (!team || !team.isActive) {
        this.logger.warn('Team registration failed: Team not found or inactive', {
          teamId
        });
        throw new NotFoundError('Team', teamId);
      }

      // Validate coach owns the team
      if (team.coach.toString() !== coachId.toString()) {
        this.logger.warn('Team registration failed: Coach does not own team', {
          teamId,
          coachId,
          teamCoach: team.coach
        });
        throw new BusinessRuleError('Coach does not own this team');
      }

      // Validate competition is open for registration
      if (competition.status !== 'upcoming') {
        this.logger.warn('Team registration failed: Competition not open', {
          competitionId,
          status: competition.status
        });
        throw new BusinessRuleError(
          'Competition is not open for registration',
          { status: competition.status }
        );
      }

      // Check if team is already registered
      const existingRegistration = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (existingRegistration) {
        this.logger.warn('Team registration failed: Already registered', {
          competitionId,
          teamId
        });
        throw new ConflictError('Team is already registered for this competition');
      }

      // Register team
      const updated = await this.competitionRepository.addTeam(
        competitionId,
        teamId,
        coachId
      );

      // Invalidate cache
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Team registered for competition', {
        competitionId,
        teamId,
        coachId
      });

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ConflictError || 
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Register team error', {
        competitionId,
        teamId,
        coachId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unregister team from competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition or registration not found
   * @throws {BusinessRuleError} If unregistration validation fails
   */
  async unregisterTeam(competitionId, teamId, coachId) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        this.logger.warn('Team unregistration failed: Competition not found', {
          competitionId
        });
        throw new NotFoundError('Competition', competitionId);
      }

      // Find registration
      const registration = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (!registration) {
        this.logger.warn('Team unregistration failed: Team not registered', {
          competitionId,
          teamId
        });
        throw new NotFoundError('Registration');
      }

      // Validate coach owns the team
      if (registration.coach.toString() !== coachId.toString()) {
        this.logger.warn('Team unregistration failed: Coach does not own team', {
          teamId,
          coachId,
          registrationCoach: registration.coach
        });
        throw new BusinessRuleError('Coach does not own this team');
      }

      // Don't allow unregistration if competition has started
      if (competition.status !== 'upcoming') {
        this.logger.warn('Team unregistration failed: Competition has started', {
          competitionId,
          status: competition.status
        });
        throw new BusinessRuleError(
          'Cannot unregister from competition that has started',
          { status: competition.status }
        );
      }

      // Don't allow unregistration if payment is completed
      if (registration.paymentStatus === 'completed') {
        this.logger.warn('Team unregistration failed: Payment completed', {
          competitionId,
          teamId
        });
        throw new BusinessRuleError(
          'Cannot unregister after payment is completed. Please contact admin for refund.'
        );
      }

      // Remove team
      const updated = await this.competitionRepository.removeTeam(
        competitionId,
        teamId
      );

      // Invalidate cache
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Team unregistered from competition', {
        competitionId,
        teamId,
        coachId
      });

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Unregister team error', {
        competitionId,
        teamId,
        coachId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add player to team registration
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @param {string} ageGroup - Age group
   * @param {string} gender - Gender
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition or registration not found
   * @throws {BusinessRuleError} If validation fails
   */
  async addPlayerToRegistration(competitionId, teamId, playerId, ageGroup, gender, actor = null) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        throw new NotFoundError('Competition', competitionId);
      }

      // Find registration
      const registration = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (!registration) {
        throw new NotFoundError('Team registration');
      }

      // Validate age group and gender are valid for this competition
      this.validateAgeGroupAndGender(competition, ageGroup, gender);

      // Check if registration is already submitted
      if (registration.isSubmitted) {
        throw new BusinessRuleError('Cannot modify submitted registration');
      }

      // A coach edits only their own team's squad.
      if (actor?.type === 'coach' && String(registration.coach) !== String(actor.id)) {
        throw new AuthorizationError("You can only change your own team's squad");
      }

      // A player's team is final at each level: only a player this team holds
      // (or may still take) at the meet's level is entered.
      const entered = await this.playerTeamService?.ensureForEntry({
        player: playerId,
        teamId,
        level: competition.level,
        actor: actor || { type: 'system' },
        via: 'squad-entry',
      });

      // The COP age rule: their own age group or any higher one.
      if (entered?.player) assertAgeGroup({ player: entered.player, gender, ageGroup, competition });

      // Check if player is already in registration
      const existingPlayer = registration.players.find(
        p => p.player && p.player.toString() === playerId.toString()
      );

      if (existingPlayer) {
        throw new ConflictError('Player is already in this registration');
      }

      /*
       * Written through the repository, not by mutating `registration` and
       * calling `competition.save()`. That document is `.lean()` — a plain
       * object with no `save` — so this path threw a TypeError and 500'd.
       *
       * The repository's targeted `$push` also avoids rewriting the whole
       * `registeredTeams` array, which is megabytes at a national meet and
       * which two coaches editing two squads at once would clobber.
       */
      const added = await this.competitionRepository.addPlayerToRegistration(
        competitionId,
        teamId,
        { player: playerId, ageGroup, gender }
      );

      if (!added) {
        throw new NotFoundError('Team registration');
      }

      // Invalidate cache
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Player added to registration', {
        competitionId,
        teamId,
        playerId,
        ageGroup,
        gender
      });

      // Re-read: `competition` above is the state from BEFORE the write, so
      // returning it would hand the caller a squad without the athlete they
      // just added.
      return this.competitionRepository.findById(competitionId);
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ConflictError || 
          error instanceof BusinessRuleError ||
          error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Add player to registration error', {
        competitionId,
        teamId,
        playerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Remove player from team registration
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition or registration not found
   * @throws {BusinessRuleError} If validation fails
   */
  async removePlayerFromRegistration(competitionId, teamId, playerId) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        throw new NotFoundError('Competition', competitionId);
      }

      // Find registration
      const registration = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (!registration) {
        throw new NotFoundError('Team registration');
      }

      // Check if registration is already submitted
      if (registration.isSubmitted) {
        throw new BusinessRuleError('Cannot modify submitted registration');
      }

      // Through the repository for the same reason as the add path above: the
      // document is lean, so `.save()` does not exist on it.
      await this.competitionRepository.removePlayerFromRegistration(
        competitionId,
        teamId,
        playerId
      );

      // Invalidate cache
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Player removed from registration', {
        competitionId,
        teamId,
        playerId
      });

      // Re-read, as in the add path: the local copy predates the write.
      return this.competitionRepository.findById(competitionId);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Remove player from registration error', {
        competitionId,
        teamId,
        playerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update registration status
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {Object} updates - Status updates (isSubmitted, paymentStatus, etc.)
   * @returns {Promise<Object>} Updated competition
   * @throws {NotFoundError} If competition or registration not found
   * @throws {BusinessRuleError} If validation fails
   */
  async updateRegistrationStatus(competitionId, teamId, updates) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition || competition.isDeleted) {
        throw new NotFoundError('Competition', competitionId);
      }

      // Find registration
      const registration = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (!registration) {
        throw new NotFoundError('Team registration');
      }

      // Validate updates
      if (updates.isSubmitted !== undefined) {
        // Can only submit if there are players
        if (updates.isSubmitted && registration.players.length === 0) {
          throw new BusinessRuleError('Cannot submit registration without players');
        }

        if (updates.isSubmitted) {
          updates.submittedAt = new Date();
        }
      }

      if (updates.paymentStatus) {
        const validStatuses = ['pending', 'completed', 'failed'];
        if (!validStatuses.includes(updates.paymentStatus)) {
          throw new ValidationError('Invalid payment status', {
            paymentStatus: updates.paymentStatus,
            validStatuses
          });
        }

        if (updates.paymentStatus === 'completed') {
          updates.paymentVerifiedAt = new Date();
        }
      }

      // Update registration
      const updated = await this.competitionRepository.updateRegistration(
        competitionId,
        teamId,
        updates
      );

      // Invalidate cache
      this.cacheService.delete(`competition:${competitionId}`);
      this.cacheService.deletePattern('competitions:*');

      this.logger.info('Registration status updated', {
        competitionId,
        teamId,
        updates: Object.keys(updates)
      });

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof ValidationError || 
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Update registration status error', {
        competitionId,
        teamId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get team registration for competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Registration details
   * @throws {NotFoundError} If competition or registration not found
   */
  async getTeamRegistration(competitionId, teamId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          { path: 'registeredTeams.team', select: 'name' },
          { path: 'registeredTeams.coach', select: 'name email' },
          { path: 'registeredTeams.players.player', select: 'name email ageGroup gender' }
        ]
      });

      if (!competition || competition.isDeleted) {
        throw new NotFoundError('Competition', competitionId);
      }

      const registration = competition.registeredTeams.find(
        rt => rt.team._id.toString() === teamId.toString()
      );

      if (!registration) {
        throw new NotFoundError('Team registration');
      }

      return registration;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get team registration error', {
        competitionId,
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all registrations for competition
   * @param {string} competitionId - Competition ID
   * @param {Object} filters - Filter options (isSubmitted, paymentStatus)
   * @returns {Promise<Array>} Registrations
   * @throws {NotFoundError} If competition not found
   */
  async getCompetitionRegistrations(competitionId, filters = {}) {
    try {
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          { path: 'registeredTeams.team', select: 'name' },
          { path: 'registeredTeams.coach', select: 'name email' },
          { path: 'registeredTeams.players.player', select: 'name email ageGroup gender' }
        ]
      });

      if (!competition || competition.isDeleted) {
        throw new NotFoundError('Competition', competitionId);
      }

      let registrations = competition.registeredTeams;

      // Apply filters
      if (filters.isSubmitted !== undefined) {
        registrations = registrations.filter(
          rt => rt.isSubmitted === filters.isSubmitted
        );
      }

      if (filters.paymentStatus) {
        registrations = registrations.filter(
          rt => rt.paymentStatus === filters.paymentStatus
        );
      }

      if (filters.isActive !== undefined) {
        registrations = registrations.filter(
          rt => rt.isActive === filters.isActive
        );
      }

      /*
       * Paged, because the unpaged answer is 3.9 MB on a 1000-team meet.
       *
       * The whole entry list — every team, every athlete in every team — went
       * out in one response. This endpoint IS the entry list, so unlike the
       * other large payloads there is nothing to project away; the only bound
       * available is a page.
       *
       * The slice happens after the filters above, so `total` counts what
       * matched rather than what exists. Sliced in memory rather than in the
       * database because the filters already are: making only pagination
       * database-side would page a different set than it counted.
       */
      const total = registrations.length;
      const page = Math.max(1, Number(filters.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
      const start = (page - 1) * limit;

      return {
        registrations: registrations.slice(start, start + limit),
        ...pageMeta(total, page, limit),
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get competition registrations error', {
        competitionId,
        filters,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate age group and gender for competition
   * @param {Object} competition - Competition object
   * @param {string} ageGroup - Age group
   * @param {string} gender - Gender
   * @throws {ValidationError} If validation fails
   */
  validateAgeGroupAndGender(competition, ageGroup, gender) {
    // Check if competition has age groups defined
    if (!competition.ageGroups || competition.ageGroups.length === 0) {
      // No restrictions, allow any age group and gender
      return;
    }

    // Check if the age group and gender combination is valid
    const isValid = competition.ageGroups.some(
      ag => ag.ageGroup === ageGroup && ag.gender === gender
    );

    if (!isValid) {
      throw new ValidationError(
        'Invalid age group and gender combination for this competition',
        {
          ageGroup,
          gender,
          validCombinations: competition.ageGroups
        }
      );
    }
  }
}

module.exports = RegistrationService;

