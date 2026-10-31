/**
 * Public Service
 *
 * Unauthenticated read APIs for competitions, teams, and scores.
 *
 * @module services/public/public.service
 */

const { ValidationError } = require('../../errors');
// The slug→display map used to be a fourth private copy in this file. It lives
// in config/cop-rules, which is also what GET /api/public/cop-rules serves.
const { toCompetitionTypeDisplay } = require('../../config/cop-rules');
const { enrichPlayerScore, rankPlayerRows } = require('../../utils/scoring/player-row.util');
const { rankTeamChampionship } = require('../../utils/scoring/team-championship.util');
const {
  SUBMITTED_TEAM_PLAYER_FIELDS,
  SUBMITTED_TEAM_PLAYER_FIELD_LIST,
  projectFields,
  stripSlipBreakdowns,
  panelRecord,
} = require('../../utils/data/user-projection.util');
const { isSubmittedRegistration } = require('../../utils/data/team-visibility.util');
const { publishedScoreQuery, publishedPlayerScores } = require('../../utils/scoring/published-score.util');

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
    // Recorded lucky draws (COP 1.12.4). Optional so harnesses that build this
    // service without it still rank — every unbroken tie then stays tied.
    this.tieBreakDrawRepository = dependencies.tieBreakDrawRepository || null;
    this.logger = dependencies.logger;
  }

  /**
   * Enrich a player score row with COP average/final when stored values are 0
   * but judge slips exist (common for in-progress / unlocked panels).
   *
   * Delegates to the shared helper so this feed and the admin feed compute the
   * same numbers for the same athlete — the results board is rendered from
   * both.
   */
  enrichPlayerScore(ps) {
    return enrichPlayerScore(ps);
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

      /*
       * Gate 2 — the Scorer has saved AND locked, for THIS apparatus.
       *
       * A squad's three apparatus share one score document, and the Scorer
       * finishes them one panel at a time, so the lock is recorded per
       * apparatus in `lockedApparatus`. `isLocked` remains the admin's
       * whole-sheet freeze and still publishes everything in the document;
       * a document with any apparatus locked qualifies, and the row filter
       * below is what keeps the unlocked ones back.
       *
       * `lockedApparatus.0` rather than `$ne: []`: on a document written
       * before the field existed the path is missing, and `$ne: []` would
       * count that as non-empty and publish an unlocked sheet.
       */
      const query = publishedScoreQuery({ competition: competitionId });

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
        query.competitionType = toCompetitionTypeDisplay(filters.competitionType);
      }

      const scores = await this.scoreRepository.find(query, {
        populate: ['teamId'],
        select: '-createdBy -updatedBy',
        sort: { createdAt: -1 },
      });

      const formattedScores = scores.map((score) => {
        const scoreObj = score.toObject ? score.toObject() : score;
        // Gate 1 (the Senior Judge's Final Submit, per row) and Gate 2 (this
        // apparatus locked, unless the admin froze the whole sheet) — one
        // definition, shared with the profile stats (published-score.util).
        let playerScores = publishedPlayerScores(scoreObj)
          .map((ps) => stripSlipBreakdowns(this.enrichPlayerScore(ps)));

        // Filter by apparatus if specified
        if (filters.apparatus) {
          playerScores = playerScores.filter((ps) => ps.apparatus === filters.apparatus);
        }

        const teamName = scoreObj.teamId?.name || 'Unknown Team';
        const team = scoreObj.teamId && typeof scoreObj.teamId === 'object'
          ? { _id: scoreObj.teamId._id, name: scoreObj.teamId.name }
          : scoreObj.teamId;

        // An ALLOW-LIST, not `...scoreObj` (security audit 2026-10-31, M1/M6):
        // this feed is anonymous, and the whole document carried every judge's
        // email (their sign-in), the ids of the admins who locked it, the
        // coach's id and Mongo internals. The results board reads only
        // `_id`, `playerScores` and `teamName` (Web/src/components/scores).
        return {
          _id: scoreObj._id,
          competition: scoreObj.competition,
          gender: scoreObj.gender,
          ageGroup: scoreObj.ageGroup,
          competitionType: scoreObj.competitionType,
          isLocked: scoreObj.isLocked,
          lockedApparatus: scoreObj.lockedApparatus,
          judgeDetails: (Array.isArray(scoreObj.judgeDetails) ? panelRecord(scoreObj.judgeDetails) : [])
            .map(({ judgeName, judgeType }) => ({ judgeName, judgeType })),
          // Stamped on every row as well as the document. The board pools
          // athletes from every team into one standing, so each row has to
          // carry its own team once it is separated from its parent.
          playerScores: playerScores.map((ps) => ({ ...ps, teamName })),
          teamName,
          teamId: team,
          team,
          createdAt: scoreObj.createdAt,
          updatedAt: scoreObj.updatedAt,
        };
      }).filter(score => score.playerScores.length > 0); // Only include scores with matching finalized players

      /*
       * Rank here, not in the browser.
       *
       * Placings depend on the panel-size tie-break rules, and those cannot be
       * re-implemented in the client without the two copies drifting — the
       * README already carries that warning about the COP rules. The rows go
       * out with `rank` and `tieBreakInfo` on them and every consumer renders
       * the same order.
       */
      const draws = this.tieBreakDrawRepository
        ? await this.tieBreakDrawRepository.findForStanding(competitionId, filters)
        : [];
      rankPlayerRows(
        formattedScores.flatMap((score) => score.playerScores),
        toCompetitionTypeDisplay(filters.competitionType),
        { draws }
      );

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
   * The Team Championship standing for one category.
   *
   * Team Championship is Competition I. Built on `getPublicScores`, so a score
   * counts toward a team only once it would be shown on the player board — the
   * Senior Judge's Final Submit and the Scorer's lock both apply. Then each
   * apparatus counts the squad's best 3 (4-player team) or best 5 (6-player
   * team), and the team total is the sum — see utils/scoring/team-championship.util.
   *
   * @param {string} competitionId
   * @param {{gender: string, ageGroup: string}} filters
   * @returns {Promise<Array>} ranked teams, best first
   */
  async getPublicTeamChampionship(competitionId, { gender, ageGroup } = {}) {
    const scoreDocs = await this.getPublicScores(competitionId, {
      gender,
      ageGroup,
      competitionType: 'competition_1',
    });

    // The count is the meet's (4 → best 3, 6 → best 5), set by the superadmin.
    const competition = await this.competitionRepository.findById(competitionId);
    const maxTeamSize = competition?.maxTeamSize ?? null;

    const teams = new Map();
    for (const doc of scoreDocs) {
      const teamId = String(doc.team?._id || doc.teamId?._id || doc.teamId || '');
      if (!teamId) continue;
      if (!teams.has(teamId)) {
        teams.set(teamId, {
          teamId,
          teamName: doc.teamName,
          maxTeamSize,
          performances: [],
        });
      }
      // Only what the board needs; the rows carry judge marks we do not publish here.
      for (const ps of doc.playerScores) {
        teams.get(teamId).performances.push({
          playerId: ps.playerId,
          playerName: ps.playerName,
          apparatus: ps.apparatus,
          finalScore: ps.finalScore || 0,
        });
      }
    }

    const ranked = rankTeamChampionship([...teams.values()])
      .map(({ performances, ...team }) => team);

    this.logger.info('Public team championship retrieved', {
      competitionId, gender, ageGroup, count: ranked.length,
    });

    return ranked;
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
        select: 'name year place status competitionTypes startDate endDate level apparatusConfig apparatusByGender legacyFinals',
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
