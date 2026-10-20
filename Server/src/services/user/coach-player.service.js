/**
 * Coach Player Service — a coach registering players who have no email.
 *
 * The third registration path ("No email at all") done by the coach instead of
 * the player: the account is created straight onto the coach's team, signs in
 * by Player ID only, and starts with the coach's DEFAULT PLAYER PASSWORD.
 *
 * The default is set once on the coach's profile and can be changed any time.
 * The coach asked to be able to SEE it, to hand it to players, so it is stored
 * encrypted rather than hashed (utils/security/data-encryption.util). Each new
 * player's copy is an ordinary hashed password, so changing the default later
 * changes nothing for players already registered.
 *
 * Entering the player in a meet is NOT done here — that stays the existing
 * age-group step, with its squad cap, fee window and end-date lock.
 *
 * @module services/user/coach-player.service
 */

const bcrypt = require('bcryptjs');
const { ValidationError, AuthenticationError, ConflictError, NotFoundError } = require('../../errors');
const { encrypt, decrypt } = require('../../utils/security/data-encryption.util');

/** The guardian relation recorded for a player their coach registered. */
const COACH_RELATION = 'Coach';

/** Matches a stored (already HTML-escaped) name exactly, ignoring case. */
const exactName = (value) => new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

class CoachPlayerService {
  /**
   * @param {Object} deps
   * @param {CoachRepository} deps.coachRepository
   * @param {PlayerRepository} deps.playerRepository
   * @param {TeamRepository} deps.teamRepository
   * @param {AuditLogRepository} [deps.auditLogRepository]
   * @param {OTPService} [deps.otpService]
   * @param {ConfigManager} deps.config
   * @param {Logger} deps.logger
   */
  constructor({ coachRepository, playerRepository, teamRepository, auditLogRepository = null, otpService = null, config, logger }) {
    this.coachRepository = coachRepository;
    this.playerRepository = playerRepository;
    this.teamRepository = teamRepository;
    this.auditLogRepository = auditLogRepository;
    this.otpService = otpService;
    this.config = config;
    this.logger = logger;
  }

  /**
   * The coach's default player password, readable.
   *
   * `readable: false` with `isSet: true` means a value exists but cannot be
   * decrypted — the key was rotated. The coach is asked to set it again.
   *
   * @param {string} coachId
   * @returns {Promise<{isSet: boolean, readable: boolean, password: string|null, setAt: Date|null}>}
   */
  async getDefaultPassword(coachId) {
    const coach = await this._loadCoach(coachId, '+playerDefaultPassword');
    const isSet = Boolean(coach.playerDefaultPassword);
    const password = isSet ? decrypt(coach.playerDefaultPassword, this.config) : null;
    return {
      isSet,
      readable: password !== null,
      password,
      setAt: coach.playerDefaultPasswordSetAt || null,
    };
  }

  /**
   * Set or replace the default, after the coach's own password — the same
   * check as changing their account password.
   *
   * @param {string} coachId
   * @param {{password: string, currentPassword: string}} input
   */
  async setDefaultPassword(coachId, { password, currentPassword }) {
    const coach = await this._loadCoach(coachId, '+password');
    const ok = await bcrypt.compare(String(currentPassword || ''), coach.password || '');
    if (!ok) throw new AuthenticationError('Current password is incorrect');

    const setAt = new Date();
    await this.coachRepository.updateById(coachId, {
      playerDefaultPassword: encrypt(password, this.config),
      playerDefaultPasswordSetAt: setAt,
    });
    await this._audit(coachId, 'COACH_SET_PLAYER_DEFAULT_PASSWORD', 'coach', String(coachId));
    this.logger.info('Coach set the default player password', { coachId });
    return { isSet: true, readable: true, password, setAt };
  }

