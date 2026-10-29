/**
 * Judge Panel Service
 *
 * Seating people on judging panels, and reading back who sits where.
 *
 * This is the third of three "judge" services and the distinction between them
 * is load-bearing:
 *
 *   judge-account.service.js  the judge as a PERSON — the login, the profile.
 *   judge.service.js          what a seated judge READS — their categories,
 *                             their rosters, their own slips.
 *   judge-panel.service.js    this one. Who occupies which SEAT at which meet:
 *                             the admin-side write path, plus the summary the
 *                             admin screens read back.
 *
 * A seat is not a login (src/models/Judge.js). One person holds one Judge row
 * per seat, all pointing at one JudgeAccount, which is why the uniqueness rules
 * below are about (gender, ageGroup, judgeNo/judgeType, competition, apparatus)
 * and never about the person.
 *
 * Extracted from AdminService on 2026-09-22, where it was ~700 of that class's
 * 2,668 lines. It reaches for nothing beyond the three repositories and the
 * logger, which is what made it a seam rather than a cut. AdminService keeps
 * thin delegating methods so every existing caller is unaffected — the same
 * shape task 3.1 used when scoring moved out.
 *
 * @module services/user/judge-panel.service
 */

const { NotFoundError, ValidationError, BusinessRuleError } = require('../../errors');
const { MINIMUM_PANEL_SEATS } = require('../../utils/data/judge-assignment.util');
const { maySeatTogether } = require('../../config/judge-seats');
const { categoryAgeGroups, ALL_AGES } = require('../../utils/data/category.util');
/*
 * Positive whitelists, applied HERE rather than in the controller: `getJudges`
 * is reached by the admin router, the judge router and the public one, so
 * projecting at the service means no caller can forget (CRIT-2 / CRIT-4). One
 * shared definition in user-projection.util — a duplicated security control is
 * one that drifts.
 */
const {
  JUDGE_PUBLIC_FIELDS,
  JUDGE_ACCOUNT_CARD_FIELDS,
  flattenJudgeAccount,
} = require('../../utils/data/user-projection.util');

class JudgePanelService {
  /**
   * @param {Object} dependencies
   * @param {JudgeRepository} dependencies.judgeRepository - Panel seats
   * @param {JudgeAccountRepository} dependencies.judgeAccountRepository - The people
   * @param {CompetitionRepository} dependencies.competitionRepository
   * @param {Logger} dependencies.logger
   */
  constructor(dependencies) {
    this.judgeRepository = dependencies.judgeRepository;
    // The people behind the assignments. Separate collection, separate
    // repository — see src/models/JudgeAccount.js.
    this.judgeAccountRepository = dependencies.judgeAccountRepository;
    this.competitionRepository = dependencies.competitionRepository;
    this.logger = dependencies.logger;
  }

