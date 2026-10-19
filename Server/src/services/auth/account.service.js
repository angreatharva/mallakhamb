/**
 * Account Service — the signed-in user's own account, for every role.
 *
 * Behind the top-right account menu: view the profile, edit the safe fields,
 * change the password, change the email. One service for all five roles
 * (a super admin is an Admin account) so the rules cannot drift between them.
 *
 * Email changes take two steps. The new address gets a code and only replaces
 * the old one once the code comes back — an address that was never checked
 * would become the account's password-reset channel. A player registered with
 * no email additionally needs their coach to approve the address
 * (`awaiting-coach`); the coach's side of that is plan Part C.
 *
 * @module services/auth/account.service
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} = require('../../errors');
const { createUserRepositoryResolver } = require('../../utils/auth/user-repository-resolver');
const { stripSensitiveFields } = require('../../utils/data/user-projection.util');
const { normalizeEmail, sanitizeUserData } = require('../../utils/validation/sanitization.util');
const { recordLogout } = require('../../utils/security/token-invalidation.util');
const { emailTypeOf } = require('../../utils/data/player-login-id.util');

const EMAIL_CHANGE = 'email-change';
/** How long an email change may stay unfinished, start to coach approval. */
const REQUEST_LIFETIME_MS = 48 * 60 * 60 * 1000;
/** Wrong codes before the request is dropped and has to be started again. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * What each role may change about itself here. Everything else is either the
 * server's (a Player ID, a role), an organiser's, or has its own flow (email,
 * password). A judge's photo stays on PUT /judge/profile.
 */
const EDITABLE_FIELDS = {
  player: ['firstName', 'lastName', 'phone', 'guardian', 'stateUnit', 'registrationNumber'],
  coach: ['firstName', 'lastName', 'phone'],
  admin: ['name'],
  judge: ['firstName', 'lastName', 'phone', 'stateUnit', 'registrationNumber', 'certificationLevel'],
};

/**
 * A player's date of birth and gender decide their age group and the entries
 * they are in, so they are only theirs to correct before they join a team.
 * After that an organiser does it.
 */
const PLAYER_FIELDS_BEFORE_TEAM = ['dateOfBirth', 'gender'];

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const sameHash = (a, b) => {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};

const displayName = (user) =>
  user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'there';

class AccountService {
  /**
   * @param {Object} deps
   * @param {PlayerRepository} deps.playerRepository
   * @param {CoachRepository} deps.coachRepository
   * @param {AdminRepository} deps.adminRepository
   * @param {JudgeAccountRepository} deps.judgeAccountRepository
   * @param {AccountRequestRepository} deps.accountRequestRepository
   * @param {TokenService} deps.tokenService
   * @param {OTPService} deps.otpService - account mail
   * @param {ConfigManager} deps.config
   * @param {Logger} deps.logger
   */
  constructor({
    playerRepository, coachRepository, adminRepository, judgeAccountRepository,
    accountRequestRepository, tokenService, otpService, config, logger,
  }) {
    this.repositories = createUserRepositoryResolver({
      playerRepository, coachRepository, adminRepository, judgeAccountRepository,
    });
    this.accountRequestRepository = accountRequestRepository;
    this.tokenService = tokenService;
    this.otpService = otpService;
    this.config = config;
    this.logger = logger;
  }

  /** @private */
  _repository(userType) {
    return this.repositories.getRepositoryByType(userType);
  }

  /** @private */
  async _load(userId, userType, options = {}) {
    const user = await this._repository(userType).findById(userId, options);
    if (!user) throw new NotFoundError('Account');
    return user;
  }

  /** @private */
  async _assertPassword(userId, userType, password) {
    const user = await this._load(userId, userType, { select: '+password' });
    const ok = await bcrypt.compare(String(password || ''), user.password || '');
    if (!ok) throw new AuthenticationError('Current password is incorrect');
    return user;
  }

  /** @private */
  _codeExpiryMinutes() {
    return Number(this.config?.get?.('security.otpExpiry')) || 10;
  }

  /** @private */
  _generateCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  /**
   * The account as its owner sees it, plus any email change in progress.
   * @param {string} userId
   * @param {string} userType
   * @returns {Promise<{user: Object, userType: string, pendingEmailChange: Object|null}>}
   */
  async getAccount(userId, userType) {
    const user = await this._load(userId, userType);
    const pending = await this.accountRequestRepository.findOpen(userId, userType, EMAIL_CHANGE);
    return {
      user: stripSensitiveFields(user),
      userType,
      pendingEmailChange: pending
        ? { newEmail: pending.newEmail, newEmailType: pending.newEmailType, status: pending.status, expiresAt: pending.expiresAt }
        : null,
    };
  }

