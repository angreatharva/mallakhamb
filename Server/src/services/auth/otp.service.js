/**
 * OTP Service
 * 
 * Handles OTP generation, validation, and email sending.
 * Integrates with email service and tracks OTP attempts and expiration.
 * 
 * Requirements: 1.5, 1.8
 */

const crypto = require('crypto');
const { ValidationError } = require('../../errors');
const { createUserRepositoryResolver } = require('../../utils/auth/user-repository-resolver');

/**
 * One message for every way a code can fail — unknown email, no code issued,
 * expired, wrong, or burnt by too many guesses. Distinct messages told a
 * caller which addresses had accounts ("No OTP found" vs "Invalid OTP").
 */
const INVALID_CODE_MESSAGE = 'That code is invalid or has expired. Check your latest email or request a new code.';

// Wrong guesses allowed against one code before it is discarded. The per-IP
// rate limit alone doesn't stop guesses spread across many IPs.
const DEFAULT_MAX_OTP_ATTEMPTS = 5;

class OTPService {
  /**
   * Create an OTP service
   * @param {ConfigManager} configManager - Configuration manager instance
   * @param {Logger} logger - Logger instance
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {CoachRepository} coachRepository - Coach repository
   * @param {AdminRepository} adminRepository - Admin repository
   * @param {EmailService} emailService - Email service instance (optional)
   * @param {JudgeRepository} judgeRepository - Judge repository (optional)
   */
  constructor(configManager, logger, playerRepository, coachRepository, adminRepository, emailService = null, judgeRepository = null, judgeAccountRepository = null) {
    this.config = configManager;
    this.logger = logger;
    this.playerRepository = playerRepository;
    this.coachRepository = coachRepository;
    this.adminRepository = adminRepository;
    this.emailService = emailService;

    // Shared repository resolver (MED-13) — now includes judge type. An OTP is
    // written to and read from the judge's ACCOUNT; a panel seat has no
    // address to send one to.
    this._repoResolver = createUserRepositoryResolver({
      playerRepository,
      coachRepository,
      adminRepository,
      judgeRepository,
      judgeAccountRepository,
    });
  }

  /**
   * Generate OTP code
   * @returns {string} OTP code
   */
  generateOTPCode() {
    const otpLength = this.config.get('security.otpLength');
    const max = Math.pow(10, otpLength) - 1;
    const min = Math.pow(10, otpLength - 1);
    
    const otp = crypto.randomInt(min, max + 1);
    return otp.toString();
  }

  /**
   * Generate an OTP, store it on the account, and start sending the email.
   *
   * The email is sent in the background: the request no longer waits on the
   * mail provider. That keeps forgot-password fast when the provider is slow or
   * unreachable, and stops the response time from revealing whether an account
   * exists (an unknown address returned in 0.4 s, a real one after the send).
   * Delivery failures are logged and counted by EmailService
   * (mallakhamb_emails_sent_total{outcome="failed"}).
   *
   * @param {Object} user - User object
   * @param {string} userType - User type (player, coach, admin, judge)
   * @returns {Promise<{delivery: Promise<void>}>} resolves once the OTP is
   *   stored; `delivery` settles when the email attempt finishes (never rejects)
   */
  async generateAndSendOTP(user, userType) {
    const otp = this.generateOTPCode();
    const otpExpiryMinutes = this.config.get('security.otpExpiry');
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    try {
      const repository = this.getRepositoryByType(userType);
      await repository.updateById(user._id, {
        resetPasswordToken: otp,
        resetPasswordExpires: expiresAt,
        resetPasswordAttempts: 0
      });
    } catch (error) {
      this.logger.error('OTP generation failed', {
        userId: user._id,
        userType,
        error: error.message
      });
      throw error;
    }

    this.logger.info('OTP generated', { userId: user._id, userType });

    const delivery = this._sendInBackground('OTP', user, userType, (to) =>
      this.emailService.sendOTP(to, {
        otp,
        userName: user.name || user.firstName || user.username || 'User',
        expiryMinutes: otpExpiryMinutes
      }),
      { otp }
    );

    return { delivery };
  }

