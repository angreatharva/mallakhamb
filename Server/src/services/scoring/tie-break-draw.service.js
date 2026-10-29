/**
 * Tie-Break Draw Service
 *
 * Records the result of a PHYSICAL lucky draw — the last tie-break step:
 * COP Mallakhamb 1.12.4 on a 4/5-judge panel, and "same time" on a 3-judge
 * panel. The draw happens at the venue; an admin or superadmin records the
 * order it produced, and the ranking engine places the group in that order
 * (utils/scoring/tie-breaker.util.js).
 *
 * A draw can only be recorded for a group the rules have actually left tied
 * right now: the service ranks the standing first and checks that the
 * athletes sent are exactly one such group. The engine re-checks the same
 * thing on every read, so a draw that stops describing the standing (a score
 * was corrected) is ignored rather than misapplied.
 *
 * @module services/scoring/tie-break-draw.service
 */

const { toCompetitionTypeSlug, apparatusKey } = require('../../config/cop-rules');
const { ValidationError, NotFoundError } = require('../../errors');
const { tieGroupKey } = require('../../utils/scoring/tie-breaker.util');

class TieBreakDrawService {
  /**
   * @param {Object} deps
   * @param {import('../../repositories/tie-break-draw.repository')} deps.tieBreakDrawRepository
   * @param {import('./scoring.service')} deps.scoringService - ranks the standing being drawn for
   * @param {Object} deps.logger
   */
  constructor({ tieBreakDrawRepository, scoringService, logger }) {
    this.tieBreakDrawRepository = tieBreakDrawRepository;
    this.scoringService = scoringService;
    this.logger = logger;
  }

  /**
   * The document identity for one tie group.
   *
   * @param {string} competitionId
   * @param {{gender: string, ageGroup: string, competitionType: string, apparatus: string}} filters
   * @param {string} groupKey
   * @returns {Object}
   */
  buildIdentity(competitionId, { gender, ageGroup, competitionType, apparatus }, groupKey) {
    if (!competitionId) {
      throw new ValidationError('Competition is required');
    }
    if (!gender || !ageGroup || !competitionType || !apparatus) {
      throw new ValidationError('gender, ageGroup, competitionType and apparatus are all required');
    }
    return {
      competition: competitionId,
      gender,
      ageGroup,
      competitionType: toCompetitionTypeSlug(competitionType),
      apparatus: apparatusKey(apparatus),
      groupKey
    };
  }

  /**
   * The ranked rows of one standing, as the admin board sees them.
   *
   * @returns {Promise<Array<Object>>} performance rows carrying tieBreakInfo
   */
  async standingRows(competitionId, { gender, ageGroup, competitionType, apparatus }) {
    const players = await this.scoringService.getIndividualScores(
      competitionId, ageGroup, gender, competitionType, apparatus
    );
    const key = apparatusKey(apparatus);
    return players
      .flatMap((player) => (player.scores || []).map((row) => ({ ...row, playerId: row.playerId ?? player.playerId })))
      .filter((row) => apparatusKey(row.apparatus) === key);
  }

  /**
   * Record (or replace) the drawn order for one tie group.
   *
   * @param {string} competitionId
   * @param {Object} filters - gender, ageGroup, competitionType, apparatus
   * @param {Array<string>} order - player ids, first place first
   * @param {{id: *, name: string, role: string}} actor
   * @param {{notes?: string}} [extra]
   * @returns {Promise<Object>} the stored draw
   */
  async recordDraw(competitionId, filters, order, actor, { notes = '' } = {}) {
    const ids = (order || []).map(String);
    if (ids.length < 2) {
      throw new ValidationError('A lucky draw needs at least two athletes');
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError('An athlete appears more than once in the draw');
    }

    const groupKey = tieGroupKey(ids);
    const identity = this.buildIdentity(competitionId, filters, groupKey);

    const rows = await this.standingRows(competitionId, filters);
    const group = rows.filter((row) => row.tieBreakInfo?.tieGroupKey === groupKey);
    const drawable = group.length === ids.length && group.every((row) =>
      row.tieBreakInfo.awaitingLuckyDraw || row.tieBreakInfo.method === 'lucky_draw'
    );
    if (!drawable) {
      throw new ValidationError(
        'These athletes are not a tie that awaits a lucky draw in this standing. Refresh the results and try again.'
      );
    }

    const draw = await this.tieBreakDrawRepository.upsertByIdentity(identity, {
      order: ids,
      tiedScore: Number(group[0].finalScore) || 0,
      notes: String(notes || '').slice(0, 500),
      recordedBy: actor?.id || null,
      recordedByName: actor?.name || '',
      recordedByRole: actor?.role || '',
      recordedAt: new Date()
    });

    this.logger.info('Lucky draw recorded', {
      competitionId,
      apparatus: identity.apparatus,
      category: [identity.gender, identity.ageGroup, identity.competitionType].join('/'),
      athletes: ids.length,
      recordedBy: actor?.id
    });
    await this._afterDraw(competitionId, identity);

    return draw;
  }

  /**
   * Remove a recorded draw, so the group shows as awaiting a draw again.
   *
   * @param {string} competitionId
   * @param {Object} filters - gender, ageGroup, competitionType, apparatus
   * @param {string} groupKey - the group's tieGroupKey
   * @param {{id: *}} actor
   * @returns {Promise<void>}
   */
  async clearDraw(competitionId, filters, groupKey, actor) {
    const key = tieGroupKey(String(groupKey || '').split(',').filter(Boolean));
    if (!key) {
      throw new ValidationError('groupKey is required');
    }
    const removed = await this.tieBreakDrawRepository.deleteByIdentity(
      this.buildIdentity(competitionId, filters, key)
    );
    if (!removed) {
      throw new NotFoundError('Lucky draw for this group');
    }
    this.logger.info('Lucky draw cleared', { competitionId, apparatus: filters.apparatus, clearedBy: actor?.id });
    await this._afterDraw(competitionId, this.buildIdentity(competitionId, filters, key));
  }

  /**
   * A Competition I draw can decide who reaches a final (a tie at the cut):
   * recompute the finals that standing feeds. Resolved lazily — the
   * qualification service is optional and never blocks a draw.
   * @private
   */
  async _afterDraw(competitionId, identity) {
    if (identity.competitionType !== 'competition_1') return;
    try {
      await this.qualificationService?.onCompetitionOneChange(competitionId, identity.gender, identity.ageGroup);
    } catch (error) {
      this.logger.error('Qualification recompute after a draw failed', { error: error.message });
    }
  }
}

module.exports = TieBreakDrawService;
