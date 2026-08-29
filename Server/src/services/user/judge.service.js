/**
 * Judge Service
 *
 * Everything a judge does inside a competition: sign in, see the teams in
 * their category, read a team's athletes, submit a score.
 *
 * The judge PRINCIPAL is a JudgeAccount (models/JudgeAccount.js) and the panel
 * seats they hold are Judge documents (models/Judge.js). Every method here
 * takes an account id and resolves the assignment that covers the category
 * being acted on — see utils/data/judge-assignment.util.js. A registered judge
 * with no assignments is a normal state: they can sign in and see nothing.
 *
 * Requirements: 1.5, 1.8, 4.3, 4.4, 4.5
 */

const UserService = require('./user.service');
const {
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError
} = require('../../errors');
const bcrypt = require('bcryptjs');
const { getJudgeRoleMapping } = require('../../utils/scoring/judge-slip.util');
const { toCompetitionTypeDisplay } = require('../../config/cop-rules');
const {
  SUBMITTED_TEAM_COACH_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_COACH_FIELD_LIST,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
  fullName,
} = require('../../utils/data/user-projection.util');
const {
  findSubmittedRegistration,
  registeredPlayerIds,
} = require('../../utils/data/team-visibility.util');
const {
  loadAssignments,
  resolveAssignment,
  competitionsFor,
} = require('../../utils/data/judge-assignment.util');
const {
  getLockoutState,
  registerFailedAttempt,
  clearedLockoutState,
  lockoutMessage,
} = require('../../utils/security/account-lockout.util');

/**
 * LOW-4: see the equivalent note in authentication.service.js. A literal, not a
 * `hashSync` call, so importing this module does no bcrypt work at startup.
 */
const DUMMY_PASSWORD_HASH = '$2a$12$xkzf6jGVSx6.qXQ/GXY93OiYAmFAjB7Q9ph2ciDNL8cuW.PNc94Mi';

const DEFAULT_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

/**
 * Read a security setting from the config singleton, defensively — unit tests
 * construct this service without ever calling `config.load()`.
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function judgeSecuritySetting(key, fallback) {
  try {
    const value = require('../../config/config-manager').get(key);
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  } catch {
    return fallback;
  }
}

/** Shape one assignment for the client. */
const toClientAssignment = (assignment) => ({
  _id: assignment._id,
  competition: assignment.competition,
  gender: assignment.gender,
  ageGroup: assignment.ageGroup,
  competitionTypes: assignment.competitionTypes,
  apparatus: assignment.apparatus,
  judgeType: assignment.judgeType,
  judgeNo: assignment.judgeNo,
});

class JudgeService extends UserService {
  /**
   * Create a judge service
   * @param {Object} dependencies - Service dependencies
   */
  constructor(dependencies) {
    super(
      dependencies.judgeRepository,
      dependencies.logger,
      'judge',
      dependencies.cacheService
    );

    this.judgeRepository = dependencies.judgeRepository;
    this.judgeAccountRepository = dependencies.judgeAccountRepository;
    this.competitionRepository = dependencies.competitionRepository;
    this.teamRepository = dependencies.teamRepository;
    this.playerRepository = dependencies.playerRepository;
    this.scoreRepository = dependencies.scoreRepository;
    this.tokenService = dependencies.tokenService;
    this.socketManager = dependencies.socketManager;
  }