  /**
   * Tell the account holder their password was just changed, so a reset they
   * didn't ask for doesn't go unnoticed. Background, never throws.
   * @param {Object} user
   * @param {string} userType
   * @returns {Promise<void>}
   */
  notifyPasswordChanged(user, userType) {
    return this._sendInBackground('password-changed notice', user, userType, (to) =>
      this.emailService.sendPasswordReset(to, {
        userName: user.name || user.firstName || user.username || 'User'
      })
    );
  }

  /**
   * Mail the code that proves a new address works, TO that address. Background,
   * never throws.
   * @param {string} to - the new address
   * @param {{userName: string, code: string, expiryMinutes: number}} data
   * @returns {Promise<void>}
   */
  sendEmailChangeCode(to, { userName, code, expiryMinutes }) {
    return this._sendInBackground('email-change code', { email: to }, 'account', (address) =>
      this.emailService.sendNotification(address, {
        userName,
        title: 'Confirm your new email address',
        message: [
          `Your confirmation code is ${code}.`,
          '',
          `Enter it on your profile page within ${expiryMinutes} minutes to use this address for your Mallakhamb account.`,
          'If you did not ask for this, ignore this email — nothing changes.',
        ].join('\n'),
      }),
      { code }
    );
  }

  /**
   * Tell the OLD address that the account's email was changed away from it,
   * so a change the owner did not make does not go unnoticed. Background,
   * never throws.
   * @param {string} to - the address being replaced
   * @param {{userName: string, newEmail: string}} data
   * @returns {Promise<void>}
   */
  notifyEmailChanged(to, { userName, newEmail }) {
    return this._sendInBackground('email-changed notice', { email: to }, 'account', (address) =>
      this.emailService.sendNotification(address, {
        userName,
        title: 'Your email address was changed',
        message: [
          `The email on your Mallakhamb account is now ${newEmail}.`,
          '',
          'If you did not make this change, reset your password and contact the organisers.',
        ].join('\n'),
      })
    );
  }

  /**
   * Mail one or more Player IDs to an address: the new player's own at
   * registration, or every child under a guardian's address when someone
   * there has forgotten one. Background, never throws.
   * @param {string} to
   * @param {Array<{firstName: string, lastName: string, loginId: string}>} players
   * @param {'registered'|'reminder'} reason
   * @returns {Promise<void>}
   */
  notifyPlayerLoginIds(to, players, reason) {
    const lines = players
      .filter((p) => p?.loginId)
      .map((p) => `${[p.firstName, p.lastName].filter(Boolean).join(' ')}: ${p.loginId}`);
    if (!to || lines.length === 0) return Promise.resolve();

    const registered = reason === 'registered';
    const message = [
      registered
        ? 'Your player account is ready. Sign in with this Player ID and the password you chose:'
        : 'Someone asked for the Player IDs registered with this email address:',
      '',
      ...lines,
      '',
      registered
        ? 'Keep it somewhere safe. Your coach can also see it on the team roster.'
        : 'Sign in with the Player ID. To reset a password, choose "Forgot password" and enter the Player ID.',
    ].join('\n');

    const recipient = { _id: players[0]._id, email: to };
    return this._sendInBackground('Player ID', recipient, 'player', (address) =>
      this.emailService.sendNotification(address, {
        userName: registered ? players[0].firstName : 'there',
        title: registered ? 'Your Player ID' : 'Your Player IDs',
        message,
      })
    );
  }

  /**
   * Run an email send without letting it reject. Returns the settled promise
   * so tests can await the attempt; production callers ignore it.
   * @private
   */
  _sendInBackground(what, user, userType, send, devExtras = {}) {
    const to = user.email || user.username;

    if (!this.emailService) {
      // Without an email service the code is only reachable from the log.
      if (this.config.get('server.nodeEnv') === 'development') {
        this.logger.info(`${what} not emailed (DEV MODE - no email service)`, {
          userId: user._id, userType, email: to, ...devExtras
        });
      }
      return Promise.resolve();
    }

    return Promise.resolve()
      .then(() => send(to))
      .then(() => {
        this.logger.info(`${what} email sent`, { userId: user._id, userType, email: to });
      })
      .catch((error) => {
        this.logger.error(`Failed to send ${what} email`, {
          userId: user._id,
          userType,
          error: error.message
        });
      });
  }