  /**
   * Change the fields this role may change about itself. Anything else in the
   * body is ignored rather than refused, so a client sending the whole
   * profile back does not fail on the read-only parts.
   * @returns {Promise<Object>} as getAccount
   */
  async updateProfile(userId, userType, updates) {
    const user = await this._load(userId, userType);
    const sanitized = sanitizeUserData(updates || {});
    const allowed = [...(EDITABLE_FIELDS[userType] || [])];
    if (userType === 'player' && !user.team) allowed.push(...PLAYER_FIELDS_BEFORE_TEAM);

    const changes = {};
    for (const field of allowed) {
      if (sanitized[field] !== undefined) changes[field] = sanitized[field];
    }

    if (userType === 'player' && changes.guardian) {
      const { name = null, relation = null, phone = null } = changes.guardian;
      changes.guardian = { name, relation, phone };
      // The responsible adult cannot be removed from a player who has no
      // address of their own.
      if (emailTypeOf(user) !== 'self' && !(name && phone)) {
        throw new ValidationError('Parent/guardian name and phone are required for this account');
      }
    }

    if (Object.keys(changes).length > 0) {
      await this._repository(userType).updateById(userId, changes);
      this.logger.info('Account profile updated', { userId, userType, fields: Object.keys(changes) });
    }
    return this.getAccount(userId, userType);
  }

  /**
   * Change the password while signed in, knowing the current one. Every other
   * session ends — whoever else held the old password or a stolen session is
   * signed out — and this one gets a fresh token so it carries on.
   * @param {string} userId
   * @param {string} userType
   * @param {string} currentPassword
   * @param {string} newPassword
   * @param {string|null} competitionId - this session's meet, kept on the new token
   * @returns {Promise<{token: string, user: Object}>}
   */
  async changePassword(userId, userType, currentPassword, newPassword, competitionId = null) {
    const user = await this._assertPassword(userId, userType, currentPassword);
    if (currentPassword === newPassword) {
      throw new ValidationError('New password must be different from the current one');
    }

    // updateById sends a password through document.save(), so the model's
    // pre-save hook hashes it.
    await this._repository(userType).updateById(userId, { password: newPassword, loginAttempts: 0, lockUntil: null });

    await this.tokenService.revokeAllRefreshTokens?.(String(userId));
    await recordLogout(String(userId));
    // `iat` is whole seconds, the logout time milliseconds: the next whole
    // second is the first `iat` the logout check lets through.
    const token = this.tokenService.generateToken(String(userId), userType, competitionId, {
      issuedAt: Math.ceil(Date.now() / 1000),
    });

    if (user.email) this.otpService?.notifyPasswordChanged?.(user, userType);
    this.logger.info('Password changed from the account page', { userId, userType });

    const fresh = await this._load(userId, userType);
    return { token, user: stripSensitiveFields(fresh) };
  }

  /**
   * Start an email change: check the password, check the address is free, and
   * mail a code to it. Replaces any change already in progress.
   * @param {string} userId
   * @param {string} userType
   * @param {{newEmail: string, emailType?: 'self'|'guardian', currentPassword: string}} input
   * @returns {Promise<Object>} the pending change
   */
  async requestEmailChange(userId, userType, { newEmail, emailType, currentPassword }) {
    const user = await this._assertPassword(userId, userType, currentPassword);
    const address = normalizeEmail(newEmail);
    const isPlayer = userType === 'player';
    const kind = isPlayer ? (emailType || 'self') : null;
    if (isPlayer && !['self', 'guardian'].includes(kind)) {
      throw new ValidationError('emailType must be self or guardian');
    }

    if (address === user.email && (!isPlayer || kind === emailTypeOf(user))) {
      throw new ValidationError('That is already the email on this account');
    }
    await this._assertAddressFree(userId, userType, address, kind);

    if (isPlayer && kind === 'guardian' && !(user.guardian?.name && user.guardian?.phone)) {
      throw new ValidationError("Add the parent's or guardian's name and phone to your profile first");
    }

    await this.accountRequestRepository.closeOpen(userId, userType, EMAIL_CHANGE);
    const code = this._generateCode();
    const expiryMinutes = this._codeExpiryMinutes();
    const now = Date.now();
    const request = await this.accountRequestRepository.create({
      kind: EMAIL_CHANGE,
      userType,
      user: userId,
      newEmail: address,
      newEmailType: kind,
      codeHash: hashCode(code),
      codeExpiresAt: new Date(now + expiryMinutes * 60 * 1000),
      expiresAt: new Date(now + REQUEST_LIFETIME_MS),
    });

    this.otpService?.sendEmailChangeCode?.(address, { userName: displayName(user), code, expiryMinutes });
    this.logger.info('Email change started', { userId, userType });

    return { newEmail: request.newEmail, newEmailType: request.newEmailType, status: request.status, expiresAt: request.expiresAt };
  }

