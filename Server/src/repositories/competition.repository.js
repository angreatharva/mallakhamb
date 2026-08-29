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
const { convertToObjectId } = require('../utils/data/objectid.util');

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

  /**
   * Open a category for scoring.
   *
   * Atomic, and deliberately so. The service used to read the competition,
   * push onto `startedAgeGroups` and call `competition.save()` — which threw
   * `TypeError: competition.save is not a function`, because `findById` here
   * goes through BaseRepository and is `.lean()`. Starting an age group was a
   * 500 on all three routes that do it.
   *
   * Rewriting it as a read-then-write would have fixed the crash and left a
   * lost update: two admins opening two categories at the same moment each
   * write back the whole array as they read it, and whichever saves second
   * erases the other. The `$not/$elemMatch` filter makes "not already started"
   * part of the write, so a duplicate is refused by the database rather than by
   * a check that ran a moment earlier.
   *
   * @param {string} competitionId
   * @param {{gender: string, ageGroup: string, competitionType: string}} category
   * @returns {Promise<boolean>} false when the category was already started
   */
  async startAgeGroup(competitionId, category) {
    try {
      const { gender, ageGroup, competitionType } = category;

      const result = await this.model.updateOne(
        {
          _id: competitionId,
          isDeleted: { $ne: true },
          startedAgeGroups: {
            $not: { $elemMatch: { gender, ageGroup, competitionType } },
          },
        },
        {
          $push: {
            startedAgeGroups: { gender, ageGroup, competitionType, startedAt: new Date() },
          },
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('CompetitionRepository.startAgeGroup error', {
        competitionId,
        category,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Add an athlete to a team's squad for this competition.
   *
   * Same story as startAgeGroup: the caller held a lean document and called
   * `.save()` on it. `arrayFilters` targets the one registration without
   * reading, rewriting and saving the whole `registeredTeams` array — which at
   * a national meet is megabytes, and which two coaches editing two squads
   * concurrently would clobber.
   *
   * @param {string} competitionId
   * @param {string} teamId
   * @param {{player: string, ageGroup: string, gender: string, apparatus?: Object}} entry
   * @returns {Promise<boolean>} false when no matching registration was found
   */
  async addPlayerToRegistration(competitionId, teamId, entry) {
    try {
      const result = await this.model.updateOne(
        { _id: competitionId, isDeleted: { $ne: true } },
        { $push: { 'registeredTeams.$[registration].players': entry } },
        { arrayFilters: [{ 'registration.team': convertToObjectId(teamId) }] }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('CompetitionRepository.addPlayerToRegistration error', {
        competitionId,
        teamId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Remove an athlete from a team's squad for this competition.
   *
   * @param {string} competitionId
   * @param {string} teamId
   * @param {string} playerId
   * @returns {Promise<boolean>} false when nothing was removed
   */
  async removePlayerFromRegistration(competitionId, teamId, playerId) {
    try {
      const result = await this.model.updateOne(
        { _id: competitionId, isDeleted: { $ne: true } },
        {
          $pull: {
            'registeredTeams.$[registration].players': { player: convertToObjectId(playerId) },
          },
        },
        { arrayFilters: [{ 'registration.team': convertToObjectId(teamId) }] }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      this.logger.error('CompetitionRepository.removePlayerFromRegistration error', {
        competitionId,
        teamId,
        playerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Athletes entered in a competition, as a page.
   *
   * Backs GET /api/admin/players, which used to filter the Player collection by
   * `competition` — a field Player does not have. Entry is recorded in
   * `registeredTeams`, so that query matched nothing, unindexed, and the
   * endpoint returned an empty page however many athletes were entered.
   *
   * Paginating in the pipeline rather than in JavaScript matters here: the
   * alternative is loading every athlete in the meet to return ten of them.
   *
   * @param {string} competitionId
   * @param {Object} [filters] - { ageGroup, gender, team, isSubmitted }
   * @param {{skip: number, limit: number}} pagination
   * @returns {Promise<{players: Object[], total: number}>}
   */
  async findEnteredPlayers(competitionId, filters = {}, pagination = {}) {
    try {
      const { skip = 0, limit = 10 } = pagination;

      const entryMatch = {};
      if (filters.ageGroup) entryMatch['entry.ageGroup'] = filters.ageGroup;
      if (filters.gender) entryMatch['entry.gender'] = filters.gender;
      if (filters.team) entryMatch['registration.team'] = convertToObjectId(filters.team);
      if (filters.isSubmitted !== undefined) {
        entryMatch['registration.isSubmitted'] = filters.isSubmitted;
      }

      /*
       * `status` filters on the ATHLETE's account, which lives in another
       * collection — so it needs the join to happen before the count, not
       * inside the paginated branch where the other filters are applied.
       *
       * Only built when asked for. Joining every entered athlete to answer a
       * query that did not ask about them would make the common path pay for
       * the rare one.
       */
      const statusStages = filters.isActive === undefined ? [] : [
        {
          $lookup: {
            from: 'players',
            localField: 'entry.player',
            foreignField: '_id',
            as: 'accountState',
            pipeline: [{ $project: { isActive: 1 } }],
          },
        },
        { $unwind: { path: '$accountState', preserveNullAndEmptyArrays: true } },
        // `$ne: false` for active, because the field defaults to true and older
        // rows may not carry it at all.
        {
          $match: filters.isActive
            ? { 'accountState.isActive': { $ne: false } }
            : { 'accountState.isActive': false },
        },
      ];

      const pipeline = [
        { $match: { _id: convertToObjectId(competitionId), isDeleted: { $ne: true } } },
        { $unwind: '$registeredTeams' },
        { $project: { registration: '$registeredTeams' } },
        { $match: { 'registration.isActive': { $ne: false } } },
        { $unwind: '$registration.players' },
        { $project: { registration: 1, entry: '$registration.players' } },
        ...(Object.keys(entryMatch).length ? [{ $match: entryMatch }] : []),
        ...statusStages,
        // `$facet` so the page and its total come from ONE pass. Counting
        // separately would re-walk the whole embedded array a second time.
        {
          $facet: {
            total: [{ $count: 'value' }],
            page: [
              { $sort: { 'entry.ageGroup': 1, 'entry.player': 1 } },
              { $skip: skip },
              { $limit: limit },
              {
                $lookup: {
                  from: 'players',
                  localField: 'entry.player',
                  foreignField: '_id',
                  as: 'player',
                  // Projected in the lookup: these rosters are largely minors,
                  // and an unprojected join carries the bcrypt hash, the e-mail
                  // and the date of birth straight to the response.
                  pipeline: [{
                    $project: {
                      firstName: 1, lastName: 1, gender: 1, stateUnit: 1, registrationNumber: 1,
                    },
                  }],
                },
              },
              { $unwind: { path: '$player', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'teams',
                  localField: 'registration.team',
                  foreignField: '_id',
                  as: 'team',
                  pipeline: [{ $project: { name: 1 } }],
                },
              },
              { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: '$entry.player',
                  firstName: '$player.firstName',
                  lastName: '$player.lastName',
                  gender: '$entry.gender',
                  ageGroup: '$entry.ageGroup',
                  apparatus: '$entry.apparatus',
                  stateUnit: '$player.stateUnit',
                  registrationNumber: '$player.registrationNumber',
                  team: { _id: '$team._id', name: '$team.name' },
                  isSubmitted: '$registration.isSubmitted',
                  paymentStatus: '$registration.paymentStatus',
                },
              },
            ],
          },
        },
      ];

      const [result] = await this.model.aggregate(pipeline);

      return {
        players: result?.page || [],
        total: result?.total?.[0]?.value || 0,
      };
    } catch (error) {
      this.logger.error('CompetitionRepository.findEnteredPlayers error', {
        competitionId,
        filters,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = CompetitionRepository;