  /**
   * Verify OTP for user. Every failure throws the same INVALID_CODE_MESSAGE.
   * A wrong guess is counted on the account; at the cap the code is discarded
   * and the user has to request a new one.
   * @param {Object} user - User object (as loaded by findByEmail)
   * @param {string} otp - OTP code to verify
   * @param {string} userType - User type (player, coach, admin, judge)
   * @returns {Promise<boolean>} True if OTP is valid
   * @throws {ValidationError} If OTP is missing, expired, wrong or exhausted
   */
  async verifyOTP(user, otp, userType) {
    const stored = user.resetPasswordToken;

    if (!stored) {
      this.logger.warn('OTP verification failed: no code issued', { userId: user._id, userType });
      throw new ValidationError(INVALID_CODE_MESSAGE);
    }

    if (!user.resetPasswordExpires || new Date() > new Date(user.resetPasswordExpires)) {
      this.logger.warn('OTP verification failed: code expired', { userId: user._id, userType });
      throw new ValidationError(INVALID_CODE_MESSAGE);
    }

    if (!this._codesMatch(stored, otp)) {
      await this._recordWrongGuess(user, stored, userType);
      throw new ValidationError(INVALID_CODE_MESSAGE);
    }

    this.logger.info('OTP verified successfully', { userId: user._id, userType });
    return true;
  }

  /**
   * Constant-time comparison, so response timing can't leak how many leading
   * digits were right.
   * @private
   */
  _codesMatch(stored, given) {
    const a = Buffer.from(String(stored));
    const b = Buffer.from(String(given ?? ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Count a wrong guess atomically and discard the code at the cap. Guarded on
   * the stored code, so a guess against an older code can't burn a newer one.
   * @private
   */
  async _recordWrongGuess(user, stored, userType) {
    const maxAttempts = this.config.get('security.otpMaxAttempts') || DEFAULT_MAX_OTP_ATTEMPTS;
    const model = this.getRepositoryByType(userType)?.model;
    if (!model?.findOneAndUpdate) return;

    try {
      const updated = await model.findOneAndUpdate(
        { _id: user._id, resetPasswordToken: stored },
        { $inc: { resetPasswordAttempts: 1 } },
        { new: true, projection: { resetPasswordAttempts: 1 } }
      ).lean();

      const attempts = updated?.resetPasswordAttempts ?? 0;
      this.logger.warn('OTP verification failed: wrong code', { userId: user._id, userType, attempts });

      if (attempts >= maxAttempts) {
        await model.updateOne(
          { _id: user._id, resetPasswordToken: stored },
          { $set: { resetPasswordToken: null, resetPasswordExpires: null, resetPasswordAttempts: 0 } }
        );
        this.logger.warn('OTP discarded after too many wrong guesses', { userId: user._id, userType });
      }
    } catch (error) {
      // Counting is a safeguard; failing to count must not turn a wrong code
      // into a 500.
      this.logger.error('Failed to record wrong OTP guess', { userId: user._id, userType, error: error.message });
    }
  }

  /**
   * Clear OTP from user document
   * @param {string} userId - User ID
   * @param {string} userType - User type
   * @returns {Promise<void>}
   */
  async clearOTP(userId, userType) {
    try {
      const repository = this.getRepositoryByType(userType);
      
      await repository.updateById(userId, {
        resetPasswordToken: null,
        resetPasswordExpires: null,
        resetPasswordAttempts: 0
      });

      this.logger.debug('OTP cleared', { userId, userType });
    } catch (error) {
      this.logger.error('OTP clear failed', { 
        userId, 
        userType, 
        error: error.message 
      });
      throw error;
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
}

module.exports = OTPService;
module.exports.INVALID_CODE_MESSAGE = INVALID_CODE_MESSAGE;