  /**
   * Register a player with no email onto the coach's team.
   *
   * A player with the same name and date of birth may already exist — most
   * often the child registered themselves. Creating a second account would
   * quietly give it a `.2` Player ID, so the coach is shown the match (409)
   * and has to send `confirmDuplicate: true` to go ahead anyway.
   *
   * @param {string} coachId
   * @param {Object} input - validated body (validators/player.validator coachRegisterPlayer)
   * @returns {Promise<{player: Object, team: {_id: *, name: string}}>}
   */
  async registerPlayer(coachId, input) {
    const { firstName, lastName, dateOfBirth, gender, guardianConsent, confirmDuplicate } = input;

    const [team] = await this.teamRepository.find({ coach: coachId, isActive: true }, { sort: { createdAt: -1 }, limit: 1 });
    if (!team) throw new ValidationError('Create your team before registering players');

    // The coach registering the player is their contact of record: name,
    // relation "Coach" and the coach's phone — taken from the coach's account,
    // never from the request.
    const coach = await this._loadCoach(coachId);
    const guardian = this._coachAsGuardian(coach);

    const { password } = await this.getDefaultPassword(coachId);
    if (!password) {
      throw new ValidationError('Set your default player password on your profile first');
    }

    if (!(confirmDuplicate === true || confirmDuplicate === 'true')) {
      const matches = await this._findSamePerson(firstName, lastName, dateOfBirth);
      if (matches.length > 0) {
        throw new ConflictError('A player with this name and date of birth is already registered', {
          reason: 'POSSIBLE_DUPLICATE',
          matches,
        });
      }
    }

    const player = await this.playerRepository.create({
      firstName,
      lastName,
      dateOfBirth,
      gender,
      emailType: 'none',
      guardian,
      // The coach confirms the guardian agreed; the validator requires it under 18.
      ...((guardianConsent === true || guardianConsent === 'true') ? { consentAt: new Date() } : {}),
      team: team._id,
      password,
    });

    await this._audit(coachId, 'COACH_REGISTERED_PLAYER', 'player', String(player._id), {
      loginId: player.loginId,
      team: String(team._id),
    });
    this.otpService?.notifyCoachOfPlayerId?.(coachId, player, 'registered-by-coach', team.name);
    this.logger.info('Coach registered a player with no email', { coachId, playerId: player._id });

    return {
      player: {
        _id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        loginId: player.loginId,
        gender: player.gender,
        dateOfBirth: player.dateOfBirth,
        emailType: player.emailType,
        team: team._id,
      },
      team: { _id: team._id, name: team.name },
    };
  }

  /**
   * The guardian block for a coach-registered player: the coach themself.
   * @private
   */
  _coachAsGuardian(coach) {
    const name = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
    if (!coach.phone) {
      throw new ValidationError('Add your phone number to your profile first — it is the contact for players you register');
    }
    return { name, relation: COACH_RELATION, phone: coach.phone };
  }

  /** @private */
  async _findSamePerson(firstName, lastName, dateOfBirth) {
    const day = new Date(dateOfBirth);
    day.setUTCHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    const found = await this.playerRepository.find(
      {
        firstName: exactName(firstName),
        lastName: exactName(lastName),
        dateOfBirth: { $gte: day, $lt: next },
      },
      { limit: 5, populate: { path: 'team', select: 'name' } }
    );
    return (found || []).map((p) => ({
      loginId: p.loginId,
      name: [p.firstName, p.lastName].filter(Boolean).join(' '),
      team: p.team?.name || null,
    }));
  }

  /** @private */
  async _loadCoach(coachId, select) {
    const coach = await this.coachRepository.findById(coachId, { select });
    if (!coach) throw new NotFoundError('Coach');
    return coach;
  }

  /** @private */
  async _audit(coachId, action, resource, resourceId, details = {}) {
    try {
      await this.auditLogRepository?.logAction?.({
        adminId: coachId,
        adminType: 'coach',
        action,
        resource,
        resourceId,
        details,
      });
    } catch (error) {
      this.logger.error('Could not write the audit log for a coach player action', { error: error.message });
    }
  }
}

module.exports = CoachPlayerService;
module.exports.COACH_RELATION = COACH_RELATION;
