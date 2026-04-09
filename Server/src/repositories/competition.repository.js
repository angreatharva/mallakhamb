/**
 * Competition Repository
 * 
 * Domain-specific repository for Competition model.
 * Provides methods for competition data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Competition = require('../../models/Competition');

class CompetitionRepository extends BaseRepository {
  /**
   * Create a competition repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Competition, logger);
  }

  /**
   * Find active competitions
   * @param {Object} options - Query options (select, populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of active competitions
   */
  async findActive(options = {}) {
    try {
      return await this.find({ isDeleted: false }, options);
    } catch (error) {
      this.logger.error('CompetitionRepository.findActive error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find competitions by status
   * @param {string} status - Competition status (upcoming, ongoing, completed)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of competitions with the specified status
   */
  async findByStatus(status, options = {}) {
    try {
      return await this.find({ status, isDeleted: false }, options);
    } catch (error) {
      this.logger.error('CompetitionRepository.findByStatus error', { 
        status, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find upcoming competitions
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of upcoming competitions
   */
  async findUpcoming(options = {}) {
    try {
      const now = new Date();
      return await this.find(
        { 
          startDate: { $gt: now },
          isDeleted: false 
        }, 
        { ...options, sort: { startDate: 1 } }
      );
    } catch (error) {
      this.logger.error('CompetitionRepository.findUpcoming error', { error: error.message });
      throw error;
    }
  }

  /**
   * Find competitions by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of competitions within the date range
   */
  async findByDateRange(startDate, endDate, options = {}) {
    try {
      return await this.find(
        {
          startDate: { $gte: startDate },
          endDate: { $lte: endDate },
          isDeleted: false
        },
        options
      );
    } catch (error) {
      this.logger.error('CompetitionRepository.findByDateRange error', { 
        startDate, 
        endDate, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Add team to competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {string} coachId - Coach ID
   * @returns {Promise<Object|null>} Updated competition document
   */
  async addTeam(competitionId, teamId, coachId) {
    try {
      const competition = await this.model.findById(competitionId);
      if (!competition) {
        return null;
      }

      // Check if team is already registered
      const existingTeam = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (existingTeam) {
        return this.toPlainObject(competition);
      }

      // Add team to registered teams
      competition.registeredTeams.push({
        team: teamId,
        coach: coachId,
        players: [],
        isSubmitted: false,
        paymentStatus: 'pending',
        isActive: true
      });

      await competition.save();
      return this.toPlainObject(competition);
    } catch (error) {
      this.logger.error('CompetitionRepository.addTeam error', { 
        competitionId, 
        teamId, 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove team from competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object|null>} Updated competition document
   */
  async removeTeam(competitionId, teamId) {
    try {
      const competition = await this.model.findById(competitionId);
      if (!competition) {
        return null;
      }

      // Remove team from registered teams
      competition.registeredTeams = competition.registeredTeams.filter(
        rt => rt.team.toString() !== teamId.toString()
      );

      await competition.save();
      return this.toPlainObject(competition);
    } catch (error) {
      this.logger.error('CompetitionRepository.removeTeam error', { 
        competitionId, 
        teamId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update team registration in competition
   * @param {string} competitionId - Competition ID
   * @param {string} teamId - Team ID
   * @param {Object} updates - Registration updates
   * @returns {Promise<Object|null>} Updated competition document
   */
  async updateRegistration(competitionId, teamId, updates) {
    try {
      const competition = await this.model.findById(competitionId);
      if (!competition) {
        return null;
      }

      // Find the registered team
      const registeredTeam = competition.registeredTeams.find(
        rt => rt.team.toString() === teamId.toString()
      );

      if (!registeredTeam) {
        return null;
      }

      // Update registration fields
      Object.assign(registeredTeam, updates);

      await competition.save();
      return this.toPlainObject(competition);
    } catch (error) {
      this.logger.error('CompetitionRepository.updateRegistration error', { 
        competitionId, 
        teamId, 
        updates, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = CompetitionRepository;