  /**
   * Bulk save judges (create or update)
   * @param {string} competitionId - Competition ID
   * @param {Array} judges - Array of judge data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} { created, updated, errors }
   */
  async saveJudges(competitionId, judges, adminId) {
    try {
      const results = {
        created: [],
        updated: [],
        errors: []
      };

      for (const judgeData of judges) {
        try {
          // An entry with no account is an untouched slot in the admin's form,
          // not an error — the same role the empty `name` check used to play.
          const judgeAccountId = judgeData.judgeAccount || judgeData.judgeAccountId;
          if (!judgeAccountId) {
            continue;
          }

          await this.assertAssignableJudgeAccount(judgeAccountId);

          // Look for existing judge in the SAME slot (gender + ageGroup + judgeNo + competition)
          let existing = null;
          if (competitionId && judgeData.gender && judgeData.ageGroup && judgeData.judgeNo) {
            const query = {
              competition: competitionId,
              gender: judgeData.gender,
              ageGroup: judgeData.ageGroup,
              judgeNo: judgeData.judgeNo,
            };
            if (judgeData.apparatus) {
              query.apparatus = judgeData.apparatus;
            } else {
              query.apparatus = { $in: [null, ''] }; // explicitly check for no apparatus
            }
            existing = await this.judgeRepository.findOne(query);
          }

          // One person cannot hold two slots on the same panel — that would
          // make them, say, both Senior Judge and Judge 1, and their single
          // slip would then be counted twice in the panel average.
          await this.assertNotAlreadyOnPanel({
            judgeAccountId,
            competitionId,
            gender: judgeData.gender,
            ageGroup: judgeData.ageGroup,
            competitionTypes: judgeData.competitionTypes,
            apparatus: judgeData.apparatus,
            judgeType: judgeData.judgeType,
            excludeJudgeId: existing?._id,
          });

          const judgeDataWithStatus = {
            ...judgeData,
            judgeAccount: judgeAccountId,
            competition: competitionId,
            // A slot is live exactly when a registered judge fills it.
            isActive: true
          };
          delete judgeDataWithStatus.judgeAccountId;

          if (existing) {
            // Update existing judge in this specific slot
            const mergedTypes = [
              ...new Set([
                ...(existing.competitionTypes || []),
                ...(judgeData.competitionTypes || []),
              ]),
            ];
            const updated = await this.judgeRepository.updateById(existing._id, {
              ...judgeDataWithStatus,
              competitionTypes: mergedTypes,
            });
            results.updated.push(updated);
          } else {
            // Create new judge record for this slot
            const created = await this.judgeRepository.create({
              ...judgeDataWithStatus,
              createdBy: adminId
            });
            results.created.push(created);
          }
        } catch (error) {
          results.errors.push({
            judge: judgeData,
            error: error.message
          });
        }
      }

      this.logger.info('Judges saved', {
        competitionId,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
        adminId
      });

      return results;
    } catch (error) {
      this.logger.error('Save judges error', { 
        competitionId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all judges for a competition
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Array>} Array of judges
   */
  async getJudges(competitionId, filters = {}) {
    try {
      /*
       * Live seats only.
       *
       * `isActive` is set exactly when a registered judge fills the slot, and
       * cleared when one is removed — so this is the difference between a seat
       * and a seat that used to exist. Without it, removing Judge 4 from a
       * 5-seat panel changed nothing that mattered: `deleteJudge` is a soft
       * delete, it leaves `judgeAccount` pointing at the person, and the row
       * kept coming back here with a name on it. The judge screens count the
       * named rows to decide the panel size (Web/src/pages/judge/
       * useJudgePanelData.js), so the shrunk panel went on scoring by the
       * 5-judge method — a believable number produced the wrong way, which is
       * the worst shape a scoring bug can take.
       *
       * Slots that never had anybody in them are excluded too, and that is
       * harmless: the admin's Judge List pads all six seats back in
       * (`padJudgeSlots`), so an empty slot is drawn from the layout rather
       * than from a document.
       */
      const query = { competition: competitionId, isActive: true };
      if (filters.gender) query.gender = filters.gender;
      if (filters.ageGroup) query.ageGroup = filters.ageGroup;
      if (filters.competitionTypes) {
        const types = Array.isArray(filters.competitionTypes)
          ? filters.competitionTypes
          : [filters.competitionTypes];
        query.competitionTypes = { $in: types };
      }
      /*
       * A seat with no apparatus judges every apparatus in its category.
       *
       * This used to be an exact match, which made a category-wide panel
       * invisible the moment a judge picked an apparatus: the seats say null,
       * the query asked for 'Rope Mallakhamb', nothing came back, and the
       * caller inferred the panel size from however many slips happened to
       * have arrived. A seat that DOES name an apparatus is still matched
       * exactly, so a per-apparatus panel keeps working alongside.
       */
      if (filters.apparatus) {
        query.apparatus = { $in: [filters.apparatus, null, ''] };
      }

      // CRIT-2: without a projection this returns every judge's bcrypt hash.
      // Applied here (not in the controller) because /api/admin/judges,
      // /api/judge/judges and /api/public/judges all land on this method.
      const judges = await this.judgeRepository.find(query, {
        select: JUDGE_PUBLIC_FIELDS,
        populate: { path: 'judgeAccount', select: JUDGE_ACCOUNT_CARD_FIELDS },
        sort: { createdAt: -1 }
      });

      const flattened = judges.map(flattenJudgeAccount);

      this.logger.info('Judges retrieved', {
        competitionId,
        count: judges.length
      });

      return flattened;
    } catch (error) {
      this.logger.error('Get judges error', {
        competitionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Assert that a judge account exists and may be put on a panel.
   * @param {string} judgeAccountId
   * @returns {Promise<Object>} The account
   * @throws {NotFoundError|BusinessRuleError}
   */
  async assertAssignableJudgeAccount(judgeAccountId) {
    if (!this.judgeAccountRepository) {
      throw new BusinessRuleError('Judge account repository is not configured');
    }

    const account = await this.judgeAccountRepository.findById(judgeAccountId);
    if (!account) {
      throw new NotFoundError('Judge account');
    }
    if (account.isActive === false) {
      throw new BusinessRuleError('That judge account is deactivated');
    }
    return account;
  }

  /**
   * Refuse to seat one person twice on the same panel.
   *
   * "The same panel" is the category a slip is written against: competition +
   * gender + age group + competition type (+ apparatus). Two slots there for
   * one judge would have that judge's single opinion counted twice in the
   * panel average, which the scoring maths has no way to detect.
   *
   * @param {Object} args
   * @returns {Promise<void>}
   * @throws {BusinessRuleError}
   */
  async assertNotAlreadyOnPanel({
    judgeAccountId,
    competitionId,
    gender,
    ageGroup,
    competitionTypes,
    apparatus,
    judgeType = null,
    excludeJudgeId = null,
  }) {
    if (!judgeAccountId || !competitionId || !gender || !ageGroup) return;

    const query = {
      judgeAccount: judgeAccountId,
      competition: competitionId,
      gender,
      ageGroup,
    };
    const types = Array.isArray(competitionTypes) ? competitionTypes : [competitionTypes].filter(Boolean);
    if (types.length > 0) {
      query.competitionTypes = { $in: types };
    }
    /*
     * A seat with no apparatus judges every apparatus in its category, so it
     * clashes with a new seat whatever apparatus that names. Matching the
     * apparatus exactly let one person hold two seats as long as the seats
     * disagreed about apparatus — chief for the whole category, and Judge 1
     * for Rope — which is the same person's slip counted twice on every Rope
     * routine.
     */
    if (apparatus) {
      query.apparatus = { $in: [apparatus, null, ''] };
    }

    const held = await this.judgeRepository.find(query, { select: '_id judgeType' });
    // The one exception: the Scorer and the Time Keeper may be the same person
    // — neither evaluates, so no slip is counted twice (config/judge-seats).
    const clash = held.find((row) => String(row._id) !== String(excludeJudgeId || '')
      && !maySeatTogether(row.judgeType, judgeType));

    if (clash) {
      throw new BusinessRuleError(
        `That judge is already on this panel as ${clash.judgeType}`
      );
    }
  }

  /**
   * Create a single judge
   * @param {Object} judgeData - Judge data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Created judge
   */
  async createSingleJudge(judgeData, adminId) {
    try {
      const judgeAccountId = judgeData.judgeAccount || judgeData.judgeAccountId;
      if (!judgeAccountId) {
        throw new ValidationError('A registered judge must be selected for this slot');
      }

      await this.assertAssignableJudgeAccount(judgeAccountId);
      await this.assertNotAlreadyOnPanel({
        judgeAccountId,
        competitionId: judgeData.competition,
        gender: judgeData.gender,
        ageGroup: judgeData.ageGroup,
        competitionTypes: judgeData.competitionTypes,
        apparatus: judgeData.apparatus,
        judgeType: judgeData.judgeType,
      });

      const payload = { ...judgeData, judgeAccount: judgeAccountId, isActive: true };
      delete payload.judgeAccountId;

      const judge = await this.judgeRepository.create({
        ...payload,
        createdBy: adminId
      });

      this.logger.info('Judge created', { judgeId: judge._id, adminId });

      return judge;
    } catch (error) {
      this.logger.error('Create judge error', {
        judgeData,
        adminId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update a judge
   * @param {string} judgeId - Judge ID
   * @param {Object} updates - Update data
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated judge
   * @throws {NotFoundError} If judge not found
   */
  async updateJudge(judgeId, updates, adminId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      // An admin edits a slot by changing WHO is in it. Name, username and
      // password are no longer theirs to set — those live on the judge's own
      // account and only the judge can change them.
      const { name, username, password, ...safeUpdates } = updates;
      const payload = {
        ...safeUpdates,
        updatedBy: adminId,
        updatedAt: new Date(),
      };

      const nextAccountId = updates.judgeAccount || updates.judgeAccountId;
      if (nextAccountId) {
        await this.assertAssignableJudgeAccount(nextAccountId);
        await this.assertNotAlreadyOnPanel({
          judgeAccountId: nextAccountId,
          competitionId: judge.competition,
          gender: judge.gender,
          ageGroup: judge.ageGroup,
          competitionTypes: judge.competitionTypes,
          apparatus: judge.apparatus,
          judgeType: judge.judgeType,
          excludeJudgeId: judgeId,
        });
        payload.judgeAccount = nextAccountId;
        payload.isActive = true;
      }
      delete payload.judgeAccountId;

      // Legacy Scorer docs used judgeNo 7 (before Time Keeper was removed) — migrate to 6 when safe
      if (judge.judgeType === 'Scorer' && Number(judge.judgeNo) === 7) {
        payload.judgeNo = 6;
      }

      let updatedJudge;
      try {
        updatedJudge = await this.judgeRepository.updateById(judgeId, payload);
      } catch (err) {
        // Slot 6 may still be occupied by a legacy Time Keeper — update without remapping judgeNo
        if (payload.judgeNo === 6 && /duplicate|E11000/i.test(err.message || '')) {
          delete payload.judgeNo;
          updatedJudge = await this.judgeRepository.updateById(judgeId, payload);
        } else {
          throw err;
        }
      }

      this.logger.info('Judge updated', { judgeId, adminId });

      return updatedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Update judge error', { 
        judgeId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete a judge (soft delete)
   * @param {string} judgeId - Judge ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Deleted judge
   * @throws {NotFoundError} If judge not found
   */
  async deleteJudge(judgeId, adminId) {
    try {
      const judge = await this.judgeRepository.findById(judgeId);
      if (!judge) {
        throw new NotFoundError('Judge');
      }

      /*
       * Removing a judge VACATES THE SEAT rather than deleting the document.
       *
       * The slot itself is part of the panel's layout — one document per
       * (competition, gender, ageGroup, judgeNo), and Judge.js has unique
       * indexes on exactly that — so the row stays and stops holding anybody.
       *
       * `judgeAccount: null` is the part that was missing. Flipping `isActive`
       * alone left the removed person still pointed at by the seat, so
       * `assertNotAlreadyOnPanel` went on treating them as seated here and
       * refused to put them anywhere else on the panel. It also kept the row
       * countable: see the note on `isActive` in getJudges above.
       *
       * `deletedBy` / `deletedAt` are not in the schema and Mongoose drops them
       * in strict mode, so they were never written — the audit trail for this
       * is the AuditLog the route already records.
       */
      const deletedJudge = await this.judgeRepository.updateById(judgeId, {
        judgeAccount: null,
        isActive: false
      });

      this.logger.info('Judge deleted', { judgeId, adminId });

      return deletedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Delete judge error', { 
        judgeId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get all judges summary
   * @param {string} competitionId - Competition ID
   * @returns {Promise<Object>} Judges summary with age group breakdown
   */
  async getAllJudgesSummary(competitionId) {
    try {
      const compId = competitionId || this.competitionId;
      const competition = await this.competitionRepository.findById(compId);
      if (!competition) {
        return { summary: [], totalJudges: 0, activeJudges: 0, byCompetition: {} };
      }

      // "A judge" here means a filled slot. That used to be tested by a
      // non-empty `name` typed in by the admin; it is now the presence of a
      // registered account in the slot.
      const filled = { competition: compId, judgeAccount: { $ne: null } };
      const [totalJudges, activeJudges] = await Promise.all([
        this.judgeRepository.count(filled),
        this.judgeRepository.count({ ...filled, isActive: true })
      ]);

      // Get all judges for this competition
      const judges = (await this.judgeRepository.find(
        { competition: compId },
        {
          select: 'judgeAccount gender ageGroup competitionTypes apparatus judgeType judgeNo isActive',
          populate: { path: 'judgeAccount', select: JUDGE_ACCOUNT_CARD_FIELDS },
        }
      )).map(flattenJudgeAccount);

      /**
       * The apparatus this meet runs for one competition type.
       *
       * `apparatusConfig` is a Map on a hydrated document and a plain object on
       * a lean one, and this method is reached both ways.
       *
       * @param {string} competitionType
       * @returns {string[]} empty when the meet declares none
       */
      const apparatusForType = (competitionType) => {
        const config = competition.apparatusConfig;
        const raw = config instanceof Map ? config.get(competitionType) : config?.[competitionType];
        return Array.isArray(raw) ? raw.filter(Boolean) : [];
      };

      /*
       * Seat count for THIS competition, not every competition ever run.
       *
       * This was `judgeRepository.find({})` — every judge seat in the database,
       * across every past and future meet, loaded to build a count map "for
       * backward compatibility". It grows without bound as meets accumulate,
       * and it is on a screen an admin opens during an event.
       *
       * Nothing consumes the other competitions' entries: `byCompetition` does
       * not appear anywhere in the web client. The shape is kept — a map keyed
       * by competition id — so any caller outside this repository still finds
       * what it expects for the competition it asked about.
       */
      const seatCount = await this.judgeRepository.count({ competition: compId });
      const byCompetition = { [String(compId)]: seatCount };

      // Build summary array grouped by gender and age group
      const summaryMap = new Map();

      // Initialize with all age groups from competition, plus Competition II's
      // "All ages" final per gender.
      const categories = [...(competition.ageGroups || [])];
      for (const gender of [...new Set(categories.map((ag) => ag.gender))]) {
        if (categoryAgeGroups(competition, gender).includes(ALL_AGES)) categories.push({ gender, ageGroup: ALL_AGES });
      }
      categories.forEach(ag => {
        const key = `${ag.gender}_${ag.ageGroup}`;
        summaryMap.set(key, {
          gender: ag.gender,
          ageGroup: ag.ageGroup,
          competitionTypes: {}
        });

        // Initialize competition types from competition
        competition.competitionTypes?.forEach(ct => {
          summaryMap.get(key).competitionTypes[ct] = {
            judges: [],
            // One bucket per apparatus the meet runs, because a panel is
            // seated per apparatus now. Pre-created from the meet's config
            // rather than from the seats found, so an apparatus with NO panel
            // at all is an empty bucket that fails the minimum — rather than a
            // missing key that nothing checks.
            byApparatus: Object.fromEntries(
              apparatusForType(ct).map((apparatus) => [apparatus, { judges: [] }])
            ),
            hasMinimumJudges: false,
            isStarted: false
          };
        });
      });

      // Add judges to their respective age groups and competition types
      judges.forEach(judge => {
        if (!judge.gender || !judge.ageGroup) return;
        // Skip empty slots — a panel position nobody has been assigned to.
        if (!judge.judgeAccount) return;

        const key = `${judge.gender}_${judge.ageGroup}`;
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            gender: judge.gender,
            ageGroup: judge.ageGroup,
            competitionTypes: {}
          });
        }

        const entry = summaryMap.get(key);

        // Add judge to each competition type they're assigned to
        judge.competitionTypes?.forEach(ct => {
          if (!entry.competitionTypes[ct]) {
            entry.competitionTypes[ct] = {
              judges: [],
              byApparatus: Object.fromEntries(
                apparatusForType(ct).map((apparatus) => [apparatus, { judges: [] }])
              ),
              hasMinimumJudges: false,
              isStarted: false
            };
          }

          const seat = {
            _id: judge._id,
            name: judge.name,
            email: judge.email,
            judgeType: judge.judgeType,
            judgeNo: judge.judgeNo,
            apparatus: judge.apparatus || null,
          };

          // The flat list is every seat in the category, whatever apparatus —
          // unchanged, because callers count it to show who is on staff.
          entry.competitionTypes[ct].judges.push(seat);

          /*
           * The per-apparatus buckets are what "can this start" is decided on.
           *
           * A seat naming an apparatus counts for that one. A LEGACY seat with
           * no apparatus judges the whole category, so it counts for all of
           * them — which is what keeps a meet seated before the apparatus rung
           * existed reporting itself as ready.
           */
          const buckets = entry.competitionTypes[ct].byApparatus;
          const covers = judge.apparatus ? [judge.apparatus] : Object.keys(buckets);
          covers.forEach((apparatus) => {
            if (!buckets[apparatus]) buckets[apparatus] = { judges: [] };
            buckets[apparatus].judges.push(seat);
          });
        });
      });

      // Check if competition types are started and have minimum judges
      competition.startedAgeGroups?.forEach(started => {
        const key = `${started.gender}_${started.ageGroup}`;
        if (summaryMap.has(key)) {
          const entry = summaryMap.get(key);
          if (entry.competitionTypes[started.competitionType]) {
            entry.competitionTypes[started.competitionType].isStarted = true;
          }
        }
      });

      /*
       * Update hasMinimumJudges: Senior Judge, J1, J2, Scorer & Time Keeper required.
       *
       * The list is MINIMUM_PANEL_SEATS in utils/data/judge-assignment.util —
       * it was an anonymous literal buried in this loop, which made the rule
       * that gates whether a category can be scored at all invisible to anyone
       * not reading this function.
       *
       * ASKED PER APPARATUS, AND ANSWERED FOR ALL OF THEM AT ONCE. This is the
       * flag behind the dashboard's Start button, and panels are seated per
       * apparatus — so counting the category's seats in one flat list would
       * call a category ready when Pole had the chief and Rope had the Scorer.
       * Every apparatus the meet runs has to stand on its own.
       *
       * A meet that declares no apparatus for a type has no buckets, and falls
       * back to the flat list. That is not a special case bolted on: it is the
       * same question with one nameless apparatus.
       */
      const minimallyStaffed = (judges) =>
        MINIMUM_PANEL_SEATS.every((type) => (judges || []).some((j) => j.judgeType === type));

      summaryMap.forEach(entry => {
        Object.keys(entry.competitionTypes).forEach(ct => {
          const bucketEntries = Object.entries(entry.competitionTypes[ct].byApparatus || {});

          bucketEntries.forEach(([, bucket]) => {
            bucket.hasMinimumJudges = minimallyStaffed(bucket.judges);
          });

          entry.competitionTypes[ct].hasMinimumJudges = bucketEntries.length > 0
            ? bucketEntries.every(([, bucket]) => bucket.hasMinimumJudges)
            : minimallyStaffed(entry.competitionTypes[ct].judges);
        });
      });

      const summary = Array.from(summaryMap.values());

      this.logger.info('Judges summary retrieved', { 
        totalJudges, 
        activeJudges, 
        summaryCount: summary.length 
      });

      return {
        summary,
        totalJudges,
        activeJudges,
        byCompetition
      };
    } catch (error) {
      this.logger.error('Get judges summary error', { error: error.message });
      throw error;
    }
  }

  /**
   * Assign judge to competition
   * @param {string} judgeId - Judge ID
   * @param {string} competitionId - Competition ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<Object>} Updated judge
   * @throws {NotFoundError} If judge or competition not found
   */
  async assignJudgeToCompetition(judgeId, competitionId, adminId) {
    try {
      const [judge, competition] = await Promise.all([
        this.judgeRepository.findById(judgeId),
        this.competitionRepository.findById(competitionId)
      ]);

      if (!judge) {
        throw new NotFoundError('Judge');
      }
      if (!competition) {
        throw new NotFoundError('Competition');
      }

      const updatedJudge = await this.judgeRepository.updateById(judgeId, {
        competition: competitionId,
        assignedBy: adminId,
        assignedAt: new Date()
      });

      this.logger.info('Judge assigned to competition', { 
        judgeId, 
        competitionId, 
        adminId 
      });

      return updatedJudge;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      this.logger.error('Assign judge to competition error', { 
        judgeId, 
        competitionId, 
        adminId, 
        error: error.message 
      });
      throw error;
    }
  }
}

module.exports = JudgePanelService;
