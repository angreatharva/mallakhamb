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
const { toCompetitionTypeSlug, toCompetitionTypeDisplay, validateSlipBreakdown } = require('../../config/cop-rules');
const { calculateIndividualScore } = require('../../utils/scoring/calculation.util');

/**
 * Field projections for the credential-bearing documents this service returns
 * (CRIT-2, CRIT-4). Applied in the service rather than the controller because
 * `getJudges` and `getSubmittedTeams` are shared by the public/judge routers
 * and the admin router — projecting here means no caller can forget.
 *
 * These are positive whitelists: a field added to a model in future is not
 * exposed until it is named here.
 */

// CRIT-4 projections moved to utils/data/user-projection.util.js (task 3.1) so
// the scoring service shares one definition. A duplicated security control is
// one that drifts.
const {
  SUBMITTED_TEAM_COACH_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_COACH_FIELD_LIST,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
  fullName,
  coachCard,
  enteredPlayerCard,
  toMongoProjection,
  stripSensitiveFields,
} = require('../../utils/data/user-projection.util');
const { isSubmittedRegistration } = require('../../utils/data/team-visibility.util');
const { apparatusList } = require('../../utils/data/apparatus.util');
const { pageMeta } = require('../../utils/data/pagination.util');

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
    // The people behind the assignments. Separate collection, separate
    // repository — see src/models/JudgeAccount.js.
    this.judgeAccountRepository = dependencies.judgeAccountRepository;
    this.scoreRepository = dependencies.scoreRepository;
    this.transactionRepository = dependencies.transactionRepository;
    this.calculationService = dependencies.calculationService;
    // Task 3.1: scoring lives in ScoringService now; the methods retained on
    // this class delegate to it. Judge seating left the same way on 2026-09-22
    // and lives in JudgePanelService.
    this.scoringService = dependencies.scoringService;
    this.judgePanelService = dependencies.judgePanelService;
    this.socketManager = dependencies.socketManager;
    // Only for the health endpoint — nothing here sends mail.
    this.emailService = dependencies.emailService;
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
      if (admin.role === 'superadmin') {
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
      if (admin.role === 'superadmin') {
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
      if (admin.role === 'superadmin') {
        this.logger.info('Admin competition access checked', { 
          adminId, 
          competitionId, 
          hasAccess: true,
          reason: 'superadmin'
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
        const profile = stripSensitiveFields(player);
        return { ...profile, userType: 'player' };
      });

      const coachesWithoutPasswords = coaches.map(coach => {
        const profile = stripSensitiveFields(coach);
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

      return { users, ...pageMeta(total, page, limit) };
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
      const profile = stripSensitiveFields(updatedUser);

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
      const profile = stripSensitiveFields(updatedUser);

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
   * @param {string} role - Admin role (admin or superadmin)
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

      const emailStatus = await this.checkEmailStatus();

      this.logger.info('System health checked');

      return {
        database: dbStatus,
        cache: cacheStatus,
        email: emailStatus,
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

  /**
   * Check email provider status.
   *
   * This used to be the literal string `'healthy'` with a comment saying a real
   * check was needed — so the health page reported a working mailer while OTP
   * and password-reset delivery was down, which is precisely the outage this
   * field exists to surface.
   *
   * `verifyConfiguration()` opens an SMTP connection, so it is raced against a
   * deadline: a health endpoint that hangs on a wedged mail server is worse
   * than one that says it does not know.
   *
   * @param {number} [timeoutMs=3000] - How long to wait for the provider
   * @returns {Promise<'healthy'|'unhealthy'|'unavailable'|'unknown'>}
   */
  async checkEmailStatus(timeoutMs = 3000) {
    if (!this.emailService || typeof this.emailService.verifyConfiguration !== 'function') {
      return 'unavailable';
    }

    let timer;
    try {
      const verdict = await Promise.race([
        this.emailService.verifyConfiguration(),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);

      if (verdict === 'timeout') return 'unknown';
      return verdict ? 'healthy' : 'unhealthy';
    } catch (error) {
      this.logger.warn('Email health check failed', { error: error.message });
      return 'unhealthy';
    } finally {
      clearTimeout(timer);
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
      const { ageGroup, gender, ...teamFilters } = filters;

      // Get competition with registered teams
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition || !competition.registeredTeams) {
        this.logger.info('No competition or registered teams found', { competitionId });
        return {
          teams: [],
          total: 0,
          page,
          pages: 0
        };
      }

      // Filter registered teams by active status
      let filteredRegisteredTeams = competition.registeredTeams.filter(rt => rt.isActive);

      // Apply player-level filters (gender/ageGroup)
      if (gender || ageGroup) {
        filteredRegisteredTeams = filteredRegisteredTeams.filter(rt => {
          // Check if any player in the team matches the gender/ageGroup filter
          return rt.players.some(p => {
            const matchesGender = !gender || p.gender === gender;
            const matchesAgeGroup = !ageGroup || p.ageGroup === ageGroup;
            return matchesGender && matchesAgeGroup;
          });
        });
      }

      // Get team IDs
      const teamIds = filteredRegisteredTeams.map(rt => rt.team);

      if (teamIds.length === 0) {
        this.logger.info('No teams match the filters', { competitionId, filters });
        return {
          teams: [],
          total: 0,
          page,
          pages: 0
        };
      }

      /*
       * Paginate BEFORE doing the work, not after.
       *
       * This used to fetch every matching team, issue one player query per team
       * inside a Promise.all, build the whole response, and only then slice the
       * requested page off the end. Asking for 10 rows cost the same as asking
       * for all of them — measured at 100 entered teams, `?limit=10` issued 104
       * queries; at 1,000 teams it is 1,004, for ten rows.
       *
       * `teamFilters` (name, coachName) still has to be applied by the database
       * before the page is cut, or the page would be taken from the wrong set.
       * So: one query to resolve and order the matching ids, then the page, then
       * ONE player query for just that page's athletes.
       */
      const matchingTeams = await this.teamRepository.find(
        { _id: { $in: teamIds }, ...teamFilters },
        { sort: { createdAt: -1 }, select: '_id' }
      );

      const total = matchingTeams.length;
      const skip = (page - 1) * limit;
      const pageIds = matchingTeams.slice(skip, skip + limit).map((team) => team._id);

      if (pageIds.length === 0) {
        return { teams: [], ...pageMeta(total, page, limit) };
      }

      const teams = await this.teamRepository.find(
        { _id: { $in: pageIds } },
        { sort: { createdAt: -1 }, populate: 'coach' }
      );

      // One query for the whole page's athletes, replacing the per-team query
      // that made this an N+1.
      const registeredByTeam = new Map(
        filteredRegisteredTeams.map((rt) => [rt.team.toString(), rt])
      );
      const pagePlayerIds = teams.flatMap((team) => {
        const registeredTeam = registeredByTeam.get(team._id.toString());
        return (registeredTeam?.players || []).map((p) => p.player);
      });
      const playerDocs = pagePlayerIds.length
        ? await this.playerRepository.find({ _id: { $in: pagePlayerIds } })
        : [];
      const playerById = new Map(playerDocs.map((player) => [player._id.toString(), player]));

      const teamsWithPlayers = teams.map((team) => {
        const registeredTeam = registeredByTeam.get(team._id.toString());

        // Driven off the ENTRY rather than the fetched player documents, so an
        // athlete whose account has since been removed still shows the squad
        // place they hold — the previous version dropped the row entirely.
        let playersWithAgeGroups = (registeredTeam?.players || []).map((registeredPlayer) => {
          const player = playerById.get(registeredPlayer.player?.toString());
          if (!player) return null;
          return enteredPlayerCard(player, registeredPlayer);
        }).filter(Boolean);

        // Apply gender and ageGroup filters to the players list
        if (gender || ageGroup) {
          playersWithAgeGroups = playersWithAgeGroups.filter(player => {
            const matchesGender = !gender || player.gender === gender;
            const matchesAgeGroup = !ageGroup || player.ageGroup === ageGroup;
            return matchesGender && matchesAgeGroup;
          });
        }

        return {
          _id: team._id,
          name: team.name,
          coach: coachCard(team.coach),
          playerCount: playersWithAgeGroups.length,
          players: playersWithAgeGroups,
          description: team.description,
          isActive: team.isActive,
          isSubmitted: registeredTeam?.isSubmitted,
          paymentStatus: registeredTeam?.paymentStatus,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt
        };
      });

      this.logger.info('All teams retrieved with filters', {
        competitionId,
        total,
        filters: { ageGroup, gender, ...teamFilters }
      });

      return { teams: teamsWithPlayers, ...pageMeta(total, page, limit) };
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
                gender: registeredPlayer?.gender || player.gender,
                apparatus: registeredPlayer?.apparatus
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
          coach: coachCard(team.coach),
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
      // Log the incoming request
      this.logger.info('AdminService.getSubmittedTeams called', { 
        competitionId, 
        filters 
      });
      
      /*
       * Fetch only this category's submitted registrations.
       *
       * This used to load the WHOLE competition with three levels of populate
       * and filter it in JavaScript: 2.87 MB and ~11,000 populated documents on
       * a 1000-team meet, to answer a question about roughly 830 athletes. Every
       * category read paid for every other category, and the judge dashboard
       * polls this endpoint throughout an event.
       *
       * CRIT-4 still applies and is still enforced: the aggregation projects the
       * same coach and athlete allow-lists the populate did, so bcrypt hashes,
       * e-mail addresses and minors' dates of birth do not leave the database.
       * `projectFields` below is the second line of defence, unchanged.
       */
      const registrations = await this.competitionRepository.findSubmittedRegistrations(
        competitionId,
        { gender: filters.gender, ageGroup: filters.ageGroup },
        {
          coachFields: toMongoProjection(SUBMITTED_TEAM_COACH_FIELDS),
          playerFields: toMongoProjection(SUBMITTED_TEAM_PLAYER_FIELDS),
        }
      );

      // Kept so the rest of this method reads as it did: it works off
      // `competition.registeredTeams`.
      const competition = { registeredTeams: registrations };

      // The competition's own fields are no longer fetched — only its matching
      // registrations are — so there is no name to log here any more.
      this.logger.info('Submitted registrations fetched', {
        competitionId,
        count: registrations.length
      });

      // Filter submitted teams (only teams fully submitted by coach)
      let submittedTeams = (competition.registeredTeams || []).filter(isSubmittedRegistration);
      
      this.logger.info('Submitted teams (before additional filters)', { 
        count: submittedTeams.length 
      });

      // Apply additional filters if provided
      if (filters.gender || filters.ageGroup || filters.competitionType || filters.apparatus) {
        submittedTeams = submittedTeams.filter(regTeam => {
          // Check if any player in the team matches the filters
          return regTeam.players.some(playerEntry => {
            const matchesGender = !filters.gender || playerEntry.gender === filters.gender;
            const matchesAgeGroup = !filters.ageGroup || playerEntry.ageGroup === filters.ageGroup;
            
            let matchesApparatus = true;
            // One reading of the three-shaped Mixed field, shared with the fee
            // engine — see utils/data/apparatus.util.
            const playerApparatuses = apparatusList(
              playerEntry.apparatus,
              filters.competitionType
            );

            if (filters.competitionType && filters.apparatus) {
              matchesApparatus = playerApparatuses.includes(filters.apparatus);
            } else if (filters.competitionType) {
              matchesApparatus = playerApparatuses.length > 0;
            } else if (filters.apparatus) {
              matchesApparatus = playerApparatuses.includes(filters.apparatus);
            }

            return matchesGender && matchesAgeGroup && matchesApparatus;
          });
        });
      }
      
      this.logger.info('Submitted teams (after filters)', { 
        count: submittedTeams.length,
        filters 
      });

      // Transform to expected format, attach per-player finalize status for judge dashboard
      const scoreQuery = { competition: competitionId };
      if (filters.gender) scoreQuery.gender = filters.gender;
      if (filters.ageGroup) scoreQuery.ageGroup = filters.ageGroup;
      if (filters.competitionType) {
        scoreQuery.competitionType = toCompetitionTypeDisplay(filters.competitionType);
      }

      /*
       * Only the fields the loop below reads.
       *
       * This response does not return score documents at all — it returns a
       * per-athlete `isFinalized` / `finalScore` / `hasScore` flag derived from
       * them. Loading whole documents to compute three booleans pulled every
       * judge slip and every COP breakdown in the category across the wire from
       * MongoDB for nothing.
       */
      const scoreDocs = await this.scoreRepository.find(scoreQuery, {
        select: 'teamId isLocked playerScores.playerId playerScores.isFinalized '
          + 'playerScores.finalizedAt playerScores.finalScore playerScores.averageMarks '
          + 'playerScores.deduction playerScores.otherDeduction playerScores.judgeScores '
          + 'playerScores.panelSize '
          // `judgeRole` alone, because the only thing asked of judgeSlips below
          // is whether the array is non-empty. Selecting the slips whole would
          // bring back the COP breakdowns this projection exists to avoid.
          + 'playerScores.judgeSlips.judgeRole',
      });
      const finalizedByPlayer = new Map();
      const scoredByPlayer = new Map();
      for (const doc of scoreDocs || []) {
        const teamKey = doc.teamId?.toString();
        for (const ps of doc.playerScores || []) {
          const pid = ps.playerId?.toString();
          if (!pid) continue;
          const key = `${teamKey}:${pid}`;

          /*
           * Resolve the final to display: the stored value, else the average
           * less the Scorer's deductions, else the same thing recomputed from
           * the slips.
           *
           * The deductions belong in every one of those branches. The time
           * penalty is read off a stopwatch and a Senior Judge's late ruling
           * has no field on a slip, so neither can be recovered from
           * judgeScores — falling back to a bare average hands back a mark the
           * athlete did not earn.
           */
          const afterDeductions = (average) => Math.max(
            0,
            average - (Number(ps.deduction) || 0) - (Number(ps.otherDeduction) || 0)
          );

          let resolvedFinal = typeof ps.finalScore === 'number' ? ps.finalScore : null;
          if ((resolvedFinal == null || resolvedFinal === 0) && ps.averageMarks > 0) {
            resolvedFinal = afterDeductions(ps.averageMarks);
          }
          if ((resolvedFinal == null || resolvedFinal === 0) && ps.judgeScores) {
            /*
             * Recompute for DISPLAY only.
             *
             * This block used to also write the repaired values back —
             * `needsRepair = true` and an `updateById` at the end of the loop —
             * to fix stale 0.00 finals left by the old 3-judge Senior+J1+J2
             * bug. That made a GET take a write lock, on the endpoint the judge
             * dashboard polls throughout an event.
             *
             * The repair is now a migration (007_repair_zero_final_scores),
             * which does it once, offline, for every affected row rather than
             * only the ones somebody happens to look at. The display fallback
             * stays because it is also what shows a correct number for a panel
             * still being scored, which no migration can pre-compute.
             */
            const recomputed = calculateIndividualScore(ps.judgeScores, ps.panelSize);
            if (recomputed.averageMarks > 0) {
              resolvedFinal = afterDeductions(recomputed.averageMarks);
            }
          }

          if (ps.isFinalized || doc.isLocked) {
            finalizedByPlayer.set(key, {
              isFinalized: true,
              finalScore: resolvedFinal,
              finalizedAt: ps.finalizedAt,
            });
          }
          if (ps.isFinalized || (ps.judgeScores && Object.values(ps.judgeScores).some((v) => Number(v) > 0)) || (ps.judgeSlips && ps.judgeSlips.length > 0)) {
            scoredByPlayer.set(key, true);
          }
        }
      }

      const teamsWithPlayers = submittedTeams.map(regTeam => ({
        _id: regTeam.team._id,
        name: regTeam.team.name,
        // CRIT-4: second line of defence. `.toObject()` does not run a schema
        // toJSON transform, so the allow-list is applied explicitly here as
        // well as in the populate projection above.
        coach: projectFields(
          // "Which of these two is the populated coach?" — whichever one has a
          // name on it. Tested on firstName now that the name is two fields.
          (regTeam.coach && regTeam.coach.firstName) ? regTeam.coach :
          (regTeam.team && regTeam.team.coach && regTeam.team.coach.firstName) ? regTeam.team.coach :
          regTeam.coach,
          SUBMITTED_TEAM_COACH_FIELD_LIST
        ),
        isSubmitted: regTeam.isSubmitted,
        submittedAt: regTeam.submittedAt,
        paymentStatus: regTeam.paymentStatus,
        /*
         * Only the athletes in the CATEGORY that was asked for.
         *
         * The team-level filter above keeps a team when ANY of its athletes
         * matches, and this then returned that team's ENTIRE roster. Since a
         * squad is mixed, asking for Male Under-14 returned essentially every
         * athlete in the meet — 10,000 rows on a 1000-team fixture where the
         * category holds about 830.
         *
         * Both consumers already filter to exactly this
         * (JudgeDashboard.getFilteredPlayersForTeam, and the apparatus picker
         * beside it), so the rows being dropped here are rows the client
         * discards on arrival.
         *
         * Deliberately gender + ageGroup ONLY. `apparatus` and
         * `competitionType` are matched client-side by `isRegisteredFor`, which
         * understands the three shapes the field has been written in; a second,
         * simpler implementation here would disagree with it on the older ones.
         */
        players: regTeam.players.filter(playerEntry => {
          if (filters.gender && playerEntry.gender !== filters.gender) return false;
          if (filters.ageGroup && playerEntry.ageGroup !== filters.ageGroup) return false;
          return true;
        }).map(playerEntry => {
          // Handle both Mongoose documents and plain objects
          const playerData = projectFields(playerEntry.player, SUBMITTED_TEAM_PLAYER_FIELD_LIST);
          const playerId = playerData?._id?.toString();
          const key = `${regTeam.team._id?.toString()}:${playerId}`;
          const finalized = finalizedByPlayer.get(key);
          return {
            player: playerData,
            ageGroup: playerEntry.ageGroup,
            gender: playerEntry.gender,
            apparatus: playerEntry.apparatus,
            isFinalized: !!finalized,
            finalScore: finalized?.finalScore ?? null,
            hasScore: scoredByPlayer.has(key),
          };
        })
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

      /*
       * Read from the competition's entries, not from the Player collection.
       *
       * This used to be `playerRepository.find({ competition, ...filters })`.
       * Player has no `competition` path — entry is recorded in
       * `Competition.registeredTeams` — so Mongoose passed the unknown field
       * through, MongoDB matched nothing (unindexed, so a full scan doing it),
       * and the endpoint returned an empty page however many athletes were
       * entered. It answered 200 throughout, so it read as "no athletes yet".
       *
       * `filters.team` rather than `filters.teamId`: the controller maps the
       * query's `teamId` onto `team` before it gets here.
       */
      const skip = (page - 1) * limit;
      const { players, total } = await this.competitionRepository.findEnteredPlayers(
        competitionId,
        filters,
        { skip, limit }
      );

      this.logger.info('All players retrieved', { competitionId, total });

      return { players, ...pageMeta(total, page, limit) };
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
  //
  // Seating judges moved to JudgePanelService on 2026-09-22 — ~700 lines of
  // this class, reaching for only three repositories and the logger. The
  // methods below delegate so that every existing caller (admin.controller,
  // super-admin.controller, the seeding scripts) is unaffected; new callers
  // should resolve `judgePanelService` and skip the hop.

  /**
   * The panel service the delegating methods below use.
   *
   * A getter, for the same reason `scoring` below is one: a missing dependency
   * should fail with an actionable message at the call site rather than
   * "Cannot read properties of undefined (reading 'getJudges')". Several tests
   * construct AdminService by hand; this tells them exactly what to add.
   *
   * @returns {Object} JudgePanelService
   */
  get panels() {
    if (!this.judgePanelService) {
      throw new Error(
        'AdminService.judgePanelService is not set. Judge seating moved to ' +
        'JudgePanelService — pass `judgePanelService` when constructing AdminService.'
      );
    }
    return this.judgePanelService;
  }

  /**
   * Bulk save judges (create or update).
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async saveJudges(competitionId, judges, adminId) {
    return this.panels.saveJudges(competitionId, judges, adminId);
  }

  /**
   * Read a competition's panels back, padded to the drawn layout.
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async getJudges(competitionId, filters = {}) {
    return this.panels.getJudges(competitionId, filters);
  }

  /**
   * Seat one judge.
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async createSingleJudge(judgeData, adminId) {
    return this.panels.createSingleJudge(judgeData, adminId);
  }

  /**
   * Change a seat.
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async updateJudge(judgeId, updates, adminId) {
    return this.panels.updateJudge(judgeId, updates, adminId);
  }

  /**
   * Vacate a seat (soft delete; clears the account so the person can be
   * re-seated elsewhere on the same panel).
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async deleteJudge(judgeId, adminId) {
    return this.panels.deleteJudge(judgeId, adminId);
  }

  /**
   * Every panel at a meet, summarised per category.
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async getAllJudgesSummary(competitionId) {
    return this.panels.getAllJudgesSummary(competitionId);
  }

  /**
   * Point an existing seat at a different competition.
   * @deprecated Delegates to JudgePanelService. Prefer judgePanelService.
   */
  async assignJudgeToCompetition(judgeId, competitionId, adminId) {
    return this.panels.assignJudgeToCompetition(judgeId, competitionId, adminId);
  }

  // ==================== Score Management ====================

  /**
   * Persist a judge slip or a bulk score payload.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async saveScores(scoreData) {
    return this.scoring.saveScores(scoreData);
  }






  /**
   * The scoring service the delegating methods below use.
   *
   * Accessed through a getter so a missing dependency fails with an
   * actionable message at the call site instead of
   * "Cannot read properties of undefined (reading 'getTeamScores')".
   * Several tests construct AdminService by hand; this tells them exactly what
   * to add.
   *
   * @returns {Object} ScoringService
   */
  get scoring() {
    if (!this.scoringService) {
      throw new Error(
        'AdminService.scoringService is not set. Scoring moved to ScoringService in task 3.1 — ' +
        'pass `scoringService` when constructing AdminService.'
      );
    }
    return this.scoringService;
  }

  /**
   * Unlock a single score, recording who did it.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async unlockScore(scoreId, adminId) {
    return this.scoring.unlockScoreAsAdmin(scoreId, adminId);
  }

  /**
   * Unlock every score in an age group.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async unlockScores(competitionId, ageGroup, adminId) {
    return this.scoring.unlockScoresForAgeGroup(competitionId, ageGroup, adminId);
  }

  /**
   * Lock every score in an age group.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async lockScores(competitionId, ageGroup, adminId) {
    return this.scoring.lockScoresForAgeGroup(competitionId, ageGroup, adminId);
  }

  /**
   * Recalculate scores for an age group.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async recalculateScores(competitionId, ageGroup, adminId) {
    return this.scoring.recalculateScores(competitionId, ageGroup, adminId);
  }

  /**
   * Close an age group: lock its scores and mark it ended.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async endAgeGroup(competitionId, ageGroup, adminId) {
    return this.scoring.endAgeGroup(competitionId, ageGroup, adminId);
  }

  /**
   * Get team scores with aggregation.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async getTeamScores(competitionId, ageGroup, gender, competitionType, apparatus, teamId = null) {
    return this.scoring.getTeamScores(competitionId, ageGroup, gender, competitionType, apparatus, teamId);
  }

  /**
   * Get individual player scores.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async getIndividualScores(competitionId, ageGroup, gender, competitionType, apparatus) {
    return this.scoring.getIndividualScores(competitionId, ageGroup, gender, competitionType, apparatus);
  }

  /**
   * Get team rankings.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async getTeamRankings(competitionId, ageGroup, gender, competitionType, apparatus) {
    return this.scoring.getTeamRankings(competitionId, ageGroup, gender, competitionType, apparatus);
  }

  /**
   * Get individual player rankings.
   * @deprecated Delegates to ScoringService (task 3.1). Prefer scoringService.
   */
  async getIndividualRankings(competitionId, ageGroup) {
    return this.scoring.getIndividualRankings(competitionId, ageGroup);
  }


  // ==================== Age Group Management ====================

  /**
   * Start an age group competition type
   * @param {string} competitionId - Competition ID
   * @param {string} gender - Gender (Male/Female)
   * @param {string} ageGroup - Age group
   * @param {string} competitionType - Competition type (competition_1, competition_2, competition_3)
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async startAgeGroup(competitionId, gender, ageGroup, competitionType, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Check if this age group exists in the competition
      const ageGroupExists = competition.ageGroups?.some(
        ag => ag.gender === gender && ag.ageGroup === ageGroup
      );

      if (!ageGroupExists) {
        throw new NotFoundError(`Age group ${gender} ${ageGroup} not found in competition`);
      }

      /*
       * The "already started" check IS the write.
       *
       * This used to read the competition, test `startedAgeGroups` in memory,
       * push, and call `competition.save()`. Two things were wrong with that.
       * The document came from `competitionRepository.findById`, which is
       * `.lean()`, so `.save()` did not exist and every call was a 500. And
       * even hydrated, the check and the write were separate: two admins
       * opening two categories at once would each write back the array as they
       * read it, silently erasing one of the two.
       *
       * The repository does both in one conditional update, so a second attempt
       * modifies nothing and is reported as already started.
       */
      const started = await this.competitionRepository.startAgeGroup(competitionId, {
        gender,
        ageGroup,
        competitionType,
      });

      if (!started) {
        throw new ValidationError(`${competitionType} for ${gender} ${ageGroup} has already been started`);
      }

      this.logger.info('Competition type started', { 
        competitionId, 
        gender, 
        ageGroup, 
        competitionType, 
        adminId 
      });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.AGE_GROUP_STARTED, {
          gender,
          ageGroup,
          competitionType
        });
      }

      return { 
        success: true, 
        message: `${competitionType} for ${gender} ${ageGroup} started successfully` 
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Start age group error', { 
        competitionId, 
        gender,
        ageGroup, 
        competitionType,
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

      /*
       * The competition is NOT populated here any more.
       *
       * It used to be — with `registeredTeams.players.player` populated inside
       * it — which meant every row of a ten-row page carried the ENTIRE
       * competition: every entered team, every athlete in every entry. That is
       * ~3 MB per row, so a single page of transactions was tens of megabytes.
       * It never showed up in the benchmark because the fixture has no
       * transactions, which is exactly how a payload like this survives.
       *
       * What the screen actually does with it (AdminTransactions.jsx) is find
       * the ONE registration matching `tx.team._id` and read its athletes'
       * name, ageGroup, gender and apparatus. So that is what is assembled
       * below, per transaction, from one extra query for the whole page.
       */
      const [transactions, total] = await Promise.all([
        this.transactionRepository.find(filters, {
          skip,
          limit,
          sort: { createdAt: -1 },
          populate: ['team', 'coach']
        }),
        this.transactionRepository.count(filters)
      ]);

      const withEntries = await this.attachTransactionSquads(transactions);

      this.logger.info('Transactions retrieved', { total });

      return {
        // The table shows one name per row (AdminTransactions.jsx), so the two
        // stored halves are composed here.
        transactions: withEntries.map((tx) => (
          tx.coach ? { ...tx, coach: { ...tx.coach, name: fullName(tx.coach) } } : tx
        )),
        ...pageMeta(total, page, limit),
      };
    } catch (error) {
      this.logger.error('Get transactions error', { error: error.message });
      throw error;
    }
  }

  /**
   * Attach each transaction's own squad, and nothing else's.
   *
   * Replaces populating the whole competition onto every row. One query for the
   * page's competitions, one for the page's athletes, then each transaction
   * gets the single registration matching its team — shaped as
   * `competition.registeredTeams: [thatOneEntry]` so AdminTransactions.jsx's
   * existing lookup keeps working unchanged.
   *
   * @param {Object[]} transactions
   * @returns {Promise<Object[]>}
   */
  async attachTransactionSquads(transactions) {
    if (!transactions.length) return transactions;

    const competitionIds = [...new Set(
      transactions.map((tx) => tx.competition?.toString()).filter(Boolean)
    )];
    if (competitionIds.length === 0) return transactions;

    const competitions = await this.competitionRepository.find(
      { _id: { $in: competitionIds } },
      { select: 'name year place registeredTeams' }
    );
    const competitionById = new Map(competitions.map((c) => [c._id.toString(), c]));

    // The entries this page actually refers to — team by team, not the whole
    // meet.
    const wanted = new Map();
    for (const tx of transactions) {
      const competition = competitionById.get(tx.competition?.toString());
      const teamId = tx.team?._id?.toString() || tx.team?.toString();
      if (!competition || !teamId) continue;
      const entry = (competition.registeredTeams || [])
        .find((rt) => rt.team?.toString() === teamId);
      if (entry) wanted.set(`${tx._id}`, { competition, entry });
    }

    const playerIds = [...new Set(
      [...wanted.values()].flatMap(({ entry }) =>
        (entry.players || []).map((p) => p.player?.toString()).filter(Boolean))
    )];
    const players = playerIds.length
      ? await this.playerRepository.find(
        { _id: { $in: playerIds } },
        { select: 'firstName lastName gender' }
      )
      : [];
    const playerById = new Map(players.map((p) => [p._id.toString(), p]));

    return transactions.map((tx) => {
      const match = wanted.get(`${tx._id}`);
      if (!match) return tx;
      const { competition, entry } = match;

      return {
        ...tx,
        competition: {
          _id: competition._id,
          name: competition.name,
          year: competition.year,
          place: competition.place,
          registeredTeams: [{
            ...entry,
            players: (entry.players || []).map((p) => {
              const player = playerById.get(p.player?.toString());
              return {
                ...p,
                player: player
                  ? { _id: player._id, firstName: player.firstName, lastName: player.lastName,
                    gender: player.gender, name: fullName(player) }
                  : p.player,
              };
            }),
          }],
        },
      };
    });
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

      return transaction.coach
        ? { ...transaction, coach: { ...transaction.coach, name: fullName(transaction.coach) } }
        : transaction;
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

}

module.exports = AdminService;
