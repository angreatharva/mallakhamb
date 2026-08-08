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
const { normalizeEmail, sanitizeString, sanitizeUserData } = require('../../utils/validation/sanitization.util');
const { recordLogout } = require('../../utils/security/token-invalidation.util');
const {
  getLockoutState,
  registerFailedAttempt,
  clearedLockoutState,
  lockoutMessage,
} = require('../../utils/security/account-lockout.util');
const { createUserRepositoryResolver } = require('../../utils/user-repository-resolver');

/**
 * LOW-4: a dummy hash to compare against when the account does not exist.
 *
 * Without it, login returned immediately on user-not-found while a real
 * account paid for a bcrypt comparison, so response time told an attacker
 * which e-mail addresses are registered. Computed once at module load — doing
 * it per request would be the same work bcrypt is meant to cost, on every
 * unauthenticated hit.
 *
 * The plaintext is irrelevant and this is not a secret; only the COST of
 * comparing against it matters. It is a literal rather than a `hashSync` call
 * so that importing this module does no bcrypt work at startup, and so unit
 * tests that mock bcrypt do not have to stub `hashSync` to load the file.
 * Generated at cost 12, matching BCRYPT_ROUNDS.
 */
const DUMMY_PASSWORD_HASH = '$2a$12$xkzf6jGVSx6.qXQ/GXY93OiYAmFAjB7Q9ph2ciDNL8cuW.PNc94Mi';

const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;
// Matches the model pre-save hooks and the documented BCRYPT_ROUNDS default.
const DEFAULT_BCRYPT_ROUNDS = 12;

/**
 * Fields that must never reach a client, whatever the query selected.
 *
 * The schema `toJSON` transforms are not a safety net here: BaseRepository
 * queries use `.lean()`, so results are plain objects the transform never sees,
 * and `.toObject()` does not run a toJSON transform either.
 */
const SENSITIVE_USER_FIELDS = [
  'password',
  'resetPasswordToken',
  'resetPasswordExpires',
  'loginAttempts',
  'lockUntil',
];

/**
 * Remove every sensitive field from a user object destined for a response.
 * @param {Object} userObject
 * @returns {Object} a copy without the sensitive fields
 */
function stripSensitiveFields(userObject) {
  const safe = { ...userObject };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete safe[field];
  }
  return safe;
}

/**
 * Read a security setting from the config singleton.
 *
 * This service is constructed positionally by the DI container and has no
 * `config` dependency; adding one would change the constructor signature that
 * bootstrap wires by position. The singleton is read directly instead, and
 * defensively: unit tests build the service without ever calling
 * `config.load()`, and a lockout policy is not worth throwing over.
 *
 * @param {string} key - Dot path under the config root
 * @param {number} fallback
 * @returns {number}
 */
