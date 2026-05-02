/**
 * Coach Service
 * 
 * Service for coach-specific operations.
 * Extends UserService with coach-specific functionality.
 * 
 * Requirements: 1.5, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../errors');

class CoachService extends UserService {
  /**
   * Create a coach service
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {TeamRepository} teamRepository - Team repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   */
  constructor(
    coachRepository,
    teamRepository,
    logger,
    cacheService = null,
    authenticationService = null,
    competitionRepository = null,
    playerRepository = null,
    config = null
  ) {
    super(coachRepository, logger, 'coach', cacheService);
    this.teamRepository = teamRepository;
    this.authenticationService = authenticationService;
    this.competitionRepository = competitionRepository;
    this.playerRepository = playerRepository;
    this.config = config;
  }

  async registerCoach(payload) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    return this.authenticationService.register(payload, 'coach');
  }

  async loginCoach(email, password) {
    if (!this.authenticationService) {
      throw new ValidationError('Authentication service is not configured');
    }
    
    // Perform login - do NOT auto-set competition context
    // Coach should always choose competition after login
    const loginResult = await this.authenticationService.login(email, password, 'coach');
    
    this.logger?.info?.('Coach login successful, will select competition next', {
      coachId: loginResult.user._id || loginResult.coach._id
    });
    
    return loginResult;
  }

  async getCoachProfile(coachId) {
    return this.getProfile(coachId);
  }

  async getCoachStatus(coachId) {
    const teams = await this.getCoachTeams(coachId);
    
    // If no teams, need to create team
    if (teams.length === 0) {
      return {
        hasTeam: false,
        hasCompetition: false,
        step: 'create-team',
        teamCount: 0,
      };
    }
    
    // Check if any team is registered for a competition
    let hasCompetition = false;
    if (this.competitionRepository) {
      try {
        // Check if any competition has this coach's team registered
        const competitions = await this.competitionRepository.find({
          'registeredTeams.coach': coachId,
          isDeleted: false
        });
        hasCompetition = competitions.length > 0;
      } catch (error) {
        this.logger?.warn?.('Failed to check competition registration', { coachId, error: error.message });
      }
    }
    
    return {
      hasTeam: true,
      hasCompetition,
      step: hasCompetition ? 'dashboard' : 'select-competition',
      teamCount: teams.length,
    };
  }

  async getCoachTeams(coachId) {
    return this.teamRepository.find({ coach: coachId, isActive: true }, { sort: { createdAt: -1 } });
  }

  async createTeam(coachId, teamData) {
    if (!teamData || typeof teamData !== 'object') {
      throw new ValidationError('Team data is required');
    }
    
    // Create the team
    const created = await this.teamRepository.create({
      ...teamData,
      coach: coachId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Update coach to reference this team
    try {
      await this.repository.updateById(coachId, { team: created._id });
      this.logger?.info?.('Team bound to coach', { coachId, teamId: created._id });
    } catch (error) {
      this.logger?.warn?.('Failed to bind team to coach', { 
        coachId, 
        teamId: created._id, 
        error: error.message 
      });
    }
    
    return created;
  }

  async getOpenCompetitions() {
    if (!this.competitionRepository) {
      return [];
    }
    return this.competitionRepository.find({ status: 'upcoming', isDeleted: false }, { sort: { startDate: 1 } });
  }

  async registerTeamForCompetition(teamId, competitionId, coachId) {
    // Validate team belongs to coach
    const team = await this.teamRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team');
    }
    
    if (team.coach.toString() !== coachId.toString()) {
      throw new AuthorizationError('You do not have permission to register this team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Check if team is already registered
    const existingRegistration = competition.registeredTeams.find(
      rt => rt.team.toString() === teamId.toString()
    );
    
    if (existingRegistration) {
      this.logger?.info?.('Team already registered for competition', { teamId, competitionId });
      return { 
        teamId, 
        competitionId, 
        coachId, 
        status: 'already_registered',
        registeredTeam: existingRegistration
      };
    }
    
    // Register team - use updateById to avoid .save() issues
    const updatedCompetition = await this.competitionRepository.updateById(
      competitionId,
      {
        $push: {
          registeredTeams: {
            team: teamId,
            coach: coachId,
            players: [],
            isSubmitted: false,
            paymentStatus: 'pending',
            isActive: true
          }
        }
      }
    );
    
    if (!updatedCompetition) {
      throw new Error('Failed to register team for competition');
    }
    
    this.logger?.info?.('Team registered for competition', { teamId, competitionId, coachId });
    
    // Get the newly added registered team
    const refreshedCompetition = await this.competitionRepository.findById(competitionId);
    const registeredTeam = refreshedCompetition.registeredTeams.find(
      rt => rt.team.toString() === teamId.toString()
    );
    
    return { 
      teamId, 
      competitionId, 
      coachId, 
      status: 'registered',
      registeredTeam
    };
  }

  async selectCompetitionForTeam(coachId, competitionId) {
    const teams = await this.getCoachTeams(coachId);
    const team = teams[0] || null;
    return { coachId, competitionId, teamId: team?._id || null };
  }

  async getTeamDashboard(coachId, competitionId) {
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    
    this.logger?.info?.('getTeamDashboard called', { 
      coachId: coachId.toString(), 
      competitionId: competitionId.toString(),
      teamsCount: teams.length 
    });
    
    if (teams.length === 0) {
      this.logger?.warn?.('No teams found for coach', { coachId });
      return {
        competitionId,
        team: null,
        totalTeams: 0,
      };
    }
    
    // Get the competition to find registered team with players
    if (!this.competitionRepository) {
      // If no competition repository, return basic team info
      this.logger?.warn?.('No competition repository available');
      return {
        competitionId,
        team: {
          ...teams[0].toObject(),
          players: [],
          isSubmitted: false,
          paymentStatus: 'pending'
        },
        totalTeams: teams.length,
      };
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      this.logger?.error?.('Competition not found', { competitionId });
      throw new NotFoundError('Competition');
    }
    
    this.logger?.info?.('Competition found', { 
      competitionId,
      registeredTeamsCount: competition.registeredTeams.length,
      registeredTeams: competition.registeredTeams.map(rt => ({
        teamId: rt.team.toString(),
        coachId: rt.coach.toString()
      }))
    });
    
    // Find the registered team in the competition
    const registeredTeam = competition.registeredTeams.find(
      rt => {
        const rtCoachId = rt.coach._id ? rt.coach._id.toString() : rt.coach.toString();
        const searchCoachId = coachId._id ? coachId._id.toString() : coachId.toString();
        return rtCoachId === searchCoachId;
      }
    );
    
    if (!registeredTeam) {
      // Team exists but not registered for this competition
      this.logger?.warn?.('Team not registered for this competition', { 
        coachId: coachId.toString(),
        competitionId,
        availableCoaches: competition.registeredTeams.map(rt => {
          const rtCoachId = rt.coach._id ? rt.coach._id.toString() : rt.coach.toString();
          return rtCoachId;
        })
      });
      return {
        competitionId,
        team: null,
        totalTeams: teams.length,
      };
    }
    
    this.logger?.info?.('Registered team found', { 
      teamId: registeredTeam.team.toString(),
      playersCount: registeredTeam.players.length 
    });
    
    // Get the team details
    const team = teams.find(t => {
      const tId = t._id._id ? t._id._id.toString() : t._id.toString();
      const rtTeamId = registeredTeam.team._id ? registeredTeam.team._id.toString() : registeredTeam.team.toString();
      return tId === rtTeamId;
    });
    
    if (!team) {
      this.logger?.error?.('Team details not found', { 
        registeredTeamId: registeredTeam.team.toString(),
        availableTeams: teams.map(t => t._id.toString())
      });
      return {
        competitionId,
        team: null,
        totalTeams: teams.length,
      };
    }
    
    // Populate player details
    const playersWithDetails = [];
    if (this.playerRepository && registeredTeam.players.length > 0) {
      for (const playerEntry of registeredTeam.players) {
        try {
          const player = await this.playerRepository.findById(playerEntry.player);
          if (player) {
            playersWithDetails.push({
              player: {
                _id: player._id,
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email,
                dateOfBirth: player.dateOfBirth,
                gender: player.gender
              },
              ageGroup: playerEntry.ageGroup,
              gender: playerEntry.gender
            });
          }
        } catch (error) {
          this.logger?.warn?.('Failed to fetch player details', { 
            playerId: playerEntry.player, 
            error: error.message 
          });
        }
      }
    }
    
    return {
      competitionId,
      team: {
        _id: team._id,
        name: team.name,
        coach: team.coach,
        description: team.description,
        isActive: team.isActive,
        players: playersWithDetails,
        isSubmitted: registeredTeam.isSubmitted,
        paymentStatus: registeredTeam.paymentStatus,
        paymentAmount: registeredTeam.paymentAmount,
        submittedAt: registeredTeam.submittedAt
      },
      totalTeams: teams.length,
    };
  }

  async getTeamStatus(coachId, competitionId) {
    const teams = await this.getCoachTeams(coachId);
    return {
      competitionId,
      hasTeam: teams.length > 0,
      submitted: false,
    };
  }

  async searchPlayers(coachId, competitionId, query = '') {
    if (!this.playerRepository) return [];
    const filters = {
      isActive: true,
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    };
    return this.playerRepository.find(filters, { limit: 20, sort: { createdAt: -1 } });
  }

  async addPlayerToAgeGroup(coachId, competitionId, payload) {
    const { playerId, ageGroup, gender } = payload;
    
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    if (teams.length === 0) {
      throw new NotFoundError('Team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Find registered team
    const registeredTeamIndex = competition.registeredTeams.findIndex(
      rt => rt.coach.toString() === coachId.toString()
    );
    
    if (registeredTeamIndex === -1) {
      throw new NotFoundError('Registered team for this competition');
    }
    
    const registeredTeam = competition.registeredTeams[registeredTeamIndex];
    
    // Check if player already exists
    const existingPlayerIndex = registeredTeam.players.findIndex(
      p => p.player && p.player.toString() === playerId.toString()
    );
    
    if (existingPlayerIndex !== -1) {
      // Update existing player's age group and gender
      await this.competitionRepository.updateById(
        competitionId,
        {
          $set: {
            [`registeredTeams.${registeredTeamIndex}.players.${existingPlayerIndex}.ageGroup`]: ageGroup,
            [`registeredTeams.${registeredTeamIndex}.players.${existingPlayerIndex}.gender`]: gender
          }
        }
      );
    } else {
      // Add new player
      await this.competitionRepository.updateById(
        competitionId,
        {
          $push: {
            [`registeredTeams.${registeredTeamIndex}.players`]: {
              player: playerId,
              ageGroup,
              gender
            }
          }
        }
      );
    }
    
    this.logger?.info?.('Player added to team', { 
      coachId, 
      competitionId, 
      playerId, 
      ageGroup, 
      gender 
    });
    
    return { 
      competitionId, 
      teamId: registeredTeam.team, 
      playerId 
    };
  }

  async removePlayerFromAgeGroup(coachId, competitionId, playerId) {
    // Get coach's teams
    const teams = await this.getCoachTeams(coachId);
    if (teams.length === 0) {
      throw new NotFoundError('Team');
    }
    
    // Get competition
    if (!this.competitionRepository) {
      throw new Error('Competition repository not available');
    }
    
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) {
      throw new NotFoundError('Competition');
    }
    
    // Find registered team
    const registeredTeamIndex = competition.registeredTeams.findIndex(
      rt => rt.coach.toString() === coachId.toString()
    );
    
    if (registeredTeamIndex === -1) {
      throw new NotFoundError('Registered team for this competition');
    }
    
    // Remove player using $pull
    await this.competitionRepository.updateById(
      competitionId,
      {
        $pull: {
          [`registeredTeams.${registeredTeamIndex}.players`]: {
            player: playerId
          }
        }
      }
    );
    
    this.logger?.info?.('Player removed from team', { 
      coachId, 
      competitionId, 
      playerId 
    });
    
    return { 
      competitionId, 
      teamId: competition.registeredTeams[registeredTeamIndex].team, 
      playerId 
    };
  }

  async createTeamPaymentOrder(coachId, competitionId) {
    try {
      // Validate coach exists
      const coach = await this.repository.findById(coachId);
      if (!coach) {
        throw new NotFoundError('Coach not found');
      }

      // Get competition and find registered team
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      const registeredTeam = competition.registeredTeams?.find(
        rt => rt.coach?.toString() === coachId.toString()
      );

      if (!registeredTeam) {
        throw new NotFoundError('Team not registered for this competition');
      }

      // Get team details
      const team = await this.teamRepository.findById(registeredTeam.team);
      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Calculate payment amount: ₹500 base + ₹100 per player
      const playerCount = registeredTeam.players?.length || 0;
      const amount = 500 + (playerCount * 100);

      // Get Razorpay credentials from config
      const razorpayKeyId = this.config?.get('razorpay.keyId') || '';
      const razorpayKeySecret = this.config?.get('razorpay.keySecret') || '';

      if (!razorpayKeyId || !razorpayKeySecret) {
        this.logger?.error?.('Razorpay credentials not configured', {
          hasKeyId: !!razorpayKeyId,
          hasKeySecret: !!razorpayKeySecret
        });
        throw new ValidationError('Razorpay credentials are not configured');
      }

      // Create Razorpay instance
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
      });

      this.logger?.info?.('Creating Razorpay order', {
        amount,
        playerCount,
        teamId: team._id.toString()
      });

      // Create Razorpay order
      // Receipt must be max 40 characters - use last 8 chars of teamId + timestamp
      const shortTeamId = team._id.toString().slice(-8);
      const timestamp = Date.now().toString().slice(-8);
      const receipt = `rcpt_${shortTeamId}_${timestamp}`;
      
      const razorpayOrder = await razorpay.orders.create({
        amount: amount * 100, // Razorpay expects amount in paise (smallest currency unit)
        currency: 'INR',
        receipt: receipt,
        notes: {
          coachId: coachId.toString(),
          competitionId: competitionId.toString(),
          teamId: team._id.toString(),
          teamName: team.name,
          playerCount: playerCount
        }
      });

      this.logger?.info?.('Razorpay order created successfully', {
        coachId,
        competitionId,
        orderId: razorpayOrder.id,
        amount,
        playerCount
      });

      return {
        order: {
          id: razorpayOrder.id,
          amount,
          currency: 'INR'
        },
        razorpayKeyId,
        team: {
          _id: team._id,
          name: team.name,
          playerCount
        }
      };
    } catch (error) {
      this.logger?.error?.('Error creating payment order', {
        error: error.message,
        stack: error.stack,
        razorpayError: error.error,
        statusCode: error.statusCode
      });
      
      // Handle Razorpay-specific errors
      if (error.error && error.error.description) {
        throw new ValidationError(error.error.description);
      }
      
      throw error;
    }
  }

  async verifyTeamPaymentAndSubmit(coachId, competitionId, payload) {
    try {
      // Get competition and find registered team
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      const registeredTeamIndex = competition.registeredTeams.findIndex(
        rt => rt.coach?.toString() === coachId.toString()
      );

      if (registeredTeamIndex === -1) {
        throw new NotFoundError('Team not registered for this competition');
      }

      const registeredTeam = competition.registeredTeams[registeredTeamIndex];

      // Check if already submitted
      if (registeredTeam.isSubmitted) {
        this.logger?.warn?.('Team already submitted', { coachId, competitionId });
        return {
          coachId,
          competitionId,
          verified: true,
          submitted: true,
          alreadySubmitted: true,
          payment: payload || {},
        };
      }

      // Update team submission status
      await this.competitionRepository.updateById(
        competitionId,
        {
          $set: {
            [`registeredTeams.${registeredTeamIndex}.isSubmitted`]: true,
            [`registeredTeams.${registeredTeamIndex}.submittedAt`]: new Date(),
            [`registeredTeams.${registeredTeamIndex}.paymentStatus`]: 'completed',
            [`registeredTeams.${registeredTeamIndex}.paymentId`]: payload.razorpay_payment_id,
            [`registeredTeams.${registeredTeamIndex}.paymentOrderId`]: payload.razorpay_order_id,
            [`registeredTeams.${registeredTeamIndex}.paymentSignature`]: payload.razorpay_signature,
            [`registeredTeams.${registeredTeamIndex}.paymentVerifiedAt`]: new Date(),
          }
        }
      );

      this.logger?.info?.('Team submitted successfully', { 
        coachId, 
        competitionId,
        teamId: registeredTeam.team,
        paymentId: payload.razorpay_payment_id
      });

      return {
        coachId,
        competitionId,
        verified: true,
        submitted: true,
        payment: payload || {},
      };
    } catch (error) {
      this.logger?.error?.('Error verifying payment and submitting team', {
        error: error.message,
        stack: error.stack,
        coachId,
        competitionId
      });
      throw error;
    }
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
        throw new NotFoundError('Coach');
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
        throw new NotFoundError('Coach');
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
        throw new NotFoundError('Team');
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
        throw new NotFoundError('Coach');
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
        throw new NotFoundError('Coach');
      }

      // If coach has no team, return null
      if (!coach.team) {
        this.logger.info('Coach has no team', { coachId });
        return null;
      }

      // Get team with coach populated
      const team = await this.teamRepository.findById(coach.team, {
        populate: 'coach'
      });

      // Fetch players for this team (players reference teams, not the other way around)
      const Player = require('../../models/Player');
      const players = await Player.find({ team: coach.team }).lean();

      this.logger.info('Coach team retrieved', { 
        coachId, 
        teamId: coach.team 
      });

      return {
        ...team,
        players
      };
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

