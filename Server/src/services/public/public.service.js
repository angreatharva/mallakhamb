/**
 * Public Service
 *
 * Unauthenticated read APIs for competitions, teams, and scores.
 *
 * @module services/public/public.service
 */

const COMPETITION_TYPE_MAP = {
  competition_1: 'Competition I',
  competition_2: 'Competition II',
  competition_3: 'Competition III',
};

class PublicService {
  /**
   * @param {Object} dependencies
   * @param {import('../../repositories/competition.repository')} dependencies.competitionRepository
   * @param {import('../../repositories/score.repository')} dependencies.scoreRepository
   * @param {import('../user/admin.service')} [dependencies.adminService] - Used for rankings aggregation
   * @param {import('../../infrastructure/logger')} dependencies.logger
   */
  constructor(dependencies) {
    this.competitionRepository = dependencies.competitionRepository;
    this.scoreRepository = dependencies.scoreRepository;
    this.adminService = dependencies.adminService;
    this.logger = dependencies.logger;
  }

  /**
   * Get public scores for a competition with optional filters.
   * @param {string} [competitionId]
   * @param {Object} [filters]
   * @param {string} [filters.teamId]
   * @param {string} [filters.gender]
   * @param {string} [filters.ageGroup]
   * @param {string} [filters.competitionType]
   * @returns {Promise<Array>}
   */
  async getPublicScores(competitionId, filters = {}) {
    try {
      const query = { isLocked: true };

      if (competitionId) {
        query.competition = competitionId;
      }
      if (filters.teamId) {
        query.teamId = filters.teamId;
      }
      if (filters.gender) {
        query.gender = filters.gender;
      }
      if (filters.ageGroup) {
        query.ageGroup = filters.ageGroup;
      }
      if (filters.competitionType) {
        query.competitionType =
          COMPETITION_TYPE_MAP[filters.competitionType] || filters.competitionType;
      }

      const scores = await this.scoreRepository.find(query, {
        populate: ['teamId'],
        select: '-createdBy -updatedBy',
        sort: { createdAt: -1 },
      });

      const formattedScores = scores.map((score) => {
        const scoreObj = score.toObject ? score.toObject() : score;
        return {
          ...scoreObj,
          teamName: scoreObj.teamId?.name || 'Unknown Team',
          team: scoreObj.teamId,
        };
      });

      this.logger.info('Public scores retrieved', {
        competitionId,
        filters,
        count: formattedScores.length,
      });

      return formattedScores;
    } catch (error) {
      this.logger.error('Get public scores error', {
        competitionId,
        filters,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get teams registered for a competition (for public score filters).
   * @param {string} [competitionId]
   * @returns {Promise<Array>}
   */
  async getPublicTeams(competitionId) {
    try {
      if (!competitionId) {
        this.logger.info('No competition ID provided for public teams');
        return [];
      }

      const competition = await this.competitionRepository.findById(competitionId, {
        populate: [
          {
            path: 'registeredTeams.team',
            select: 'name description isActive',
          },
          {
            path: 'registeredTeams.players.player',
            select: 'firstName lastName gender dateOfBirth',
          },
        ],
      });

      if (!competition) {
        this.logger.warn('Competition not found', { competitionId });
        return [];
      }

      const teams = (competition.registeredTeams || [])
        .filter((rt) => rt.isActive && rt.team)
        .map((rt) => ({
          _id: rt.team._id,
          name: rt.team.name,
          description: rt.team.description,
          isActive: rt.team.isActive,
          players: (rt.players || []).map((p) => ({
            player: p.player,
            ageGroup: p.ageGroup,
            gender: p.gender,
          })),
        }));

      this.logger.info('Public teams retrieved', {
        competitionId,
        count: teams.length,
      });

      return teams;
    } catch (error) {
      this.logger.error('Get public teams error', {
        competitionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all non-deleted competitions for public selection.
   * @returns {Promise<Array>}
   */
  async getPublicCompetitions() {
    try {
      const competitions = await this.competitionRepository.findActive({
        sort: { startDate: -1 },
        select: 'name year place status competitionTypes startDate endDate level',
      });

      this.logger.info('Public competitions retrieved', { count: competitions.length });

      return competitions;
    } catch (error) {
      this.logger.error('Get public competitions error', { error: error.message });
      throw error;
    }
  }

  /**
   * Get public rankings for a competition and age group.
   * @param {string} competitionId
   * @param {string} ageGroup
   * @returns {Promise<{ teamRankings: Array, individualRankings: Array }>}
   */
  async getPublicRankings(competitionId, ageGroup) {
    try {
      if (!this.adminService) {
        throw new Error('AdminService is required for public rankings');
      }

      const [teamRankings, individualRankings] = await Promise.all([
        this.adminService.getTeamRankings(competitionId, ageGroup),
        this.adminService.getIndividualRankings(competitionId, ageGroup),
      ]);

      this.logger.info('Public rankings retrieved', { competitionId, ageGroup });

      return {
        teamRankings,
        individualRankings,
      };
    } catch (error) {
      this.logger.error('Get public rankings error', {
        competitionId,
        ageGroup,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = PublicService;
