/**
 * Performance Order Service
 *
 * Owns the running order for a competition category: the admin/superadmin lot
 * draw, and the drag-to-reorder sequence the panel's Senior Judge or Scorer
 * sets for teams and for the athletes inside a team.
 *
 * Every mutation broadcasts `performance_order_updated` into the category's
 * scoring room(s), which is what makes a Senior Judge's drag show up on the
 * other four judges' tablets without a refresh.
 *
 * @module services/competition/performance-order.service
 */

const crypto = require('crypto');
const EventTypes = require('../../socket/events/event-types');
const { toCompetitionTypeSlug, toCompetitionTypeDisplay } = require('../../config/cop-rules');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../errors');
const { fullName } = require('../../utils/data/user-projection.util');

/** Judge roles allowed to set the running order for their own panel. */
const SEQUENCE_JUDGE_TYPES = Object.freeze(['Senior Judge', 'Scorer']);

/**
 * Fisher-Yates using crypto.randomInt rather than Math.random.
 *
 * This is a competition draw — the order it produces decides who performs
 * first, and Math.random is both predictable and biased when squeezed through
 * `Math.floor(x * n)`. `crypto.randomInt` is uniform over the range and not
 * reproducible from an observed prefix.
 *
 * @template T
 * @param {T[]} items
 * @returns {T[]} a new shuffled array; the input is not mutated
 */
function secureShuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** @param {*} id @returns {string} */
const idStr = (id) => (id == null ? '' : String(id._id ?? id));

class PerformanceOrderService {
  /**
   * @param {Object} dependencies
   * @param {import('../../repositories/performance-order.repository')} dependencies.performanceOrderRepository
   * @param {import('../user/admin.service')} dependencies.adminService - source of truth for "which teams are in this category"
   * @param {import('../../repositories/judge.repository')} dependencies.judgeRepository
   * @param {Object} dependencies.logger
   * @param {Object|null} dependencies.socketManager - injected lazily by bootstrap
   */
  constructor(dependencies) {
    this.performanceOrderRepository = dependencies.performanceOrderRepository;
    this.adminService = dependencies.adminService;
    this.judgeRepository = dependencies.judgeRepository;
    this.logger = dependencies.logger;
    this.socketManager = dependencies.socketManager;
  }

  /**
   * Normalize the four fields that identify a category, rejecting anything
   * incomplete before it can create a half-keyed document.
   *
   * @param {string} competitionId
   * @param {Object} filters - { gender, ageGroup, competitionType }
   * @returns {{competition: string, gender: string, ageGroup: string, competitionType: string}}
   * @throws {ValidationError}
   */
  buildIdentity(competitionId, filters = {}) {
    const { gender, ageGroup, competitionType } = filters;

    if (!competitionId) {
      throw new ValidationError('Competition is required');
    }
    if (!gender || !ageGroup || !competitionType) {
      throw new ValidationError('gender, ageGroup and competitionType are all required');
    }

    return {
      competition: competitionId,
      gender,
      ageGroup,
      // Slug is canonical here — see the note on the model. Normalizing on the
      // way in is what stops "Competition I" and "competition_1" becoming two
      // documents for one panel.
      competitionType: toCompetitionTypeSlug(competitionType),
    };
  }

