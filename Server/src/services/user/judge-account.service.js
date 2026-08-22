/**
 * Judge Account Service
 *
 * Self-service identity for judges: registration, profile, password change and
 * the read-only view of which panels they sit on.
 *
 * Deliberately does NOT go through AuthenticationService.register: that method
 * resolves its repository through `getRepositoryByType('judge')`, and that
 * mapping still points at the assignment collection until the auth-plumbing
 * phase flips it. Writing registration against the account repository directly
 * keeps this service correct on both sides of that change.
 */

const bcrypt = require('bcryptjs');
const {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
} = require('../../errors');
const { normalizeEmail, sanitizeUserData } = require('../../utils/validation/sanitization.util');
const { stripSensitiveFields } = require('../../utils/data/user-projection.util');

/** Fields a judge may set on themselves. Everything else is ignored. */
const EDITABLE_PROFILE_FIELDS = [
  'name',
  'phone',
  'email',
  'stateUnit',
  'registrationNumber',
  'certificationLevel',
  'photo',
];

/** Fields returned for each assignment the account holds. */
const ASSIGNMENT_FIELDS = 'competition gender ageGroup competitionTypes apparatus judgeNo judgeType isActive';

class JudgeAccountService {
  /**
   * @param {Object} dependencies
   * @param {JudgeAccountRepository} dependencies.judgeAccountRepository
   * @param {JudgeRepository} dependencies.judgeRepository - panel assignments
   * @param {CompetitionRepository} dependencies.competitionRepository
   * @param {TokenService} dependencies.tokenService
   * @param {Logger} dependencies.logger
   */
  constructor(dependencies) {
    this.judgeAccountRepository = dependencies.judgeAccountRepository;
    this.judgeRepository = dependencies.judgeRepository;
    this.competitionRepository = dependencies.competitionRepository;
    this.tokenService = dependencies.tokenService;
    this.logger = dependencies.logger;
  }

  /**
   * Register a new judge.
   *
   * A fresh account holds no assignments, and an account with no assignments
   * can read nothing about any competition — assignment by an admin is the
   * only thing that grants access. That is why registration needs no approval
   * gate.
   *
   * @param {Object} payload - { name, email, phone, password, ...credentials }
   * @returns {Promise<Object>} { user, token }
   * @throws {ConflictError} If the email is already registered
   */
  async register(payload) {
    const sanitized = sanitizeUserData(payload || {});
    const email = sanitized.email || normalizeEmail(payload?.email);

    if (!email) {
      throw new ValidationError('Email is required');
    }

    if (await this.judgeAccountRepository.isEmailTaken(email)) {
      this.logger.warn('Judge registration failed: email already registered', { email });
      throw new ConflictError('Email already registered');
    }

    const account = await this.judgeAccountRepository.create({
      name: sanitized.name,
      email,
      phone: sanitized.phone || null,
      password: payload.password,
      stateUnit: sanitized.stateUnit || null,
      registrationNumber: sanitized.registrationNumber || null,
      certificationLevel: payload.certificationLevel || null,
      isActive: true,
    });

    // No competitionId: a new account is on no panel yet, so there is no
    // competition context to put in the token.
    const token = this.tokenService.generateToken(String(account._id), 'judge');

    this.logger.info('Judge account registered', { judgeAccountId: account._id });

    return {
      user: stripSensitiveFields(account),
      token,
    };
  }

  /**
   * The account plus every assignment it holds.
   * @param {string} accountId
   * @returns {Promise<Object>}
   * @throws {NotFoundError}
   */
  async getProfile(accountId) {
    const account = await this.judgeAccountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Judge account');
    }

    return {
      ...stripSensitiveFields(account),
      assignments: await this.getAssignments(accountId),
    };
  }

  /**
   * Every panel this account sits on, newest competition first, with the
   * competition's own details resolved so the profile can group by meet.
   *
   * @param {string} accountId
   * @returns {Promise<Array>}
   */
  async getAssignments(accountId) {
    const assignments = await this.judgeRepository.find(
      { judgeAccount: accountId, isActive: { $ne: false } },
      { select: ASSIGNMENT_FIELDS, sort: { createdAt: -1 } }
    );

    if (assignments.length === 0) return [];

    const competitionIds = [...new Set(
      assignments.map((a) => String(a.competition)).filter(Boolean)
    )];

    const competitions = await this.competitionRepository.find(
      { _id: { $in: competitionIds } },
      { select: '_id name year place level status startDate endDate' }
    );
    const competitionById = new Map(competitions.map((c) => [String(c._id), c]));

    return assignments.map((assignment) => ({
      ...assignment,
      competition: competitionById.get(String(assignment.competition)) || assignment.competition,
    }));
  }

  /**
   * Update the judge's own profile.
   *
   * Only EDITABLE_PROFILE_FIELDS are applied — a body carrying `password`,
   * `isActive` or `isPlaceholderEmail` cannot escalate anything.
   *
   * @param {string} accountId
   * @param {Object} updates
   * @returns {Promise<Object>} The updated profile
   */
  async updateProfile(accountId, updates) {
    const account = await this.judgeAccountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundError('Judge account');
    }

    const sanitized = sanitizeUserData(updates || {});
    const allowed = {};
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (sanitized[field] !== undefined) {
        allowed[field] = sanitized[field];
      }
    }

    if (allowed.email) {
      allowed.email = normalizeEmail(allowed.email);
      if (allowed.email !== account.email) {
        if (await this.judgeAccountRepository.isEmailTaken(allowed.email, accountId)) {
          throw new ConflictError('Email already registered');
        }
        // Setting a real address is exactly what clears the migrated-account
        // flag; nothing else in the app writes it back to true.
        allowed.isPlaceholderEmail = false;
      }
    }

    if (Object.keys(allowed).length === 0) {
      return this.getProfile(accountId);
    }

    await this.judgeAccountRepository.updateById(accountId, allowed);

    this.logger.info('Judge profile updated', {
      judgeAccountId: accountId,
      updatedFields: Object.keys(allowed),
    });

    return this.getProfile(accountId);
  }

  /**
   * Change the judge's own password.
   *
   * Requires the current password: an access token alone must not be enough to
   * take permanent ownership of an account.
   *
   * @param {string} accountId
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<void>}
   * @throws {AuthenticationError} If the current password is wrong
   */
  async changePassword(accountId, currentPassword, newPassword) {
    const account = await this.judgeAccountRepository.findById(accountId, {
      select: '+password',
    });
    if (!account) {
      throw new NotFoundError('Judge account');
    }

    const isValid = await bcrypt.compare(currentPassword || '', account.password || '');
    if (!isValid) {
      this.logger.warn('Judge password change failed: wrong current password', {
        judgeAccountId: accountId,
      });
      throw new AuthenticationError('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new ValidationError('New password must be different from the current one');
    }

    // updateById routes password writes through document.save(), so the
    // model's pre-save hook does the hashing — do not hash here as well.
    await this.judgeAccountRepository.updateById(accountId, {
      password: newPassword,
      mustResetPassword: false,
    });

    this.logger.info('Judge password changed', { judgeAccountId: accountId });
  }

  /**
   * Accounts an admin may put on a panel.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchAccounts(query) {
    return this.judgeAccountRepository.searchAssignable(query);
  }
}

module.exports = JudgeAccountService;
module.exports.EDITABLE_PROFILE_FIELDS = EDITABLE_PROFILE_FIELDS;
