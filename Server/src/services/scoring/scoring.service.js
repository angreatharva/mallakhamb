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
const {
  toCompetitionTypeDisplay,
  toCompetitionTypeSlug,
  validateSlipBreakdown,
} = require('../../config/cop-rules');
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

    // Existence is resolved in ONE query rather than a findById per entry.
    // This runs on the score-save path during a live event, and the previous
    // shape was a sequential `await` inside the loop — a twelve-player team
    // paid twelve serial round-trips before the write even started.
    // Only `isActive` is read, so the projection stays minimal.
    const playerIds = playerScores.map((ps) => ps.playerId).filter(Boolean);
    const activePlayerIds = new Set();

    if (playerIds.length > 0) {
      const players = await this.playerRepository.find(
        { _id: { $in: playerIds } },
        { select: '_id isActive' }
      );
      for (const player of players) {
        if (player.isActive) {
          activePlayerIds.add(String(player._id));
        }
      }
    }

    for (let i = 0; i < playerScores.length; i++) {
      const ps = playerScores[i];

      // Validate player exists
      if (ps.playerId) {
        if (!activePlayerIds.has(String(ps.playerId))) {
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


  // ==========================================================================
  // Score locking, recalculation and age-group closure
  //
  // Moved from admin.service.js (task 3.1 / MED-5). Behaviour unchanged.
  //
  // NOTE ON NAMING: this class already had `lockScore(scoreId)` and
  // `unlockScore(scoreId)`, which are live on /api/scoring and are genuinely
  // DIFFERENT operations — they take a single score id, write no audit fields
  // and return the updated document. The admin variants below act on a whole
  // age group (or record `unlockedBy`/`unlockedAt`) and return a message
  // object, so they are named explicitly rather than overloading the originals.
  // Collapsing them would have silently changed /api/scoring's behaviour.
  // ==========================================================================

  /**
   * Unlock a single score document by ID (MED-4)
   * @param {string} scoreId - Score document ID
   * @param {string} adminId - Admin performing the unlock
   * @returns {Promise<Object>} Unlock result
   * @throws {NotFoundError} If score not found
   */
  async unlockScoreAsAdmin(scoreId, adminId) {
    try {
      const scoreDoc = await this.scoreRepository.findById(scoreId);

      if (!scoreDoc) {
        throw new NotFoundError('Score');
      }

      await this.scoreRepository.updateById(scoreId, {
        isLocked: false,
        unlockedBy: adminId,
        unlockedAt: new Date()
      });

      this.logger.info('Score unlocked', { scoreId, adminId });

      return {
        message: 'Score unlocked successfully',
        scoreId,
        isLocked: false
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Unlock score error', {
        scoreId,
        adminId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unlock scores for editing
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async unlockScoresForAgeGroup(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update scores to unlocked state
      await this.scoreRepository.updateMany(
        { competition: competitionId, ageGroup },
        { isLocked: false, unlockedBy: adminId, unlockedAt: new Date() }
      );

      this.logger.info('Scores unlocked', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.SCORES_UNLOCKED, {
          ageGroup
        });
      }

      return { success: true, message: 'Scores unlocked successfully' };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Unlock scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Lock scores
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async lockScoresForAgeGroup(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update scores to locked state
      await this.scoreRepository.updateMany(
        { competition: competitionId, ageGroup },
        { isLocked: true, lockedBy: adminId, lockedAt: new Date() }
      );

      this.logger.info('Scores locked', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.SCORES_LOCKED, {
          ageGroup
        });
      }

      return { success: true, message: 'Scores locked successfully' };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Lock scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Recalculate scores for an age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Recalculation results
   */
  async recalculateScores(competitionId, ageGroup, adminId) {
    try {
      const scores = await this.scoreRepository.find({
        competition: competitionId,
        ageGroup
      });

      let recalculated = 0;

      for (const scoreDoc of scores) {
        if (scoreDoc.playerScores && scoreDoc.playerScores.length > 0) {
          const updatedPlayerScores = scoreDoc.playerScores.map(ps => {
            // Recalculate using CalculationService
            const recalc = this.calculationService.calculateCompletePlayerScore(ps);
            return recalc;
          });

          await this.scoreRepository.updateById(scoreDoc._id, {
            playerScores: updatedPlayerScores,
            recalculatedBy: adminId,
            recalculatedAt: new Date()
          });

          recalculated++;
        }
      }

      this.logger.info('Scores recalculated', { 
        competitionId, 
        ageGroup, 
        recalculated, 
        adminId 
      });

      return {
        success: true,
        recalculated,
        message: `${recalculated} score documents recalculated`
      };
    } catch (error) {
      this.logger.error('Recalculate scores error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * End an age group
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Success message
   */
  async endAgeGroup(competitionId, ageGroup, adminId) {
    try {
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      // Update age group status
      const ageGroups = competition.ageGroups || [];
      const ageGroupIndex = ageGroups.findIndex(ag => ag.name === ageGroup);

      if (ageGroupIndex === -1) {
        throw new NotFoundError('Age group');
      }

      ageGroups[ageGroupIndex].status = 'ended';
      ageGroups[ageGroupIndex].endedAt = new Date();
      ageGroups[ageGroupIndex].endedBy = adminId;

      await this.competitionRepository.updateById(competitionId, {
        ageGroups
      });

      // Finalize scores (lock them)
      await this.lockScoresForAgeGroup(competitionId, ageGroup, adminId);

      this.logger.info('Age group ended', { competitionId, ageGroup, adminId });

      // Emit Socket.IO event
      if (this.socketManager) {
        this.socketManager.emitToRoom(`competition_${competitionId}`, EventTypes.AGE_GROUP_ENDED, {
          ageGroup
        });
      }

      return { success: true, message: `Age group ${ageGroup} ended` };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('End age group error', { 
        competitionId, 
        ageGroup, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  // ==========================================================================
  // Score writes
  //
  // Moved from admin.service.js (task 3.1 / MED-5). Behaviour unchanged.
  //
  // This is the most consequential method in the product and carries two
  // recent fixes that must not be disturbed:
  //   HIGH-3 — `competitionType` is part of the document identity, normalized
  //            ONCE and used for both the lookup and the write.
  //   HIGH-4 — the read-merge-write runs in a bounded retry under an
  //            optimistic-concurrency guard on `__v`, so concurrent judges do
  //            not erase each other's slips.
  // The merge stays in JavaScript deliberately: it upserts judgeSlips by role
  // and enforces the per-player finalize guard, neither of which a positional
  // arrayFilters $set can express.
  // ==========================================================================

  /**
   * Bulk save scores (legacy method)
   * @param {Array} scores - Array of score data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} { saved, errors }
   */
  async saveScores(scoreData) {
    try {
      // Validate required fields
      const requiredFields = ['teamId', 'gender', 'ageGroup', 'playerScores'];
      const missingFields = requiredFields.filter(field => !scoreData[field]);
      
      if (missingFields.length > 0) {
        throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Process each player score through calculation service
      const processedPlayerScores = [];
      for (const playerScore of scoreData.playerScores) {
        // COP §3.3 — reject a slip whose breakdown exceeds the section ceilings
        // (Difficulty ≤3.80, Combination ≤1.60, Execution ≤4.40, Bonus 0/0.20,
        // total ≤10.00). No-op when no breakdown is supplied.
        const capCheck = validateSlipBreakdown(playerScore.breakdown);
        if (!capCheck.valid) {
          throw new ValidationError(`Invalid score for ${playerScore.playerName || playerScore.playerId}: ${capCheck.error}`);
        }
        const calculatedScore = await this.calculationService.calculateCompletePlayerScore(playerScore, {
          panelSize: scoreData.panelSize || playerScore.panelSize
        });
        processedPlayerScores.push(calculatedScore);
      }

      // HIGH-3: `competitionType` is part of a Score document's identity.
      // Normalize it ONCE and use the same value for both the lookup and the
      // write. The lookup used to omit it entirely, so scoring a team in
      // Competition II found its Competition I document, overwrote the
      // category, and merged both categories' slips into one playerScores
      // array — silently destroying the Competition I result.
      const competitionTypeKey = scoreData.competitionType
        ? toCompetitionTypeDisplay(scoreData.competitionType)
        : 'Competition I';

      // The full document identity, matching the unique index on Score.
      const scoreIdentity = {
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        competition: scoreData.competitionId,
        competitionType: competitionTypeKey
      };

      // Fresh payload per attempt — the retry loop below may run this more than
      // once, and the merge mutates playerScores.
      const buildScoreDocData = () => ({
        competition: scoreData.competitionId,
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        competitionType: competitionTypeKey,
        playerScores: processedPlayerScores,
        judgeDetails: scoreData.judgeDetails || {},
        timeKeeper: scoreData.timeKeeper || '',
        scorer: scoreData.scorer || '',
        remarks: scoreData.remarks || '',
        isLocked: scoreData.isLocked || false
      });

      /**
       * Merge the incoming slips onto an existing document's playerScores.
       *
       * Extracted so the retry loop can re-run it against freshly read state.
       * Semantics are unchanged: judgeSlips upsert by role, per-player finalize
       * guard, and field-level "only if provided" merging.
       */
      const buildMergedPlayerScores = (existingScore) => {
        const mergedPlayerScores = [...existingScore.playerScores];

        for (const incomingPlayerScore of processedPlayerScores) {
          const existingPlayerIndex = mergedPlayerScores.findIndex(
            ps => ps.playerId?.toString() === incomingPlayerScore.playerId?.toString()
          );

          if (existingPlayerIndex >= 0) {
            // Merge judge scores - keep existing scores and add/update new ones
            const existingPlayerScore = mergedPlayerScores[existingPlayerIndex];

            // Per-player lock after Senior Judge Final Submit. Applies to judges only;
            // Scorer/Admin (allowFinalizedEdit) still need to record time, deductions
            // and remarks on a finalized player before locking the sheet.
            if (
              existingPlayerScore.isFinalized &&
              !scoreData.isFinalSubmit &&
              !scoreData.allowFinalizedEdit
            ) {
              throw new ValidationError(
                `Scores for ${existingPlayerScore.playerName || 'this player'} are finalized and locked`
              );
            }

            // Merge judgeSlips by role (upsert per judge)
            const existingSlips = Array.isArray(existingPlayerScore.judgeSlips)
              ? [...existingPlayerScore.judgeSlips]
              : [];
            const incomingSlips = Array.isArray(incomingPlayerScore.judgeSlips)
              ? incomingPlayerScore.judgeSlips
              : [];
            for (const slip of incomingSlips) {
              const idx = existingSlips.findIndex(s => s.judgeRole === slip.judgeRole);
              if (idx >= 0) existingSlips[idx] = { ...existingSlips[idx], ...slip };
              else existingSlips.push(slip);
            }
            mergedPlayerScores[existingPlayerIndex] = {
              ...existingPlayerScore,
              ...incomingPlayerScore,
              judgeScores: {
                ...existingPlayerScore.judgeScores,
                ...incomingPlayerScore.judgeScores
              },
              judgeSlips: existingSlips.length > 0 ? existingSlips : existingPlayerScore.judgeSlips,
              // Update other fields only if provided
              time: incomingPlayerScore.time || existingPlayerScore.time,
              deduction: incomingPlayerScore.deduction !== undefined ? incomingPlayerScore.deduction : existingPlayerScore.deduction,
              otherDeduction: incomingPlayerScore.otherDeduction !== undefined ? incomingPlayerScore.otherDeduction : existingPlayerScore.otherDeduction,
              breakdown: incomingPlayerScore.breakdown || existingPlayerScore.breakdown,
              panelSize: incomingPlayerScore.panelSize || scoreData.panelSize || existingPlayerScore.panelSize,
              isFinalized: scoreData.isFinalSubmit
                ? true
                : (incomingPlayerScore.isFinalized ?? existingPlayerScore.isFinalized),
              finalizedAt: scoreData.isFinalSubmit
                ? (incomingPlayerScore.finalizedAt || new Date())
                : (incomingPlayerScore.finalizedAt || existingPlayerScore.finalizedAt)
            };
          } else {
            // New player score
            if (scoreData.panelSize && !incomingPlayerScore.panelSize) {
              incomingPlayerScore.panelSize = scoreData.panelSize;
            }
            if (scoreData.isFinalSubmit) {
              incomingPlayerScore.isFinalized = true;
              incomingPlayerScore.finalizedAt = incomingPlayerScore.finalizedAt || new Date();
            }
            mergedPlayerScores.push(incomingPlayerScore);
          }
        }

        return mergedPlayerScores;
      };

      // HIGH-4: panel scoring is inherently concurrent — up to five judges
      // submit for the same performer within seconds. The old flow was
      // read -> merge in JS -> write the WHOLE playerScores array, so the last
      // writer silently erased the earlier judges' slips and Panel Review showed
      // an incomplete panel with no error anywhere.
      //
      // Each attempt now re-reads, re-merges and commits under an optimistic
      // concurrency guard on `__v`. A writer that loses the race matches zero
      // documents and retries against fresh state instead of clobbering it.
      //
      // The merge stays in JavaScript rather than becoming an arrayFilters
      // positional $set: it upserts judgeSlips by role and enforces the
      // per-player finalize guard, neither of which a positional update can
      // express. The version guard makes that merge safe without altering its
      // semantics.
      const MAX_SAVE_ATTEMPTS = 5;
      let savedScore = null;
      // Tracked outside the loop purely for the log line below — `existingScore`
      // is scoped per attempt.
      let didUpdateExisting = false;

      for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS && !savedScore; attempt += 1) {
        const scoreDocData = buildScoreDocData();
        const existingScore = await this.scoreRepository.findOne(scoreIdentity);

        // HIGH-2: a locked document rejects EVERY write. `isFinalSubmit` used to
        // short-circuit this check, which meant any caller could reopen a frozen
        // sheet just by asserting the flag. The only way back is an explicit
        // admin unlock (unlockScore / unlockScores), which clears isLocked.
        //
        // Note this is the *document* lock set by an admin (or by a Scorer's
        // "Lock & Submit"). The separate per-player finalize lock inside
        // buildMergedPlayerScores still honours `isFinalSubmit` /
        // `allowFinalizedEdit`, because the Senior Judge's final submit and the
        // Scorer's post-finalize edits both operate on unlocked documents.
        if (existingScore?.isLocked) {
          throw new ValidationError('Scores are locked and cannot be modified');
        }

        if (existingScore) {
          scoreDocData.playerScores = buildMergedPlayerScores(existingScore);
          // Keep existing document lock unless admin explicitly locks
          if (!scoreData.isLocked) {
            scoreDocData.isLocked = existingScore.isLocked;
          }

          // Optimistic-concurrency guard. Matching on the `__v` we just read
          // means a judge whose slip was computed from stale state matches zero
          // documents and loops instead of overwriting the winner's slips.
          const versionGuard = { _id: existingScore._id };
          if (typeof existingScore.__v === 'number') {
            versionGuard.__v = existingScore.__v;
          }

          const result = await this.scoreRepository.model.updateOne(
            versionGuard,
            { $set: scoreDocData, $inc: { __v: 1 } }
          );

          if (result.matchedCount === 0) {
            this.logger.warn('Concurrent score write detected; retrying against fresh state', {
              scoreId: String(existingScore._id),
              attempt,
              maxAttempts: MAX_SAVE_ATTEMPTS
            });
            continue;
          }

          savedScore = await this.scoreRepository.findById(existingScore._id);
          didUpdateExisting = true;
        } else {
          // Create new record
          if (scoreData.isFinalSubmit) {
            scoreDocData.playerScores = processedPlayerScores.map((ps) => ({
              ...ps,
              isFinalized: true,
              finalizedAt: ps.finalizedAt || new Date(),
            }));
          }

          try {
            savedScore = await this.scoreRepository.create(scoreDocData);
          } catch (createError) {
            // Two judges raced to create the first document for this performer.
            // The unique index rejects the loser, who retries and merges onto
            // the winner's document instead of failing the submission.
            const isDuplicateKey = createError?.code === 11000
              || createError?.cause?.code === 11000;
            if (isDuplicateKey && attempt < MAX_SAVE_ATTEMPTS) {
              this.logger.warn('Concurrent score create detected; retrying as an update', {
                attempt,
                maxAttempts: MAX_SAVE_ATTEMPTS
              });
              continue;
            }
            throw createError;
          }
        }
      }

      if (!savedScore) {
        throw new ValidationError(
          'Could not save scores because another judge is submitting for the same performer. Please try again.'
        );
      }

      this.logger.info('Scores saved successfully', {
        scoreId: savedScore._id,
        teamId: scoreData.teamId,
        gender: scoreData.gender,
        ageGroup: scoreData.ageGroup,
        isUpdate: didUpdateExisting
      });

      // Emit socket event for real-time updates
      if (this.socketManager && scoreData.gender && scoreData.ageGroup && scoreData.competitionType) {
        // Map competition type back to frontend slug for the room ID
        const competitionTypeForRoom = toCompetitionTypeSlug(scoreData.competitionType);

        const roomId = `scoring_${scoreData.gender}_${scoreData.ageGroup}_${competitionTypeForRoom}`;
        
        // Emit score update for each player score
        for (const playerScore of processedPlayerScores) {
          // Determine which judge field was updated
          const judgeScores = playerScore.judgeScores || {};
          const judgeTypeMap = {
            seniorJudge: 'Senior Judge',
            judge1: 'Judge 1',
            judge2: 'Judge 2',
            judge3: 'Judge 3',
            judge4: 'Judge 4'
          };
          
          // Emit for each judge score that was provided (include full breakdown for Panel Review)
          for (const [field, judgeType] of Object.entries(judgeTypeMap)) {
            if (judgeScores[field] !== undefined && judgeScores[field] !== 0) {
              this.socketManager.emitToRoom(roomId, 'score_updated', {
                playerId: playerScore.playerId,
                playerName: playerScore.playerName,
                judgeType: judgeType,
                score: judgeScores[field],
                breakdown: playerScore.breakdown || null,
                teamId: scoreData.teamId,
                gender: scoreData.gender,
                ageGroup: scoreData.ageGroup,
                isFinalSubmit: !!scoreData.isFinalSubmit,
                isLocked: !!scoreData.isLocked,
                timestamp: new Date().toISOString()
              });
            }
          }

          if (scoreData.isFinalSubmit) {
            this.socketManager.emitToRoom(roomId, 'scores_saved_notification', {
              playerId: playerScore.playerId,
              playerName: playerScore.playerName,
              teamId: scoreData.teamId,
              finalScore: playerScore.finalScore,
              isFinalized: true,
              isLocked: true,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        this.logger.info('Socket events emitted for score updates', {
          roomId,
          playerCount: processedPlayerScores.length
        });
      }

      // Return proper response format
      return {
        scoreId: savedScore._id,
        isLocked: savedScore.isLocked,
        playerScores: savedScore.playerScores
      };
    } catch (error) {
      this.logger.error('Save scores error', { 
        scoreData, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = ScoringService;
