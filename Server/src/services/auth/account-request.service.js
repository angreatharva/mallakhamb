/**
 * Account Request Service — coach (or super admin) approval for players who
 * registered without an email (plan Part C).
 *
 * Such a player has nowhere to receive a code, so two things go through a
 * person who knows them instead:
 *
 *   Password reset. "Forgot password" with their Player ID opens a request.
 *   Their coach checks it is really the child or parent, approves, and is shown
 *   a one-time 6-digit code (24 h) to hand over. The player enters Player ID +
 *   code + new password. The coach never sees or sets the password.
 *
 *   Adding an email. The address proves it works with a code first (see
 *   AccountService); the coach then confirms it is the right family.
 *
 * "Their coach" is the coach of the team the player is on when the request is
 * decided — looked up, not stored, so a team change moves the request with the
 * player. A super admin can decide any request EXCEPT from a player a coach
 * registered — those are that coach's alone (and coaches cannot be
 * deactivated, so one is always there). Every decision is written to the
 * audit log.
 *
 * @module services/auth/account-request.service
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AuthorizationError, NotFoundError, ValidationError } = require('../../errors');
const { recordLogout } = require('../../utils/security/token-invalidation.util');
const {
  emailTypeOf, looksLikeEmail, isCoachRegistered, COACH_REGISTERED_CLAUSE,
} = require('../../utils/data/player-login-id.util');
const { securitySetting, DEFAULT_BCRYPT_ROUNDS } = require('../../utils/security/login-security.util');

const PASSWORD_RESET = 'password-reset';
const EMAIL_CHANGE = 'email-change';
/** How long a request waits for a coach before it lapses. */
const REQUEST_LIFETIME_MS = 48 * 60 * 60 * 1000;
/** How long the code a coach hands over stays usable. */
const RESET_CODE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
/** One message for every failed coach-code reset, so it reveals nothing. */
const INVALID_RESET_MESSAGE = 'That Player ID and code do not match an approved reset. Check them, or ask your coach again.';

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const sameHash = (a, b) => {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
};

class AccountRequestService {
  /**
   * @param {Object} deps
   * @param {AccountRequestRepository} deps.accountRequestRepository
   * @param {PlayerRepository} deps.playerRepository
   * @param {TeamRepository} deps.teamRepository
   * @param {AuditLogRepository} deps.auditLogRepository
   * @param {AccountService} deps.accountService - applies an approved email
   * @param {TokenService} deps.tokenService
   * @param {Logger} deps.logger
   */
  constructor({ accountRequestRepository, playerRepository, teamRepository, auditLogRepository, accountService, tokenService, logger }) {
    this.accountRequestRepository = accountRequestRepository;
    this.playerRepository = playerRepository;
    this.teamRepository = teamRepository;
    this.auditLogRepository = auditLogRepository;
    this.accountService = accountService;
    this.tokenService = tokenService;
    this.logger = logger;
  }

  /**
   * Called by forgot-password. When the identifier is the Player ID of a player
   * with no email, open a reset request for their coach; otherwise do nothing.
   * Silent either way — the caller answers every forgot-password the same.
   * An open request is left as it is, so asking twice does not void a code the
   * coach has already handed over.
   * @param {string} identifier
   * @returns {Promise<void>}
   */
  async openPasswordResetIfNoEmail(identifier) {
    try {
      if (!identifier || looksLikeEmail(identifier)) return;
      const player = await this.playerRepository.findByLoginId(identifier);
      if (!player || player.isActive === false) return;
      if (player.email && emailTypeOf(player) !== 'none') return;

      const open = await this.accountRequestRepository.findOpen(player._id, 'player', PASSWORD_RESET);
      if (open) return;

      await this.accountRequestRepository.create({
        kind: PASSWORD_RESET,
        userType: 'player',
        user: player._id,
        status: 'awaiting-coach',
        expiresAt: new Date(Date.now() + REQUEST_LIFETIME_MS),
      });
      this.logger.info('Coach password-reset request opened', { playerId: player._id });
    } catch (error) {
      this.logger.error('Could not open a coach password-reset request', { error: error.message });
    }
  }

