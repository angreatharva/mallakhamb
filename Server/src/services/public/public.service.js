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

const { ValidationError } = require('../../errors');
const { calculateIndividualScore } = require('../../utils/scoring/calculation.util');
const {
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
  stripSlipBreakdowns,
} = require('../../utils/data/user-projection.util');
const { isSubmittedRegistration } = require('../../utils/data/team-visibility.util');

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
   * Enrich a player score row with COP average/final when stored values are 0
   * but judge slips exist (common for in-progress / unlocked panels).
   */
  enrichPlayerScore(ps) {
    const row = { ...(typeof ps.toObject === 'function' ? ps.toObject() : ps) };
    const hasJudges = row.judgeScores && Object.values(row.judgeScores).some((v) => Number(v) > 0);
    if (!hasJudges) return row;

    if (!(row.finalScore > 0) || !(row.averageMarks > 0)) {
      const calc = calculateIndividualScore(row.judgeScores, row.panelSize || undefined);
      if (calc.averageMarks > 0) {
        row.executionAverage = calc.executionAverage;
        row.baseScore = calc.baseScore;
        row.baseScoreApplied = calc.baseScoreApplied;
        row.toleranceUsed = calc.toleranceUsed;
        row.averageMarks = calc.averageMarks;
        if (!(row.finalScore > 0)) {
          const deduction = Number(row.deduction) || 0;
          const other = Number(row.otherDeduction) || 0;
          row.finalScore = Math.max(0, Number((calc.averageMarks - deduction - other).toFixed(3)));
        }
      }
    }
    return row;
  }

  /**
   * Get public scores for a competition with optional filters.
   * Returns score docs for EVERY registered team that matches the category
   * filters — public results are never scoped to a single team.
   *
   * A result reaches this page only after BOTH signoffs, in order:
   *
   *   1. the Senior Judge's Final Submit, which sets `isFinalized` on that
   *      player's row (scoring.service `isFinalSubmit`), and
   *   2. the Scorer's "Save & Lock", which sets `isLocked` on the whole score
   *      document (scoring.service, `isLocked` in the save payload).
   *
   * Both are required and neither is negotiable from the request. The
   * document filter used to honour a `lockedOnly` query parameter that
   * defaulted to true — but this endpoint is ANONYMOUS, so
   * `?lockedOnly=false` was a published bypass: anyone could read a panel's
   * un-locked working scores mid-event, which is precisely the disclosure the
   * lock exists to prevent. There is no caller-supplied override any more.
   *
   * @param {string} [competitionId]
   * @param {Object} [filters]
   * @param {string} [filters.gender]
   * @param {string} [filters.ageGroup]
   * @param {string} [filters.competitionType]
   * @param {string} [filters.apparatus]
   * @returns {Promise<Array>}
   */
  async getPublicScores(competitionId, filters = {}) {
    try {
      /*
       * A competition is REQUIRED.
       *
       * It used to be optional, and omitting it dropped the filter rather than
       * refusing the request — so an anonymous caller got every published score
       * in the database in one unpaginated response. Measured on a single
       * 1000-team meet that is 19.5 MB and 1.4 seconds; across a season's worth
       * of competitions there is no bound at all. Nothing legitimate asked for
       * it: both callers in the web client always send `competitionId`.
       */
      if (!competitionId) {
        throw new ValidationError('competitionId is required', 'competitionId');
      }

      // Gate 2 — the Scorer has saved AND locked this sheet.
      const query = { isLocked: true, competition: competitionId };

      /*
       * Scoping to one team is allowed.
       *
       * The note above says public results are never scoped to a single team,
       * and that remains true of the RESULTS PAGE, which sends no teamId and
       * gets every team. But `PerformancePanel` — one team's performance —
       * has always SENT `teamId`, and this endpoint silently ignored it, so
       * that component rendered every athlete in the competition under one
       * team's heading. Honouring the filter fixes what it shows as well as
       * what it transfers.
       *
       * Narrowing a public result set can disclose nothing the unscoped call
       * would not already have returned.
       */
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
        // Gate 1 — the Senior Judge has Final Submitted this athlete. Applied
        // per row, not per document: locking a sheet does not retroactively
        // publish a performer the Senior Judge never signed off.
        let playerScores = (scoreObj.playerScores || [])
          .filter((ps) => ps.isFinalized === true)
          .map((ps) => stripSlipBreakdowns(this.enrichPlayerScore(ps)));
        
        // Filter by apparatus if specified
        if (filters.apparatus) {
          playerScores = playerScores.filter((ps) => ps.apparatus === filters.apparatus);
        }
        
        return {
          ...scoreObj,
          playerScores,
          teamName: scoreObj.teamId?.name || 'Unknown Team',
          team: scoreObj.teamId,
        };
      }).filter(score => score.playerScores.length > 0); // Only include scores with matching finalized players

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
            // CRIT-4 class: this selected `dateOfBirth` and the mapping below
            // returned the whole populated player, so an ANONYMOUS endpoint
            // published every registered athlete's date of birth — and these
            // rosters are largely minors. Narrowed to the shared allow-list.
            path: 'registeredTeams.players.player',
            select: SUBMITTED_TEAM_PLAYER_FIELDS,
          },
        ],
      });

      if (!competition) {
        this.logger.warn('Competition not found', { competitionId });
        return [];
      }

      const teams = (competition.registeredTeams || [])
        .filter((rt) => rt.team && isSubmittedRegistration(rt))
        .map((rt) => ({
          _id: rt.team._id,
          name: rt.team.name,
          description: rt.team.description,
          isActive: rt.team.isActive,
          players: (rt.players || []).map((p) => ({
            // Projected again at the mapping layer, not just in the populate:
            // BaseRepository uses `.lean()` and `.toObject()` does not run a
            // schema toJSON transform, so a widened populate elsewhere would
            // otherwise flow straight to the wire.
            player: projectFields(p.player, SUBMITTED_TEAM_PLAYER_FIELD_LIST),
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
        select: 'name year place status competitionTypes startDate endDate level apparatusConfig',
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