function securitySetting(key, fallback) {
  try {
    const value = require('../../config/config-manager').get(key);
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  } catch {
    return fallback;
  }
}

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

    // Shared repository resolver (MED-13)
    this._repoResolver = createUserRepositoryResolver({
      playerRepository,
      coachRepository,
      adminRepository,
      judgeRepository,
    });
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

      // Find user by type. `password` is `select: false` on every user schema,
      // so the login lookup has to opt back into it or verifyPassword sees nothing.
      // MED-1: the lockout counters are `select: false`, so opt into them here
      // alongside the password or enforcement silently does nothing.
      const user = await this.findUserByType(sanitizedEmail, sanitizedUserType, {
        select: '+password +loginAttempts +lockUntil',
      });

      if (!user) {
        // LOW-4: burn a comparable amount of time before returning, so an
        // unregistered e-mail is not distinguishable by response latency.
        await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
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

      // MED-1: refuse a locked account before spending a password comparison.
      const lockout = getLockoutState(user);
      if (lockout.isLocked) {
        this.logger.warn('Login failed: Account locked', {
          userId: user._id,
          userType: sanitizedUserType,
          remainingMinutes: lockout.remainingMinutes,
        });
        throw new AuthenticationError(lockoutMessage(lockout.remainingMinutes));
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(user, password);

      if (!isPasswordValid) {
        const next = registerFailedAttempt(user, {
          maxAttempts: securitySetting('security.maxLoginAttempts', DEFAULT_MAX_LOGIN_ATTEMPTS),
          lockoutMinutes: securitySetting('security.lockoutDuration', DEFAULT_LOCKOUT_MINUTES),
        });

        await this.persistLockoutState(sanitizedUserType, user._id, {
          loginAttempts: next.loginAttempts,
          lockUntil: next.lockUntil,
        });

        this.logger.warn('Login failed: Invalid password', {
          userId: user._id,
          userType: sanitizedUserType,
          attempts: next.loginAttempts,
          locked: next.isLocked,
        });

        // Tell the user they are now locked out rather than letting them keep
        // guessing against a door that is already shut.
        if (next.isLocked) {
          throw new AuthenticationError(lockoutMessage(next.remainingMinutes));
        }
        throw new AuthenticationError('Invalid credentials');
      }

      // A successful login always clears the counter, so nobody carries a
      // stale tally into their next session.
      if (user.loginAttempts || user.lockUntil) {
        await this.persistLockoutState(sanitizedUserType, user._id, clearedLockoutState());
      }

      // Generate token
      const token = this.tokenService.generateToken(user._id.toString(), sanitizedUserType);

      // Strip every sensitive field from the response.
      //
      // `password` alone is not enough. The schema `toJSON` transform does NOT
      // run here — BaseRepository queries are `.lean()`, so this is a plain
      // object, and `.toObject()` does not apply a toJSON transform either. On
      // top of that, this login lookup deliberately re-selects the normally
      // hidden `loginAttempts`/`lockUntil` counters, which would otherwise ride
      // out in the response. Caught by tests/security/account-lockout.security.
      const userObject = user.toObject ? user.toObject() : { ...user };
      const userWithoutPassword = stripSensitiveFields(userObject);

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

      // Remove password and every other sensitive field from the response.
      const userWithoutPassword = stripSensitiveFields(safeUser);

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

      // Verify OTP (read-only verification check first)
      const isValid = await this.otpService.verifyOTP(user, otp, userType);

      if (!isValid) {
        throw new ValidationError('Invalid or expired OTP');
      }

      // Validate password strength (MED-9)
      if (!newPassword || newPassword.length < 8) {
        throw new ValidationError('Password must be at least 8 characters long');
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        throw new ValidationError('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }

      // MED-3: this hardcoded 10 while every model pre-save hook uses 12 and
      // BCRYPT_ROUNDS documents 12, so any password set through the reset flow
      // was hashed more weakly than one set at registration. Read the
      // configured cost instead.
      const salt = await bcrypt.genSalt(securitySetting('security.bcryptRounds', DEFAULT_BCRYPT_ROUNDS));
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Get repository for user type
      const repository = this.getRepositoryByType(userType);

      // Atomic find and update under matching conditions to prevent parallel replay
      const updatedUser = await repository.model.findOneAndUpdate(
        {
          _id: user._id,
          resetPasswordToken: otp,
          resetPasswordExpires: { $gt: new Date() }
        },
        {
          $set: {
            password: hashedPassword,
            resetPasswordToken: null,
            resetPasswordExpires: null
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        throw new ValidationError('Invalid or expired OTP');
      }

      // Clear OTP explicitly
      await this.otpService.clearOTP(user._id, userType);

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
   * - admin/superadmin: competitions array on the user document
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

      if (type === 'admin' || type === 'superadmin' || type === 'super_admin') {
        // superadmin: fetch all competitions
        if (user.role === 'superadmin' || user.role === 'super_admin') {
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
        // Player: fetch competitions where they are actually added to the team roster
        // First get the player's team
        if (!user.team) return [];
        
        // Find competitions where:
        // 1. The player's team is registered
        // 2. The player is in the team's players array
        const competitions = await this.competitionRepository.find({
          'registeredTeams.team': user.team,
          'registeredTeams.players.player': userId,
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
    if (userId != null) {
      recordLogout(userId.toString());
    }
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
   * @param {Object} options - Query options. Pass { select: '+password' } to load
   *   the credential hash; it is excluded by default on every user schema.
   * @returns {Promise<Object|null>} User document or null
   */
  async findUserByType(email, userType, options = {}) {
    try {
      const repository = this.getRepositoryByType(userType);
      return await repository.findByEmail(email, options);
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
    return this._repoResolver.getRepositoryByType(userType);
  }

  /**
   * Persist the account-lockout counters (MED-1).
   *
   * Writes straight through the model rather than `repository.updateById`,
   * which branches on `updates.password` for re-hashing and runs full document
   * validation — neither is wanted for a counter bump, and a validation error
   * on an unrelated legacy field must never turn a failed login into a 500.
   *
   * Failures here are logged and swallowed on purpose: losing a lockout
   * increment is far better than breaking authentication for everyone.
   *
   * @param {string} userType
   * @param {*} userId
   * @param {{loginAttempts: number, lockUntil: Date|null}} state
   * @returns {Promise<void>}
   */
  async persistLockoutState(userType, userId, state) {
    try {
      const repository = this.getRepositoryByType(userType);
      if (!repository?.model?.updateOne) return;
      await repository.model.updateOne({ _id: userId }, { $set: state });
    } catch (error) {
      this.logger.error('Failed to persist account lockout state', {
        userType,
        userId: String(userId),
        error: error.message,
      });
    }
  }
}

module.exports = AuthenticationService;