  /**
   * Confirm a judge actually sits on the panel they are trying to sequence,
   * in a role that is allowed to.
   *
   * A judge can hold several seats (one per gender/age-group/category), and
   * `req.user` is the person, not a seat — so the question "may THIS judge
   * reorder THIS panel" can only be answered by looking at every seat they
   * hold and finding one that covers the category being reordered.
   *
   * @param {Object} judgeUser - `req.user` for a judge (a JudgeAccount)
   * @param {Object} identity - result of buildIdentity
   * @param {Array} [preloadedAssignments] - `req.judgeAssignments`, if the
   *   caller already has them
   * @returns {Promise<Object>} the matching assignment
   * @throws {AuthorizationError}
   */
  async assertJudgeMaySequence(judgeUser, identity, preloadedAssignments = null) {
    if (!judgeUser) {
      throw new AuthorizationError('Authentication required');
    }

    // The principal is a judge ACCOUNT, so every seat it holds is looked up by
    // that account. The auth middleware has usually done this already and
    // passes the result in; the lookup here is the fallback for callers that
    // have not (and for the unit tests).
    const assignments = preloadedAssignments?.length
      ? preloadedAssignments
      : await this.judgeRepository.find({
        judgeAccount: judgeUser._id,
        competition: identity.competition,
        isActive: { $ne: false },
      });

    const match = (assignments || []).find((a) => {
      if (!SEQUENCE_JUDGE_TYPES.includes(a.judgeType)) return false;
      if (a.gender !== identity.gender) return false;
      if (a.ageGroup !== identity.ageGroup) return false;
      if (idStr(a.competition) !== idStr(identity.competition)) return false;
      // A Scorer is routinely created without competitionTypes (the judge
      // client defaults them to competition_1), so an empty list means "all
      // categories in this gender/age group" rather than "none".
      const types = Array.isArray(a.competitionTypes) ? a.competitionTypes : [];
      return types.length === 0 || types.includes(identity.competitionType);
    });

    if (!match) {
      throw new AuthorizationError(
        'Only the Senior Judge or Scorer assigned to this category can set its running order'
      );
    }

    return match;
  }

  /**
   * Read the stored order for a category.
   * @param {string} competitionId
   * @param {Object} filters
   * @returns {Promise<Object|null>}
   */
  async getOrderDocument(competitionId, filters) {
    const identity = this.buildIdentity(competitionId, filters);
    return this.performanceOrderRepository.findByCategory(identity);
  }

  /**
   * The roster for a category, already sorted into running order.
   *
   * This is the one call every ordering screen makes: it returns the teams and
   * their athletes merged with whatever order has been stored, so the caller
   * never has to re-implement the merge. Teams (or athletes) registered after
   * the last draw are not in the stored order — they are appended in name order
   * rather than dropped, which is why the merge is positional-with-fallback and
   * not a lookup.
   *
   * @param {string} competitionId
   * @param {Object} filters - { gender, ageGroup, competitionType }
   * @returns {Promise<Object>} { ...identity, lotsDrawnAt, teams: [...] }
   */
  async getOrderedRoster(competitionId, filters) {
    const identity = this.buildIdentity(competitionId, filters);

    const [orderDoc, submittedTeams] = await Promise.all([
      this.performanceOrderRepository.findByCategory(identity),
      // `getSubmittedTeams` is the definition of "which teams are in this
      // category" used by the judge dashboard. Reusing it — rather than
      // re-querying registeredTeams here — is what keeps the lot list and the
      // judge's team list from ever showing different teams.
      this.adminService.getSubmittedTeams(competitionId, {
        gender: identity.gender,
        ageGroup: identity.ageGroup,
        competitionType: identity.competitionType,
      }),
    ]);

    const teamPositions = new Map();
    const teamLots = new Map();
    for (const entry of orderDoc?.teamOrder || []) {
      teamPositions.set(idStr(entry.team), entry.position);
      teamLots.set(idStr(entry.team), entry.lotNo ?? null);
    }

    const playerOrderByTeam = new Map();
    for (const entry of orderDoc?.playerOrders || []) {
      const byPlayer = new Map();
      for (const p of entry.players || []) {
        byPlayer.set(idStr(p.player), { position: p.position, lotNo: p.lotNo ?? null });
      }
      playerOrderByTeam.set(idStr(entry.team), byPlayer);
    }

    const teams = (submittedTeams || []).map((team) => {
      const teamId = idStr(team._id);
      const playerOrder = playerOrderByTeam.get(teamId);

      // Only athletes in this category perform in it. Apparatus is deliberately
      // NOT filtered here: one order serves every apparatus view (see model).
      const players = (team.players || [])
        .filter((entry) => entry.player && entry.gender === identity.gender && entry.ageGroup === identity.ageGroup)
        .map((entry) => {
          const playerId = idStr(entry.player._id);
          const stored = playerOrder?.get(playerId);
          return {
            _id: entry.player._id,
            name: `${entry.player.firstName || ''} ${entry.player.lastName || ''}`.trim(),
            gender: entry.gender,
            ageGroup: entry.ageGroup,
            apparatus: entry.apparatus || {},
            isFinalized: !!entry.isFinalized,
            lotNo: stored?.lotNo ?? null,
            position: stored?.position ?? null,
          };
        });

      return {
        _id: team._id,
        name: team.name,
        coachName: team.coach?.name || fullName(team.coach) || '',
        lotNo: teamLots.get(teamId) ?? null,
        position: teamPositions.has(teamId) ? teamPositions.get(teamId) : null,
        players: this.sortByStoredPosition(players, (p) => p.name),
        playerCount: players.length,
      };
    });

    return {
      ...identity,
      lotsDrawnAt: orderDoc?.lotsDrawnAt || null,
      lotsDrawnByName: orderDoc?.lotsDrawnByName || '',
      updatedAt: orderDoc?.updatedAt || null,
      updatedByName: orderDoc?.updatedByName || '',
      updatedByRole: orderDoc?.updatedByRole || '',
      hasOrder: !!orderDoc,
      teams: this.sortByStoredPosition(teams, (t) => t.name),
    };
  }