  /**
   * The requests waiting on this coach: open requests from players on any of
   * their teams.
   * @param {string} coachId
   * @returns {Promise<Array>}
   */
  async listForCoach(coachId) {
    const teams = await this.teamRepository.findByCoach(coachId);
    const teamIds = (teams || []).map((t) => t._id);
    if (teamIds.length === 0) return [];
    const players = await this.playerRepository.find({ team: { $in: teamIds } }, { select: '_id' });
    return this._listOpen({ user: { $in: players.map((p) => p._id) } });
  }

  /**
   * Every request waiting on a person, for the super admin — except those
   * from players a coach registered, which only that coach sees and decides.
   * @returns {Promise<Array>}
   */
  async listForSuperAdmin() {
    const coachOwned = await this.playerRepository.find(COACH_REGISTERED_CLAUSE, { select: '_id' });
    const excluded = (coachOwned || []).map((p) => p._id);
    return this._listOpen(excluded.length ? { user: { $nin: excluded } } : {});
  }

  /** @private */
  async _listOpen(criteria) {
    const requests = await this.accountRequestRepository.find({
      ...criteria,
      userType: 'player',
      status: { $in: ['awaiting-coach', 'approved'] },
      expiresAt: { $gt: new Date() },
    }, { sort: { createdAt: 1 }, limit: 200 });
    if (requests.length === 0) return [];

    const players = await this.playerRepository.find(
      { _id: { $in: requests.map((r) => r.user) } },
      { select: 'firstName lastName loginId team', populate: { path: 'team', select: 'name' } }
    );
    const byId = new Map(players.map((p) => [String(p._id), p]));
    return requests.map((r) => {
      const player = byId.get(String(r.user)) || {};
      return {
        id: r._id,
        kind: r.kind,
        status: r.status,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        newEmail: r.kind === EMAIL_CHANGE ? r.newEmail : undefined,
        newEmailType: r.kind === EMAIL_CHANGE ? r.newEmailType : undefined,
        codeExpiresAt: r.status === 'approved' ? r.codeExpiresAt : undefined,
        player: {
          id: player._id,
          firstName: player.firstName,
          lastName: player.lastName,
          loginId: player.loginId,
          team: player.team?.name || null,
        },
      };
    });
  }

  /**
   * May this person decide this request? A coach only for a player on one of
   * their teams right now; a super admin for any player except one a coach
   * registered, whose requests are that coach's alone.
   * @private
   */
  async _assertMayDecide(request, approver) {
    const player = await this.playerRepository.findById(request.user, { select: 'team registeredByCoach guardian' });
    if (approver.userType === 'superadmin') {
      // A player their coach registered belongs to that coach alone.
      if (isCoachRegistered(player)) throw new AuthorizationError('This player’s requests are decided by their coach');
      return;
    }
    if (approver.userType !== 'coach') throw new AuthorizationError('Only the player’s coach or a super admin can decide this');
    const team = player?.team ? await this.teamRepository.findById(player.team) : null;
    if (!team || String(team.coach) !== String(approver.userId)) {
      throw new AuthorizationError('This player is not on your team');
    }
  }

  /** @private */
  async _loadOpen(requestId) {
    const request = await this.accountRequestRepository.findOne({
      _id: requestId,
      userType: 'player',
      status: { $in: ['awaiting-coach', 'approved'] },
      expiresAt: { $gt: new Date() },
    });
    if (!request) throw new NotFoundError('Request');
    return request;
  }

  /** @private */
  async _audit(approver, action, request, details = {}) {
    try {
      await this.auditLogRepository?.logAction?.({
        adminId: approver.userId,
        adminType: approver.userType,
        action,
        resource: 'player',
        resourceId: String(request.user),
        details: { requestId: String(request._id), kind: request.kind, ...details },
      });
    } catch (error) {
      this.logger.error('Could not write the audit log for an account request', { error: error.message });
    }
  }

