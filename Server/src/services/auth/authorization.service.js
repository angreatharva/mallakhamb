/**
 * Authorization Service
 * 
 * Handles authorization checks including role-based access control,
 * competition-based access control, and resource ownership validation.
 * 
 * Requirements: 1.2, 1.8
 */

const { AuthorizationError, NotFoundError } = require('../../errors');
const { loadAssignments } = require('../../utils/data/judge-assignment.util');

class AuthorizationService {
  /**
   * Create an authorization service
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {AdminRepository} adminRepository - Admin repository
   * @param {JudgeRepository} judgeRepository - Judge repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {Logger} logger - Logger instance
   */
  constructor(
    playerRepository,
    coachRepository,
    adminRepository,
    judgeRepository,
    competitionRepository,
    logger,
    // Appended, not inserted — this constructor is wired positionally.
    judgeAccountRepository = null
  ) {
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.judgeRepository = judgeRepository;
    this.judgeAccountRepository = judgeAccountRepository;
    this.competitionRepository = competitionRepository;
    this.logger = logger;

    // Define role hierarchy (higher number = more permissions)
    this.roleHierarchy = {
      player: 1,
      coach: 2,
      judge: 3,
      admin: 4,
      superadmin: 5
    };
  }

  /**
   * Check if user has required role
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string|string[]} requiredRoles - Required role(s)
   * @returns {Promise<boolean>} True if user has required role
   * @throws {AuthorizationError} If user doesn't have required role
   */
  async checkRole(userId, userType, requiredRoles) {
    try {
      // Normalize to array
      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      // Get user
      const user = await this.getUserByType(userId, userType);

      if (!user) {
        this.logger.warn('Authorization failed: User not found', { 
          userId, 
          userType 
        });
        throw new AuthorizationError('User not found');
      }

      // Check if user's role matches any required role
      const userRole = this.getUserRole(user, userType);
      const hasRole = roles.some(role => 
        role.toLowerCase() === userRole.toLowerCase()
      );

      if (!hasRole) {
        this.logger.warn('Authorization failed: Insufficient role', { 
          userId, 
          userType, 
          userRole, 
          requiredRoles: roles 
        });
        throw new AuthorizationError('Insufficient permissions');
      }

      this.logger.debug('Role check passed', { 
        userId, 
        userType, 
        userRole 
      });

      return true;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Role check error', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw new AuthorizationError('Authorization check failed');
    }
  }

  /**
   * Check if user has minimum role level
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string} minimumRole - Minimum required role
   * @returns {Promise<boolean>} True if user has sufficient role level
   * @throws {AuthorizationError} If user doesn't have sufficient role level
   */
  async checkMinimumRole(userId, userType, minimumRole) {
    try {
      const user = await this.getUserByType(userId, userType);

      if (!user) {
        throw new AuthorizationError('User not found');
      }

      const userRole = this.getUserRole(user, userType);
      const userLevel = this.roleHierarchy[userRole.toLowerCase()] || 0;
      const minimumLevel = this.roleHierarchy[minimumRole.toLowerCase()] || 0;

      if (userLevel < minimumLevel) {
        this.logger.warn('Authorization failed: Insufficient role level', { 
          userId, 
          userType, 
          userRole, 
          minimumRole 
        });
        throw new AuthorizationError('Insufficient permissions');
      }

      this.logger.debug('Minimum role check passed', { 
        userId, 
        userType, 
        userRole 
      });

      return true;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Minimum role check error', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw new AuthorizationError('Authorization check failed');
    }
  }