  /**
   * Sort rows that carry a possibly-null `position`.
   *
   * Rows WITH a position keep it. Rows without one (registered since the last
   * draw) are appended in `fallback` order rather than sorted to the front,
   * because `null` compares as 0 in a naive numeric sort and would silently
   * push a brand-new team to the top of a drawn running order.
   *
   * @template T
   * @param {T[]} rows
   * @param {(row: T) => string} fallback - tiebreak key for unordered rows
   * @returns {T[]}
   */
  sortByStoredPosition(rows, fallback) {
    const ordered = rows.filter((r) => typeof r.position === 'number');
    const unordered = rows.filter((r) => typeof r.position !== 'number');

    ordered.sort((a, b) => a.position - b.position);
    unordered.sort((a, b) => String(fallback(a)).localeCompare(String(fallback(b))));

    return [...ordered, ...unordered];
  }

  /**
   * Draw lots for a category — the admin/superadmin privilege.
   *
   * Randomly shuffles the submitted teams and stamps lot numbers 1..N. When
   * `includePlayers` is set, each team's athletes are shuffled and numbered the
   * same way. Redrawing is allowed and simply replaces the previous draw: an
   * admin re-runs a draw when teams are added or withdrawn before the session
   * starts, and blocking that would leave them with no way to fix it.
   *
   * @param {string} competitionId
   * @param {Object} filters - { gender, ageGroup, competitionType }
   * @param {Object} actor - { id, name, role }
   * @param {Object} [options]
   * @param {boolean} [options.includePlayers=true]
   * @returns {Promise<Object>} the ordered roster after the draw
   */
  async drawLots(competitionId, filters, actor, options = {}) {
    const identity = this.buildIdentity(competitionId, filters);
    const includePlayers = options.includePlayers !== false;

    const roster = await this.getOrderedRoster(competitionId, filters);

    if (!roster.teams.length) {
      throw new NotFoundError('Submitted teams for this category');
    }

    const now = new Date();
    const shuffledTeams = secureShuffle(roster.teams);

    const teamOrder = shuffledTeams.map((team, index) => ({
      team: team._id,
      lotNo: index + 1,
      position: index,
    }));

    let playerOrders = [];
    if (includePlayers) {
      playerOrders = shuffledTeams
        .filter((team) => team.players.length > 0)
        .map((team) => ({
          team: team._id,
          players: secureShuffle(team.players).map((player, index) => ({
            player: player._id,
            lotNo: index + 1,
            position: index,
          })),
        }));
    } else {
      // Keep any hand-set athlete sequence that already exists — a team-only
      // redraw must not silently discard the panel's player ordering.
      const existing = await this.performanceOrderRepository.findByCategory(identity);
      playerOrders = existing?.playerOrders || [];
    }

    const saved = await this.performanceOrderRepository.upsertByCategory(identity, {
      teamOrder,
      playerOrders,
      lotsDrawnAt: now,
      lotsDrawnBy: actor?.id || null,
      lotsDrawnByName: actor?.name || '',
      updatedBy: actor?.id || null,
      updatedByRole: actor?.role || '',
      updatedByName: actor?.name || '',
    });

    this.logger.info('Lots drawn', {
      ...identity,
      teamCount: teamOrder.length,
      includePlayers,
      drawnBy: actor?.id,
      role: actor?.role,
    });

    const result = await this.getOrderedRoster(competitionId, filters);
    this.broadcast(identity, 'lots_drawn', result, actor);
    return { ...result, _id: saved?._id };
  }

