/**
 * Super Admin "Player teams" — look at, correct and audit a player's team at
 * each competition level (docs/team-per-level-plan.md, step 3).
 *
 *  - search / detail: a player's team at every level (who set it, when, how),
 *    their squad entries, entries that break the COP age rule, open conflicts;
 *  - correct: change the team at a level, with a reason. Refused while the
 *    player is still entered for the old team in an open competition at that
 *    level — `removeEntries` takes them out of those squads first;
 *  - conflicts: players migration 014 found on two teams at one level;
 *  - history: every lock, claim, correction and namesake override.
 *
 * The everyday writer stays services/team/player-team.service; only a Super
 * Admin's correction replaces a level's team.
 *
 * @module services/team/player-team-admin.service
 */

const { NotFoundError, ValidationError, BusinessRuleError } = require('../../errors');
const { COMPETITION_LEVELS } = require('../../config/competition-levels');
const { levelLabel, teamAtLevel, levelEntry } = require('../../utils/data/player-team.util');
const { isCompetitionLocked } = require('../../utils/security/competition-lock.util');
const { checkAgeGroup, groupLabel } = require('../../utils/data/age-eligibility.util');

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;
const nameOf = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'");
const literal = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every audit action that changes, or bears on, a player's team at a level. */
const HISTORY_ACTIONS = Object.freeze([
  'PLAYER_TEAM_SET',
  'PLAYER_TEAM_CORRECTED',
  'PLAYER_TEAM_ENTRIES_REMOVED',
  'PLAYER_TEAM_CONFLICT_RESOLVED',
  'WALK_IN_PLAYER_LINKED',
  'WALK_IN_DIFFERENT_CHILD',
]);

class PlayerTeamAdminService {
  constructor({ playerRepository, teamRepository, competitionRepository, auditLogRepository, playerTeamConflictRepository, logger }) {
    this.players = playerRepository;
    this.teams = teamRepository;
    this.competitions = competitionRepository;
    this.audit = auditLogRepository;
    this.conflicts = playerTeamConflictRepository;
    this.logger = logger;
  }

  /** @private */
  async _teamNames(ids) {
    const unique = [...new Set(ids.filter(Boolean).map(String))];
    if (!unique.length) return new Map();
    const teams = await this.teams.find({ _id: { $in: unique } }, { select: 'name' });
    return new Map((teams || []).map((t) => [String(t._id), t.name]));
  }

  /** @private */
  _card(player, names) {
    return {
      _id: player._id,
      name: nameOf(player),
      loginId: player.loginId || null,
      email: player.email || null,
      gender: player.gender,
      dateOfBirth: player.dateOfBirth,
      oldTeam: player.team ? { _id: idOf(player.team), name: names.get(idOf(player.team)) || 'Unknown team' } : null,
      levels: COMPETITION_LEVELS.map((level) => {
        const entry = levelEntry(player, level);
        return {
          level,
          label: levelLabel(level),
          team: entry ? { _id: idOf(entry.team), name: names.get(idOf(entry.team)) || 'Unknown team' } : null,
          setAt: entry?.setAt || null,
          setByType: entry?.setByType || null,
          via: entry?.via || null,
        };
      }),
    };
  }

  /** Players by part of their name, Player ID or email (up to 20). */
  async search(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const like = new RegExp(literal(q), 'i');
    const or = [{ firstName: like }, { lastName: like }, { loginId: like }, { email: like }];
    const [first, ...rest] = q.split(/\s+/);
    if (rest.length) or.push({ firstName: new RegExp(`^${literal(first)}`, 'i'), lastName: new RegExp(`^${literal(rest.join(' '))}`, 'i') });
    const found = await this.players.find({ $or: or }, { limit: 20, sort: { firstName: 1, lastName: 1 } });
    const names = await this._teamNames((found || []).flatMap((p) => [idOf(p.team), ...(p.levelTeams || []).map((e) => idOf(e.team))]));
    return (found || []).map((p) => this._card(p, names));
  }

  /** @private */
  async _player(playerId) {
    const player = await this.players.findById(playerId);
    if (!player) throw new NotFoundError('Player');
    return player;
  }

  /** @private — every squad entry of this player, newest meet first. */
  async _entries(player) {
    const meets = await this.competitions.find(
      { 'registeredTeams.players.player': player._id },
      { sort: { startDate: -1 }, select: 'name level place startDate endDate ageCutoffYear ageGroups registeredTeams' }
    );
    const rows = [];
    for (const meet of meets || []) {
      for (const rt of meet.registeredTeams || []) {
        const entry = (rt.players || []).find((e) => idOf(e.player) === idOf(player._id));
        if (!entry) continue;
        const age = checkAgeGroup({ dateOfBirth: player.dateOfBirth, gender: entry.gender, ageGroup: entry.ageGroup, competition: meet });
        rows.push({
          competition: {
            _id: meet._id, name: meet.name, level: meet.level, place: meet.place,
            startDate: meet.startDate, endDate: meet.endDate, locked: isCompetitionLocked(meet),
          },
          team: { _id: idOf(rt.team) },
          ageGroup: entry.ageGroup,
          gender: entry.gender,
          isSubmitted: Boolean(rt.isSubmitted),
          paymentStatus: rt.paymentStatus || null,
          ageIssue: age.ok ? null : `Too old for ${groupLabel(entry.ageGroup)} (${age.age} on 31 Dec ${age.cutoffYear})`,
        });
      }
    }
    return rows;
  }

