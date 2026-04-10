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

class ScoringService {
  /**
   * Create a scoring service
   * @param {ScoreRepository} scoreRepository - Score repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {JudgeRepository} judgeRepository - Judge repository
   * @param {Logger} logger - Logger instance
   */
  constructor(scoreRepository, competitionRepository, playerRepository, judgeRepository, logger) {
    this.scoreRepository = scoreRepository;
    this.competitionRepository = competitionRepository;
    this.playerRepository = playerRepository;
    this.judgeRepository = judgeRepository;
    this.logger = logger;
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
}

module.exports = ScoringService;