  /**
   * Finish an email change with the code from the new address. A player who
   * had no email waits for their coach after this; anyone else's address is
   * switched now and the old one is told.
   * @returns {Promise<{status: string, user: Object}>}
   */
  async confirmEmailChange(userId, userType, code) {
    const request = await this.accountRequestRepository.findOpen(userId, userType, EMAIL_CHANGE, { select: '+codeHash' });
    if (!request || request.status !== 'awaiting-code') {
      throw new ValidationError('No email change is waiting for a code. Start again from your profile.');
    }
    if (!request.codeExpiresAt || request.codeExpiresAt <= new Date()) {
      await this.accountRequestRepository.updateById(request._id, { status: 'expired' });
      throw new ValidationError('That code has expired. Start the change again to get a new one.');
    }
    if (!sameHash(hashCode(code), request.codeHash)) {
      const attempts = (request.attempts || 0) + 1;
      const exhausted = attempts >= MAX_CODE_ATTEMPTS;
      await this.accountRequestRepository.updateById(request._id, { attempts, ...(exhausted && { status: 'expired' }) });
      throw new ValidationError(exhausted
        ? 'Too many wrong codes. Start the change again to get a new one.'
        : 'That code is not right. Check the email and try again.');
    }

    const user = await this._load(userId, userType);
    // Checked again: the address may have been taken since the code was sent.
    await this._assertAddressFree(userId, userType, request.newEmail, request.newEmailType);

    if (userType === 'player' && emailTypeOf(user) === 'none') {
      await this.accountRequestRepository.updateById(request._id, { status: 'awaiting-coach', verifiedAt: new Date() });
      this.logger.info('Email change verified, waiting for the coach', { userId });
      return { status: 'awaiting-coach', user: stripSensitiveFields(user) };
    }

    const updated = await this._applyEmailChange(user, userType, request);
    return { status: 'done', user: stripSensitiveFields(updated) };
  }

  /**
   * Drop an email change in progress.
   * @returns {Promise<void>}
   */
  async cancelEmailChange(userId, userType) {
    await this.accountRequestRepository.closeOpen(userId, userType, EMAIL_CHANGE, 'rejected');
  }

  /**
   * Switch the address. Used here, and by the coach's approval for a player
   * who had no email.
   * @param {Object} user - the account as stored
   * @param {string} userType
   * @param {Object} request - the AccountRequest being completed
   * @returns {Promise<Object>} the updated account
   */
  async _applyEmailChange(user, userType, request) {
    const changes = { email: request.newEmail };
    if (userType === 'player') changes.emailType = request.newEmailType || 'self';

    let updated;
    try {
      updated = await this._repository(userType).updateById(user._id, changes);
    } catch (error) {
      if (error?.code === 11000) throw new ConflictError('That email is already registered to another account');
      throw error;
    }
    await this.accountRequestRepository.updateById(request._id, { status: 'done' });

    if (user.email && user.email !== request.newEmail) {
      this.otpService?.notifyEmailChanged?.(user.email, { userName: displayName(user), newEmail: request.newEmail });
    }
    this.logger.info('Email changed', { userId: user._id, userType });
    return updated;
  }

  /**
   * Is this address free for this account? Only an address that signs in must
   * be unique: a player's guardian email may be shared by siblings.
   * @private
   */
  async _assertAddressFree(userId, userType, address, playerEmailType) {
    if (userType === 'player' && playerEmailType === 'guardian') return;
    if (await this._repository(userType).isEmailTaken(address, userId)) {
      throw new ConflictError('That email is already registered to another account');
    }
  }
}

module.exports = AccountService;
module.exports.EDITABLE_FIELDS = EDITABLE_FIELDS;
module.exports.MAX_CODE_ATTEMPTS = MAX_CODE_ATTEMPTS;