  /** One player: teams per level, squad entries, open conflicts. */
  async detail(playerId) {
    const player = await this._player(playerId);
    const entries = await this._entries(player);
    const conflicts = await this.conflicts.find({ player: player._id, resolved: false });
    const names = await this._teamNames([
      idOf(player.team),
      ...(player.levelTeams || []).map((e) => idOf(e.team)),
      ...entries.map((e) => e.team._id),
      ...(conflicts || []).flatMap((c) => (c.teams || []).map((t) => idOf(t.team))),
    ]);
    return {
      ...this._card(player, names),
      entries: entries.map((e) => {
        const held = teamAtLevel(player, e.competition.level);
        return { ...e, team: { _id: e.team._id, name: names.get(e.team._id) || 'Unknown team' }, heldAtLevel: held === e.team._id };
      }),
      conflicts: (conflicts || []).map((c) => ({
        _id: c._id,
        level: c.level,
        teams: (c.teams || []).map((t) => ({ _id: idOf(t.team), name: names.get(idOf(t.team)) || 'Unknown team', competitions: (t.competitions || []).length })),
      })),
    };
  }

  /**
   * Open competitions at `level` where the player is entered for `teamId` —
   * what blocks a correction away from that team. Finished (locked) meets are
   * history and stay as they are.
   * @private
   */
  _openEntries(entries, level, teamId) {
    return entries.filter((e) => e.competition.level === level && e.team._id === idOf(teamId) && !e.competition.locked);
  }

  /**
   * Change (or set) the player's team at a level. Super Admin only, with a
   * reason, audited.
   */
  async correct(actor, playerId, { level, teamId, reason }) {
    if (!COMPETITION_LEVELS.includes(level)) throw new ValidationError('Choose a competition level');
    if (!reason || String(reason).trim().length < 5) throw new ValidationError('Give a reason (at least 5 characters)');
    const team = await this.teams.findById(teamId);
    if (!team) throw new NotFoundError('Team');
    const player = await this._player(playerId);
    const current = teamAtLevel(player, level);
    if (current === idOf(teamId)) throw new BusinessRuleError(`${nameOf(player)} is already with ${team.name} for ${levelLabel(level)}.`);

    if (current) {
      const blocking = this._openEntries(await this._entries(player), level, current);
      if (blocking.length) {
        throw new BusinessRuleError(
          `${nameOf(player)} is still entered for their current ${levelLabel(level)} team in ${blocking.length} open competition(s). Remove them from those squads first.`,
          { reason: 'ENTERED_FOR_OLD_TEAM', competitions: blocking.map((e) => ({ _id: e.competition._id, name: e.competition.name })) }
        );
      }
    }

    const entry = { level, team: team._id, setBy: actor.id, setByType: 'superadmin', via: 'superadmin-correction' };
    const changed = current
      ? await this.players.replaceTeamAtLevel(player._id, level, player.levelTeams.find((e) => e.level === level).team, entry)
      : await this.players.setTeamAtLevel(player._id, entry);
    if (!changed) throw new BusinessRuleError('This player\'s team at that level changed meanwhile. Reload and try again.');

    // The old single team follows when it pointed at the team just corrected
    // away and no other level still holds it.
    const fresh = await this.players.findById(player._id);
    if (current && idOf(fresh.team) === current && !(fresh.levelTeams || []).some((e) => idOf(e.team) === current)) {
      await this.players.updateById(player._id, { team: team._id });
    }

    await this.conflicts.model.updateMany(
      { player: player._id, level, resolved: false },
      { $set: { resolved: true, resolvedAt: new Date(), resolvedBy: actor.id, resolvedTeam: team._id } }
    );
    await this._log(actor, 'PLAYER_TEAM_CORRECTED', player._id, { level, from: current, to: idOf(team._id), team: idOf(team._id), reason: String(reason).trim() });
    return this.detail(player._id);
  }

  /**
   * Take the player out of their current team's squads at a level, in every
   * competition still open — the step before a correction. Payments are not
   * touched; the response says which squads were already paid for.
   */
  async removeEntries(actor, playerId, { level }) {
    if (!COMPETITION_LEVELS.includes(level)) throw new ValidationError('Choose a competition level');
    const player = await this._player(playerId);
    const current = teamAtLevel(player, level);
    if (!current) throw new BusinessRuleError(`${nameOf(player)} has no team for ${levelLabel(level)}.`);
    const open = this._openEntries(await this._entries(player), level, current);
    const removed = [];
    for (const e of open) {
      await this.competitions.removePlayerFromRegistration(e.competition._id, current, player._id);
      removed.push({ _id: e.competition._id, name: e.competition.name, paid: e.isSubmitted || e.paymentStatus === 'completed' });
    }
    await this._log(actor, 'PLAYER_TEAM_ENTRIES_REMOVED', player._id, { level, team: current, competitions: removed.map((r) => String(r._id)) });
    return { removed, player: await this.detail(player._id) };
  }

