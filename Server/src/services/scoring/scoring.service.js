/**
 * Scoring Service
 * 
 * Handles score management operations including submission, updates,
 * deletion, and validation of scores.
 * 
 * Requirements: 1.5, 1.7, 1.8
 */

const { 
  ValidationError, 
  NotFoundError,
  BusinessRuleError 
} = require('../../errors');
const EventTypes = require('../../socket/events/event-types');
const { toCompetitionTypeDisplay } = require('../../config/cop-rules');
const {
  SUBMITTED_TEAM_COACH_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_COACH_FIELD_LIST,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
} = require('../../utils/data/user-projection.util');

class ScoringService {
  /**
   * Create a scoring service
   * @param {ScoreRepository} scoreRepository - Score repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {JudgeRepository} judgeRepository - Judge repository
   * @param {SocketManager} socketManager - Socket.IO manager (optional)
   * @param {Logger} logger - Logger instance
   */
  constructor(
    scoreRepository,
    competitionRepository,
    playerRepository,
    judgeRepository,
    socketManager,
    logger,
    calculationService
  ) {
    this.scoreRepository = scoreRepository;
    this.competitionRepository = competitionRepository;
    this.playerRepository = playerRepository;
    this.judgeRepository = judgeRepository;
    this.socketManager = socketManager;
    this.logger = logger;
    // Appended rather than inserted so the existing positional construction
    // keeps working. Required by the ranking methods moved here in task 3.1.
    this.calculationService = calculationService;
  }

