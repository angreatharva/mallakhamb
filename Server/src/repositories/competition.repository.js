/**
 * Competition Repository
 * 
 * Domain-specific repository for Competition model.
 * Provides methods for competition data access and queries.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */

const BaseRepository = require('./base.repository');
const Competition = require('../models/Competition');
const { convertToObjectId } = require('../utils/data/objectid.util');

/**
 * Prefix an unprefixed field map onto the matched registration, for use with
 * `arrayFilters: [{ 'registration.<something>': … }]`.
 *
 * `{ isSubmitted: true }` becomes
 * `{ 'registeredTeams.$[registration].isSubmitted': true }`.
 *
 * @param {Object} fields
 * @param {string} [identifier] - the arrayFilters identifier to target
 * @returns {Object} a `$set` document
 */
function prefixRegistrationFields(fields, identifier = 'registration') {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      `registeredTeams.$[${identifier}].${key}`,
      value,
    ])
  );
}

/**
 * The query filter for "this competition, and it has a registration for this
 * team".
 *
 * Putting the array-element condition in the QUERY rather than relying on the
 * update's `arrayFilters` alone is what makes the result readable. An
 * `arrayFilters` update whose identifier matches NOTHING still reports
 * `modifiedCount: 1` on these schemas, because `timestamps: true` bumps
 * `updatedAt` and Mongoose bumps `__v` — the document really was modified, just
 * not the element the caller cared about. Every one of these methods used to
 * return `modifiedCount > 0` and document it as "false when no matching
 * registration was found", which was therefore always true so long as the
 * competition existed, and `registration.service`'s NotFoundError guard on that
 * return could never fire.
 *
 * With the condition in the filter, `matchedCount === 0` means exactly what the
 * callers already believed it meant, and the write cannot run at all against a
 * competition where the team is not registered.
 *
 * @param {string} competitionId
 * @param {string} teamId
 * @returns {Object}
 */
