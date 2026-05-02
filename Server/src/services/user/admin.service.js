/**
 * Admin Service
 * 
 * Service for admin-specific operations.
 * Extends UserService with admin-specific functionality.
 * 
 * Requirements: 1.5, 1.7, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, AuthorizationError, BusinessRuleError } = require('../../errors');
const EventTypes = require('../../socket/events/event-types');

class AdminService extends UserService {
  /**
   * Create an admin service
   * @param {Object} dependencies - Service dependencies
   */
  constructor(dependencies) {
    super(dependencies.adminRepository, dependencies.logger, 'admin', dependencies.cacheService);
    this.playerRepository = dependencies.playerRepository;
    this.coachRepository = dependencies.coachRepository;
    this.competitionRepository = dependencies.competitionRepository;
    this.teamRepository = dependencies.teamRepository;
    this.judgeRepository = dependencies.judgeRepository;
    this.scoreRepository = dependencies.scoreRepository;
    this.transactionRepository = dependencies.transactionRepository;
    this.calculationService = dependencies.calculationService;
    this.socketManager = dependencies.socketManager;
    this.authenticationService = dependencies.authenticationService;
  }

  /**
   * Register a new admin
   * @param {Object} data - Admin registration data
   * @returns {Promise<Object>} { user, token }
   * @throws {ConflictError} If email already exists
   * @throws {ValidationError} If validation fails
   */
  async registerAdmin(data) {
    try {
      // Delegate to AuthenticationService
      const result = await this.authenticationService.register(data, 'admin');
      
      this.logger.info('Admin registered successfully', { 
        adminId: result.user._id 
      });
      
      return result;
    } catch (error) {
      // Re-throw domain errors unchanged
      this.logger.error('Admin registration error', { 
        email: data.email, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Login an admin
   * @param {string} email - Admin email
   * @param {string} password - Admin password
   * @returns {Promise<Object>} { user, token }
   * @throws {AuthenticationError} If credentials are invalid
   */
  async loginAdmin(email, password) {
    try {
      // Delegate to AuthenticationService
      const result = await this.authenticationService.login(email, password, 'admin');
      
      this.logger.info('Admin logged in successfully', { 
        adminId: result.user._id 
      });
      
      return result;
    } catch (error) {
      // Re-throw AuthenticationError and lockout errors unchanged
      this.logger.error('Admin login error', { 
        email, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get admin profile with competitions
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Admin profile with competition details
   * @throws {NotFoundError} If admin not found
   */
  async getProfile(adminId) {
    try {
      const admin = await this.repository.findById(adminId, {
        populate: 'competitions'
      });

      if (!admin) {
        this.logger.warn('Get admin profile failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Remove password from response
      const { password, ...profile } = admin;

      this.logger.info('Admin profile retrieved', { adminId });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get admin profile error', { 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Assign competition to admin
   * @param {string} adminId - Admin ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Updated admin profile
   * @throws {NotFoundError} If admin or competition not found
   * @throws {ValidationError} If competition already assigned
   */
  async assignCompetition(adminId, competitionId) {
    try {
      // Check if admin exists
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Assign competition failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Super admins have access to all competitions, no need to assign
      if (admin.role === 'super_admin') {
        this.logger.warn('Assign competition failed: Super admin has access to all competitions', { 
          adminId 
        });
        throw new ValidationError('Super admins have access to all competitions');
      }

      // Check if competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition) {
        this.logger.warn('Assign competition failed: Competition not found', { competitionId });
        throw new NotFoundError('Competition');
      }

      // Check if competition is already assigned
      const competitions = admin.competitions || [];
      if (competitions.some(comp => comp.toString() === competitionId)) {
        this.logger.warn('Assign competition failed: Competition already assigned', { 
          adminId, 
          competitionId 
        });
        throw new ValidationError('Competition already assigned to this admin');
      }

      // Add competition to admin's competitions array
      const updatedAdmin = await this.repository.updateById(adminId, {
        $push: { competitions: competitionId }
      });

      // Remove password from response
      const { password, ...profile } = updatedAdmin;

      this.logger.info('Competition assigned to admin', { 
        adminId, 
        competitionId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Assign competition error', { 
        adminId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove competition from admin
   * @param {string} adminId - Admin ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Updated admin profile
   * @throws {NotFoundError} If admin not found
   * @throws {ValidationError} If competition not assigned
   */
  async removeCompetition(adminId, competitionId) {
    try {
      // Check if admin exists
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Remove competition failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Super admins have access to all competitions
      if (admin.role === 'super_admin') {
        this.logger.warn('Remove competition failed: Cannot remove competitions from super admin', { 
          adminId 
        });
        throw new ValidationError('Cannot remove competitions from super admin');
      }

      // Check if competition is assigned
      const competitions = admin.competitions || [];
      if (!competitions.some(comp => comp.toString() === competitionId)) {
        this.logger.warn('Remove competition failed: Competition not assigned', { 
          adminId, 
          competitionId 
        });
        throw new ValidationError('Competition is not assigned to this admin');
      }

      // Remove competition from admin's competitions array
      const updatedAdmin = await this.repository.updateById(adminId, {
        $pull: { competitions: competitionId }
      });

      // Remove password from response
      const { password, ...profile } = updatedAdmin;

      this.logger.info('Competition removed from admin', { 
        adminId, 
        competitionId 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Remove competition error', { 
        adminId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if admin has access to competition
   * @param {string} adminId - Admin ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if admin has access
   * @throws {NotFoundError} If admin not found
   */
  async hasAccessToCompetition(adminId, competitionId) {
    try {
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Check access failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Super admins have access to all competitions
      if (admin.role === 'super_admin') {
        this.logger.info('Admin competition access checked', { 
          adminId, 
          competitionId, 
          hasAccess: true,
          reason: 'super_admin'
        });
        return true;
      }

      // Check if competition is in admin's competitions array
      const competitions = admin.competitions || [];
      const hasAccess = competitions.some(comp => comp.toString() === competitionId);

      this.logger.info('Admin competition access checked', { 
        adminId, 
        competitionId, 
        hasAccess 
      });

      return hasAccess;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Check access error', { 
        adminId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all users (players and coaches) - admin only
   * @param {string} adminId - Admin ID
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} { users, total, page, pages }
   * @throws {NotFoundError} If admin not found
   */
  async getAllUsers(adminId, filters = {}, page = 1, limit = 10) {
    try {
      // Verify admin exists
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Get all users failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      const skip = (page - 1) * limit;

      // Get players and coaches
      const [players, coaches, playerCount, coachCount] = await Promise.all([
        this.playerRepository.find(filters, { skip, limit: Math.ceil(limit / 2), sort: { createdAt: -1 } }),
        this.coachRepository.find(filters, { skip, limit: Math.ceil(limit / 2), sort: { createdAt: -1 } }),
        this.playerRepository.count(filters),
        this.coachRepository.count(filters)
      ]);

      // Remove passwords from response
      const playersWithoutPasswords = players.map(player => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = player;
        return { ...profile, userType: 'player' };
      });

      const coachesWithoutPasswords = coaches.map(coach => {
        const { password, resetPasswordToken, resetPasswordExpires, ...profile } = coach;
        return { ...profile, userType: 'coach' };
      });

      const users = [...playersWithoutPasswords, ...coachesWithoutPasswords];
      const total = playerCount + coachCount;

      this.logger.info('All users retrieved', { 
        adminId, 
        playerCount, 
        coachCount, 
        total 
      });

      return {
        users,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get all users error', { 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Activate user account (player or coach) - admin only
   * @param {string} adminId - Admin ID
   * @param {string} userId - User ID
   * @param {string} userType - User type (player or coach)
   * @returns {Promise<Object>} Updated user profile
   * @throws {NotFoundError} If admin or user not found
   */
  async activateUser(adminId, userId, userType) {
    try {
      // Verify admin exists
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Activate user failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Get appropriate repository
      const userRepository = userType === 'player' ? this.playerRepository : this.coachRepository;

      // Check if user exists
      const user = await userRepository.findById(userId);

      if (!user) {
        this.logger.warn('Activate user failed: User not found', { userId, userType });
        throw new NotFoundError(`${userType} not found`);
      }

      // Activate user
      const updatedUser = await userRepository.updateById(userId, {
        isActive: true
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedUser;

      this.logger.info('User activated by admin', { 
        adminId, 
        userId, 
        userType 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Activate user error', { 
        adminId, 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Deactivate user account (player or coach) - admin only
   * @param {string} adminId - Admin ID
   * @param {string} userId - User ID
   * @param {string} userType - User type (player or coach)
   * @returns {Promise<Object>} Updated user profile
   * @throws {NotFoundError} If admin or user not found
   */
  async deactivateUser(adminId, userId, userType) {
    try {
      // Verify admin exists
      const admin = await this.repository.findById(adminId);

      if (!admin) {
        this.logger.warn('Deactivate user failed: Admin not found', { adminId });
        throw new NotFoundError('Admin');
      }

      // Get appropriate repository
      const userRepository = userType === 'player' ? this.playerRepository : this.coachRepository;

      // Check if user exists
      const user = await userRepository.findById(userId);

      if (!user) {
        this.logger.warn('Deactivate user failed: User not found', { userId, userType });
        throw new NotFoundError(`${userType} not found`);
      }

      // Deactivate user
      const updatedUser = await userRepository.updateById(userId, {
        isActive: false
      });

      // Remove password from response
      const { password, resetPasswordToken, resetPasswordExpires, ...profile } = updatedUser;

      this.logger.info('User deactivated by admin', { 
        adminId, 
        userId, 
        userType 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Deactivate user error', { 
        adminId, 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get admins by role
   * @param {string} role - Admin role (admin or super_admin)
   * @returns {Promise<Array>} Array of admins
   */
  async getAdminsByRole(role) {
    try {
      const admins = await this.repository.findByRole(role);

      // Remove passwords from response
      const adminsWithoutPasswords = admins.map(admin => {
        const { password, ...profile } = admin;
        return profile;
      });

      this.logger.info('Admins retrieved by role', { 
        role, 
        count: adminsWithoutPasswords.length 
      });

      return adminsWithoutPasswords;
    } catch (error) {
      this.logger.error('Get admins by role error', { 
        role, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Dashboard & Statistics ====================

  /**
   * Get dashboard statistics for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Dashboard statistics
   * @throws {NotFoundError} If competition not found
   */
  async getDashboardStats(competitionId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Derive team/player counts from the embedded registeredTeams array
      const registeredTeams = competition.registeredTeams || [];
      const activeTeams = registeredTeams.filter(rt => rt.isActive !== false);

      // All players across all active registered teams
      const allPlayers = activeTeams.flatMap(rt => rt.players || []);

      const malePlayers = allPlayers.filter(p => p.gender === 'Male');
      const femalePlayers = allPlayers.filter(p => p.gender === 'Female');

      // Teams that have at least one male player vs at least one female player
      const boysTeams = activeTeams.filter(rt =>
        (rt.players || []).some(p => p.gender === 'Male')
      ).length;
      const girlsTeams = activeTeams.filter(rt =>
        (rt.players || []).some(p => p.gender === 'Female')
      ).length;

      const totalTeams = activeTeams.length;
      const totalParticipants = allPlayers.length;
      const totalBoys = malePlayers.length;
      const totalGirls = femalePlayers.length;
      const submittedTeams = activeTeams.filter(rt => rt.isSubmitted).length;

      // Judge count still needs a DB query
      const totalJudges = await this.judgeRepository.count({ competition: competitionId, isActive: true });

      this.logger.info('Dashboard stats retrieved', { competitionId });

      return {
        totalTeams,
        totalParticipants,
        boysTeams,
        girlsTeams,
        totalBoys,
        totalGirls,
        submittedTeams,
        totalJudges,
        competition: {
          name: competition.name,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status
        }
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get dashboard stats error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get competition overview with age groups and registration status
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Competition overview
   * @throws {NotFoundError} If competition not found
   */
  async getCompetitionOverview(competitionId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Get registration status by age group
      const ageGroups = competition.ageGroups || [];
      const ageGroupStats = await Promise.all(
        ageGroups.map(async (ageGroup) => {
          const teamCount = await this.teamRepository.count({
            competition: competitionId,
            ageGroup: ageGroup.name
          });
          const playerCount = await this.playerRepository.count({
            competition: competitionId,
            ageGroup: ageGroup.name
          });
          return {
            name: ageGroup.name,
            teamCount,
            playerCount,
            status: ageGroup.status || 'pending'
          };
        })
      );

      this.logger.info('Competition overview retrieved', { competitionId });

      return {
        competition,
        ageGroups: ageGroupStats,
        registrationStatus: competition.registrationStatus || 'open',
        scoringProgress: competition.scoringProgress || 0
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get competition overview error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get system health status
   * @returns {Promise<Object>} System health information
   */
  async getSystemHealth() {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      // Check database status
      const dbStatus = await this.checkDatabaseStatus();

      // Check cache status (if available)
      let cacheStatus = 'unavailable';
      if (this.cacheService) {
        try {
          await this.cacheService.get('health_check');
          cacheStatus = 'healthy';
        } catch (error) {
          cacheStatus = 'unhealthy';
        }
      }

      this.logger.info('System health checked');

      return {
        database: dbStatus,
        cache: cacheStatus,
        email: 'healthy', // Placeholder - would need email service check
        uptime: Math.floor(uptime),
        memory: {
          used: Math.floor(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.floor(memoryUsage.heapTotal / 1024 / 1024)
        }
      };
    } catch (error) {
      this.logger.error('Get system health error', { error: error.message });
      throw error;
    }
  }

  /**
   * Check database status
   * @returns {Promise<string>} Database status
   */
  async checkDatabaseStatus() {
    try {
      await this.repository.count({});
      return 'healthy';
    } catch (error) {
      return 'unhealthy';
    }
  }

  // ==================== Team Management ====================

  /**
   * Get all teams with filters and pagination
   * @param {string} competitionId - Competition ID
   * @param {Object} filters - Filter criteria (ageGroup, gender, status, coachName, teamName)
   * @param {Object} pagination - Pagination options (page, limit)
   * @returns {Promise<Object>} { teams, total, page, pages }
   */
  async getAllTeams(competitionId, filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      
      // Separate team-level filters from player-level filters
      const { ageGroup, gender, ...teamFilters } = filters;
      const criteria = { competition: competitionId, ...teamFilters };

      // First, get all teams for the competition
      const allTeams = await this.teamRepository.find(criteria, { 
        sort: { createdAt: -1 },
        populate: ['coach']
      });

      // Fetch players for each team and apply player-level filters
      const teamsWithFilteredPlayers = await Promise.all(
        allTeams.map(async (team) => {
          let players = await this.playerRepository.find({ team: team._id });
          
          // Apply player-level filters
          if (ageGroup) {
            players = players.filter(player => player.ageGroup === ageGroup);
          }
          if (gender) {
            players = players.filter(player => player.gender === gender);
          }
          
          return {
            ...team,
            players,
            playerCount: players.length
          };
        })
      );

      // Filter out teams that have no players matching the criteria
      const filteredTeams = teamsWithFilteredPlayers.filter(team => {
        // If no player filters are applied, include all teams
        if (!ageGroup && !gender) return true;
        // If player filters are applied, only include teams with matching players
        return team.players.length > 0;
      });

      // Apply pagination to filtered results
      const total = filteredTeams.length;
      const skip = (page - 1) * limit;
      const paginatedTeams = filteredTeams.slice(skip, skip + limit);

      this.logger.info('All teams retrieved with filters', { 
        competitionId, 
        total, 
        filters: { ageGroup, gender, ...teamFilters }
      });

      return {
        teams: paginatedTeams,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Get all teams error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get team details with players, coach, payment status, and scores
   * @param {string} teamId - Team ID
   * @param {Object} filters - Optional filters (gender, ageGroup, competition)
   * @returns {Promise<Object>} Team details
   * @throws {NotFoundError} If team not found
   */
  async getTeamDetails(teamId, filters = {}) {
    try {
      const team = await this.teamRepository.findById(teamId, {
        populate: ['coach']
      });

      if (!team) {
        throw new NotFoundError('Team');
      }

      // Get players for this team (players reference teams, not the other way around)
      let players = await this.playerRepository.find({ team: teamId });

      // If competition filter is provided, we need to get age groups from competition's registeredTeams
      if (filters.competition) {
        const competition = await this.competitionRepository.findById(filters.competition);
        if (competition) {
          const registeredTeam = competition.registeredTeams.find(
            rt => rt.team.toString() === teamId
          );
          
          if (registeredTeam) {
            // Get only players that are registered in this competition
            const registeredPlayerIds = registeredTeam.players.map(rp => rp.player.toString());
            players = players.filter(player => registeredPlayerIds.includes(player._id.toString()));
            
            // Update player data with competition-specific age groups and gender
            players = players.map(player => {
              const registeredPlayer = registeredTeam.players.find(
                rp => rp.player.toString() === player._id.toString()
              );
              return {
                ...player,
                ageGroup: registeredPlayer?.ageGroup || player.ageGroup,
                gender: registeredPlayer?.gender || player.gender
              };
            });
          } else {
            // Team not registered in this competition
            players = [];
          }
        }
      }

      // Apply gender and ageGroup filters after getting competition-specific data
      if (filters.gender || filters.ageGroup) {
        players = players.filter(player => {
          const matchesGender = !filters.gender || player.gender === filters.gender;
          const matchesAgeGroup = !filters.ageGroup || player.ageGroup === filters.ageGroup;
          return matchesGender && matchesAgeGroup;
        });
      }

      // Get payment status
      const transaction = await this.transactionRepository.findOne({
        team: teamId,
        paymentStatus: 'completed'
      });

      // Get scores if available
      const scores = await this.scoreRepository.find({
        team: teamId
      });

      this.logger.info('Team details retrieved', { teamId });

      return {
        team: {
          _id: team._id,
          name: team.name,
          coach: team.coach ? {
            _id: team.coach._id,
            name: team.coach.name,
            firstName: team.coach.firstName || team.coach.name?.split(' ')[0] || '',
            lastName: team.coach.lastName || team.coach.name?.split(' ').slice(1).join(' ') || '',
            email: team.coach.email
          } : null,
          players: players.map(p => ({
            _id: p._id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            ageGroup: p.ageGroup,
            gender: p.gender,
            dateOfBirth: p.dateOfBirth,
            isActive: p.isActive
          })),
          playerCount: players.length,
          description: team.description,
          isActive: team.isActive,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt
        },
        paymentStatus: transaction ? 'paid' : 'pending',
        transaction,
        scores
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get team details error', { 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get submitted teams for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Array of submitted teams
   */
  async getSubmittedTeams(competitionId, filters = {}) {
    try {
      // Query the Competition model to get registered teams
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          {
            path: 'registeredTeams.team',
            populate: { path: 'coach' }
          },
          {
            path: 'registeredTeams.players.player'
          }
        ]
      });

      if (!competition) {
        this.logger.warn('Competition not found', { competitionId });
        return [];
      }

      // Filter submitted teams
      let submittedTeams = competition.registeredTeams.filter(regTeam => regTeam.isSubmitted);

      // Apply additional filters if provided
      if (filters.gender || filters.ageGroup) {
        submittedTeams = submittedTeams.filter(regTeam => {
          // Check if any player in the team matches the filters
          return regTeam.players.some(playerEntry => {
            const matchesGender = !filters.gender || playerEntry.gender === filters.gender;
            const matchesAgeGroup = !filters.ageGroup || playerEntry.ageGroup === filters.ageGroup;
            return matchesGender && matchesAgeGroup;
          });
        });
      }

      // Transform to expected format
      const teamsWithPlayers = submittedTeams.map(regTeam => ({
        _id: regTeam.team._id,
        name: regTeam.team.name,
        coach: regTeam.coach,
        isSubmitted: regTeam.isSubmitted,
        submittedAt: regTeam.submittedAt,
        paymentStatus: regTeam.paymentStatus,
        players: regTeam.players.map(playerEntry => ({
          ...playerEntry.player.toObject(),
          ageGroup: playerEntry.ageGroup,
          gender: playerEntry.gender
        }))
      }));

      this.logger.info('Submitted teams retrieved', { 
        competitionId, 
        count: teamsWithPlayers.length,
        filters 
      });

      return teamsWithPlayers;
    } catch (error) {
      this.logger.error('Get submitted teams error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Approve a team
   * @param {string} teamId - Team ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated team
   * @throws {NotFoundError} If team not found
   * @throws {BusinessRuleError} If team already approved
   */
  async approveTeam(teamId, adminId) {
    try {
      const team = await this.teamRepository.findById(teamId);
      if (!team) {
        throw new NotFoundError('Team');
      }

      if (team.status === 'approved') {
        throw new BusinessRuleError('Team is already approved');
      }

      const updatedTeam = await this.teamRepository.updateById(teamId, {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: new Date()
      });

      this.logger.info('Team approved', { teamId, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${team.competition}`, EventTypes.TEAM_APPROVED, {
          teamId,
          teamName: team.name
        });
      }

      return updatedTeam;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Approve team error', { 
        teamId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Reject a team
   * @param {string} teamId - Team ID
   * @param {string} reason - Rejection reason
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated team
   * @throws {NotFoundError} If team not found
   */
  async rejectTeam(teamId, reason, adminId) {
    try {
      const team = await this.teamRepository.findById(teamId);
      if (!team) {
        throw new NotFoundError('Team');
      }

      const updatedTeam = await this.teamRepository.updateById(teamId, {
        status: 'rejected',
        rejectionReason: reason,
        rejectedBy: adminId,
        rejectedAt: new Date()
      });

      this.logger.info('Team rejected', { teamId, reason, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${team.competition}`, EventTypes.TEAM_REJECTED, {
          teamId,
          teamName: team.name,
          reason
        });
      }

      return updatedTeam;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Reject team error', { 
        teamId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Player Management ====================

  /**
   * Get all players with filters and pagination
   * @param {string} competitionId - Competition ID
   * @param {Object} filters - Filter criteria (ageGroup, gender, teamId, status)
   * @param {Object} pagination - Pagination options (page, limit)
   * @returns {Promise<Object>} { players, total, page, pages }
   */
  async getAllPlayers(competitionId, filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const criteria = { competition: competitionId, ...filters };

      const skip = (page - 1) * limit;
      const [players, total] = await Promise.all([
        this.playerRepository.find(criteria, { 
          skip, 
          limit, 
          sort: { createdAt: -1 },
          populate: ['team']
        }),
        this.playerRepository.count(criteria)
      ]);

      this.logger.info('All players retrieved', { competitionId, total });

      return {
        players,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Get all players error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get player details with team, scores, and registration date
   * @param {string} playerId - Player ID
   * @returns {Promise<Object>} Player details
   * @throws {NotFoundError} If player not found
   */
  async getPlayerDetails(playerId) {
    try {
      const player = await this.playerRepository.findById(playerId, {
        populate: ['team']
      });

      if (!player) {
        throw new NotFoundError('Player');
      }

      // Get scores
      const scores = await this.scoreRepository.find({
        'playerScores.playerId': playerId
      });

      this.logger.info('Player details retrieved', { playerId });

      return {
        player,
        scores,
        registrationDate: player.createdAt
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get player details error', { 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update player status
   * @param {string} playerId - Player ID
   * @param {string} status - New status (active, inactive, disqualified)
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated player
   * @throws {NotFoundError} If player not found
   */
  async updatePlayerStatus(playerId, status, adminId) {
    try {
      const player = await this.playerRepository.findById(playerId);
      if (!player) {
        throw new NotFoundError('Player');
      }

      const updatedPlayer = await this.playerRepository.updateById(playerId, {
        status,
        statusUpdatedBy: adminId,
        statusUpdatedAt: new Date()
      });

      this.logger.info('Player status updated', { playerId, status, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToUser(player.coach, EventTypes.PLAYER_STATUS_UPDATED, {
          playerId,
          playerName: player.name,
          status
        });
      }

      return updatedPlayer;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Update player status error', { 
        playerId, 
        status, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Assign player to team
   * @param {string} playerId - Player ID
   * @param {string} teamId - Team ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated player
   * @throws {NotFoundError} If player or team not found
   * @throws {BusinessRuleError} If eligibility check fails
   */
  async assignPlayerToTeam(playerId, teamId, adminId) {
    try {
      const [player, team] = await Promise.all([
        this.playerRepository.findById(playerId),
        this.teamRepository.findById(teamId)
      ]);

      if (!player) {
        throw new NotFoundError('Player');
      }
      if (!team) {
        throw new NotFoundError('Team');
      }

      // Validate eligibility (age group and gender match)
      if (player.ageGroup !== team.ageGroup) {
        throw new BusinessRuleError('Player age group does not match team age group');
      }
      if (player.gender !== team.gender) {
        throw new BusinessRuleError('Player gender does not match team gender');
      }

      const updatedPlayer = await this.playerRepository.updateById(playerId, {
        team: teamId,
        assignedBy: adminId,
        assignedAt: new Date()
      });

      this.logger.info('Player assigned to team', { playerId, teamId, adminId });

      return updatedPlayer;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Assign player to team error', { 
        playerId, 
        teamId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }
  // ==================== Judge Management ====================

  /**
   * Bulk save judges (create or update)
   * @param {string} competitionId - Competition ID
   * @param {Array} judges - Array of judge data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} { created, updated, errors }
   */
  async saveJudges(competitionId, judges, adminId) {
    try {
      const results = {
        created: [],
        updated: [],
        errors: []
      };

      for (const judgeData of judges) {
        try {
          const lookupKey = judgeData.username || judgeData.email;
          const existing = lookupKey ? await this.judgeRepository.findByEmail(lookupKey) : null;

          // Determine if judge should be active based on having complete data
          const hasCompleteData = !!(judgeData.name && judgeData.username && judgeData.password);
          const judgeDataWithStatus = {
            ...judgeData,
            competition: competitionId,
            isActive: hasCompleteData
          };

          if (existing) {
            // Update existing judge
            const updated = await this.judgeRepository.updateById(existing._id, judgeDataWithStatus);
            results.updated.push(updated);
          } else {
            // Create new judge
            const created = await this.judgeRepository.create({
              ...judgeDataWithStatus,
              createdBy: adminId
            });
            results.created.push(created);
          }
        } catch (error) {
          results.errors.push({
            judge: judgeData,
            error: error.message
          });
        }
      }

      this.logger.info('Judges saved', {
        competitionId,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
        adminId
      });

      return results;
    } catch (error) {
      this.logger.error('Save judges error', { 
        competitionId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all judges for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Array of judges
   */
  async getJudges(competitionId, filters = {}) {
    try {
      const query = { competition: competitionId };
      if (filters.gender) query.gender = filters.gender;
      if (filters.ageGroup) query.ageGroup = filters.ageGroup;
      if (filters.competitionTypes) query.competitionTypes = filters.competitionTypes;

      const judges = await this.judgeRepository.find(query, {
        sort: { createdAt: -1 }
      });

      this.logger.info('Judges retrieved', { 
        competitionId, 
        count: judges.length 
      });

      return judges;
    } catch (error) {
      this.logger.error('Get judges error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create a single judge
   * @param {Object} judgeData - Judge data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Created judge
   */
  async createSingleJudge(judgeData, adminId) {
    try {
      const judge = await this.judgeRepository.create({
        ...judgeData,
        createdBy: adminId
      });

      this.logger.info('Judge created', { judgeId: judge._id, adminId });

      return judge;
    } catch (error) {
      this.logger.error('Create judge error', { 
        judgeData, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update a judge
   * @param {string} judgeId - Judge ID
   * @param {Object} updates - Update data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated judge
   * @throws {NotFoundError} If judge not found
   */
  async updateJudge(judgeId, updates, adminId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      const updatedJudge = await this.judgeRepository.updateById(judgeId, {
        ...updates,
        updatedBy: adminId,
        updatedAt: new Date()
      });

      this.logger.info('Judge updated', { judgeId, adminId });

      return updatedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Update judge error', { 
        judgeId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete a judge (soft delete)
   * @param {string} judgeId - Judge ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Deleted judge
   * @throws {NotFoundError} If judge not found
   */
  async deleteJudge(judgeId, adminId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      const deletedJudge = await this.judgeRepository.updateById(judgeId, {
        isActive: false,
        deletedBy: adminId,
        deletedAt: new Date()
      });

      this.logger.info('Judge deleted', { judgeId, adminId });

      return deletedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Delete judge error', { 
        judgeId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all judges summary
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Judges summary with age group breakdown
   */
  async getAllJudgesSummary(competitionId) {
    try {
      const compId = competitionId || this.competitionId;
      const competition = await this.competitionRepository.findById(compId);
      if (!competition) {
        return { summary: [], totalJudges: 0, activeJudges: 0, byCompetition: {} };
      }

      const [totalJudges, activeJudges] = await Promise.all([
        this.judgeRepository.count({ competition: compId }),
        this.judgeRepository.count({ competition: compId, isActive: true })
      ]);

      // Get all judges for this competition
      const judges = await this.judgeRepository.find(
        { competition: compId },
        { select: 'name email gender ageGroup competitionTypes isActive' }
      );

      // Get judges by competition for backward compatibility
      const allJudges = await this.judgeRepository.find({}, {
        select: 'competition'
      });

      const byCompetition = allJudges.reduce((acc, judge) => {
        const compId = judge.competition?.toString();
        if (compId) {
          acc[compId] = (acc[compId] || 0) + 1;
        }
        return acc;
      }, {});

      // Build summary array grouped by gender and age group
      const summaryMap = new Map();

      // Initialize with all age groups from competition
      competition.ageGroups?.forEach(ag => {
        const key = `${ag.gender}_${ag.ageGroup}`;
        summaryMap.set(key, {
          gender: ag.gender,
          ageGroup: ag.ageGroup,
          competitionTypes: {}
        });

        // Initialize competition types from competition
        competition.competitionTypes?.forEach(ct => {
          summaryMap.get(key).competitionTypes[ct] = {
            judges: [],
            hasMinimumJudges: false,
            isStarted: false
          };
        });
      });

      // Add judges to their respective age groups and competition types
      judges.forEach(judge => {
        if (!judge.gender || !judge.ageGroup) return;

        const key = `${judge.gender}_${judge.ageGroup}`;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            gender: judge.gender,
            ageGroup: judge.ageGroup,
            competitionTypes: {}
          });
        }

        const entry = summaryMap.get(key);

        // Add judge to each competition type they're assigned to
        judge.competitionTypes?.forEach(ct => {
          if (!entry.competitionTypes[ct]) {
            entry.competitionTypes[ct] = {
              judges: [],
              hasMinimumJudges: false,
              isStarted: false
            };
          }

          entry.competitionTypes[ct].judges.push({
            _id: judge._id,
            name: judge.name,
            email: judge.email
          });
        });
      });

      // Check if competition types are started and have minimum judges
      competition.startedAgeGroups?.forEach(started => {
        const key = `${started.gender}_${started.ageGroup}`;
        if (summaryMap.has(key)) {
          const entry = summaryMap.get(key);
          if (entry.competitionTypes[started.competitionType]) {
            entry.competitionTypes[started.competitionType].isStarted = true;
          }
        }
      });

      // Update hasMinimumJudges flag (minimum 3 judges required)
      summaryMap.forEach(entry => {
        Object.keys(entry.competitionTypes).forEach(ct => {
          const judgeCount = entry.competitionTypes[ct].judges.length;
          entry.competitionTypes[ct].hasMinimumJudges = judgeCount >= 3;
        });
      });

      const summary = Array.from(summaryMap.values());

      this.logger.info('Judges summary retrieved', { 
        totalJudges, 
        activeJudges, 
        summaryCount: summary.length 
      });

      return {
        summary,
        totalJudges,
        activeJudges,
        byCompetition
      };
    } catch (error) {
      this.logger.error('Get judges summary error', { error: error.message });
      throw error;
    }
  }

  /**
   * Assign judge to competition
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated judge
   * @throws {NotFoundError} If judge or competition not found
   */
  async assignJudgeToCompetition(judgeId, competitionId, adminId) {
    try {
      const [judge, competition] = await Promise.all([
        this.judgeRepository.findById(judgeId),
        this.competitionRepository.findById(competitionId)
      ]);

      if (!judge) {
        throw new NotFoundError('Judge');
      }
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      const updatedJudge = await this.judgeRepository.updateById(judgeId, {
        competition: competitionId,
        assignedBy: adminId,
        assignedAt: new Date()
      });

      this.logger.info('Judge assigned to competition', { 
        judgeId, 
        competitionId, 
        adminId 
      });

      return updatedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Assign judge to competition error', { 
        judgeId, 
        competitionId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Score Management ====================

  /**
   * Bulk save scores (legacy method)
   * @param {Array} scores - Array of score data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} { saved, errors }
   */
  async saveScores(scoreData) {
    try {
      // Validate required fields
      const requiredFields = ['teamId', 'gender', 'ageGroup', 'playerScores'];
      const missingFields = requiredFields.filter(field => !scoreData[field]);
      
      if (missingFields.length > 0) {
        throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Process each player score through calculation service
      const processedPlayerScores = [];
      for (const playerScore of scoreData.playerScores) {
        const calculatedScore = await this.calculationService.calculateCompletePlayerScore(playerScore);
        processedPlayerScores.push(calculatedScore);
      }

      // Prepare score document data
      const scoreDocData = {
        competition: scoreData.competitionId,
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        competitionType: scoreData.competitionType || 'Competition I',
        playerScores: processedPlayerScores,
        judgeDetails: scoreData.judgeDetails || {},
        timeKeeper: scoreData.timeKeeper || '',
        scorer: scoreData.scorer || '',
        remarks: scoreData.remarks || '',
        isLocked: scoreData.isLocked || false
      };

      // Implement upsert logic - find existing score record
      const existingScore = await this.scoreRepository.findOne({
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        competition: scoreData.competitionId
      });

      let savedScore;
      if (existingScore) {
        // Update existing record
        savedScore = await this.scoreRepository.updateById(existingScore._id, scoreDocData);
      } else {
        // Create new record
        savedScore = await this.scoreRepository.create(scoreDocData);
      }

      this.logger.info('Scores saved successfully', {
        scoreId: savedScore._id,
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        isUpdate: !!existingScore
      });

      // Return proper response format
      return {
        scoreId: savedScore._id,
        isLocked: savedScore.isLocked,
        playerScores: savedScore.playerScores
      };
    } catch (error) {
      this.logger.error('Save scores error', { 
        scoreData, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Unlock scores for editing
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async unlockScores(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update scores to unlocked state
      await this.scoreRepository.updateMany(
        { competition: competitionId, ageGroup },
        { isLocked: false, unlockedBy: adminId, unlockedAt: new Date() }
      );

      this.logger.info('Scores unlocked', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.SCORES_UNLOCKED, {
          ageGroup
        });
      }

      return { success: true, message: 'Scores unlocked successfully' };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Unlock scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Lock scores
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async lockScores(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update scores to locked state
      await this.scoreRepository.updateMany(
        { competition: competitionId, ageGroup },
        { isLocked: true, lockedBy: adminId, lockedAt: new Date() }
      );

      this.logger.info('Scores locked', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.SCORES_LOCKED, {
          ageGroup
        });
      }

      return { success: true, message: 'Scores locked successfully' };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Lock scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get team scores with aggregation
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Teams with aggregated scores
   */
  async getTeamScores(competitionId, ageGroup, gender) {
    try {
      // Query the Competition model to get registered teams
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          {
            path: 'registeredTeams.team',
            populate: { path: 'coach' }
          },
          {
            path: 'registeredTeams.players.player'
          }
        ]
      });

      if (!competition) {
        this.logger.warn('Competition not found', { competitionId });
        return [];
      }

      // Filter teams by age group and gender if provided
      let filteredTeams = competition.registeredTeams;
      
      if (ageGroup || gender) {
        filteredTeams = filteredTeams.filter(regTeam => {
          return regTeam.players.some(playerEntry => {
            const matchesAgeGroup = !ageGroup || playerEntry.ageGroup === ageGroup;
            const matchesGender = !gender || playerEntry.gender === gender;
            return matchesAgeGroup && matchesGender;
          });
        });
      }

      const teamsWithScores = await Promise.all(
        filteredTeams.map(async (regTeam) => {
          // Get scores for this team
          const scores = await this.scoreRepository.find({
            competition: competitionId,
            team: regTeam.team._id
          });

          const playerScores = scores.flatMap(s => s.playerScores || []);
          const totalScore = playerScores.reduce((sum, ps) => sum + (ps.finalScore || 0), 0);

          return {
            _id: regTeam.team._id,
            name: regTeam.team.name,
            coach: regTeam.coach,
            players: regTeam.players.map(playerEntry => ({
              ...playerEntry.player.toObject(),
              ageGroup: playerEntry.ageGroup,
              gender: playerEntry.gender
            })),
            scores: playerScores,
            totalScore
          };
        })
      );

      this.logger.info('Team scores retrieved', { competitionId, ageGroup, gender });

      return teamsWithScores;
    } catch (error) {
      this.logger.error('Get team scores error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get individual player scores
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Players with individual scores
   */
  async getIndividualScores(competitionId, ageGroup, gender) {
    try {
      // Build query filters
      const query = { competition: competitionId };
      
      // Only add ageGroup filter if provided
      if (ageGroup) {
        query.ageGroup = ageGroup;
      }

      const scores = await this.scoreRepository.find(query);

      const playerScoresMap = new Map();

      scores.forEach(scoreDoc => {
        (scoreDoc.playerScores || []).forEach(ps => {
          const playerId = ps.playerId?.toString();
          if (playerId) {
            // Apply gender filter if provided
            if (gender && ps.playerGender && ps.playerGender !== gender) {
              return; // Skip this player score
            }
            
            if (!playerScoresMap.has(playerId)) {
              playerScoresMap.set(playerId, {
                playerId: ps.playerId,
                playerName: ps.playerName,
                playerGender: ps.playerGender,
                playerAgeGroup: ps.playerAgeGroup,
                scores: []
              });
            }
            playerScoresMap.get(playerId).scores.push(ps);
          }
        });
      });

      const individualScores = Array.from(playerScoresMap.values());

      this.logger.info('Individual scores retrieved', { 
        competitionId, 
        ageGroup, 
        gender,
        count: individualScores.length 
      });

      return individualScores;
    } catch (error) {
      this.logger.error('Get individual scores error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get team rankings
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Team rankings
   */
  async getTeamRankings(competitionId, ageGroup, gender) {
    try {
      const teamsWithScores = await this.getTeamScores(competitionId, ageGroup, gender);

      // Calculate rankings using CalculationService
      const rankings = this.calculationService.calculateRankings(
        teamsWithScores.map(t => ({
          ...t,
          finalScore: t.totalScore
        }))
      );

      this.logger.info('Team rankings calculated', { 
        competitionId, 
        ageGroup, 
        gender,
        count: rankings.length 
      });

      return rankings;
    } catch (error) {
      this.logger.error('Get team rankings error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get individual player rankings
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Individual rankings
   */
  async getIndividualRankings(competitionId, ageGroup) {
    try {
      const individualScores = await this.getIndividualScores(competitionId, ageGroup);

      // Calculate final score for each player
      const playersWithFinalScores = individualScores.map(player => {
        const finalScore = player.scores.reduce((sum, s) => sum + (s.finalScore || 0), 0);
        return {
          ...player,
          finalScore
        };
      });

      // Calculate rankings using CalculationService
      const rankings = this.calculationService.calculateRankings(playersWithFinalScores);

      this.logger.info('Individual rankings calculated', { 
        competitionId, 
        ageGroup, 
        count: rankings.length 
      });

      return rankings;
    } catch (error) {
      this.logger.error('Get individual rankings error', { 
        competitionId, 
        ageGroup, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Recalculate scores for an age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Recalculation results
   */
  async recalculateScores(competitionId, ageGroup, adminId) {
    try {
      const scores = await this.scoreRepository.find({
        competition: competitionId,
        ageGroup
      });

      let recalculated = 0;

      for (const scoreDoc of scores) {
        if (scoreDoc.playerScores && scoreDoc.playerScores.length > 0) {
          const updatedPlayerScores = scoreDoc.playerScores.map(ps => {
            // Recalculate using CalculationService
            const recalc = this.calculationService.calculateCompletePlayerScore(ps);
            return recalc;
          });

          await this.scoreRepository.updateById(scoreDoc._id, {
            playerScores: updatedPlayerScores,
            recalculatedBy: adminId,
            recalculatedAt: new Date()
          });

          recalculated++;
        }
      }

      this.logger.info('Scores recalculated', { 
        competitionId, 
        ageGroup, 
        recalculated, 
        adminId 
      });

      return {
        success: true,
        recalculated,
        message: `${recalculated} score documents recalculated`
      };
    } catch (error) {
      this.logger.error('Recalculate scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Age Group Management ====================

  /**
   * Start an age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async startAgeGroup(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update age group status
      const ageGroups = competition.ageGroups || [];
      const ageGroupIndex = ageGroups.findIndex(ag => ag.name === ageGroup);

      if (ageGroupIndex === -1) {
        throw new NotFoundError('Age group');
      }

      ageGroups[ageGroupIndex].status = 'started';
      ageGroups[ageGroupIndex].startedAt = new Date();
      ageGroups[ageGroupIndex].startedBy = adminId;

      await this.competitionRepository.updateById(competitionId, {
        ageGroups
      });

      this.logger.info('Age group started', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.AGE_GROUP_STARTED, {
          ageGroup
        });
      }

      return { success: true, message: `Age group ${ageGroup} started` };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Start age group error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * End an age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async endAgeGroup(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update age group status
      const ageGroups = competition.ageGroups || [];
      const ageGroupIndex = ageGroups.findIndex(ag => ag.name === ageGroup);

      if (ageGroupIndex === -1) {
        throw new NotFoundError('Age group');
      }

      ageGroups[ageGroupIndex].status = 'ended';
      ageGroups[ageGroupIndex].endedAt = new Date();
      ageGroups[ageGroupIndex].endedBy = adminId;

      await this.competitionRepository.updateById(competitionId, {
        ageGroups
      });

      // Finalize scores (lock them)
      await this.lockScores(competitionId, ageGroup, adminId);

      this.logger.info('Age group ended', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.AGE_GROUP_ENDED, {
          ageGroup
        });
      }

      return { success: true, message: `Age group ${ageGroup} ended` };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('End age group error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get age group status for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Age group statuses
   */
  async getAgeGroupStatus(competitionId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      const ageGroups = competition.ageGroups || [];

      this.logger.info('Age group status retrieved', { 
        competitionId, 
        count: ageGroups.length 
      });

      return ageGroups;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get age group status error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Transaction Management ====================

  /**
   * Get transactions with filters and pagination
   * @param {Object} filters - Filter criteria (status, dateRange, teamId, coachId)
   * @param {Object} pagination - Pagination options (page, limit)
   * @returns {Promise<Object>} { transactions, total, page, pages }
   */
  async getTransactions(filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 10 } = pagination;

      const skip = (page - 1) * limit;
      const [transactions, total] = await Promise.all([
        this.transactionRepository.find(filters, { 
          skip, 
          limit, 
          sort: { createdAt: -1 },
          populate: ['team', 'coach']
        }),
        this.transactionRepository.count(filters)
      ]);

      this.logger.info('Transactions retrieved', { total });

      return {
        transactions,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Get transactions error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get transaction details
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Transaction details
   * @throws {NotFoundError} If transaction not found
   */
  async getTransactionDetails(transactionId) {
    try {
      const transaction = await this.transactionRepository.findById(transactionId, {
        populate: ['team', 'coach', 'competition']
      });

      if (!transaction) {
        throw new NotFoundError('Transaction');
      }

      this.logger.info('Transaction details retrieved', { transactionId });

      return transaction;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get transaction details error', { 
        transactionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get payment summary for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Payment summary
   */
  async getPaymentSummary(competitionId) {
    try {
      const transactions = await this.transactionRepository.find({
        competition: competitionId
      });

      const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      const paidAmount = transactions
        .filter(t => t.paymentStatus === 'completed')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const pendingAmount = totalAmount - paidAmount;

      this.logger.info('Payment summary retrieved', { competitionId });

      return {
        totalAmount,
        paidAmount,
        pendingAmount,
        transactionCount: transactions.length,
        completedCount: transactions.filter(t => t.paymentStatus === 'completed').length,
        pendingCount: transactions.filter(t => t.paymentStatus === 'pending').length,
        failedCount: transactions.filter(t => t.paymentStatus === 'failed').length
      };
    } catch (error) {
      this.logger.error('Get payment summary error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==================== Public Endpoints ====================

  /**
   * Get public scores for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Public-safe score data
   */
  async getPublicScores(competitionId) {
    try {
      const scores = await this.scoreRepository.find(
        { competition: competitionId, isPublic: true },
        { 
          populate: ['team'],
          select: '-judge -notes -createdBy -updatedBy'
        }
      );

      this.logger.info('Public scores retrieved', { 
        competitionId, 
        count: scores.length 
      });

      return scores;
    } catch (error) {
      this.logger.error('Get public scores error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get public teams for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Public team information
   */
  async getPublicTeams(competitionId) {
    try {
      const teams = await this.teamRepository.find(
        { competition: competitionId, isPublic: true },
        { 
          select: '-coach -paymentStatus -notes'
        }
      );

      // Fetch players for each team (players reference teams, not the other way around)
      const teamsWithPlayers = await Promise.all(
        teams.map(async (team) => {
          const players = await this.playerRepository.find({ team: team._id });
          return {
            ...team,
            players
          };
        })
      );

      this.logger.info('Public teams retrieved', { 
        competitionId, 
        count: teamsWithPlayers.length 
      });

      return teamsWithPlayers;
    } catch (error) {
      this.logger.error('Get public teams error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get public competitions
   * @returns {Promise<Array>} Active/upcoming public competitions
   */
  async getPublicCompetitions() {
    try {
      const competitions = await this.competitionRepository.find({
        status: { $in: ['active', 'upcoming'] },
        isPublic: true,
        isDeleted: false
      }, {
        sort: { startDate: 1 },
        select: '-registeredTeams -createdBy -updatedBy'
      });

      this.logger.info('Public competitions retrieved', { count: competitions.length });

      return competitions;
    } catch (error) {
      this.logger.error('Get public competitions error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get public rankings for a competition and age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Object>} Public rankings (team and individual)
   */
  async getPublicRankings(competitionId, ageGroup) {
    try {
      const [teamRankings, individualRankings] = await Promise.all([
        this.getTeamRankings(competitionId, ageGroup),
        this.getIndividualRankings(competitionId, ageGroup)
      ]);

      this.logger.info('Public rankings retrieved', { competitionId, ageGroup });

      return {
        teamRankings,
        individualRankings
      };
    } catch (error) {
      this.logger.error('Get public rankings error', { 
        competitionId, 
        ageGroup, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = AdminService;