  /** Players migration 014 found on two or more teams at one level. */
  async listConflicts() {
    const open = await this.conflicts.find({ resolved: false }, { sort: { createdAt: 1 }, limit: 500 });
    const playerIds = (open || []).map((c) => c.player);
    const players = playerIds.length ? await this.players.find({ _id: { $in: playerIds } }, { select: 'firstName lastName loginId dateOfBirth' }) : [];
    const byId = new Map((players || []).map((p) => [String(p._id), p]));
    const names = await this._teamNames((open || []).flatMap((c) => (c.teams || []).map((t) => idOf(t.team))));
    return (open || []).map((c) => {
      const p = byId.get(idOf(c.player));
      return {
        _id: c._id,
        level: c.level,
        label: levelLabel(c.level),
        player: p ? { _id: p._id, name: nameOf(p), loginId: p.loginId } : { _id: idOf(c.player), name: 'Deleted player', loginId: null },
        teams: (c.teams || []).map((t) => ({ _id: idOf(t.team), name: names.get(idOf(t.team)) || 'Unknown team', competitions: (t.competitions || []).length })),
      };
    });
  }

  /** Settle a conflict: the chosen team becomes the player's team at its level. */
  async resolveConflict(actor, conflictId, { teamId }) {
    const conflict = await this.conflicts.findById(conflictId);
    if (!conflict) throw new NotFoundError('Conflict');
    if (conflict.resolved) throw new BusinessRuleError('This conflict is already resolved.');
    if (!(conflict.teams || []).some((t) => idOf(t.team) === idOf(teamId))) {
      throw new ValidationError('Choose one of the teams that entered the player at this level');
    }
    const player = await this._player(conflict.player);
    const current = teamAtLevel(player, conflict.level);
    if (current && current !== idOf(teamId)) {
      throw new BusinessRuleError(`${nameOf(player)} already has a team for ${levelLabel(conflict.level)} — use Correct instead.`);
    }
    if (!current) {
      const set = await this.players.setTeamAtLevel(player._id, {
        level: conflict.level, team: teamId, setBy: actor.id, setByType: 'superadmin', via: 'conflict-resolved',
      });
      if (!set) throw new BusinessRuleError('This player\'s team at that level changed meanwhile. Reload and try again.');
    }
    await this.conflicts.updateById(conflict._id, { resolved: true, resolvedAt: new Date(), resolvedBy: actor.id, resolvedTeam: teamId });
    await this._log(actor, 'PLAYER_TEAM_CONFLICT_RESOLVED', player._id, { level: conflict.level, team: idOf(teamId) });
    return { resolved: true };
  }

  /** Every team change on record, newest first; filter by level, team or player. */
  async history({ level, teamId, playerId, page = 1, limit = 50 } = {}) {
    const query = { action: { $in: HISTORY_ACTIONS } };
    if (playerId) query.resourceId = String(playerId);
    if (level) query['details.level'] = level;
    if (teamId) query.$or = ['details.team', 'details.from', 'details.to', 'details.namesakeTeam'].map((k) => ({ [k]: String(teamId) }));
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * size;
    const [rows, total] = await Promise.all([
      this.audit.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(size).lean(),
      this.audit.model.countDocuments(query),
    ]);
    const playerIds = [...new Set(rows.map((r) => r.resourceId).filter(Boolean))];
    const players = playerIds.length ? await this.players.find({ _id: { $in: playerIds } }, { select: 'firstName lastName loginId' }) : [];
    const byId = new Map((players || []).map((p) => [String(p._id), p]));
    const names = await this._teamNames(rows.flatMap((r) => [r.details?.team, r.details?.from, r.details?.to]));
    return {
      total,
      page: Math.max(Number(page) || 1, 1),
      rows: rows.map((r) => ({
        _id: r._id,
        at: r.createdAt,
        action: r.action,
        by: { type: r.adminType, id: idOf(r.adminId) },
        player: byId.get(r.resourceId) ? { _id: r.resourceId, name: nameOf(byId.get(r.resourceId)), loginId: byId.get(r.resourceId).loginId } : { _id: r.resourceId, name: null },
        level: r.details?.level || null,
        team: r.details?.team ? names.get(String(r.details.team)) || null : null,
        from: r.details?.from ? names.get(String(r.details.from)) || null : null,
        to: r.details?.to ? names.get(String(r.details.to)) || null : null,
        via: r.details?.via || null,
        reason: r.details?.reason || null,
        namesake: r.details?.namesake || null,
      })),
    };
  }

  /** @private */
  async _log(actor, action, playerId, details) {
    try {
      await this.audit.logAction({ adminId: actor.id, adminType: 'superadmin', action, resource: 'player', resourceId: String(playerId), details });
    } catch (error) {
      this.logger?.error?.('Could not write the player-team audit log', { error: error.message, action });
    }
  }
}

module.exports = PlayerTeamAdminService;
module.exports.HISTORY_ACTIONS = HISTORY_ACTIONS;