  /**
   * Approve a request.
   *
   * A password reset returns the one-time code — the only time it exists in
   * the clear; approving again issues a new one and voids the old. An email
   * addition is applied now.
   *
   * @param {string} requestId
   * @param {{userId: string, userType: 'coach'|'superadmin'}} approver
   * @returns {Promise<{status: string, code?: string, codeExpiresAt?: Date}>}
   */
  async approve(requestId, approver) {
    const request = await this._loadOpen(requestId);
    await this._assertMayDecide(request, approver);
    const decided = { decidedBy: { user: approver.userId, userType: approver.userType }, decidedAt: new Date() };

    if (request.kind === PASSWORD_RESET) {
      const code = String(crypto.randomInt(100000, 1000000));
      const codeExpiresAt = new Date(Date.now() + RESET_CODE_LIFETIME_MS);
      await this.accountRequestRepository.updateById(request._id, {
        ...decided,
        status: 'approved',
        codeHash: hashCode(code),
        codeExpiresAt,
        attempts: 0,
        // The code outlives the request's own deadline if it has to.
        expiresAt: new Date(Math.max(new Date(request.expiresAt).getTime(), codeExpiresAt.getTime())),
      });
      await this._audit(approver, 'account-request.approve', request);
      this.logger.info('Coach password reset approved', { requestId, approver: approver.userType });
      return { status: 'approved', code, codeExpiresAt };
    }

    if (request.kind === EMAIL_CHANGE && request.status === 'awaiting-coach') {
      const player = await this.playerRepository.findById(request.user);
      if (!player) throw new NotFoundError('Player');
      // The address may have been taken while it waited for the coach.
      await this.accountService._assertAddressFree(player._id, 'player', request.newEmail, request.newEmailType);
      await this.accountService._applyEmailChange(player, 'player', request);
      await this.accountRequestRepository.updateById(request._id, decided);
      await this._audit(approver, 'account-request.approve', request, { newEmail: request.newEmail });
      return { status: 'done' };
    }

    throw new ValidationError('This request has nothing left to approve');
  }

  /**
   * Turn a request down.
   * @returns {Promise<{status: 'rejected'}>}
   */
  async reject(requestId, approver) {
    const request = await this._loadOpen(requestId);
    await this._assertMayDecide(request, approver);
    await this.accountRequestRepository.updateById(request._id, {
      status: 'rejected',
      codeHash: null,
      decidedBy: { user: approver.userId, userType: approver.userType },
      decidedAt: new Date(),
    });
    await this._audit(approver, 'account-request.reject', request);
    return { status: 'rejected' };
  }

  /**
   * The player's half: Player ID + the code from their coach + a new password.
   * Every failure answers the same; five wrong codes void the approval.
   * @param {string} identifier - Player ID
   * @param {string} code
   * @param {string} newPassword
   * @returns {Promise<void>}
   */
  async completePasswordReset(identifier, code, newPassword) {
    const player = looksLikeEmail(identifier) ? null : await this.playerRepository.findByLoginId(identifier);
    const request = player
      ? await this.accountRequestRepository.findOpen(player._id, 'player', PASSWORD_RESET, { select: '+codeHash' })
      : null;
    if (!request || request.status !== 'approved' || !request.codeExpiresAt || request.codeExpiresAt <= new Date()) {
      throw new ValidationError(INVALID_RESET_MESSAGE);
    }
    if (!sameHash(hashCode(code), request.codeHash)) {
      const attempts = (request.attempts || 0) + 1;
      await this.accountRequestRepository.updateById(request._id, {
        attempts,
        ...(attempts >= MAX_CODE_ATTEMPTS && { status: 'expired', codeHash: null }),
      });
      throw new ValidationError(INVALID_RESET_MESSAGE);
    }

    // Claim the request before writing the password, so the same code cannot
    // be used twice by two requests racing.
    const claimed = await this.accountRequestRepository.model.findOneAndUpdate(
      { _id: request._id, status: 'approved' },
      { $set: { status: 'done', codeHash: null } },
      { new: true }
    );
    if (!claimed) throw new ValidationError(INVALID_RESET_MESSAGE);

    const salt = await bcrypt.genSalt(securitySetting('security.bcryptRounds', DEFAULT_BCRYPT_ROUNDS));
    const hashed = await bcrypt.hash(newPassword, salt);
    await this.playerRepository.model.updateOne(
      { _id: player._id },
      { $set: { password: hashed, loginAttempts: 0, lockUntil: null } }
    );

    try {
      await this.tokenService?.revokeAllRefreshTokens?.(String(player._id));
      await recordLogout(String(player._id));
    } catch (error) {
      this.logger.error('Could not end sessions after a coach reset', { error: error.message });
    }
    this.logger.info('Password reset with a coach code', { playerId: player._id });
  }
}

module.exports = AccountRequestService;
module.exports.INVALID_RESET_MESSAGE = INVALID_RESET_MESSAGE;
module.exports.MAX_CODE_ATTEMPTS = MAX_CODE_ATTEMPTS;
