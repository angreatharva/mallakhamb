/**
 * Judge Service
 * 
 * Business logic for judge operations including authentication,
 * competition management, and scoring interface.
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
    this.competitionRepository = dependencies.competitionRepository;
    this.teamRepository = dependencies.teamRepository;
    this.playerRepository = dependencies.playerRepository;
    this.scoreRepository = dependencies.scoreRepository;
    this.tokenService = dependencies.tokenService;
    this.socketManager = dependencies.socketManager;
  }

  /**
   * Authenticate judge with competition context
   * @param {string} username - Judge username
   * @param {string} password - Judge password
   * @returns {Promise<Object>} { judge, token, competition }
   * @throws {AuthenticationError} If credentials invalid
   * @throws {AuthorizationError} If not assigned to competition
   */
  async loginJudge(username, password) {
    try {
      // Find judge by username (case-insensitive) - gets one record.
      // `password` is `select: false` on the Judge schema, so it must be
      // requested explicitly here or every judge login fails.
      // MED-1: the lockout counters are `select: false`, so request them here
      // alongside the password or enforcement silently does nothing.
      const judge = await this.judgeRepository.findByUsername(
        username.toLowerCase(),
        { select: '+password +loginAttempts +lockUntil' }
      );

      if (!judge) {
        // LOW-4: equalize timing so an unknown username is not distinguishable
        // from a wrong password by response latency.
        await bcrypt.compare(password || '', DUMMY_PASSWORD_HASH);
        this.logger.warn('Judge login failed: Judge not found', { username });
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if active — treat missing isActive as inactive only when explicitly false
      if (judge.isActive === false) {
        this.logger.warn('Judge login failed: Account inactive', {
          judgeId: judge._id,
          username
        });
        throw new AuthenticationError('Account is inactive');
      }

      // MED-1: judge credentials were publicly disclosed by CRIT-2, so the
      // password is the only remaining barrier on this account. Refuse a locked
      // account before spending a comparison.
      const lockout = getLockoutState(judge);
      if (lockout.isLocked) {
        this.logger.warn('Judge login failed: Account locked', {
          judgeId: judge._id,
          username,
          remainingMinutes: lockout.remainingMinutes,
        });
        throw new AuthenticationError(lockoutMessage(lockout.remainingMinutes));
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, judge.password);

      if (!isPasswordValid) {
        const next = registerFailedAttempt(judge, {
          maxAttempts: judgeSecuritySetting('security.maxLoginAttempts', DEFAULT_MAX_LOGIN_ATTEMPTS),
          lockoutMinutes: judgeSecuritySetting('security.lockoutDuration', DEFAULT_LOCKOUT_MINUTES),
        });

        await this.persistJudgeLockoutState(judge._id, {
          loginAttempts: next.loginAttempts,
          lockUntil: next.lockUntil,
        });

        this.logger.warn('Judge login failed: Invalid password', {
          judgeId: judge._id,
          username,
          attempts: next.loginAttempts,
          locked: next.isLocked,
        });

        if (next.isLocked) {
          throw new AuthenticationError(lockoutMessage(next.remainingMinutes));
        }
        throw new AuthenticationError('Invalid credentials');
      }

      // Clear the counter on success so nobody carries a stale tally forward.
      if (judge.loginAttempts || judge.lockUntil) {
        await this.persistJudgeLockoutState(judge._id, clearedLockoutState());
      }

      // Use judge's assigned competition
      const competitionId = judge.competition;

      // Get competition details
      const competition = await this.competitionRepository.findById(competitionId);
      
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Find ALL judge records with the same username and competition (for multi-assignment support)
      const allAssignments = await this.judgeRepository.find({
        username: username.toLowerCase(),
        competition: competitionId,
        isActive: { $ne: false } // Only include active assignments
      });

      this.logger.info('Judge logged in successfully', { 
        judgeId: judge._id, 
        competitionId,
        username,
        totalAssignments: allAssignments.length,
        ageGroups: [...new Set(allAssignments.map(a => a.ageGroup))],
        genders: [...new Set(allAssignments.map(a => a.gender))]
      });

      // Generate token with competition context
      const token = this.tokenService.generateToken(
        judge._id, 
        'judge', 
        competitionId
      );

      return {
        judge: {
          _id: judge._id,
          name: judge.name,
          username: judge.username,
          judgeType: judge.judgeType,
          judgeNo: judge.judgeNo,
          ageGroup: judge.ageGroup,
          gender: judge.gender,
          competitionTypes: judge.competitionTypes,
          // NEW: Include all assignments for this judge
          allAssignments: allAssignments.map(a => ({
            _id: a._id,
            gender: a.gender,
            ageGroup: a.ageGroup,
            competitionTypes: a.competitionTypes,
            apparatus: a.apparatus,
            judgeType: a.judgeType,
            judgeNo: a.judgeNo
          }))
        },
        token,
        competition: {
          _id: competition._id,
          name: competition.name,
          level: competition.level,
          place: competition.place,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status,
          apparatusConfig: competition.apparatusConfig
        }
      };
    } catch (error) {
      if (error instanceof AuthenticationError || 
          error instanceof AuthorizationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Judge login error', { 
        username, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get judge profile
   * @param {string} judgeId - Judge ID
   * @returns {Promise<Object>} Judge profile
   */
  async getJudgeProfile(judgeId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId, {
        populate: 'competition'
      });

      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // Remove password from response
      const { password, ...profile } = judge;

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get judge profile error', { 
        judgeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update judge profile
   * @param {string} judgeId - Judge ID
   * @param {Object} updates - Profile updates
   * @returns {Promise<Object>} Updated profile
   */
  async updateJudgeProfile(judgeId, updates) {
    try {
      // Prevent updating sensitive fields
      const { 
        password, 
        competition, 
        judgeNo, 
        judgeType, 
        ...allowedUpdates 
      } = updates;

      const updatedJudge = await this.judgeRepository.updateById(
        judgeId, 
        allowedUpdates
      );

      if (!updatedJudge) {
        throw new NotFoundError('Judge');
      }

      // Remove password from response
      const { password: _, ...profile } = updatedJudge;

      // Invalidate cache
      if (this.cacheService) {
        this.cacheService.delete(`user:judge:${judgeId}`);
      }

      this.logger.info('Judge profile updated', { 
        judgeId, 
        updatedFields: Object.keys(allowedUpdates) 
      });

      return profile;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Update judge profile error', { 
        judgeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get assigned competitions for judge
   * @param {string} judgeId - Judge ID
   * @returns {Promise<Array>} Assigned competitions
   */
  async getAssignedCompetitions(judgeId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId, {
        populate: 'competition'
      });

      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // Return as array for consistency (judge has single competition)
      return judge.competition ? [judge.competition] : [];
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get assigned competitions error', { 
        judgeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Set competition context (generate new token)
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} { token, competition }
   */
  async setCompetitionContext(judgeId, competitionId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // Verify assignment
      if (judge.competition.toString() !== competitionId.toString()) {
        throw new AuthorizationError('Not assigned to this competition');
      }

      const competition = await this.competitionRepository.findById(competitionId);
      
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Generate new token with competition context
      const token = this.tokenService.generateToken(
        judgeId, 
        'judge', 
        { competitionId }
      );

      this.logger.info('Competition context set', { judgeId, competitionId });

      return { token, competition };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Set competition context error', { 
        judgeId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get competition details for judge
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Competition details
   */
  async getCompetitionDetails(judgeId, competitionId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // Verify access
      if (judge.competition.toString() !== competitionId.toString()) {
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
        judgeId, 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get teams available for scoring (filtered by assigned age group)
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group filter (optional)
   * @returns {Promise<Array>} Teams with scoring status
   */
  async getAvailableTeams(judgeId, competitionId, ageGroup = null) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // Use judge's assigned age group if not provided
      const targetAgeGroup = ageGroup || judge.ageGroup;

      // Check if judge is assigned to this age group
      if (judge.ageGroup !== targetAgeGroup) {
        throw new AuthorizationError('Not assigned to this age group');
      }

      // Get teams for age group and gender
      const teams = await this.teamRepository.find({
        competition: competitionId,
        ageGroup: targetAgeGroup,
        gender: judge.gender,
        isSubmitted: true
      }, {
        populate: 'coach',
        select: 'name ageGroup gender coach isSubmitted'
      });

      // Fetch players for each team and add scoring status
      const teamsWithStatus = await Promise.all(
        teams.map(async (team) => {
          // Fetch players for this team
          const Player = require('../../models/Player');
          const players = await Player.find({ team: team._id }).lean();
          
          const scoredPlayers = await this.scoreRepository.count({
            team: team._id,
            judge: judgeId
          });

          return {
            _id: team._id,
            name: team.name,
            ageGroup: team.ageGroup,
            gender: team.gender,
            coach: team.coach,
            players,
            totalPlayers: players.length,
            scoredPlayers,
            scoringComplete: scoredPlayers === players.length
          };
        })
      );

      return teamsWithStatus;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Get available teams error', { 
        judgeId, 
        competitionId, 
        ageGroup, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get team players with existing scores
   * @param {string} judgeId - Judge ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} { team, players }
   */
  async getTeamPlayers(judgeId, teamId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      const team = await this.teamRepository.findById(teamId, {
        populate: 'coach competition'
      });

      if (!team) {
        throw new NotFoundError('Team');
      }

      // Verify team has been submitted by coach for this competition
      const compId = judge.competition?._id || judge.competition;
      if (compId) {
        const comp = await this.competitionRepository.findById(compId);
        if (comp) {
          const regTeam = (comp.registeredTeams || []).find(
            rt => rt.team && (rt.team._id ? rt.team._id.toString() : rt.team.toString()) === teamId.toString()
          );
          if (!regTeam || regTeam.isSubmitted !== true) {
            throw new AuthorizationError('Team has not been submitted by coach yet');
          }
        }
      }

      // Find score documents for this team and judge's category
      const scoreQuery = {
        teamId: teamId,
        gender: judge.gender,
        ageGroup: judge.ageGroup
      };
      if (judge.competition) {
        scoreQuery.competition = judge.competition._id || judge.competition;
      }

      const scores = await this.scoreRepository.find(scoreQuery);

      // Task 3.2: was a second hand-written copy of the panel-role mapping.
      // If it ever disagreed with the one used to WRITE slips, a judge would
      // submit into one slot and then be told they had not scored the player.
      const judgeInfo = getJudgeRoleMapping(judge.judgeType);
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

      // Fetch players for this team
      const Player = require('../../models/Player');
      const players = await Player.find({ team: teamId }).lean();

      // CRIT-4 class: this roster used to carry `email` and `dateOfBirth`, and
      // these are minors. A judge needs a name, a gender and a score — nothing
      // here reads contact details (JudgeTeamPlayers.jsx:251-258).
      const playersWithScores = players.map(player => ({
        _id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        gender: player.gender,
        ageGroup: player.ageGroup,
        score: scoreMap[player._id.toString()]?.score || null,
        isFinalized: !!scoreMap[player._id.toString()]?.isFinalized,
        hasScore: !!scoreMap[player._id.toString()]?.hasScore
      }));

      return {
        team: {
          _id: team._id,
          name: team.name,
          coach: team.coach,
          competition: team.competition
        },
        players: playersWithScores
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof AuthorizationError) {
        throw error;
      }
      this.logger.error('Get team players error', { 
        judgeId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Save individual score
   * @param {string} judgeId - Judge ID
   * @param {Object} scoreData - Score data
   * @returns {Promise<Object>} Saved score
   */
  async saveIndividualScore(judgeId, scoreData) {
    try {
      const { playerId, teamId, competitionId, score, notes } = scoreData;

      // Verify judge assignment
      const judge = await this.judgeRepository.findById(judgeId);
      
      if (!judge || judge.competition.toString() !== competitionId.toString()) {
        throw new AuthorizationError('Not authorized to score this competition');
      }

      // Get player and team
      const player = await this.playerRepository.findById(playerId);
      
      if (!player) {
        throw new NotFoundError('Player');
      }

      const team = await this.teamRepository.findById(teamId);
      
      if (!team) {
        throw new NotFoundError('Team');
      }

      // Check if judge assigned to this age group and gender
      if (judge.ageGroup !== team.ageGroup || judge.gender !== team.gender) {
        throw new AuthorizationError('Not assigned to this age group/gender');
      }

      // Check if already scored
      const existingScore = await this.scoreRepository.findOne({
        player: playerId,
        judge: judgeId,
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
        judge: judgeId,
        competition: competitionId,
        ageGroup: team.ageGroup,
        gender: team.gender,
        score,
        notes,
        submittedAt: new Date(),
        isLocked: false
      });

      this.logger.info('Score saved', {
        judgeId,
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
            judgeId,
            judgeType: judge.judgeType,
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
        judgeId, 
        scoreData, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update individual score
   * @param {string} judgeId - Judge ID
   * @param {string} scoreId - Score ID
   * @param {Object} updates - Score updates
   * @returns {Promise<Object>} Updated score
   */
  async updateIndividualScore(judgeId, scoreId, updates) {
    try {
      const score = await this.scoreRepository.findById(scoreId);
      
      if (!score) {
        throw new NotFoundError('Score');
      }

      // Verify ownership
      if (score.judge.toString() !== judgeId.toString()) {
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
        judgeId, 
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
            judgeId,
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
        judgeId, 
        scoreId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get scores submitted by judge
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Scores
   */
  async getMyScores(judgeId, competitionId) {
    try {
      const scores = await this.scoreRepository.find({
        judge: judgeId,
        competition: competitionId
      }, {
        populate: ['player', 'team'],
        sort: { submittedAt: -1 }
      });

      return scores;
    } catch (error) {
      this.logger.error('Get my scores error', { 
        judgeId, 
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
   * NOTE: a judge may hold several documents (one per assignment) sharing a
   * username. `findByUsername` authenticates against one of them, so the
   * counter is kept on that record. This is a known limitation: an attacker
   * could get the full attempt budget per assignment. Recorded rather than
   * silently ignored — closing it means keying lockout on the username, which
   * is a larger change than this task.
   *
   * Failures are logged and swallowed: losing an increment beats breaking
   * judge login during an event.
   *
   * @param {*} judgeId
   * @param {{loginAttempts: number, lockUntil: Date|null}} state
   * @returns {Promise<void>}
   */
  async persistJudgeLockoutState(judgeId, state) {
    try {
      if (!this.judgeRepository?.model?.updateOne) return;
      await this.judgeRepository.model.updateOne({ _id: judgeId }, { $set: state });
    } catch (error) {
      this.logger.error('Failed to persist judge lockout state', {
        judgeId: String(judgeId),
        error: error.message,
      });
    }
  }
}

module.exports = JudgeService;