  /**
   * Check if user has access to competition
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if user has access
   * @throws {AuthorizationError} If user doesn't have access
   * @throws {NotFoundError} If competition not found
   */
  async checkCompetitionAccess(userId, userType, competitionId) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition) {
        this.logger.warn('Competition access check failed: Competition not found', { 
          competitionId 
        });
        throw new NotFoundError('Competition');
      }

      // Get user
      const user = await this.getUserByType(userId, userType);

      if (!user) {
        throw new AuthorizationError('User not found');
      }

      // Check access based on user type
      const hasAccess = await this.checkUserCompetitionAccess(
        user, 
        userType, 
        competitionId
      );

      if (!hasAccess) {
        this.logger.warn('Authorization failed: No competition access', { 
          userId, 
          userType, 
          competitionId 
        });
        throw new AuthorizationError('No access to this competition');
      }

      this.logger.debug('Competition access check passed', { 
        userId, 
        userType, 
        competitionId 
      });

      return true;
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Competition access check error', { 
        userId, 
        userType, 
        competitionId, 
        error: error.message 
      });
      throw new AuthorizationError('Authorization check failed');
    }
  }

  /**
   * Check if user owns a resource
   * @param {string} userId - User ID
   * @param {string} resourceOwnerId - Resource owner ID
   * @returns {Promise<boolean>} True if user owns resource
   * @throws {AuthorizationError} If user doesn't own resource
   */
  async checkResourceOwnership(userId, resourceOwnerId) {
    try {
      const isOwner = userId.toString() === resourceOwnerId.toString();

      if (!isOwner) {
        this.logger.warn('Authorization failed: Not resource owner', { 
          userId, 
          resourceOwnerId 
        });
        throw new AuthorizationError('You do not own this resource');
      }

      this.logger.debug('Resource ownership check passed', { 
        userId, 
        resourceOwnerId 
      });

      return true;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Resource ownership check error', { 
        userId, 
        resourceOwnerId, 
        error: error.message 
      });
      throw new AuthorizationError('Authorization check failed');
    }
  }

  /**
   * Check if user can perform action on resource
   * Combines role check and ownership check
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string} resourceOwnerId - Resource owner ID
   * @param {string[]} allowedRoles - Roles that can access regardless of ownership
   * @returns {Promise<boolean>} True if user can access
   * @throws {AuthorizationError} If user cannot access
   */
  async checkResourceAccess(userId, userType, resourceOwnerId, allowedRoles = []) {
    try {
      // Check if user is owner
      const isOwner = userId.toString() === resourceOwnerId.toString();

      if (isOwner) {
        this.logger.debug('Resource access granted: Owner', { userId });
        return true;
      }

      // Check if user has privileged role
      if (allowedRoles.length > 0) {
        try {
          await this.checkRole(userId, userType, allowedRoles);
          this.logger.debug('Resource access granted: Privileged role', { 
            userId, 
            userType 
          });
          return true;
        } catch (error) {
          // Role check failed, continue to deny access
        }
      }

      this.logger.warn('Authorization failed: No resource access', { 
        userId, 
        userType, 
        resourceOwnerId 
      });
      throw new AuthorizationError('No access to this resource');
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Resource access check error', { 
        userId, 
        userType, 
        resourceOwnerId, 
        error: error.message 
      });
      throw new AuthorizationError('Authorization check failed');
    }
  }

  /**
   * Get user by type
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Object|null>} User document or null
   */
  async getUserByType(userId, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      return await repository.findById(userId);
    } catch (error) {
      this.logger.error('Get user by type error', { 
        userId, 
        userType, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Get user role
   * @param {Object} user - User document
   * @param {string} userType - User type
   * @returns {string} User role
   */
  getUserRole(user, userType) {
    // Admin has explicit role field
    if (userType === 'admin' && user.role) {
      return user.role;
    }

    // Judge has explicit judgeType field
    if (userType === 'judge' && user.judgeType) {
      return 'judge';
    }

    // Other types use their type as role
    return userType;
  }

  /**
   * Check user's competition access based on type
   * @param {Object} user - User document
   * @param {string} userType - User type
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if user has access
   */
  async checkUserCompetitionAccess(user, userType, competitionId) {
    switch (userType.toLowerCase()) {
      case 'admin':
        // Super admin has access to all competitions
        if (user.role === 'superadmin') {
          return true;
        }
        // Regular admin has access to assigned competitions
        return user.competitions && user.competitions.some(
          comp => comp.toString() === competitionId.toString()
        );

      case 'judge':
        // A judge principal is an account, so the competitions they may reach
        // are the ones their seats are in. This is a synchronous check, so it
        // reads assignments the caller has already loaded (`req.judgeAssignments`
        // shape) rather than issuing a query of its own.
        return (user.assignments || []).some(
          (a) => String(a.competition) === String(competitionId)
        );

      case 'coach':
      case 'player':
        // TODO: Implement team-based competition access
        // For now, allow access (will be refined based on business rules)
        return true;

      default:
        return false;
    }
  }

  /**
   * Check if judge can score in a competition
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<boolean>} True if judge can score
   */
  async canJudgeScore(judgeAccountId, competitionId) {
    try {
      const assignments = await loadAssignments(
        this.judgeRepository,
        judgeAccountId,
        competitionId
      );

      if (assignments.length === 0) {
        this.logger.warn('Judge not assigned to competition', {
          judgeAccountId,
          competitionId,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Can judge score check error', {
        judgeAccountId,
        competitionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get judge details including assignment information
   * @param {string} judgeId - Judge ID
   * @returns {Promise<Object|null>} Judge document with assignment details or null
   */
  async getJudgeDetails(judgeAccountId) {
    try {
      const account = this.judgeAccountRepository
        ? await this.judgeAccountRepository.findById(judgeAccountId)
        : null;

      const assignments = await loadAssignments(this.judgeRepository, judgeAccountId);

      // A registered judge on no panel is a real principal with nothing to do:
      // the socket auto-join iterates `assignments` and joins no rooms, which
      // is exactly right.
      if (!account && assignments.length === 0) {
        this.logger.warn('Judge not found for details fetch', { judgeAccountId });
        return null;
      }

      const primary = assignments[0] || {};

      return {
        _id: judgeAccountId,
        name: account?.name || '',
        email: account?.email || null,
        judgeType: primary.judgeType || null,
        gender: primary.gender || null,
        ageGroup: primary.ageGroup || null,
        competitionTypes: primary.competitionTypes || [],
        apparatus: primary.apparatus || null,
        competition: primary.competition || null,
        isActive: account ? account.isActive !== false : true,
        judgeNo: primary.judgeNo || null,
        assignments: assignments.map(a => ({
          gender: a.gender,
          ageGroup: a.ageGroup,
          competitionTypes: a.competitionTypes || [],
          apparatus: a.apparatus,
          judgeType: a.judgeType,
          judgeNo: a.judgeNo,
          competition: a.competition,
        }))
      };
    } catch (error) {
      this.logger.error('Get judge details error', {
        judgeAccountId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get repository by user type
   * @param {string} userType - User type
   * @returns {BaseRepository} Repository instance
   * @throws {Error} If user type is invalid
   */
  getRepositoryByType(userType) {
    switch (userType.toLowerCase()) {
      case 'player':
        return this.playerRepository;
      case 'coach':
        return this.coachRepository;
      case 'admin':
        return this.adminRepository;
      case 'judge':
        return this.judgeRepository;
      default:
        throw new Error(`Invalid user type: ${userType}`);
    }
  }
}

module.exports = AuthorizationService;