  /**
   * Replace the team running order with an explicit list of team ids.
   *
   * @param {string} competitionId
   * @param {Object} filters
   * @param {string[]} teamIds - full running order, first to last
   * @param {Object} actor - { id, name, role }
   * @returns {Promise<Object>} the ordered roster after the change
   */
  async setTeamOrder(competitionId, filters, teamIds, actor) {
    const identity = this.buildIdentity(competitionId, filters);

    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      throw new ValidationError('teamIds must be a non-empty array');
    }

    const roster = await this.getOrderedRoster(competitionId, filters);
    const known = new Set(roster.teams.map((t) => idStr(t._id)));

    const seen = new Set();
    const cleaned = [];
    for (const raw of teamIds) {
      const id = idStr(raw);
      // Reject rather than skip: a drag payload naming a team that is not in
      // this category means the client is out of sync with the roster, and
      // silently dropping it would persist an order missing a team that is
      // about to perform.
      if (!known.has(id)) {
        throw new ValidationError(`Team ${id} is not registered in this category`);
      }
      if (seen.has(id)) {
        throw new ValidationError(`Team ${id} appears more than once in the order`);
      }
      seen.add(id);
      cleaned.push(id);
    }

    // Anything the client did not send (a team added between its last fetch and
    // this save) keeps its place at the end instead of being deleted.
    const missing = roster.teams.map((t) => idStr(t._id)).filter((id) => !seen.has(id));
    const finalOrder = [...cleaned, ...missing];

    const existing = await this.performanceOrderRepository.findByCategory(identity);
    const lotByTeam = new Map((existing?.teamOrder || []).map((e) => [idStr(e.team), e.lotNo ?? null]));

    const teamOrder = finalOrder.map((id, index) => ({
      team: id,
      // The drawn lot number is a matter of record; dragging changes WHEN a
      // team performs, not which lot it drew. Carrying it through is what lets
      // the judge screens show "Lot 4" against the team now running third.
      lotNo: lotByTeam.get(id) ?? null,
      position: index,
    }));

    await this.performanceOrderRepository.upsertByCategory(identity, {
      teamOrder,
      updatedBy: actor?.id || null,
      updatedByRole: actor?.role || '',
      updatedByName: actor?.name || '',
    });

    this.logger.info('Team running order updated', {
      ...identity,
      teamCount: teamOrder.length,
      updatedBy: actor?.id,
      role: actor?.role,
    });

