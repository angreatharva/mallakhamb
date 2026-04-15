/**
 * Admin Service
 * 
 * Service for admin-specific operations.
 * Extends UserService with admin-specific functionality.
 * 
 * Requirements: 1.5, 1.8
 */

const UserService = require('./user.service');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../errors');

class AdminService extends UserService {
  /**
   * Create an admin service
   * @param {AdminRepository} adminRepository - Admin repository
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {Logger} logger - Logger instance
   * @param {CacheService|null} cacheService - Cache service (optional)
   */
  constructor(adminRepository, playerRepository, coachRepository, competitionRepository, logger, cacheService = null) {
    super(adminRepository, logger, 'admin', cacheService);
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.competitionRepository = competitionRepository;
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Competition not found');
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Admin not found');
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
        throw new NotFoundError('Admin not found');
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
}

module.exports = AdminService;