  /**
   * Authenticate a judge by email.
   *
   * Judges used to sign in with a username the admin generated from the slot
   * (`J1-M-U14-1`). Two competitions produced the same string for two
   * different people and the lookup was global, so a judge could be refused
   * their own account. Sign-in is now the person's own address, like every
   * other role.
   *
   * Signing in with no assignments succeeds and yields a token with NO
   * competition claim — the judge sees an empty dashboard until an admin puts
   * them on a panel, which is the whole access model.
   *
   * @param {string} email - Judge email
   * @param {string} password - Judge password
   * @returns {Promise<Object>} { judge, token, competition, competitions }
   * @throws {AuthenticationError} If credentials invalid
   */
  async loginJudge(email, password) {
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();

      // `password` and the lockout counters are `select: false` on the
      // account schema, so they must be requested explicitly or authentication
      // silently sees nothing to check.
      const account = await this.judgeAccountRepository.findByEmail(
        normalizedEmail,
        { select: '+password +loginAttempts +lockUntil' }
      );

      if (!account) {
        // LOW-4: equalize timing so an unknown address is not distinguishable
        // from a wrong password by response latency.
        await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
        this.logger.warn('Judge login failed: account not found', { email: normalizedEmail });
        throw new AuthenticationError('Invalid credentials');
      }

      if (account.isActive === false) {
        this.logger.warn('Judge login failed: Account inactive', {
          judgeAccountId: account._id,
          email: normalizedEmail,
        });
        throw new AuthenticationError('Account is inactive');
      }

      // MED-1: refuse a locked account before spending a comparison.
      const lockout = getLockoutState(account);
      if (lockout.isLocked) {
        this.logger.warn('Judge login failed: Account locked', {
          judgeAccountId: account._id,
          email: normalizedEmail,
          remainingMinutes: lockout.remainingMinutes,
        });
        throw new AuthenticationError(lockoutMessage(lockout.remainingMinutes));
      }

      const isPasswordValid = await bcrypt.compare(password || '', account.password || '');

      if (!isPasswordValid) {
        const next = registerFailedAttempt(account, {
          maxAttempts: judgeSecuritySetting('security.maxLoginAttempts', DEFAULT_MAX_LOGIN_ATTEMPTS),
          lockoutMinutes: judgeSecuritySetting('security.lockoutDuration', DEFAULT_LOCKOUT_MINUTES),
        });

        await this.persistJudgeLockoutState(account._id, {
          loginAttempts: next.loginAttempts,
          lockUntil: next.lockUntil,
        });

        this.logger.warn('Judge login failed: Invalid password', {
          judgeAccountId: account._id,
          email: normalizedEmail,
          attempts: next.loginAttempts,
          locked: next.isLocked,
        });

        if (next.isLocked) {
          throw new AuthenticationError(lockoutMessage(next.remainingMinutes));
        }
        throw new AuthenticationError('Invalid credentials');
      }

      // Clear the counter on success so nobody carries a stale tally forward.
      if (account.loginAttempts || account.lockUntil) {
        await this.persistJudgeLockoutState(account._id, clearedLockoutState());
      }

      const assignments = await loadAssignments(this.judgeRepository, account._id);
      const competitionIds = competitionsFor(assignments);

      // A judge assigned to exactly one meet lands straight in it. Assigned to
      // several, they start in the most recent and can switch; assigned to
      // none, there is no competition context to hand out at all.
      const activeCompetitionId = competitionIds[0] || null;
      const competitions = competitionIds.length > 0
        ? await this.competitionRepository.find(
          { _id: { $in: competitionIds } },
          { select: '_id name level place startDate endDate status apparatusConfig' }
        )
        : [];
      const competition = competitions.find(
        (c) => String(c._id) === String(activeCompetitionId)
      ) || null;

      const activeAssignments = assignments.filter(
        (a) => String(a.competition) === String(activeCompetitionId)
      );

      const token = this.tokenService.generateToken(
        String(account._id),
        'judge',
        activeCompetitionId ? String(activeCompetitionId) : null
      );

      this.logger.info('Judge logged in successfully', {
        judgeAccountId: account._id,
        email: normalizedEmail,
        competitionId: activeCompetitionId,
        totalAssignments: assignments.length,
        competitions: competitionIds.length,
      });

      const primary = activeAssignments[0] || null;

      return {
        judge: {
          _id: account._id,
          firstName: account.firstName,
          lastName: account.lastName,
          name: fullName(account),
          email: account.email,
          competition: activeCompetitionId,
          // Convenience copies of the primary seat. The authoritative answer
          // for "which role am I in THIS category" is allAssignments — the
          // server resolves it per category and ignores anything the client
          // asserts.
          judgeType: primary?.judgeType || null,
          judgeNo: primary?.judgeNo || null,
          gender: primary?.gender || null,
          ageGroup: primary?.ageGroup || null,
          competitionTypes: primary?.competitionTypes || [],
          allAssignments: activeAssignments.map(toClientAssignment),
        },
        token,
        competition,
        competitions,
      };
    } catch (error) {
      if (error instanceof AuthenticationError ||
          error instanceof AuthorizationError ||
          error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Judge login error', {
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Assignments held by this account, optionally within one competition.
   * @param {string} judgeAccountId
   * @param {string} [competitionId]
   * @returns {Promise<Array>}
   */
  async getAssignments(judgeAccountId, competitionId = null) {
    return loadAssignments(this.judgeRepository, judgeAccountId, competitionId);
  }

  /**
   * Competitions this judge is assigned to.
   * @param {string} judgeAccountId
   * @returns {Promise<Array>} Assigned competitions (empty when unassigned)
   */
  async getAssignedCompetitions(judgeAccountId) {
    try {
      const assignments = await this.getAssignments(judgeAccountId);
      const competitionIds = competitionsFor(assignments);
      if (competitionIds.length === 0) return [];

      return await this.competitionRepository.find({ _id: { $in: competitionIds } });
    } catch (error) {
      this.logger.error('Get assigned competitions error', {
        judgeAccountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Switch the judge's active competition, issuing a token scoped to it.
   *
   * @param {string} judgeAccountId
   * @param {string} competitionId
   * @returns {Promise<Object>} { token, competition }
   * @throws {AuthorizationError} If the judge holds no seat at that meet
   */
  async setCompetitionContext(judgeAccountId, competitionId) {
    try {
      const assignments = await this.getAssignments(judgeAccountId, competitionId);

      if (assignments.length === 0) {
        throw new AuthorizationError('Not assigned to this competition');
      }

      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // The third argument is the competition id itself, not an object holding
      // one — TokenService.generateToken spreads `{ competitionId }` into the
      // claim, so passing an object produced a claim no consumer could read.
      const token = this.tokenService.generateToken(
        String(judgeAccountId),
        'judge',
        String(competitionId)
      );

      this.logger.info('Competition context set', { judgeAccountId, competitionId });

      return { token, competition };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Set competition context error', {
        judgeAccountId,
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Competition details, for a judge assigned to it.
   * @param {string} judgeAccountId
   * @param {string} competitionId
   * @returns {Promise<Object>}
   */
  async getCompetitionDetails(judgeAccountId, competitionId) {
    try {
      const assignments = await this.getAssignments(judgeAccountId, competitionId);
      if (assignments.length === 0) {
        throw new AuthorizationError('Not assigned to this competition');
      }

      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      return competition;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Get competition details error', {
        judgeAccountId,
        competitionId,
        error: error.message
      });
      throw error;
    }
  }


  /**
   * A team's entered athletes, with this judge's scoring status per athlete.
   *
   * @param {string} judgeAccountId
   * @param {string} teamId
   * @param {Object} [category] - { gender, ageGroup } when the judge holds
   *   several seats and the client knows which one is on screen
   * @returns {Promise<Object>} { team, players }
   */
  async getTeamPlayers(judgeAccountId, teamId, category = {}) {
    try {
      const team = await this.teamRepository.findById(teamId, {
        populate: [
          // Projected, not bare: an unprojected coach populate is how CRIT-4
          // put coach credentials on a judge's screen in the first place.
          { path: 'coach', select: SUBMITTED_TEAM_COACH_FIELDS },
          /*
           * No `competition` populate. A Team has no competition field — a team
           * enters a meet through `Competition.registeredTeams`, not the other
           * way round — so Mongoose's strictPopulate threw on every call and
           * this endpoint answered 500 to every judge who opened a roster. The
           * competition actually used below comes from the judge's assignment,
           * which is the authoritative one anyway.
           */
        ]
      });

      if (!team) {
        throw new NotFoundError('Team');
      }

      const assignments = await this.getAssignments(judgeAccountId);

      // A judge with no seat has no business reading a roster of minors.
      // Previously this fell out of a missing competition and was treated as
      // "we could not tell" — which resolved to "show it".
      if (assignments.length === 0) {
        throw new AuthorizationError('Judge is not assigned to a competition');
      }

      /*
       * The seat that covers the category being READ, not just any seat.
       *
       * `assignments[0]` is an arbitrary one — a judge seated on ten panels has
       * ten — and falling back to it silently answers about a different age
       * group. The caller now sends the category it is showing; the fallback
       * remains for callers that cannot.
       */
      const assignment = resolveAssignment(assignments, {
        gender: category.gender,
        ageGroup: category.ageGroup,
      }) || assignments[0];

      const compId = assignment.competition?._id || assignment.competition;
      if (!compId) {
        throw new AuthorizationError('Judge is not assigned to a competition');
      }

      // Verify the coach has actually entered this team — final submit AND
      // fees paid (see team-visibility.util for why those are one flag).
      const comp = await this.competitionRepository.findById(compId);
      const registration = findSubmittedRegistration(comp, teamId);
      if (!registration) {
        throw new AuthorizationError('Team has not been submitted by coach yet');
      }

      /*
       * Score documents for this team, this category AND THIS COMPETITION TYPE.
       *
       * The type is part of a Score's identity
       * (`{teamId, gender, ageGroup, competition, competitionType}`), so
       * leaving it out returns the Competition I document alongside the
       * Competition II one and reports an athlete finalized in the first as
       * finalized in the second — at which point the roster refuses to open
       * their slip and they can never be scored in the second at all.
       *
       * Stored in display form ('Competition I'); callers send either that or
       * the slug, so it is normalized rather than trusted. Omitted means "every
       * type", which is what a caller that does not know is asking for.
       */
      const scoreQuery = {
        teamId: teamId,
        gender: assignment.gender,
        ageGroup: assignment.ageGroup,
        competition: compId,
      };
      if (category.competitionType) {
        scoreQuery.competitionType = toCompetitionTypeDisplay(category.competitionType);
      }
      const scores = await this.scoreRepository.find(scoreQuery);

      // Task 3.2: was a second hand-written copy of the panel-role mapping.
      // If it ever disagreed with the one used to WRITE slips, a judge would
      // submit into one slot and then be told they had not scored the player.
      const judgeInfo = getJudgeRoleMapping(assignment.judgeType);
      const scoreMap = {};

      for (const scoreDoc of scores || []) {
        for (const ps of scoreDoc.playerScores || []) {
          const pid = ps.playerId?.toString();
          if (!pid) continue;

          const hasJudgeScore = (ps.judgeScores && ps.judgeScores[judgeInfo.field] > 0) ||
            (ps.judgeSlips && ps.judgeSlips.some(s => s.judgeRole === judgeInfo.role)) ||
            ps.isFinalized ||
            (ps.judgeScores && Object.values(ps.judgeScores).some(v => Number(v) > 0));

          if (hasJudgeScore) {
            scoreMap[pid] = {
              hasScore: true,
              isFinalized: !!ps.isFinalized,
              score: ps.judgeScores?.[judgeInfo.field] || ps.finalScore || null
            };
          }
        }
      }

      // Fetch the athletes the coach ENTERED, not everyone on the team.
      //
      // `Player.team` is roster membership and is written the moment a coach
      // drags an athlete onto a team — before any submission, and for athletes
      // who are never entered at all. Querying by it returned the whole squad,
      // so a submitted team leaked every draft athlete alongside its six real
      // entries. The registration's own player list is the entry.
      const registeredIds = registeredPlayerIds(registration);
      const players = registeredIds.size === 0
        ? []
        : await this.playerRepository.find(
          { _id: { $in: [...registeredIds] }, team: teamId },
          { select: SUBMITTED_TEAM_PLAYER_FIELDS }
        );

      // The category recorded at entry time wins over the athlete's own
      // profile: a player can be entered in a different age group than their
      // default (play-up), and the judge must see the one being judged.
      const categoryByPlayer = new Map();
      for (const entry of registration.players || []) {
        const pid = entry?.player?._id ? String(entry.player._id) : String(entry?.player || '');
        if (pid) categoryByPlayer.set(pid, entry);
      }

      // CRIT-4 class: this roster used to carry `email` and `dateOfBirth`, and
      // these are minors. A judge needs a name, a gender and a score — nothing
      // here reads contact details (JudgeTeamPlayers.jsx:251-258).
      const playersWithScores = players.map(player => {
        const key = player._id.toString();
        const entry = categoryByPlayer.get(key);
        return {
          _id: player._id,
          firstName: player.firstName,
          lastName: player.lastName,
          gender: entry?.gender || player.gender,
          ageGroup: entry?.ageGroup || player.ageGroup,
          score: scoreMap[key]?.score || null,
          isFinalized: !!scoreMap[key]?.isFinalized,
          hasScore: !!scoreMap[key]?.hasScore
        };
      });

      return {
        team: {
          _id: team._id,
          name: team.name,
          coach: projectFields(team.coach, SUBMITTED_TEAM_COACH_FIELD_LIST),
          competition: team.competition
        },
        players: playersWithScores
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Get team players error', {
        judgeAccountId,
        teamId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save individual score
   * @param {string} judgeAccountId
   * @param {Object} scoreData - Score data
   * @returns {Promise<Object>} Saved score
   */
  async saveIndividualScore(judgeAccountId, scoreData) {
    try {
      const { playerId, teamId, competitionId, score, notes } = scoreData;

      const player = await this.playerRepository.findById(playerId);

      if (!player) {
        throw new NotFoundError('Player');
      }

      const team = await this.teamRepository.findById(teamId);

      if (!team) {
        throw new NotFoundError('Team');
      }

      // The judge must hold a seat covering exactly the category this team is
      // being scored in — not merely "a seat at this meet".
      const assignments = await this.getAssignments(judgeAccountId, competitionId);
      const assignment = resolveAssignment(assignments, {
        competition: competitionId,
        gender: team.gender,
        ageGroup: team.ageGroup,
      });

      if (!assignment) {
        throw new AuthorizationError('Not assigned to this age group/gender');
      }

      // Check if already scored
      const existingScore = await this.scoreRepository.findOne({
        player: playerId,
        judge: judgeAccountId,
        competition: competitionId
      });

      if (existingScore) {
        throw new BusinessRuleError('Score already submitted for this player');
      }

      // Validate score range
      if (score < 0 || score > 100) {
        throw new BusinessRuleError('Score must be between 0 and 100');
      }

      // Save score
      const savedScore = await this.scoreRepository.create({
        player: playerId,
        team: teamId,
        judge: judgeAccountId,
        competition: competitionId,
        ageGroup: team.ageGroup,
        gender: team.gender,
        score,
        notes,
        submittedAt: new Date(),
        isLocked: false
      });

      this.logger.info('Score saved', {
        judgeAccountId,
        playerId,
        teamId,
        score,
        ageGroup: team.ageGroup
      });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition_${competitionId}`,
          'score_submitted',
          {
            scoreId: savedScore._id,
            playerId,
            teamId,
            judgeId: judgeAccountId,
            judgeType: assignment.judgeType,
            ageGroup: team.ageGroup,
            gender: team.gender,
            score: savedScore.score,
            timestamp: savedScore.submittedAt
          }
        );
      }

      return savedScore;
    } catch (error) {
      if (error instanceof AuthorizationError ||
          error instanceof NotFoundError ||
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Save individual score error', {
        judgeAccountId,
        scoreData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update individual score
   * @param {string} judgeAccountId
   * @param {string} scoreId - Score ID
   * @param {Object} updates - Score updates
   * @returns {Promise<Object>} Updated score
   */
  async updateIndividualScore(judgeAccountId, scoreId, updates) {
    try {
      const score = await this.scoreRepository.findById(scoreId);

      if (!score) {
        throw new NotFoundError('Score');
      }

      // Verify ownership
      if (score.judge.toString() !== judgeAccountId.toString()) {
        throw new AuthorizationError('Not authorized to update this score');
      }

      // Check if locked
      if (score.isLocked) {
        throw new BusinessRuleError('Score is locked and cannot be updated');
      }

      // Validate new score if provided
      if (updates.score !== undefined) {
        if (updates.score < 0 || updates.score > 100) {
          throw new BusinessRuleError('Score must be between 0 and 100');
        }
      }

      // Update score
      const updatedScore = await this.scoreRepository.updateById(scoreId, {
        ...updates,
        updatedAt: new Date()
      });

      this.logger.info('Score updated', {
        judgeAccountId,
        scoreId,
        updates: Object.keys(updates)
      });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition_${score.competition}`,
          'score_updated',
          {
            scoreId,
            playerId: score.player,
            teamId: score.team,
            judgeId: judgeAccountId,
            newScore: updatedScore.score,
            timestamp: updatedScore.updatedAt
          }
        );
      }

      return updatedScore;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof AuthorizationError ||
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Update individual score error', {
        judgeAccountId,
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get scores submitted by judge
   * @param {string} judgeAccountId
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Scores
   */
  async getMyScores(judgeAccountId, competitionId) {
    try {
      const scores = await this.scoreRepository.find({
        judge: judgeAccountId,
        competition: competitionId
      }, {
        populate: ['player', 'team'],
        sort: { submittedAt: -1 }
      });

      return scores;
    } catch (error) {
      this.logger.error('Get my scores error', {
        judgeAccountId,
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Persist the judge's account-lockout counters (MED-1).
   *
   * Writes through the model rather than `updateById`, which branches on
   * `updates.password` for re-hashing and runs full document validation —
   * neither is wanted for a counter bump, and a validation error on an
   * unrelated legacy field must never turn a failed login into a 500.
   *
   * The counter lives on the ACCOUNT, so a judge holding several seats now has
   * one attempt budget rather than one per seat — the limitation this method
   * used to document is closed.
   *
   * Failures are logged and swallowed: losing an increment beats breaking
   * judge login during an event.
   *
   * @param {*} judgeAccountId
   * @param {{loginAttempts: number, lockUntil: Date|null}} state
   * @returns {Promise<void>}
   */
  async persistJudgeLockoutState(judgeAccountId, state) {
    try {
      if (!this.judgeAccountRepository?.model?.updateOne) return;
      await this.judgeAccountRepository.model.updateOne({ _id: judgeAccountId }, { $set: state });
    } catch (error) {
      this.logger.error('Failed to persist judge lockout state', {
        judgeAccountId: String(judgeAccountId),
        error: error.message,
      });
    }
  }
}

module.exports = JudgeService;
