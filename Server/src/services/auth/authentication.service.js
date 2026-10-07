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
  AuthorizationError,
  ConflictError,
  ValidationError,
  NotFoundError
} = require('../../errors');
const { noopMetrics } = require('../../infrastructure/prometheus/registry');
// One rule for "may this principal act on this meet", shared with
// middleware/competition-context.middleware so the token-minting half and the
// per-request half can never disagree.
const {
  isCompetitionScoped,
  mayActOnCompetition,
} = require('../../utils/security/competition-access.util');
const { loadAssignments, competitionsFor } = require('../../utils/data/judge-assignment.util');
const { normalizeEmail, sanitizeString, sanitizeUserData } = require('../../utils/validation/sanitization.util');
const { recordLogout } = require('../../utils/security/token-invalidation.util');
const {
  getLockoutState,
  registerFailedAttempt,
  clearedLockoutState,
  lockoutMessage,
} = require('../../utils/security/account-lockout.util');
const { createUserRepositoryResolver } = require('../../utils/auth/user-repository-resolver');
const { INVALID_CODE_MESSAGE } = require('./otp.service');
// Shared so /auth/me and login can never disagree about what is sensitive.
const { stripSensitiveFields } = require('../../utils/data/user-projection.util');
// Shared with judge.service, which authenticates against a different collection
// and so used to carry its own copy of both of these.
const {
  equalizeFailedLoginTiming,
  securitySetting,
  lockoutPolicy,
  DEFAULT_BCRYPT_ROUNDS,
} = require('../../utils/security/login-security.util');

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
    logger,
    // Appended rather than inserted: the DI container wires this constructor
    // positionally, and every existing caller passes eight arguments.
    judgeAccountRepository = null,
    // Prometheus metrics; optional and last for the same reason.
    metrics = noopMetrics
  ) {
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.judgeRepository = judgeRepository;
    // A judge login is an account, not a panel seat. Falls back to the
    // assignment repository for the harnesses that construct this service with
    // the old argument list.
    this.judgeAccountRepository = judgeAccountRepository || judgeRepository;
    this.competitionRepository = competitionRepository;
    this.tokenService = tokenService;
    this.otpService = otpService;
    this.metrics = metrics || noopMetrics;
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
      judgeAccountRepository: this.judgeAccountRepository,
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
    // For mallakhamb_auth_logins_total: anything that fails is a 'failure'
    // unless it was refused by the lockout.
    let failureOutcome = 'failure';
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
        await equalizeFailedLoginTiming(password);
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
        failureOutcome = 'locked';
        throw new AuthenticationError(lockoutMessage(lockout.remainingMinutes));
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(user, password);

      if (!isPasswordValid) {
        const next = registerFailedAttempt(user, lockoutPolicy());

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
          failureOutcome = 'locked';
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

      this.metrics.business.login(sanitizedUserType, 'success');
      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      this.metrics.business.login(userType, failureOutcome);
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
   * @param {string} [userType] - Which account to reset (player, coach, admin,
   *   judge). One email can own several role accounts; without this the first
   *   match wins (player → coach → admin → judge).
   * @returns {Promise<void>}
   */
  async forgotPassword(email, userType = null) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const { user, userType: foundType } = await this.findUserAcrossTypes(normalizedEmail, userType);

      if (!user) {
        // Don't reveal if email exists (security best practice)
        this.logger.info('Password reset requested for non-existent email', {
          email: normalizedEmail,
          userType
        });
        return;
      }

      // Stores the code and starts the email in the background.
      await this.otpService.generateAndSendOTP(user, foundType);

      this.logger.info('Password reset initiated', {
        userId: user._id,
        userType: foundType
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
   * @param {string} [userType] - Account type, as for forgotPassword
   * @returns {Promise<boolean>}
   * @throws {ValidationError} If OTP is invalid
   */
  async verifyOTP(email, otp, userType = null) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const { user, userType: foundType } = await this.findUserAcrossTypes(normalizedEmail, userType);

      if (!user) {
        this.logger.warn('OTP verification failed: User not found', { email });
        throw new ValidationError(INVALID_CODE_MESSAGE);
      }

      const isValid = await this.otpService.verifyOTP(user, otp, foundType);

      this.logger.info('OTP verified', { userId: user._id, userType: foundType });

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
   * @param {string} [userType] - Account type, as for forgotPassword
   * @returns {Promise<void>}
   * @throws {ValidationError} If OTP is invalid
   */
  async resetPasswordWithOTP(email, otp, newPassword, userType = null) {
    try {
      // Validate password strength (MED-9) first: a weak password is the
      // user's typo, and must not cost them one of their code attempts.
      if (!newPassword || newPassword.length < 8) {
        throw new ValidationError('Password must be at least 8 characters long');
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        throw new ValidationError('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }

      const normalizedEmail = normalizeEmail(email);
      const { user, userType: foundType } = await this.findUserAcrossTypes(normalizedEmail, userType);

      if (!user) {
        this.logger.warn('Password reset failed: User not found', { email });
        throw new ValidationError(INVALID_CODE_MESSAGE);
      }

      // Read-only check first; counts a wrong guess against the code.
      await this.otpService.verifyOTP(user, otp, foundType);

      // MED-3: this hardcoded 10 while every model pre-save hook uses 12 and
      // BCRYPT_ROUNDS documents 12, so any password set through the reset flow
      // was hashed more weakly than one set at registration. Read the
      // configured cost instead.
      const salt = await bcrypt.genSalt(securitySetting('security.bcryptRounds', DEFAULT_BCRYPT_ROUNDS));
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const repository = this.getRepositoryByType(foundType);

      // Atomic find-and-update under the matching code, so a parallel replay of
      // the same code can't reset twice. Proving control of the mailbox also
      // ends any login lockout — otherwise a locked-out user who just reset
      // their password still couldn't sign in.
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
            resetPasswordExpires: null,
            resetPasswordAttempts: 0,
            loginAttempts: 0,
            lockUntil: null
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        throw new ValidationError(INVALID_CODE_MESSAGE);
      }

      await this._endSessionsAfterPasswordChange(user._id, foundType);
      this.otpService.notifyPasswordChanged?.(user, foundType);

      this.logger.info('Password reset successful', {
        userId: user._id,
        userType: foundType
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
   * After a password reset, sign the account out everywhere: revoke every
   * refresh token and invalidate access tokens issued before now. Whoever held
   * the old password (or a stolen session) must not stay signed in.
   * Best-effort — the password is already changed, so a failure here is
   * logged rather than reported to the user as a failed reset.
   * @private
   */
  async _endSessionsAfterPasswordChange(userId, userType) {
    try {
      if (typeof this.tokenService?.revokeAllRefreshTokens === 'function') {
        await this.tokenService.revokeAllRefreshTokens(userId.toString());
      }
      await recordLogout(userId.toString());
    } catch (error) {
      this.logger.error('Failed to end sessions after password reset', {
        userId,
        userType,
        error: error.message
      });
    }
  }

  /**
   * Set competition context for user
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} { token, competition }
   * @throws {NotFoundError} If competition not found
   * @throws {AuthorizationError} If the user is not assigned to the competition
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

      /*
       * The token this mints is what every admin route trusts, so the meet has
       * to be one the caller is assigned to. This carried a `TODO: Validate
       * user has access to competition` for as long as the route existed —
       * meaning any authenticated admin could mint a token for any meet in the
       * database and act on it.
       *
       * Only admins are scoped this way; see
       * `utils/security/competition-access.util` for why coaches and players
       * are not, and `JudgeService.setCompetitionContext` for judges, who are
       * scoped by their seats and must use their own route (this one cannot
       * see the `judgeassignments` collection).
       */
      if (String(userType || '').toLowerCase() === 'judge') {
        throw new AuthorizationError(
          'Judges switch competitions through /api/judge/competition/:competitionId/set, ' +
          'which checks panel assignments.'
        );
      }

      if (isCompetitionScoped(userType)) {
        const admin = await this.adminRepository.findById(userId);

        if (!mayActOnCompetition(admin, userType, competitionId)) {
          this.logger.warn('Competition context refused: not assigned', {
            userId,
            userType,
            competitionId,
          });
          throw new AuthorizationError('You are not assigned to this competition.');
        }
      }

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
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
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
        // A judge login is an ACCOUNT and carries no competition field — their
        // meets are the ones they hold a seat at, in `judgeassignments`. This
        // used to read `user.competition`, which JudgeAccount has never had, so
        // it returned [] for every judge. `JudgeService.getAssignedCompetitions`
        // is the same query and is what the judge client actually calls.
        const assignments = await loadAssignments(this.judgeRepository, user._id);
        const ids = competitionsFor(assignments);
        if (ids.length === 0) return [];
        return await this.competitionRepository.find({ _id: { $in: ids } });
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
   * @param {string} [onlyType] - Restrict the search to one account type. The
   *   same address may own a player, a coach and a judge account; the reset
   *   flow passes the type of the portal the user came from.
   * @returns {Promise<Object>} { user, userType } or { user: null, userType: null }
   */
  async findUserAcrossTypes(email, onlyType = null) {
    // Judges are looked up in the account collection: a panel seat never had
    // an address to send an OTP to.
    const order = [
      ['player', this.playerRepository],
      ['coach', this.coachRepository],
      ['admin', this.adminRepository],
      ['judge', this.judgeAccountRepository],
    ];

    try {
      for (const [userType, repository] of order) {
        if (onlyType && userType !== onlyType) continue;
        const user = await repository.findByEmail(email);
        if (user) {
          return { user, userType };
        }
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

