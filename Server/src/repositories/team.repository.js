/**
 * Team Repository
 * 
 * Domain-specific repository for Team model.
 * Provides methods for team data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Team = require('../../models/Team');

class TeamRepository extends BaseRepository {
  /**
   * Create a team repository
   * @param {Logger} logger - Logger instance
   */
  constructor(logger) {
    super(Team, logger);
  }

  /**
   * Find teams by coach
   * @param {string} coachId - Coach ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of teams for the coach
   */
  async findByCoach(coachId, options = {}) {
    try {
      return await this.find({ coach: coachId, isActive: true }, options);
    } catch (error) {
      this.logger.error('TeamRepository.findByCoach error', { 
        coachId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Find teams by competition
   * @param {string} competitionId - Competition ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of teams registered for the competition
   */
  async findByCompetition(competitionId, options = {}) {
    try {
      // This requires querying the Competition model to get registered teams
      // We'll use aggregation to join with Competition
      const Competition = require('../../models/Competition');
      
      const competition = await Competition.findById(competitionId)
        .select('registeredTeams')
        .lean();

      if (!competition || !competition.registeredTeams) {
        return [];
      }

      const teamIds = competition.registeredTeams.map(rt => rt.team);
      return await this.find({ _id: { $in: teamIds } }, options);
    } catch (error) {
      this.logger.error('TeamRepository.findByCompetition error', { 
        competitionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Add player to team
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @returns {Promise<boolean>} True if player was added successfully
   */
  async addPlayer(teamId, playerId) {
    try {
      // Update the player's team field
      const Player = require('../../models/Player');
      await Player.findByIdAndUpdate(playerId, { team: teamId });
      return true;
    } catch (error) {
      this.logger.error('TeamRepository.addPlayer error', { 
        teamId, 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Remove player from team
   * @param {string} teamId - Team ID
   * @param {string} playerId - Player ID
   * @returns {Promise<boolean>} True if player was removed successfully
   */
  async removePlayer(teamId, playerId) {
    try {
      // Update the player's team field to null
      const Player = require('../../models/Player');
      const player = await Player.findById(playerId).select('team').lean();
      
      if (player && player.team && player.team.toString() === teamId.toString()) {
        await Player.findByIdAndUpdate(playerId, { team: null });
      }
      
      return true;
    } catch (error) {
      this.logger.error('TeamRepository.removePlayer error', { 
        teamId, 
        playerId, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = TeamRepository;