    const result = await this.getOrderedRoster(competitionId, filters);
    this.broadcast(identity, 'team_order', result, actor);
    return result;
  }

  /**
   * Replace the athlete running order inside one team.
   *
   * @param {string} competitionId
   * @param {Object} filters
   * @param {string} teamId
   * @param {string[]} playerIds - full running order, first to last
   * @param {Object} actor - { id, name, role }
   * @returns {Promise<Object>} the ordered roster after the change
   */
  async setPlayerOrder(competitionId, filters, teamId, playerIds, actor) {
    const identity = this.buildIdentity(competitionId, filters);

    if (!teamId) {
      throw new ValidationError('teamId is required');
    }
    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new ValidationError('playerIds must be a non-empty array');
    }

    const roster = await this.getOrderedRoster(competitionId, filters);
    const team = roster.teams.find((t) => idStr(t._id) === idStr(teamId));
    if (!team) {
      throw new NotFoundError('Team in this category');
    }

    const known = new Set(team.players.map((p) => idStr(p._id)));
    const seen = new Set();
    const cleaned = [];
    for (const raw of playerIds) {
      const id = idStr(raw);
      if (!known.has(id)) {
        throw new ValidationError(`Player ${id} is not on this team in this category`);
      }
      if (seen.has(id)) {
        throw new ValidationError(`Player ${id} appears more than once in the order`);
      }
      seen.add(id);
      cleaned.push(id);
    }

    const missing = team.players.map((p) => idStr(p._id)).filter((id) => !seen.has(id));
    const finalOrder = [...cleaned, ...missing];

    const existing = await this.performanceOrderRepository.findByCategory(identity);
    const existingForTeam = (existing?.playerOrders || []).find((e) => idStr(e.team) === idStr(teamId));
    const lotByPlayer = new Map((existingForTeam?.players || []).map((p) => [idStr(p.player), p.lotNo ?? null]));

    const players = finalOrder.map((id, index) => ({
      player: id,
      lotNo: lotByPlayer.get(id) ?? null,
      position: index,
    }));

    const playerOrders = (existing?.playerOrders || []).filter((e) => idStr(e.team) !== idStr(teamId));
    playerOrders.push({ team: teamId, players });

    await this.performanceOrderRepository.upsertByCategory(identity, {
      playerOrders,
      updatedBy: actor?.id || null,
      updatedByRole: actor?.role || '',
      updatedByName: actor?.name || '',
    });

    this.logger.info('Player running order updated', {
      ...identity,
      teamId: idStr(teamId),
      playerCount: players.length,
      updatedBy: actor?.id,
      role: actor?.role,
    });

    const result = await this.getOrderedRoster(competitionId, filters);
    this.broadcast(identity, 'player_order', result, actor, { teamId: idStr(teamId) });
    return result;
  }

  /**
   * Push the new order to every judge sitting on this panel.
   *
   * Emits into BOTH room-id forms for the category. The codebase addresses the
   * same room as `scoring_M_U14_competition_1` and `scoring_M_U14_Competition I`
   * — `SocketManager.getRoomIdsForAssignment` joins judges to both, and a
   * broadcast to only one form reaches only some of the panel.
   *
   * Broadcast failure is logged, never thrown: the order is already persisted,
   * and turning a successful save into a 500 because a socket was down would
   * make the admin re-draw and change the running order for real.
   *
   * @param {Object} identity
   * @param {string} reason - 'lots_drawn' | 'team_order' | 'player_order'
   * @param {Object} roster - the payload clients apply
   * @param {Object} actor
   * @param {Object} [extra]
   */
  broadcast(identity, reason, roster, actor, extra = {}) {
    if (!this.socketManager) return;

    try {
      const base = `scoring_${identity.gender}_${identity.ageGroup}`;
      const roomIds = new Set([
        `${base}_${identity.competitionType}`,
        `${base}_${toCompetitionTypeDisplay(identity.competitionType)}`,
      ]);

      const payload = {
        ...extra,
        reason,
        competition: idStr(identity.competition),
        gender: identity.gender,
        ageGroup: identity.ageGroup,
        competitionType: identity.competitionType,
        teams: roster.teams.map((t) => ({
          _id: idStr(t._id),
          lotNo: t.lotNo,
          position: t.position,
          players: t.players.map((p) => ({ _id: idStr(p._id), lotNo: p.lotNo, position: p.position })),
        })),
        updatedByName: actor?.name || '',
        updatedByRole: actor?.role || '',
        timestamp: new Date().toISOString(),
      };

      for (const roomId of roomIds) {
        this.socketManager.emitToRoom(roomId, EventTypes.PERFORMANCE_ORDER_UPDATED, payload);
      }
    } catch (error) {
      this.logger.error('Failed to broadcast performance order update', {
        ...identity,
        reason,
        error: error.message,
      });
    }
  }
}

module.exports = PerformanceOrderService;
module.exports.SEQUENCE_JUDGE_TYPES = SEQUENCE_JUDGE_TYPES;
module.exports.secureShuffle = secureShuffle;