function registrationFilter(competitionId, teamId) {
  return {
    _id: competitionId,
    isDeleted: { $ne: true },
    'registeredTeams.team': convertToObjectId(teamId),
  };
}

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
      /*
       * `$pull`, not read-filter-save.
       *
       * This used to reassign `competition.registeredTeams` to a filtered copy
       * and call `.save()`. Assigning the whole path marks it dirty, so
       * Mongoose emits a `$set` of the ENTIRE array — every concurrent squad
       * edit made since this document was read is silently discarded, on a
       * meet-wide document that coaches are editing continuously.
       *
       * It matters twice over: this method is also the only thing that SPLICES
       * the array, which is what made positional writes elsewhere unsafe (see
       * `updateRegistrationFields`).
       */
      const result = await this.model.findOneAndUpdate(
        { _id: competitionId, isDeleted: { $ne: true } },
        { $pull: { registeredTeams: { team: convertToObjectId(teamId) } } },
        { new: true }
      ).lean();

      return result;
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
        registrationFilter(competitionId, teamId),
        { $push: { 'registeredTeams.$[registration].players': entry } },
        { arrayFilters: [{ 'registration.team': convertToObjectId(teamId) }] }
      );

      return result.matchedCount > 0;
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
        registrationFilter(competitionId, teamId),
        {
          $pull: {
            'registeredTeams.$[registration].players': { player: convertToObjectId(playerId) },
          },
        },
        { arrayFilters: [{ 'registration.team': convertToObjectId(teamId) }] }
      );

      return result.matchedCount > 0;
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
   * Set fields on ONE team's registration, addressed by team rather than by
   * position in the array.
   *
   * WHY THIS EXISTS, and why it matters more than it looks.
   *
   * The submission and payment writes in `coach.service` used to build their
   * update paths from a positional index —
   * `` `registeredTeams.${registeredTeamIndex}.isSubmitted` `` — where the index
   * came from a `findIndex` on a document read moments earlier. `removeTeam`
   * SPLICES that array, and it is reachable by any coach through
   * `DELETE /api/competitions/:competitionId/register/:teamId`.
   *
   * So between one coach's read and their payment write, another coach
   * withdrawing shifted every later index down by one — and the write landed on
   * a DIFFERENT coach's registration, marking their team submitted and paid
   * against someone else's money. Nothing would have reported it: both writes
   * succeed, and the wrong team simply appears as entered.
   *
   * `arrayFilters` keyed on the team makes the target part of the write, so
   * there is no window between deciding what to write and writing it.
   *
   * @param {string} competitionId
   * @param {string} teamId
   * @param {Object} fields - registration fields to set, unprefixed
   * @returns {Promise<boolean>} false when no matching registration was found
   */
  async updateRegistrationFields(competitionId, teamId, fields) {
    try {
      if (!fields || Object.keys(fields).length === 0) return false;

      const result = await this.model.updateOne(
        registrationFilter(competitionId, teamId),
        { $set: prefixRegistrationFields(fields) },
        { arrayFilters: [{ 'registration.team': convertToObjectId(teamId) }] }
      );

      return result.matchedCount > 0;
    } catch (error) {
      this.logger.error('CompetitionRepository.updateRegistrationFields error', {
        competitionId,
        teamId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set fields on ONE athlete's squad place inside ONE team's registration.
   *
   * Two nested `arrayFilters` identifiers, because the target is two levels
   * deep. The path this replaces used TWO positional indices —
   * `` `registeredTeams.${i}.players.${j}.ageGroup` `` — so it carried the
   * hazard described on `updateRegistrationFields` twice over: the outer index
   * shifts when a team withdraws, and the inner one shifts when any athlete is
   * removed from the squad.
   *
   * @param {string} competitionId
   * @param {string} teamId
   * @param {string} playerId
   * @param {Object} fields - squad-place fields to set, unprefixed
   * @returns {Promise<boolean>} false when no matching squad place was found
   */
  async updatePlayerInRegistration(competitionId, teamId, playerId, fields) {
    try {
      if (!fields || Object.keys(fields).length === 0) return false;

      const $set = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          `registeredTeams.$[registration].players.$[entry].${key}`,
          value,
        ])
      );

      const result = await this.model.updateOne(
        {
          ...registrationFilter(competitionId, teamId),
          'registeredTeams.players.player': convertToObjectId(playerId),
        },
        { $set },
        {
          arrayFilters: [
            { 'registration.team': convertToObjectId(teamId) },
            { 'entry.player': convertToObjectId(playerId) },
          ],
        }
      );

      return result.matchedCount > 0;
    } catch (error) {
      this.logger.error('CompetitionRepository.updatePlayerInRegistration error', {
        competitionId,
        teamId,
        playerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Apply a Razorpay webhook result to the registration that placed the order.
   *
   * Replaces a read-modify-`save()` loop that could not work: the caller held
   * `findActive()` results, which come through BaseRepository and are `.lean()`,
   * so `competition.save()` was a TypeError and every webhook answered 500. It
   * also loaded EVERY active competition and scanned `registeredTeams` in
   * JavaScript to find one order id.
   *
   * `arrayFilters` targets the single registration without rewriting the whole
   * array — the same reason `addPlayerToRegistration` above uses it. A webhook
   * arrives while coaches are still editing squads on the same document, and a
   * whole-array write would discard their concurrent changes.
   *
   * Returns the identifiers the caller needs to record a Transaction, or null
   * when no registration holds that order id.
   *
   * @param {string} orderId - Razorpay order id (`registeredTeams[].paymentOrderId`)
   * @param {Object} fields - registration fields to set, unprefixed
   * @returns {Promise<{competitionId: *, team: *, coach: *, paymentStatus: string}|null>}
   */
  async applyPaymentWebhookResult(orderId, fields) {
    try {
      if (!orderId) return null;

      const $set = prefixRegistrationFields(fields);

      const updated = await this.model.findOneAndUpdate(
        { 'registeredTeams.paymentOrderId': orderId, isDeleted: { $ne: true } },
        { $set },
        {
          arrayFilters: [{ 'registration.paymentOrderId': orderId }],
          new: true,
          projection: { _id: 1, registeredTeams: 1 },
        }
      ).lean();

      if (!updated) return null;

      const registration = (updated.registeredTeams || []).find(
        (rt) => rt.paymentOrderId === orderId
      );
      if (!registration) return null;

      return {
        competitionId: updated._id,
        team: registration.team,
        coach: registration.coach,
        paymentStatus: registration.paymentStatus,
      };
    } catch (error) {
      this.logger.error('CompetitionRepository.applyPaymentWebhookResult error', {
        orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * The submitted registrations for a category, and only those.
   *
   * Replaces loading the whole competition with three levels of populate and
   * filtering it in JavaScript. On a 1000-team meet that read was 2.87 MB plus
   * ~11,000 populated documents, to answer a question about roughly 830
   * athletes — every category read paid for every other category.
   *
   * Returns entries in exactly the shape `registeredTeams` has after those
   * populates, so the caller's mapping is unchanged. That is deliberate: this
   * swaps the FETCH and nothing else, which is what makes it checkable against
   * the old path (see the equivalence assertion in scripts/perf/testApi.js).
   *
   * The gender/ageGroup filter is applied here; competitionType and apparatus
   * are NOT. Those are matched by the caller, which understands the three
   * shapes `apparatus` has been stored in — and since this filter is a superset
   * of the caller's, moving it here cannot change which teams survive.
   *
   * @param {string} competitionId
   * @param {Object} [filters] - { gender, ageGroup, teamId } — teamId narrows
   *   to one team's registration (the scorer and admin sheets show one team)
   * @param {Object} projections - the coach/player field allow-lists
   * @returns {Promise<Object[]>}
   */
  async findSubmittedRegistrations(competitionId, filters = {}, projections = {}) {
    try {
      const { coachFields = {}, playerFields = {} } = projections;

      const playerMatch = {};
      if (filters.gender) playerMatch['players.gender'] = filters.gender;
      if (filters.ageGroup) playerMatch['players.ageGroup'] = filters.ageGroup;

      const pipeline = [
        { $match: { _id: convertToObjectId(competitionId), isDeleted: { $ne: true } } },
        { $unwind: '$registeredTeams' },
        { $replaceRoot: { newRoot: '$registeredTeams' } },
        /*
         * `isSubmittedRegistration` expressed for the database, EXACTLY.
         *
         * `isSubmitted === true` strictly, so a missing or truthy-but-not-
         * boolean value fails closed. `isActive !== false`, not `=== true`,
         * because the field was added later and older entries have it
         * undefined — `$eq: true` would hide every one of them.
         *
         * Deliberately NOT filtering on paymentStatus: the helper does not,
         * because the only writer of `isSubmitted: true` sets it in the same
         * `$set` as `paymentStatus: 'completed'`. Adding a payment test here
         * would silently drop entries the JavaScript path keeps.
         */
        { $match: { isSubmitted: true, isActive: { $ne: false } } },
      ];

      // One team, when the caller shows one: everything below — the squad
      // filter, the three lookups, the response — then scales with that team,
      // not with every team entered in the category.
      if (filters.teamId) pipeline.push({ $match: { team: convertToObjectId(filters.teamId) } });

      if (Object.keys(playerMatch).length) {
        // Narrow the squad to the category, then drop entries left with nobody
        // in it — which is the caller's "keep a team when any athlete matches".
        pipeline.push({
          $addFields: {
            players: {
              $filter: {
                input: '$players',
                as: 'p',
                cond: {
                  $and: [
                    ...(filters.gender ? [{ $eq: ['$$p.gender', filters.gender] }] : []),
                    ...(filters.ageGroup ? [{ $eq: ['$$p.ageGroup', filters.ageGroup] }] : []),
                  ],
                },
              },
            },
          },
        });
        pipeline.push({ $match: { 'players.0': { $exists: true } } });
      }

      /*
       * The pipeline SELECTS; the joins are done in batches afterwards.
       *
       * The first version of this did the joins with `$lookup` inside the
       * pipeline, and measured three times SLOWER than the populate it
       * replaced (733ms vs 230ms at 1000 teams). `$unwind` produces one
       * document per registration and each `$lookup` then runs per document —
       * four thousand of them — whereas Mongoose's populate issues one batched
       * `$in` per path. The aggregation was winning on transfer and losing far
       * more on lookups.
       *
       * So: use the pipeline for what it is good at — filtering to the category
       * before anything is transferred — and collect the references, then
       * resolve them with three `$in` queries. Four round trips total,
       * regardless of how many teams are entered.
       */
      const rows = await this.model.aggregate(pipeline);
      if (rows.length === 0) return [];

      const uniq = (values) => [...new Set(values.filter(Boolean).map(String))];

      const teamIds = uniq(rows.map((row) => row.team));
      const registrationCoachIds = uniq(rows.map((row) => row.coach));
      const playerIds = uniq(rows.flatMap((row) => (row.players || []).map((p) => p.player)));

      const [teams, players] = await Promise.all([
        teamIds.length
          ? this.model.db.collection('teams').find(
            { _id: { $in: teamIds.map(convertToObjectId) } },
            { projection: { name: 1, coach: 1, description: 1, isActive: 1 } }
          ).toArray()
          : [],
        playerIds.length
          ? this.model.db.collection('players').find(
            { _id: { $in: playerIds.map(convertToObjectId) } },
            { projection: playerFields }
          ).toArray()
          : [],
      ]);

      const teamById = new Map(teams.map((team) => [String(team._id), team]));

      // The team's own coach as well as the registration's: the caller falls
      // back from one to the other when a registration has no coach reference.
      const coachIds = uniq([...registrationCoachIds, ...teams.map((team) => team.coach)]);
      const coaches = coachIds.length
        ? await this.model.db.collection('coaches').find(
          { _id: { $in: coachIds.map(convertToObjectId) } },
          { projection: coachFields }
        ).toArray()
        : [];
      const coachById = new Map(coaches.map((coach) => [String(coach._id), coach]));
      const playerById = new Map(players.map((player) => [String(player._id), player]));

      // Stitched into exactly the shape the three populates produced.
      return rows.map((row) => {
        const team = teamById.get(String(row.team));
        return {
          ...row,
          team: team
            ? { ...team, coach: coachById.get(String(team.coach)) || team.coach }
            : row.team,
          coach: coachById.get(String(row.coach)) || row.coach,
          players: (row.players || []).map((entry) => ({
            ...entry,
            player: playerById.get(String(entry.player)) || entry.player,
          })),
        };
      });
    } catch (error) {
      this.logger.error('CompetitionRepository.findSubmittedRegistrations error', {
        competitionId,
        filters,
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
