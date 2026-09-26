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
  AGE_GROUPS,
  GENDERS,
  apparatusKey,
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
  toMongoProjection,
} = require('../../utils/data/user-projection.util');
const { enrichPlayerScore, rankPlayerRows } = require('../../utils/scoring/player-row.util');
const { rankTeamChampionship } = require('../../utils/scoring/team-championship.util');
const {
  JUDGE_SCORE_FIELDS,
  JUDGE_TYPE_BY_FIELD,
} = require('../../utils/scoring/judge-slip.util');

/**
 * Wait a little before re-reading, so concurrent writers serialize instead of
 * colliding again.
 *
 * The retry loop in `saveScores` had no delay at all: every writer that lost the
 * `__v` race immediately re-read, at the same instant as every other loser, and
 * raced again. With five judges and a Scorer on one performer that wastes the
 * attempt budget on repeats of the same collision.
 *
 * Linear rather than exponential, and small: these are humans pressing Submit
 * during a live routine, so the ceiling has to stay well inside a request. Full
 * jitter, because a fixed delay just moves the pile-up.
 *
 * @param {number} attempt - 1-based
 * @returns {Promise<void>}
 */
function pauseBeforeRetry(attempt) {
  const ceiling = Math.min(attempt, 4) * 25; // 25, 50, 75, 100ms
  return new Promise((resolve) => setTimeout(resolve, Math.random() * ceiling));
}