  /**
   * Submit a new score
   * @param {Object} scoreData - Score data
   * @returns {Promise<Object>} Created score
   * @throws {ValidationError} If validation fails
   * @throws {NotFoundError} If referenced entities not found
   * @throws {BusinessRuleError} If business rules violated
   */
  async submitScore(scoreData) {
    try {
      // Validate required fields
      this.validateScoreData(scoreData);

      // Validate competition exists and is active
      const competition = await this.competitionRepository.findById(scoreData.competition);
      if (!competition || competition.isDeleted) {
        this.logger.warn('Score submission failed: Competition not found', {
          competitionId: scoreData.competition
        });
        throw new NotFoundError('Competition', scoreData.competition);
      }

      // Validate team exists
      if (scoreData.teamId) {
        // Team validation would go here if TeamRepository was injected
        // For now, we'll assume it's valid
      }

      // Validate player scores
      if (scoreData.playerScores && scoreData.playerScores.length > 0) {
        await this.validatePlayerScores(scoreData.playerScores);
      }

      // Create score
      const score = await this.scoreRepository.create({
        ...scoreData,
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      this.logger.info('Score submitted', {
        scoreId: score._id,
        competitionId: scoreData.competition,
        teamId: scoreData.teamId,
        playerCount: scoreData.playerScores?.length || 0
      });

      // Emit Socket.IO event for real-time score update
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition:${scoreData.competition}`,
          EventTypes.SCORE_SUBMITTED,
          {
            scoreId: score._id,
            competitionId: scoreData.competition,
            teamId: scoreData.teamId,
            playerScores: scoreData.playerScores,
            timestamp: new Date()
          }
        );
      }

      return score;
    } catch (error) {
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Submit score error', {
        scoreData,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update an existing score
   * @param {string} scoreId - Score ID
   * @param {Object} updates - Update data
   * @returns {Promise<Object>} Updated score
   * @throws {NotFoundError} If score not found
   * @throws {BusinessRuleError} If score is locked
   */
  async updateScore(scoreId, updates) {
    try {
      // Find score
      const score = await this.scoreRepository.findById(scoreId);

      if (!score) {
        this.logger.warn('Score update failed: Not found', { scoreId });
        throw new NotFoundError('Score', scoreId);
      }

      // Check if score is locked
      if (score.isLocked) {
        this.logger.warn('Score update failed: Score is locked', { scoreId });
        throw new BusinessRuleError('Cannot update locked score');
      }

      // Validate updates if player scores are being updated
      if (updates.playerScores) {
        await this.validatePlayerScores(updates.playerScores);
      }

      // Don't allow updating certain fields
      const { _id, competition, createdAt, ...allowedUpdates } = updates;

      // Add updated timestamp
      allowedUpdates.updatedAt = new Date();

      // Update score
      const updated = await this.scoreRepository.updateById(scoreId, allowedUpdates);

      this.logger.info('Score updated', {
        scoreId,
        updates: Object.keys(allowedUpdates)
      });

      // Emit Socket.IO event for real-time score update
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition:${score.competition}`,
          EventTypes.SCORE_UPDATED,
          {
            scoreId,
            competitionId: score.competition,
            teamId: score.teamId,
            updates: allowedUpdates,
            timestamp: new Date()
          }
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || 
          error instanceof BusinessRuleError ||
          error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Update score error', {
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a score
   * @param {string} scoreId - Score ID
   * @returns {Promise<boolean>} True if deleted
   * @throws {NotFoundError} If score not found
   * @throws {BusinessRuleError} If score is locked
   */
  async deleteScore(scoreId) {
    try {
      // Find score
      const score = await this.scoreRepository.findById(scoreId);

      if (!score) {
        this.logger.warn('Score delete failed: Not found', { scoreId });
        throw new NotFoundError('Score', scoreId);
      }

      // Check if score is locked
      if (score.isLocked) {
        this.logger.warn('Score delete failed: Score is locked', { scoreId });
        throw new BusinessRuleError('Cannot delete locked score');
      }

      // Delete score
      await this.scoreRepository.deleteById(scoreId);

      this.logger.info('Score deleted', { scoreId });

      // Emit Socket.IO event for real-time score deletion
      if (this.socketManager) {
        this.socketManager.emitToRoom(
          `competition:${score.competition}`,
          EventTypes.SCORE_DELETED,
          {
            scoreId,
            competitionId: score.competition,
            teamId: score.teamId,
            timestamp: new Date()
          }
        );
      }

      return true;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BusinessRuleError) {
        throw error;
      }
      this.logger.error('Delete score error', {
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get score by ID
   * @param {string} scoreId - Score ID
   * @returns {Promise<Object>} Score
   * @throws {NotFoundError} If score not found
   */
  async getScoreById(scoreId) {
    try {
      const score = await this.scoreRepository.findById(scoreId, {
        populate: [
          { path: 'competition', select: 'name startDate endDate' },
          { path: 'teamId', select: 'name coach' }
        ]
      });

      if (!score) {
        this.logger.warn('Score not found', { scoreId });
        throw new NotFoundError('Score', scoreId);
      }

      return score;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Get score error', {
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get scores by competition
   * @param {string} competitionId - Competition ID
   * @param {Object} filters - Additional filters (gender, ageGroup, competitionType)
   * @returns {Promise<Array>} Scores
   */
  async getScoresByCompetition(competitionId, filters = {}) {
    try {
      const criteria = { competition: competitionId, ...filters };
      const scores = await this.scoreRepository.find(criteria, {
        sort: { createdAt: -1 }
      });

      this.logger.debug('Scores fetched for competition', {
        competitionId,
        count: scores.length,
        filters
      });

      return scores;
    } catch (error) {
      this.logger.error('Get scores by competition error', {
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lock a score to prevent further modifications
   * @param {string} scoreId - Score ID
   * @returns {Promise<Object>} Updated score
   * @throws {NotFoundError} If score not found
   */
  async lockScore(scoreId) {
    try {
      const score = await this.scoreRepository.findById(scoreId);

      if (!score) {
        this.logger.warn('Score lock failed: Not found', { scoreId });
        throw new NotFoundError('Score', scoreId);
      }

      const updated = await this.scoreRepository.updateById(scoreId, {
        isLocked: true,
        updatedAt: new Date()
      });

      this.logger.info('Score locked', { scoreId });

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Lock score error', {
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unlock a score to allow modifications
   * @param {string} scoreId - Score ID
   * @returns {Promise<Object>} Updated score
   * @throws {NotFoundError} If score not found
   */
  async unlockScore(scoreId) {
    try {
      const score = await this.scoreRepository.findById(scoreId);

      if (!score) {
        this.logger.warn('Score unlock failed: Not found', { scoreId });
        throw new NotFoundError('Score', scoreId);
      }

      const updated = await this.scoreRepository.updateById(scoreId, {
        isLocked: false,
        updatedAt: new Date()
      });

      this.logger.info('Score unlocked', { scoreId });

      return updated;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Unlock score error', {
        scoreId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate score data
   * @param {Object} scoreData - Score data to validate
   * @throws {ValidationError} If validation fails
   */
  validateScoreData(scoreData) {
    const errors = [];

    // Validate required fields
    if (!scoreData.competition) {
      errors.push('Competition is required');
    }

    if (!scoreData.teamId) {
      errors.push('Team ID is required');
    }

    if (!scoreData.gender) {
      errors.push('Gender is required');
    } else if (!['Male', 'Female'].includes(scoreData.gender)) {
      errors.push('Gender must be Male or Female');
    }

    if (!scoreData.ageGroup) {
      errors.push('Age group is required');
    } else if (!['Under10', 'Under12', 'Under14', 'Under16', 'Under18', 'Above16', 'Above18'].includes(scoreData.ageGroup)) {
      errors.push('Invalid age group');
    }

    if (!scoreData.competitionType) {
      errors.push('Competition type is required');
    } else if (!['Competition I', 'Competition II', 'Competition III'].includes(scoreData.competitionType)) {
      errors.push('Invalid competition type');
    }

    if (errors.length > 0) {
      throw new ValidationError('Score validation failed', { errors });
    }
  }

  /**
   * Validate player scores
   * @param {Array} playerScores - Array of player scores
   * @throws {ValidationError} If validation fails
   */
  async validatePlayerScores(playerScores) {
    const errors = [];

    for (let i = 0; i < playerScores.length; i++) {
      const ps = playerScores[i];

      // Validate player exists
      if (ps.playerId) {
        const player = await this.playerRepository.findById(ps.playerId);
        if (!player || !player.isActive) {
          errors.push(`Player at index ${i} not found or inactive`);
        }
      } else {
        errors.push(`Player ID is required at index ${i}`);
      }

      // Validate judge scores are within range
      if (ps.judgeScores) {
        const judgeFields = ['seniorJudge', 'judge1', 'judge2', 'judge3', 'judge4'];
        for (const field of judgeFields) {
          if (ps.judgeScores[field] !== undefined) {
            const score = ps.judgeScores[field];
            if (score < 0 || score > 10) {
              errors.push(`${field} score must be between 0 and 10 at index ${i}`);
            }
          }
        }
      }

      // Validate execution average
      if (ps.executionAverage !== undefined) {
        if (ps.executionAverage < 0 || ps.executionAverage > 10) {
          errors.push(`Execution average must be between 0 and 10 at index ${i}`);
        }
      }

      // Validate final score is non-negative
      if (ps.finalScore !== undefined && ps.finalScore < 0) {
        errors.push(`Final score cannot be negative at index ${i}`);
      }

      // Validate deductions are non-negative
      if (ps.deduction !== undefined && ps.deduction < 0) {
        errors.push(`Deduction cannot be negative at index ${i}`);
      }

      if (ps.otherDeduction !== undefined && ps.otherDeduction < 0) {
        errors.push(`Other deduction cannot be negative at index ${i}`);
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Player scores validation failed', { errors });
    }
  }

  // ==========================================================================
  // Score aggregation and rankings
  //
  // Moved verbatim from admin.service.js (task 3.1 / MED-5), which had grown to
  // 46 methods across ~3,000 lines and was the single largest source of merge
  // conflict. Behaviour is unchanged; admin.service delegates here so every
  // existing caller and route keeps working.
  // ==========================================================================

  /**
   * Get team scores with aggregation
   * @param {string} competitionId - Competition ID
   * @param {string} competitionType - Competition type
   * @param {string} apparatus - Apparatus
   * @returns {Promise<Array>} Teams with scores
   */
  async getTeamScores(competitionId, ageGroup, gender, competitionType, apparatus) {
    try {
      // Query the Competition model to get registered teams.
      // Same projection as getSubmittedTeams — without a `select` these
      // populated documents carry e-mail addresses and minors' dates of birth
      // into the response. Applied here AND at the mapping layer below, because
      // `.toObject()` does not run a schema toJSON transform.
      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          {
            path: 'registeredTeams.team',
            populate: { path: 'coach', select: SUBMITTED_TEAM_COACH_FIELDS }
          },
          {
            path: 'registeredTeams.players.player',
            select: SUBMITTED_TEAM_PLAYER_FIELDS
          }
        ]
      });

      if (!competition) {
        this.logger.warn('Competition not found', { competitionId });
        return [];
      }

      // Filter teams by age group and gender if provided
      let filteredTeams = competition.registeredTeams;
      
      if (ageGroup || gender) {
        filteredTeams = filteredTeams.filter(regTeam => {
          return regTeam.players.some(playerEntry => {
            const matchesAgeGroup = !ageGroup || playerEntry.ageGroup === ageGroup;
            const matchesGender = !gender || playerEntry.gender === gender;
            return matchesAgeGroup && matchesGender;
          });
        });
      }

      const teamsWithScores = await Promise.all(
        filteredTeams.map(async (regTeam) => {
          // Get scores for this team - filter by gender and ageGroup to get the correct score document
          const scoreQuery = {
            competition: competitionId,
            teamId: regTeam.team._id
          };
          if (gender) scoreQuery.gender = gender;
          if (ageGroup) scoreQuery.ageGroup = ageGroup;
          if (competitionType) {
            scoreQuery.competitionType = toCompetitionTypeDisplay(competitionType);
          }
          
          const scores = await this.scoreRepository.find(scoreQuery);

          let playerScores = scores.flatMap(s => s.playerScores || []);
          
          if (apparatus) {
            playerScores = playerScores.filter(ps => ps.apparatus === apparatus);
          }
          
          const totalScore = playerScores.reduce((sum, ps) => sum + (ps.finalScore || 0), 0);
          
          // Get the most recent score document for metadata (isLocked, timeKeeper, etc.)
          const latestScoreDoc = scores.length > 0 ? scores.sort((a, b) => 
            new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
          )[0] : null;

          return {
            _id: regTeam.team._id,
            name: regTeam.team.name,
            // Same defect class as CRIT-4: this returned the whole coach and
            // player documents. `select: false` now hides the bcrypt hash, but
            // coach/player e-mail and minors' dates of birth were still going
            // out on /api/judge/scores/team and /api/admin/scores/team. Reuses
            // the allow-lists getSubmittedTeams projects with, so the two
            // endpoints cannot drift apart.
            coach: projectFields(regTeam.coach, SUBMITTED_TEAM_COACH_FIELD_LIST),
            players: regTeam.players.map(playerEntry => {
              // projectFields handles Mongoose documents and plain objects, and
              // passes an unpopulated ObjectId ref through untouched.
              const playerData = projectFields(playerEntry.player, SUBMITTED_TEAM_PLAYER_FIELD_LIST);
              return {
                ...playerData,
                ageGroup: playerEntry.ageGroup,
                gender: playerEntry.gender
              };
            }),
            scores: playerScores,
            totalScore,
            // Include score document metadata
            scoreMetadata: latestScoreDoc ? {
              _id: latestScoreDoc._id,
              isLocked: latestScoreDoc.isLocked,
              timeKeeper: latestScoreDoc.timeKeeper,
              scorer: latestScoreDoc.scorer,
              remarks: latestScoreDoc.remarks,
              competitionType: latestScoreDoc.competitionType,
              createdAt: latestScoreDoc.createdAt,
              updatedAt: latestScoreDoc.updatedAt
            } : null
          };
        })
      );

      this.logger.info('Team scores retrieved', { competitionId, ageGroup, gender });

      return teamsWithScores;
    } catch (error) {
      this.logger.error('Get team scores error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get individual player scores
   * @param {string} competitionId - Competition ID
   * @param {string} competitionType - Competition type
   * @param {string} apparatus - Apparatus
   * @returns {Promise<Array>} Players with individual scores
   */
  async getIndividualScores(competitionId, ageGroup, gender, competitionType, apparatus) {
    try {
      // Build query filters
      const query = { competition: competitionId };
      
      // Only add ageGroup filter if provided
      if (ageGroup) {
        query.ageGroup = ageGroup;
      }
      if (competitionType) {
        query.competitionType = competitionType;
      }

      const scores = await this.scoreRepository.find(query);

      const playerScoresMap = new Map();

      scores.forEach(scoreDoc => {
        (scoreDoc.playerScores || []).forEach(ps => {
          const playerId = ps.playerId?.toString();
          if (playerId) {
            // Apply gender filter if provided
            if (gender && ps.playerGender && ps.playerGender !== gender) {
              return; // Skip this player score
            }
            
            // Apply apparatus filter if provided
            if (apparatus && ps.apparatus && ps.apparatus !== apparatus) {
              return; // Skip this player score
            }
            
            if (!playerScoresMap.has(playerId)) {
              playerScoresMap.set(playerId, {
                playerId: ps.playerId,
                playerName: ps.playerName,
                playerGender: ps.playerGender,
                playerAgeGroup: ps.playerAgeGroup,
                scores: []
              });
            }
            playerScoresMap.get(playerId).scores.push(ps);
          }
        });
      });

      const individualScores = Array.from(playerScoresMap.values());

      this.logger.info('Individual scores retrieved', { 
        competitionId, 
        ageGroup, 
        gender,
        count: individualScores.length 
      });

      return individualScores;
    } catch (error) {
      this.logger.error('Get individual scores error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get team rankings
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} competitionType - Competition Type
   * @param {string} apparatus - Apparatus
   * @returns {Promise<Array>} Team rankings
   */
  async getTeamRankings(competitionId, ageGroup, gender, competitionType, apparatus) {
    try {
      const teamsWithScores = await this.getTeamScores(competitionId, ageGroup, gender, competitionType, apparatus);

      // Calculate rankings using CalculationService
      const rankings = this.calculationService.calculateRankings(
        teamsWithScores.map(t => ({
          ...t,
          finalScore: t.totalScore
        }))
      );

      this.logger.info('Team rankings calculated', { 
        competitionId, 
        ageGroup, 
        gender,
        count: rankings.length 
      });

      return rankings;
    } catch (error) {
      this.logger.error('Get team rankings error', { 
        competitionId, 
        ageGroup, 
        gender,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get individual player rankings
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Individual rankings
   */
  async getIndividualRankings(competitionId, ageGroup) {
    try {
      const individualScores = await this.getIndividualScores(competitionId, ageGroup);

      // Calculate final score for each player
      const playersWithFinalScores = individualScores.map(player => {
        const finalScore = player.scores.reduce((sum, s) => sum + (s.finalScore || 0), 0);
        return {
          ...player,
          finalScore
        };
      });

      // Calculate rankings using CalculationService
      const rankings = this.calculationService.calculateRankings(playersWithFinalScores);

      this.logger.info('Individual rankings calculated', { 
        competitionId, 
        ageGroup, 
        count: rankings.length 
      });

      return rankings;
    } catch (error) {
      this.logger.error('Get individual rankings error', { 
        competitionId, 
        ageGroup, 
        error: error.message 
      });
      throw error;
    }
  }

}

module.exports = ScoringService;
