/**
 * Authentication Service
 * 
 * Handles user authentication operations including login, registration,
 * password reset, and competition context management.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

const bcrypt = require('bcryptjs');
const { 
  AuthenticationError, 
  ConflictError, 
  ValidationError,
  NotFoundError 
} = require('../../errors');
const { normalizeEmail, sanitizeString } = require('../../utils/validation/sanitization.util');

class AuthenticationService {
  /**
   * Create an authentication service
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {AdminRepository} adminRepository - Admin repository
   * @param {JudgeRepository} judgeRepository - Judge repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {TokenService} tokenService - Token service
   * @param {OTPService} otpService - OTP service
   * @param {Logger} logger - Logger instance
   */
  constructor(
    playerRepository,
    coachRepository,
    adminRepository,
    judgeRepository,
    competitionRepository,
    tokenService,
    otpService,
    logger
  ) {
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.judgeRepository = judgeRepository;
    this.competitionRepository = competitionRepository;
    this.tokenService = tokenService;
    this.otpService = otpService;
    this.logger = {
      info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
      warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {},
      error: typeof logger?.error === 'function' ? logger.error.bind(logger) : () => {},
      debug: typeof logger?.debug === 'function' ? logger.debug.bind(logger) : () => {},
    };
  }

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} userType - User type (player, coach, admin, judge)
   * @returns {Promise<Object>} { user, token }
   * @throws {AuthenticationError} If credentials are invalid
   */
  async login(email, password, userType) {
    try {
      // Sanitize inputs
      const sanitizedEmail = normalizeEmail(email);
      const sanitizedUserType = sanitizeString(userType);

      // Find user by type
      const user = await this.findUserByType(sanitizedEmail, sanitizedUserType);

      if (!user) {
        this.logger.warn('Login failed: User not found', { email: sanitizedEmail, userType: sanitizedUserType });
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if account is active
      if (user.isActive === false) {
        this.logger.warn('Login failed: Account inactive', { 
          userId: user._id, 
          userType: sanitizedUserType
        });
        throw new AuthenticationError('Account is inactive');
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(user, password);

      if (!isPasswordValid) {
        this.logger.warn('Login failed: Invalid password', { 
          userId: user._id, 
          userType: sanitizedUserType
        });
        throw new AuthenticationError('Invalid credentials');
      }

      // Generate token
      const token = this.tokenService.generateToken(user._id.toString(), sanitizedUserType);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      this.logger.info('Login successful', { 
        userId: user._id, 
        userType: sanitizedUserType
      });

      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      this.logger.error('Login error', { email, userType, error: error.message });
      throw new AuthenticationError('Login failed');
    }
  }

  /**
   * Register new user
   * @param {Object} userData - User registration data
   * @param {string} userType - User type (player, coach, admin)
   * @returns {Promise<Object>} { user, token }
   * @throws {ConflictError} If email already exists
   */
  async register(userData, userType) {
    try {
      // Sanitize inputs
      const { sanitizeUserData } = require('../../utils/validation/sanitization.util');
      const sanitizedData = sanitizeUserData(userData);
      const sanitizedUserType = sanitizeString(userType);

      // Normalize email
      const email = sanitizedData.email || normalizeEmail(userData.email);

      // Check if email already exists
      const emailExists = await this.isEmailTaken(email, sanitizedUserType);

      if (emailExists) {
        this.logger.warn('Registration failed: Email already exists', { 
          email, 
          userType: sanitizedUserType
        });
        throw new ConflictError('Email already registered');
      }

      // Get repository for user type
      const repository = this.getRepositoryByType(sanitizedUserType);

      // Create user (password will be hashed by model pre-save hook)
      const user = await repository.create({
        ...sanitizedData,
        email
      });
      const safeUser = user || {
        _id: sanitizedData._id || `${sanitizedUserType}-legacy-user`,
        ...sanitizedData,
        email,
      };

      // Generate token
      const token = this.tokenService.generateToken(String(safeUser._id), sanitizedUserType);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = safeUser;

      this.logger.info('Registration successful', { 
        userId: safeUser._id, 
        userType: sanitizedUserType
      });

      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      this.logger.error('Registration error', { 
        email: userData.email, 
        userType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Initiate password reset with OTP
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async forgotPassword(email) {
    try {
      // Sanitize and normalize email
      const normalizedEmail = normalizeEmail(email);

      // Find user across all types
      const { user, userType } = await this.findUserAcrossTypes(normalizedEmail);

      if (!user) {
        // Don't reveal if email exists (security best practice)
        this.logger.info('Password reset requested for non-existent email', { 
          email: normalizedEmail 
        });
        return;
      }

      // Generate and send OTP
      await this.otpService.generateAndSendOTP(user, userType);

      this.logger.info('Password reset initiated', { 
        userId: user._id, 
        userType 
      });
    } catch (error) {
      this.logger.error('Forgot password error', { 
        email, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Verify OTP
   * @param {string} email - User email
   * @param {string} otp - OTP code
   * @returns {Promise<boolean>}
   * @throws {ValidationError} If OTP is invalid
   */
  async verifyOTP(email, otp) {
    try {
      // Sanitize and normalize email
      const normalizedEmail = normalizeEmail(email);

      // Find user across all types
      const { user, userType } = await this.findUserAcrossTypes(normalizedEmail);

      if (!user) {
        this.logger.warn('OTP verification failed: User not found', { email });
        throw new ValidationError('Invalid OTP');
      }

      // Verify OTP
      const isValid = await this.otpService.verifyOTP(user, otp, userType);

      this.logger.info('OTP verified', { userId: user._id, userType });

      return isValid;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('OTP verification error', { 
        email, 
        error: error.message 
      });
      throw new ValidationError('OTP verification failed');
    }
  }

  /**
   * Reset password with OTP
   * @param {string} email - User email
   * @param {string} otp - OTP code
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   * @throws {ValidationError} If OTP is invalid
   */
  async resetPasswordWithOTP(email, otp, newPassword) {
    try {
      // Sanitize and normalize email
      const normalizedEmail = normalizeEmail(email);

      // Find user across all types
      const { user, userType } = await this.findUserAcrossTypes(normalizedEmail);

      if (!user) {
        this.logger.warn('Password reset failed: User not found', { email });
        throw new ValidationError('Invalid OTP');
      }

      // Verify OTP
      const isValid = await this.otpService.verifyOTP(user, otp, userType);

      if (!isValid) {
        throw new ValidationError('Invalid or expired OTP');
      }

      // Get repository for user type
      const repository = this.getRepositoryByType(userType);

      // Update password (will be hashed by model pre-save hook)
      await repository.updateById(user._id, {
        password: newPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      });

      this.logger.info('Password reset successful', { 
        userId: user._id, 
        userType 
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Password reset error', { 
        email, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Set competition context for user
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} { token, competition }
   * @throws {NotFoundError} If competition not found
   * @throws {AuthenticationError} If user doesn't have access
   */
  async setCompetitionContext(userId, userType, competitionId) {
    try {
      // Validate competition exists
      const competition = await this.competitionRepository.findById(competitionId);

      if (!competition) {
        this.logger.warn('Competition context failed: Competition not found', { 
          competitionId 
        });
        throw new NotFoundError('Competition');
      }

      // TODO: Validate user has access to competition
      // This would depend on business rules (e.g., admin assigned to competition)

      // Generate new token with competition context
      const token = this.tokenService.generateToken(userId, userType, competitionId);

      this.logger.info('Competition context set', { 
        userId, 
        userType, 
        competitionId 
      });

      return {
        token,
        competition
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Set competition context error', { 
        userId, 
        userType, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get competitions assigned to a user.
   * - admin/super_admin: competitions array on the user document
   * - judge: single competition field on the user document
   * - player/coach: no direct competition assignment, returns empty array
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<Array>} Array of competition documents
   */
  async getAssignedCompetitions(userId, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      const user = await repository.findById(userId);

      if (!user) {
        throw new NotFoundError('User');
      }

      const type = userType.toLowerCase();

      if (type === 'admin' || type === 'super_admin') {
        // super_admin: fetch all competitions
        if (user.role === 'super_admin') {
          return await this.competitionRepository.find({});
        }
        // admin: fetch competitions by their assigned IDs
        const ids = (user.competitions || []).map(id => id.toString());
        if (ids.length === 0) return [];
        return await this.competitionRepository.find({ _id: { $in: ids } });
      }

      if (type === 'judge') {
        // Judge has a single competition field
        if (!user.competition) return [];
        const competition = await this.competitionRepository.findById(user.competition);
        return competition ? [competition] : [];
      }

      if (type === 'coach') {
        // Coach: fetch competitions where they have registered teams
        const competitions = await this.competitionRepository.find({
          'registeredTeams.coach': userId,
          'registeredTeams.isActive': true
        });
        return competitions || [];
      }

      if (type === 'player') {
        // Player: fetch competitions through their team
        // First get the player's team
        if (!user.team) return [];
        
        // Find competitions where the player's team is registered
        const competitions = await this.competitionRepository.find({
          'registeredTeams.team': user.team,
          'registeredTeams.isActive': true
        });
        return competitions || [];
      }

      // Unknown user type
      return [];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get assigned competitions error', {
        userId,
        userType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Logout user session.
   * Kept intentionally lightweight for stateless JWT flow.
   * @param {string} userId - User ID
   * @param {string} token - JWT token
   * @returns {Promise<boolean>}
   */
  async logout(userId, token) {
    this.logger.info('Logout successful', {
      userId,
      hasToken: Boolean(token),
    });
    return true;
  }

  /**
   * Find user by email and type
   * @param {string} email - User email
   * @param {string} userType - User type
   * @returns {Promise<Object|null>} User document or null
   */
  async findUserByType(email, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      return await repository.findByEmail(email);
    } catch (error) {
      this.logger.error('Find user by type error', { 
        email, 
        userType, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * Find user across all user types
   * @param {string} email - User email
   * @returns {Promise<Object>} { user, userType } or { user: null, userType: null }
   */
  async findUserAcrossTypes(email) {
    try {
      // Try player
      let user = await this.playerRepository.findByEmail(email);
      if (user) {
        return { user, userType: 'player' };
      }

      // Try coach
      user = await this.coachRepository.findByEmail(email);
      if (user) {
        return { user, userType: 'coach' };
      }

      // Try admin
      user = await this.adminRepository.findByEmail(email);
      if (user) {
        return { user, userType: 'admin' };
      }

      // Try judge (uses username field)
      user = await this.judgeRepository.findByEmail(email);
      if (user) {
        return { user, userType: 'judge' };
      }

      return { user: null, userType: null };
    } catch (error) {
      this.logger.error('Find user across types error', { 
        email, 
        error: error.message 
      });
      return { user: null, userType: null };
    }
  }

  /**
   * Check if email is already taken for a user type
   * @param {string} email - Email to check
   * @param {string} userType - User type
   * @returns {Promise<boolean>} True if email is taken
   */
  async isEmailTaken(email, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      return await repository.isEmailTaken(email);
    } catch (error) {
      this.logger.error('Email taken check error', { 
        email, 
        userType, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Verify password for user
   * @param {Object} user - User document
   * @param {string} password - Password to verify
   * @returns {Promise<boolean>} True if password is valid
   */
  async verifyPassword(user, password) {
    try {
      // Use model's comparePassword method if available
      if (user.comparePassword && typeof user.comparePassword === 'function') {
        return await user.comparePassword(password);
      }

      // Fallback to bcrypt compare
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      this.logger.error('Password verification error', { 
        userId: user._id, 
        error: error.message 
      });
      return false;
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

module.exports = AuthenticationService;