class ScoringService {
  /**
   * Create a scoring service
   * @param {ScoreRepository} scoreRepository - Score repository
   * @param {CompetitionRepository} competitionRepository - Competition repository
   * @param {PlayerRepository} playerRepository - Player repository
   * @param {JudgeRepository} judgeRepository - Judge repository
   * @param {SocketManager} socketManager - Socket.IO manager (optional)
   * @param {Logger} logger - Logger instance
   * @param {CalculationService} calculationService - Scoring calculations
   * @param {TeamRepository} teamRepository - Team repository, for `submitScore`
   */
  constructor(
    scoreRepository,
    competitionRepository,
    playerRepository,
    judgeRepository,
    socketManager,
    logger,
    calculationService,
    // Appended rather than inserted so the existing positional construction
    // keeps working, and defaulted so the harnesses that build this service
    // with seven arguments still do.
    teamRepository = null
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
    this.teamRepository = teamRepository;
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

      // Validate team exists. A score is filed against `teamId` and every read
      // path — rankings, the team sheet, the public results — joins on it, so a
      // typo'd or stale id produces a document that scores a team nobody can
      // find. This used to be a comment saying the check would go here.
      if (scoreData.teamId) {
        if (!this.teamRepository) {
          // Loud rather than skipped: silently accepting an unchecked id is
          // how this went unvalidated for as long as it did.
          throw new Error('ScoringService was built without a teamRepository; cannot validate teamId');
        }
        const team = await this.teamRepository.findById(scoreData.teamId);
        if (!team) {
          this.logger.warn('Score submission failed: Team not found', {
            teamId: scoreData.teamId,
            competitionId: scoreData.competition,
          });
          throw new NotFoundError('Team', scoreData.teamId);
        }
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
        // Clearing the sheet lock without clearing the per-apparatus ones would
        // not reopen anything: `saveScores` refuses a write naming a locked
        // apparatus whatever `isLocked` says.
        lockedApparatus: [],
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
    } else if (!GENDERS.includes(scoreData.gender)) {
      errors.push('Gender must be Male or Female');
    }

    if (!scoreData.ageGroup) {
      errors.push('Age group is required');
    } else if (!AGE_GROUPS.includes(scoreData.ageGroup)) {
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
        for (const field of JUDGE_SCORE_FIELDS) {
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
      /*
       * Fetch only this category's submitted registrations.
       *
       * Same change, and the same reasoning, as AdminService.getSubmittedTeams:
       * this used to load the WHOLE competition with two levels of populate and
       * filter it in JavaScript — 2.87 MB and ~11,000 populated documents on a
       * 1000-team meet — to answer a question about one category. It backs the
       * Scorer's screen and the admin scoring screen, both polled during an
       * event, and it was the worst endpoint in the API under concurrent load.
       *
       * "Submitted" (final submit AND fees paid) is applied inside the
       * repository, so the Scorer's team list and the judge dashboard's cannot
       * drift apart — they now run the same query.
       *
       * The repository ALSO narrows each squad to the category, which this
       * method did not do before: it kept every athlete on a matching team.
       * That is the intended behaviour — ScorerScoring.jsx and
       * AdminScoring.jsx both filter the roster to the category on arrival —
       * and it is safe now that a squad entry's gender is verified against the
       * athlete's own on write (coach.service.addPlayerToAgeGroup), so the
       * server and the client agree on which field decides.
       */
      const filteredTeams = await this.competitionRepository.findSubmittedRegistrations(
        competitionId,
        { gender, ageGroup },
        {
          coachFields: toMongoProjection(SUBMITTED_TEAM_COACH_FIELDS),
          playerFields: toMongoProjection(SUBMITTED_TEAM_PLAYER_FIELDS),
        }
      );

      /*
       * ONE query for every team's scores, not one per team.
       *
       * This used to `await scoreRepository.find({ teamId })` inside the map
       * below — a textbook N+1. Measured at 100 entered teams it cost 105
       * queries per request; at 1,000 it is 1,005. On loopback each is a
       * fraction of a millisecond and it hides, but the API and the database
       * are separate hosts in production, so those are 1,005 network round
       * trips for one admin opening one screen.
       *
       * It backs /api/admin/scores/team, /api/judge/scores/team and — through
       * getTeamRankings — both ranking endpoints, so this is four endpoints.
       *
       * The `{ teamId: { $in: [...] } }` form is served by the existing
       * `{teamId, gender, ageGroup, competition}` index.
       */
      const teamIds = filteredTeams.map((regTeam) => regTeam.team._id);

      const scoreQuery = { competition: competitionId, teamId: { $in: teamIds } };
      if (gender) scoreQuery.gender = gender;
      if (ageGroup) scoreQuery.ageGroup = ageGroup;
      if (competitionType) {
        scoreQuery.competitionType = toCompetitionTypeDisplay(competitionType);
      }

      const allScores = teamIds.length ? await this.scoreRepository.find(scoreQuery) : [];

      const scoresByTeam = new Map();
      for (const scoreDoc of allScores) {
        const key = scoreDoc.teamId?.toString();
        if (!key) continue;
        if (!scoresByTeam.has(key)) scoresByTeam.set(key, []);
        scoresByTeam.get(key).push(scoreDoc);
      }

      const teamsWithScores = filteredTeams.map((regTeam) => {
        const scores = scoresByTeam.get(regTeam.team._id?.toString()) || [];

        let playerScores = scores.flatMap(s => s.playerScores || []);

        if (apparatus) {
          playerScores = playerScores.filter(ps => ps.apparatus === apparatus);
        }

        const totalScore = playerScores.reduce((sum, ps) => sum + (ps.finalScore || 0), 0);

        // Get the most recent score document for metadata (isLocked, timeKeeper, etc.).
        // Sorted on a copy: `scores` is this team's bucket in the shared map,
        // and sorting in place would reorder it for anyone reading it after.
        const latestScoreDoc = scores.length > 0 ? [...scores].sort((a, b) =>
          new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
        )[0] : null;

        return {
          _id: regTeam.team._id,
          name: regTeam.team.name,
          maxTeamSize: regTeam.team.maxTeamSize ?? null,
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
            // Which panels have finished. The Scorer's sheet is opened one
            // apparatus at a time, so `isLocked` alone cannot tell it whether
            // the apparatus IT is showing is still being scored.
            lockedApparatus: latestScoreDoc.lockedApparatus || [],
            timeKeeper: latestScoreDoc.timeKeeper,
            scorer: latestScoreDoc.scorer,
            remarks: latestScoreDoc.remarks,
            competitionType: latestScoreDoc.competitionType,
            createdAt: latestScoreDoc.createdAt,
            updatedAt: latestScoreDoc.updatedAt
          } : null
        };
      });

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
      /*
       * Gender belongs in the QUERY, like every other part of the category.
       *
       * It used to be applied per row instead, as
       * `if (gender && ps.playerGender && ps.playerGender !== gender) return;`
       * — but `playerGender` is not a path on the playerScores sub-schema, so
       * it read undefined on every row, the condition was never true and the
       * filter did nothing. Asking for Male Under-14 returned the Female
       * athletes too, next to a team table from `getTeamScores` that had
       * filtered them out correctly, so the two halves of the same results
       * board disagreed.
       *
       * The gender of a performance is on the score DOCUMENT — it is required
       * there, and it is part of the document's identity — so this is both the
       * correct source and the one served by the
       * `{competition, gender, ageGroup, competitionType}` index.
       */
      if (gender) {
        query.gender = gender;
      }
      if (competitionType) {
        /*
         * Normalized, exactly as getTeamScores does it.
         *
         * A Score stores the DISPLAY form ("Competition I"); the client sends
         * the slug ("competition_1"). This filter used the raw value, so the
         * slug matched no document and the endpoint answered `[]` — with a 200,
         * so the individual results table simply rendered empty next to a fully
         * populated team table fed by getTeamScores, which does normalize.
         */
        query.competitionType = toCompetitionTypeDisplay(competitionType);
      }

      /*
       * The team comes with the score.
       *
       * A playerScores entry records the athlete but not the squad — the team
       * lives on the parent document. Without this populate every row on the
       * admin results board read "Unknown Team", while the same athlete on the
       * public board showed the real name, because that feed populates it.
       * `SUBMITTED_TEAM_*` projections keep it to the name; nothing here needs
       * the coach's contact details.
       */
      const scores = await this.scoreRepository.find(query, {
        populate: ['teamId'],
      });

      const playerScoresMap = new Map();

      scores.forEach(scoreDoc => {
        const teamName = scoreDoc.teamId?.name || 'Unknown Team';

        (scoreDoc.playerScores || []).forEach(ps => {
          const playerId = ps.playerId?.toString();
          if (playerId) {
            // Gender is filtered in the query above — see the note there.

            // Apply apparatus filter if provided
            if (apparatus && ps.apparatus && ps.apparatus !== apparatus) {
              return; // Skip this player score
            }

            if (!playerScoresMap.has(playerId)) {
              playerScoresMap.set(playerId, {
                playerId: ps.playerId,
                playerName: ps.playerName,
                /*
                 * From the score DOCUMENT, not the row. These two were read as
                 * `ps.playerGender` / `ps.playerAgeGroup`, which the sub-schema
                 * does not declare, so both were `undefined` on every response
                 * this endpoint has ever returned — while the OpenAPI document
                 * advertises them as enums. The document carries the real
                 * values: they are what the athlete was judged under.
                 */
                playerGender: scoreDoc.gender,
                playerAgeGroup: scoreDoc.ageGroup,
                scores: []
              });
            }
            // Enriched for the same reason the public feed enriches: a panel
            // that is still scoring has judge marks and no computed total yet,
            // and an admin watching it live should see the marks add up rather
            // than a row of 0.00.
            playerScoresMap.get(playerId).scores.push({
              ...enrichPlayerScore(ps),
              teamName
            });
          }
        });
      });

      const individualScores = Array.from(playerScoresMap.values());

      // Ranked on the server so this feed and the public one agree on placings
      // and on how each tie was settled.
      rankPlayerRows(
        individualScores.flatMap((player) => player.scores),
        query.competitionType
      );

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

      /*
       * Team Championship: each apparatus counts the squad's best 3 (4-player
       * team) or best 5 (6-player team), and the team total is the sum. This
       * used to rank on `totalScore` as getTeamScores returns it — every
       * athlete's score added up — so a squad scored more simply by entering
       * more athletes. The same engine backs the public board.
       */
      const rankings = rankTeamChampionship(
        teamsWithScores.map((t) => ({ ...t, performances: t.scores }))
      ).map(({ performances, ...t }) => ({ ...t, finalScore: t.totalScore }));

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
   * Get individual player rankings, one standing per apparatus, with the
   * tie-break rules applied.
   *
   * @param {string} competitionId - Competition ID
   * @param {string} ageGroup - Age group
   * @returns {Promise<Array>} Ranked performances
   */
  async getIndividualRankings(competitionId, ageGroup) {
    try {
      const individualScores = await this.getIndividualScores(competitionId, ageGroup);

      /*
       * One row per performance, not one per athlete.
       *
       * This used to add up an athlete's finalScore across every apparatus and
       * rank that total. Two things were wrong with it. Pole and Rope are
       * separate events on separate score sheets, so the total ranked athletes
       * who never competed against each other. And the tie-break rules read
       * properties of a single performance — the senior judge's mark, the
       * panel that sat, the time on the clock — none of which survive being
       * summed across apparatus, so a tie could not be broken at all.
       *
       * Each row therefore keeps the whole judging record;
       * getIndividualRankingsWithTieBreaker groups them back into one standing
       * per apparatus before ranking.
       */
      const performances = individualScores.flatMap((player) =>
        (player.scores || []).map((score) => ({
          ...score,
          playerId: player.playerId,
          playerName: player.playerName,
          playerGender: player.playerGender,
          playerAgeGroup: player.playerAgeGroup,
          finalScore: score.finalScore || 0
        }))
      );

      const rankings = this.calculationService.getIndividualRankingsWithTieBreaker(performances);

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
        // As in `unlockScore`: the per-apparatus locks are the ones `saveScores`
        // actually tests, so an unlock that left them standing reopens nothing.
        lockedApparatus: [],
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
        // `lockedApparatus` cleared for the same reason as the single-score
        // unlocks: it is what `saveScores` refuses writes on.
        { isLocked: false, lockedApparatus: [], unlockedBy: adminId, unlockedAt: new Date() }
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
       * Which stored row an incoming one belongs to.
       *
       * An athlete's identity in `playerScores` is (player, APPARATUS) — not
       * the player alone. Somebody entered for Pole, Hanging and Rope competes
       * three times, is judged by three separate panels' worth of slips and
       * earns three separate scores; matching on `playerId` merged the second
       * apparatus onto the first and the third onto that, so only the last one
       * judged survived and the earlier results vanished without an error.
       *
       * A row that names no apparatus matches an incoming one that names none
       * either — both normalise to the schema default — which keeps
       * single-apparatus competitions behaving exactly as before.
       *
       * @param {Array} rows - the document's playerScores
       * @param {Object} incoming
       * @returns {number} index, or -1
       */
      const findSquadPlace = (rows, incoming) => rows.findIndex(
        row => row.playerId?.toString() === incoming.playerId?.toString()
          && apparatusKey(row.apparatus) === apparatusKey(incoming.apparatus)
      );

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
          const existingPlayerIndex = findSquadPlace(mergedPlayerScores, incomingPlayerScore);

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

            /*
             * The final score is recomputed from the MERGED row, not taken
             * from whichever payload arrived last.
             *
             * The two writers see different halves of it: a judge's Final
             * Submit carries the marks and no deductions, the Scorer's save
             * carries the deductions. Each one's own `finalScore` was computed
             * from its half, so a judge re-submitting after the Scorer had
             * recorded a time penalty would quietly restore the undeducted
             * figure — the deduction still stored beside it, just not applied.
             */
            const merged = mergedPlayerScores[existingPlayerIndex];
            /*
             * Rounded to 3 decimals, like CalculationService.calculateFinalScore
             * — which is the other place this subtraction happens and which has
             * always rounded.
             *
             * Without it the binary representation leaks into the stored score
             * and out to the results page: 8.40 - 0.20 is 8.200000000000001 in
             * IEEE 754, and a 0.20 time penalty is the most common one there is.
             * 28 of 152 stored finals in the seeded meet carried an artifact
             * like that, every one of them where the deduction was 0.20 — the
             * other bands (0.30, 0.40, 0.50) happen to subtract cleanly, which
             * is why it looked sporadic rather than systematic.
             *
             * 3 rather than 2 decimals because COP base scores are quarters
             * (9.225), and rounding those to 2 would change a real result.
             */
            merged.finalScore = Number(Math.max(
              0,
              (Number(merged.averageMarks) || 0)
                - (Number(merged.deduction) || 0)
                - (Number(merged.otherDeduction) || 0)
            ).toFixed(3));
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
      /*
       * Eight, not five, and with a pause between attempts.
       *
       * A five-judge panel plus the Scorer is SIX concurrent writers on one
       * document, and each round only lets one through — so at five attempts the
       * last writer could exhaust the budget and surface "Could not save scores
       * because another judge is submitting for the same performer" in the
       * middle of a competition. A Senior Judge's Panel Review correction makes
       * seven.
       *
       * The pause matters as much as the count. Retrying immediately means every
       * loser re-reads at the same instant and collides again; a short jittered
       * delay lets them serialize instead of thrashing.
       */
      const MAX_SAVE_ATTEMPTS = 8;
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
        // This is the whole-sheet lock an ADMIN sets. The separate per-player
        // finalize lock inside buildMergedPlayerScores still honours
        // `isFinalSubmit` / `allowFinalizedEdit`, because the Senior Judge's
        // final submit and the Scorer's post-finalize edits both operate on
        // unlocked documents.
        if (existingScore?.isLocked) {
          throw new ValidationError('Scores are locked and cannot be modified');
        }

        /*
         * The Scorer's lock is narrower, and stops only its own apparatus.
         *
         * One document holds every apparatus this squad competes on, so the
         * Scorer finishing with the Pole panel must not freeze the Rope and
         * Hanging rows nobody has performed for yet. Their "Lock & Submit"
         * therefore records WHICH apparatus it finalized, and only writes
         * naming one of those are refused.
         */
        const lockedAlready = new Set(
          (existingScore?.lockedApparatus || []).map(apparatusKey)
        );
        const blocked = [...new Set(
          processedPlayerScores
            .map((ps) => apparatusKey(ps.apparatus))
            .filter((name) => lockedAlready.has(name))
        )];
        if (blocked.length > 0) {
          throw new ValidationError(
            `Scores for ${blocked.join(', ')} are locked and cannot be modified`
          );
        }

        /*
         * What this write leaves locked. `scoreData.isLocked` is the caller
         * asking to finalize, and what it finalizes is the apparatus it just
         * sent — not the document.
         */
        const lockedAfter = new Set(lockedAlready);
        if (scoreData.isLocked) {
          for (const ps of processedPlayerScores) lockedAfter.add(apparatusKey(ps.apparatus));
        }
        scoreDocData.lockedApparatus = [...lockedAfter];

        /*
         * `isLocked` is NOT set from a Scorer's lock any more.
         *
         * It would have to mean "every apparatus is done", and the document
         * cannot know that: `playerScores` holds the apparatus that have been
         * SCORED, so a squad entered for three whose Pole sheet is the first
         * one saved would look complete and freeze the other two — the very
         * bug this is fixing. It stays the admin's whole-sheet freeze, and
         * published results read `lockedApparatus` alongside it.
         */
        if (existingScore) {
          scoreDocData.playerScores = buildMergedPlayerScores(existingScore);
          scoreDocData.isLocked = existingScore.isLocked;

          /*
           * The Scorer's sheet survives a judge's slip.
           *
           * `buildScoreDocData` defaults these to '' and {}, and the whole
           * object is `$set` — so every one of them was overwritten on every
           * write. Only `playerScores` and `isLocked` were merged back.
           *
           * ScorerScoring.jsx and AdminScoring.jsx send timeKeeper, scorer and
           * remarks, and REQUIRE the first two before they will save. The judge
           * slip path sends none of them. So any slip submission — including a
           * Senior Judge's correction from Panel Review — blanked the Scorer's
           * record mid-event, and the Scorer was then blocked from "Save & Lock"
           * until they retyped it.
           *
           * `??`, not `||`: a Scorer deliberately clearing remarks to '' must
           * persist, while a judge's payload (field absent) must not touch it.
           */
          scoreDocData.timeKeeper = scoreData.timeKeeper ?? existingScore.timeKeeper ?? '';
          scoreDocData.scorer = scoreData.scorer ?? existingScore.scorer ?? '';
          scoreDocData.remarks = scoreData.remarks ?? existingScore.remarks ?? '';
          scoreDocData.judgeDetails = scoreData.judgeDetails ?? existingScore.judgeDetails ?? {};

          // Optimistic-concurrency guard. Matching on the `__v` we just read
          // means a judge whose slip was computed from stale state matches zero
          // documents and loops instead of overwriting the winner's slips.
          const versionGuard = { _id: existingScore._id };
          if (typeof existingScore.__v === 'number') {
            versionGuard.__v = existingScore.__v;
          }

          /*
           * The identity fields are not written on an update.
           *
           * `competition`, `teamId`, `gender`, `ageGroup` and `competitionType`
           * ARE the document's identity — they are the key
           * `findOne(scoreIdentity)` just matched on, and the key of the unique
           * index `score_identity_unique`. Re-`$set`ting them to the values they
           * already hold achieves nothing and puts the uniqueness constraint in
           * the path of every slip submission for no reason.
           *
           * `playerScores` stays a whole-array `$set`: the merge produces the
           * whole array, and it is safe here because the `__v` guard proves the
           * array has not shifted since it was read. (That is exactly the
           * guarantee `registeredTeams` writes do NOT have, which is why those
           * are addressed by team instead — see
           * CompetitionRepository.updateRegistrationFields.)
           */
          const {
            competition: _c, teamId: _t, gender: _g, ageGroup: _a, competitionType: _ct,
            ...mutableFields
          } = scoreDocData;

          const result = await this.scoreRepository.model.updateOne(
            versionGuard,
            { $set: mutableFields, $inc: { __v: 1 } }
          );

          if (result.matchedCount === 0) {
            this.logger.warn('Concurrent score write detected; retrying against fresh state', {
              scoreId: String(existingScore._id),
              attempt,
              maxAttempts: MAX_SAVE_ATTEMPTS
            });
            await pauseBeforeRetry(attempt);
            continue;
          }

          savedScore = await this.scoreRepository.findById(existingScore._id);
          didUpdateExisting = true;
        } else {
          /*
           * A first save that also locks freezes ONE apparatus, not the sheet.
           *
           * `buildScoreDocData` copies `scoreData.isLocked` straight through,
           * which on the very first save of a squad entered for three apparatus
           * would have created the document already frozen — the Pole panel
           * finishing first would have ended the other two before they began.
           * `lockedApparatus` above already records what was actually locked.
           */
          scoreDocData.isLocked = false;

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
              await pauseBeforeRetry(attempt);
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
          // Determine which judge field was updated. The field→judgeType map is
          // derived from JUDGE_ROLE_MAP rather than written out here: this is
          // the read side of the same mapping the WRITE side uses, and a
          // divergence between the two is what makes a judge's slip land in one
          // slot while everything else looks for it in another.
          const judgeScores = playerScore.judgeScores || {};

          // Emit for each judge score that was provided (include full breakdown for Panel Review)
          for (const [field, judgeType] of Object.entries(JUDGE_TYPE_BY_FIELD)) {
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
                // A score is identified by (player, APPARATUS), and the room is
                // not — it is per competition type, and a category now holds one
                // panel per apparatus inside it. Without this every listener
                // resolved the mark to Pole. See the same note in
                // socket/handlers/scoring.handler.js.
                apparatus: playerScore.apparatus || null,
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
              // Same reason as the `score_updated` above: this locks a row, and
              // the row is (player, apparatus).
              apparatus: playerScore.apparatus || null,
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
        // The caller needs to know what IT just locked: `isLocked` is the
        // admin's whole-sheet freeze and a Scorer's lock no longer sets it, so
        // a sheet that returned only that flag would come back editable the
        // instant after it was submitted.
        lockedApparatus: savedScore.lockedApparatus || [],
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
