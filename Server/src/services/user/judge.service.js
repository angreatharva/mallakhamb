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
   * @param {string} email - Judge username/email
   * @param {string} password - Judge password
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} { judge, token, competition }
   * @throws {AuthenticationError} If credentials invalid
   * @throws {AuthorizationError} If not assigned to competition
   */
  async loginJudge(email, password, competitionId) {
    try {
      // Find judge by email/username
      const judge = await this.judgeRepository.findByEmail(email);
      
      if (!judge) {
        this.logger.warn('Judge login failed: Judge not found', { email });
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if active
      if (!judge.isActive) {
        this.logger.warn('Judge login failed: Account inactive', { 
          judgeId: judge._id, 
          email 
        });
        throw new AuthenticationError('Account is inactive');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, judge.password);
      
      if (!isPasswordValid) {
        this.logger.warn('Judge login failed: Invalid password', { 
          judgeId: judge._id, 
          email 
        });
        throw new AuthenticationError('Invalid credentials');
      }

      // Verify competition assignment
      if (judge.competition.toString() !== competitionId.toString()) {
        this.logger.warn('Judge login failed: Not assigned to competition', {
          judgeId: judge._id,
          requestedCompetition: competitionId,
          assignedCompetition: judge.competition
        });
        throw new AuthorizationError('Not assigned to this competition');
      }

      // Get competition details
      const competition = await this.competitionRepository.findById(competitionId);
      
      if (!competition) {
        throw new NotFoundError('Competition not found');
      }

      // Generate token with competition context
      const token = this.tokenService.generateToken(
        judge._id, 
        'judge', 
        { competitionId }
      );

      this.logger.info('Judge logged in successfully', { 
        judgeId: judge._id, 
        competitionId,
        ageGroup: judge.ageGroup,
        gender: judge.gender
      });

      return {
        judge: {
          _id: judge._id,
          name: judge.name,
          username: judge.username,
          judgeType: judge.judgeType,
          judgeNo: judge.judgeNo,
          ageGroup: judge.ageGroup,
          gender: judge.gender,
          competitionTypes: judge.competitionTypes
        },
        token,
        competition: {
          _id: competition._id,
          name: competition.name,
          level: competition.level,
          place: competition.place,
          startDate: competition.startDate,
          endDate: competition.endDate,
          status: competition.status
        }
      };
    } catch (error) {
      if (error instanceof AuthenticationError || 
          error instanceof AuthorizationError || 
          error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Judge login error', { 
        email, 
        competitionId, 
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
        throw new NotFoundError('Judge not found');
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
        throw new NotFoundError('Judge not found');
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
        throw new NotFoundError('Judge not found');
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
        throw new NotFoundError('Judge not found');
      }

      // Verify assignment
      if (judge.competition.toString() !== competitionId.toString()) {
        throw new AuthorizationError('Not assigned to this competition');
      }

      const competition = await this.competitionRepository.findById(competitionId);
      
      if (!competition) {
        throw new NotFoundError('Competition not found');
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
        throw new NotFoundError('Judge not found');
      }

      // Verify access
      if (judge.competition.toString() !== competitionId.toString()) {
        throw new AuthorizationError('Not assigned to this competition');
      }

      const competition = await this.competitionRepository.findById(competitionId);
      
      if (!competition) {
        throw new NotFoundError('Competition not found');
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
        throw new NotFoundError('Judge not found');
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
        populate: 'players coach',
        select: 'name ageGroup gender players coach isSubmitted'
      });

      // Add scoring status for each team
      const teamsWithStatus = await Promise.all(
        teams.map(async (team) => {
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
            totalPlayers: team.players.length,
            scoredPlayers,
            scoringComplete: scoredPlayers === team.players.length
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
        throw new NotFoundError('Judge not found');
      }

      const team = await this.teamRepository.findById(teamId, {
        populate: 'players coach competition'
      });

      if (!team) {
        throw new NotFoundError('Team not found');
      }

      // Verify judge can score this team (age group and gender match)
      if (team.ageGroup !== judge.ageGroup || team.gender !== judge.gender) {
        throw new AuthorizationError('Not authorized to score this team');
      }

      // Get existing scores by this judge for this team
      const scores = await this.scoreRepository.find({
        team: teamId,
        judge: judgeId
      });

      const scoreMap = scores.reduce((map, score) => {
        map[score.player.toString()] = score;
        return map;
      }, {});

      // Add score info to each player
      const playersWithScores = team.players.map(player => ({
        _id: player._id,
        firstName: player.firstName,
        lastName: player.lastName,
        email: player.email,
        dateOfBirth: player.dateOfBirth,
        gender: player.gender,
        ageGroup: player.ageGroup,
        score: scoreMap[player._id.toString()] || null,
        hasScore: !!scoreMap[player._id.toString()]
      }));

      return {
        team: {
          _id: team._id,
          name: team.name,
          ageGroup: team.ageGroup,
          gender: team.gender,
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
        throw new NotFoundError('Player not found');
      }

      const team = await this.teamRepository.findById(teamId);
      
      if (!team) {
        throw new NotFoundError('Team not found');
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
        throw new NotFoundError('Score not found');
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
}

module.exports = JudgeService;
