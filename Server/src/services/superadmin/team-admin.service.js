/**
 * Phase 4 of docs/superadmin-control-plan.md: teams, coaches, transfers.
 *
 *  - rename / delete / restore a team;
 *  - change a team's coach (D5): the new coach takes over the team and every
 *    competition entry it has; the old coach stays as a co-coach or is
 *    removed. Co-coaches work AS the main coach (utils/auth/team-coach.util);
 *  - move a player to another team in one step (D4): out of the old squads,
 *    team-at-level corrected, into the new team's squads with the same age
 *    group and apparatus, scores re-homed, finals recomputed.
 *
 * Registration writes go BY TEAM through arrayFilters, never by index
 * (embedded-array-writes). Every change is recorded with a reason.
 *
 * @module services/superadmin/team-admin.service
 */

const mongoose = require('mongoose');
const { ValidationError, NotFoundError, BusinessRuleError, ConflictError } = require('../../errors');
const { requireReason } = require('./correction.service');
const { teamAtLevel, levelLabel } = require('../../utils/data/player-team.util');
const { hasRoomInSquad } = require('../../utils/scoring/team-championship.util');
const { isCompetitionLocked } = require('../../utils/security/competition-lock.util');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const idOf = (v) => (v && v._id ? String(v._id) : v ? String(v) : null);
const same = (a, b) => idOf(a) === idOf(b);
const personName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || p?.name || 'Unknown';

class TeamAdminService {
  constructor({ correctionService, playerTeamAdminService, competitionRepository, logger, qualificationService }) {
    this.corrections = correctionService;
    this.playerTeams = playerTeamAdminService;
    this.competitions = competitionRepository;
    this.logger = logger;
    this._qualification = qualificationService || null;
  }

  get Team() { return mongoose.model('Team'); }
  get Coach() { return mongoose.model('Coach'); }
  get Player() { return mongoose.model('Player'); }
  get Competition() { return this.competitions.model; }
  get Score() { return mongoose.model('Score'); }

  async _team(teamId, { includeDeleted = false } = {}) {
    if (!mongoose.isValidObjectId(teamId)) throw new ValidationError('Invalid team id');
    const team = await this.Team.findById(teamId).lean();
    if (!team || (!includeDeleted && team.isActive === false)) throw new NotFoundError('Team');
    return team;
  }

  async _coach(coachId) {
    if (!mongoose.isValidObjectId(coachId)) throw new ValidationError('Invalid coach id');
    const coach = await this.Coach.findById(coachId).lean();
    if (!coach) throw new NotFoundError('Coach');
    return coach;
  }

  // ── Reading ───────────────────────────────────────────────────────────

  /** Teams by name (or coach name), deleted ones included and marked. */
  async search({ q = '', includeDeleted = 'true' } = {}) {
    const text = String(q).trim().slice(0, 60);
    const rx = text ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    const coachIds = rx ? (await this.Coach.find({ $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] }, { _id: 1 }).lean()).map((c) => c._id) : [];
    const query = rx ? { $or: [{ name: rx }, { coach: { $in: coachIds } }] } : {};
    if (includeDeleted === 'false' || includeDeleted === false) query.isActive = { $ne: false };
    const teams = await this.Team.find(query).sort({ name: 1 }).limit(100).populate('coach', 'firstName lastName email').lean();
    return teams.map((t) => ({
      _id: t._id, name: t.name, isActive: t.isActive !== false,
      coach: t.coach ? { _id: t.coach._id, name: personName(t.coach), email: t.coach.email } : null,
      coCoaches: (t.coCoaches || []).length,
    }));
  }

  /** One team: coaches, co-coaches, and every competition it entered. */
  async detail(teamId) {
    const team = await this._team(teamId, { includeDeleted: true });
    const coachIds = [team.coach, ...(team.coCoaches || [])].filter(Boolean);
    const coaches = await this.Coach.find({ _id: { $in: coachIds } }, { firstName: 1, lastName: 1, email: 1, team: 1 }).lean();
    const byId = new Map(coaches.map((c) => [String(c._id), c]));
    const meets = await this.Competition.find(
      { 'registeredTeams.team': team._id, isDeleted: { $ne: true } },
      { name: 1, level: 1, endDate: 1, startDate: 1, 'registeredTeams.$': 1 }
    ).sort({ startDate: -1 }).lean();
    const card = (id) => { const c = byId.get(String(id)); return c ? { _id: c._id, name: personName(c), email: c.email } : { _id: id, name: 'Unknown coach', email: null }; };
    return {
      _id: team._id, name: team.name, isActive: team.isActive !== false,
      coach: team.coach ? card(team.coach) : null,
      coCoaches: (team.coCoaches || []).map(card),
      competitions: meets.map((m) => {
        const reg = (m.registeredTeams || [])[0] || {};
        return {
          _id: m._id, name: m.name, level: m.level, finished: isCompetitionLocked(m),
          isSubmitted: !!reg.isSubmitted, paymentStatus: reg.paymentStatus || null,
          players: (reg.players || []).length,
        };
      }),
    };
  }

  // ── Rename / delete / restore ─────────────────────────────────────────

  async update(actor, teamId, { name, reason } = {}) {
    const why = requireReason(reason);
    const team = await this._team(teamId);
    const next = String(name || '').trim();
    if (next.length < 2) throw new ValidationError('Team name must be at least 2 characters');
    if (next === team.name) throw new ValidationError('Nothing to change');
    if (await this.Team.exists({ _id: { $ne: team._id }, coach: team.coach, name: next })) {
      throw new ConflictError('This coach already has a team with that name');
    }
    await this.Team.updateOne({ _id: team._id }, { $set: { name: next } });
    await this.corrections.record({
      actor, entity: 'team', entityId: team._id, action: 'TEAM_UPDATED', label: next, reason: why,
      before: { name: team.name }, after: { name: next }, undoable: true,
    });
    return this.detail(team._id);
  }

  async setDeleted(actor, teamId, { deleted, reason } = {}) {
    const why = requireReason(reason);
    const team = await this._team(teamId, { includeDeleted: true });
    const active = !deleted;
    if ((team.isActive !== false) === active) throw new BusinessRuleError(active ? 'This team is not deleted' : 'This team is already deleted');
    await this.Team.updateOne({ _id: team._id }, { $set: { isActive: active } });
    await this.corrections.record({
      actor, entity: 'team', entityId: team._id, action: active ? 'TEAM_RESTORED' : 'TEAM_DELETED', label: team.name, reason: why,
    });
    return this.detail(team._id);
  }

  // ── Change coach / co-coaches (D5) ────────────────────────────────────

  /**
   * @param {Object} body
   * @param {string} body.coachId       the new main coach
   * @param {'cocoach'|'remove'} body.oldCoach  what happens to the current one
   */
  async changeCoach(actor, teamId, { coachId, oldCoach = 'cocoach', reason } = {}) {
    const why = requireReason(reason);
    if (!['cocoach', 'remove'].includes(oldCoach)) throw new ValidationError('Choose whether the old coach stays as co-coach or is removed');
    const team = await this._team(teamId);
    const next = await this._coach(coachId);
    if (same(team.coach, next._id)) throw new BusinessRuleError(`${personName(next)} already coaches ${team.name}`);
    if (next.isActive === false) throw new BusinessRuleError(`${personName(next)}'s account is deactivated`);
    if (await this.Team.exists({ _id: { $ne: team._id }, coach: next._id, name: team.name })) {
      throw new ConflictError(`${personName(next)} already has a team called ${team.name}`);
    }
    const previous = team.coach ? await this.Coach.findById(team.coach, { firstName: 1, lastName: 1, team: 1 }).lean() : null;

    const coCoaches = (team.coCoaches || []).filter((c) => !same(c, next._id) && !same(c, team.coach));
    if (oldCoach === 'cocoach' && team.coach) coCoaches.push(team.coach);
    await this.Team.updateOne({ _id: team._id }, { $set: { coach: next._id, coCoaches } });

    // Every entry of this team, in every competition, follows the team.
    const moved = await this.Competition.updateMany(
      { 'registeredTeams.team': team._id },
      { $set: { 'registeredTeams.$[r].coach': next._id } },
      { arrayFilters: [{ 'r.team': team._id }] }
    );
    // Open paper-form drafts for this team's meets move with it.
    try {
      const meetIds = (await this.Competition.find({ 'registeredTeams.team': team._id }, { _id: 1 }).lean()).map((m) => m._id);
      if (previous && meetIds.length) {
        await mongoose.model('WalkInRegistration').updateMany(
          { coach: previous._id, competition: { $in: meetIds }, status: { $in: ['draft', 'submitted'] } },
          { $set: { coach: next._id } }
        );
      }
    } catch (error) {
      this.logger?.warn?.('Paper-form drafts not moved with the team', { error: error.message });
    }

    if (!next.team) await this.Coach.updateOne({ _id: next._id }, { $set: { team: team._id } });
    if (previous && same(previous.team, team._id)) {
      const other = await this.Team.findOne({ coach: previous._id, isActive: { $ne: false } }, { _id: 1 }).lean();
      await this.Coach.updateOne({ _id: previous._id }, { $set: { team: other?._id || null } });
    }

    await this.corrections.record({
      actor, entity: 'team', entityId: team._id, action: 'TEAM_COACH_CHANGED', label: team.name, reason: why,
      before: { coach: previous ? personName(previous) : null, coCoaches: (team.coCoaches || []).length },
      after: { coach: personName(next), coCoaches: coCoaches.length },
      extra: {
        oldCoach: previous ? String(previous._id) : null, newCoach: String(next._id),
        oldCoachKept: oldCoach === 'cocoach', competitions: moved?.modifiedCount ?? null,
      },
    });
    return this.detail(team._id);
  }

  /**
   * Remove a co-coach. The Super Admin may remove anyone; a coach only from
   * the team they lead (never from a team they merely co-coach).
   */
  async removeCoCoach(actor, teamId, coCoachId, { reason, byCoach = false } = {}) {
    const team = await this._team(teamId);
    if (byCoach && !same(team.coach, actor.id)) throw new BusinessRuleError('Only the team\'s main coach can remove a co-coach');
    const why = byCoach ? (String(reason || '').trim() || 'Removed by the main coach') : requireReason(reason);
    if (!(team.coCoaches || []).some((c) => same(c, coCoachId))) throw new NotFoundError('Co-coach');
    await this.Team.updateOne({ _id: team._id }, { $pull: { coCoaches: oid(coCoachId) } });
    const removed = await this.Coach.findById(coCoachId, { firstName: 1, lastName: 1 }).lean();
    await this.corrections.record({
      actor: byCoach ? { id: actor.id, name: actor.name || 'Main coach' } : actor,
      entity: 'team', entityId: team._id, action: 'TEAM_COCOACH_REMOVED', label: team.name, reason: why,
      extra: { coCoach: String(coCoachId), coCoachName: personName(removed), byCoach },
    });
    return this.detail(team._id);
  }

  /**
   * The coach's own view: every team they lead with its co-coaches, or the
   * team they co-coach (read-only for them).
   */
  async coCoachesFor(coachId, coCoachOf = null) {
    const teams = coCoachOf
      ? await this.Team.find({ _id: coCoachOf }).lean()
      : await this.Team.find({ coach: coachId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    const ids = teams.flatMap((t) => [t.coach, ...(t.coCoaches || [])]);
    const people = await this.Coach.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1, email: 1 }).lean();
    const byId = new Map(people.map((p) => [String(p._id), p]));
    const card = (id) => ({ _id: id, name: personName(byId.get(String(id))), email: byId.get(String(id))?.email || null });
    return {
      isMain: !coCoachOf,
      teams: teams.map((t) => ({ _id: t._id, name: t.name, mainCoach: card(t.coach), coCoaches: (t.coCoaches || []).map(card) })),
    };
  }

  /** A main coach removes a co-coach from whichever of their teams has them. */
  async removeOwnCoCoach(coach, coCoachId, reason) {
    const team = await this.Team.findOne({ coach: coach.id, coCoaches: oid(coCoachId), isActive: { $ne: false } }, { _id: 1 }).lean();
    if (!team) throw new NotFoundError('Co-coach');
    await this.removeCoCoach(coach, team._id, coCoachId, { reason, byCoach: true });
    return this.coCoachesFor(coach.id, null);
  }

  // ── Transfer a player (D4) ────────────────────────────────────────────

  /**
   * What a transfer would touch, for the confirmation screen.
   * @returns {{player, level, from, to, competitions: Array}}
   */
  async previewTransfer({ playerId, toTeamId, level }) {
    const { player, from, to } = await this._transferParties(playerId, toTeamId, level);
    const meets = await this._levelMeets(player._id, level);
    return {
      player: { _id: player._id, name: personName(player), loginId: player.loginId || null },
      level, levelLabel: levelLabel(level),
      from: from ? { _id: from._id, name: from.name } : null,
      to: { _id: to._id, name: to.name },
      competitions: meets.map((m) => {
        const entry = this._entryOf(m, player._id);
        const target = (m.registeredTeams || []).find((rt) => same(rt.team, to._id));
        return {
          _id: m._id, name: m.name, finished: isCompetitionLocked(m),
          enteredFor: entry ? { team: idOf(entry.reg.team), ageGroup: entry.entry.ageGroup, gender: entry.entry.gender } : null,
          targetEntered: !!target,
          targetHasRoom: entry ? hasRoomInSquad(m.maxTeamSize, target?.players || [], entry.entry.gender, entry.entry.ageGroup) : true,
        };
      }).filter((c) => c.enteredFor && from && same(c.enteredFor.team, from._id)),
    };
  }

  async _transferParties(playerId, toTeamId, level) {
    if (!mongoose.isValidObjectId(playerId)) throw new ValidationError('Invalid player id');
    const player = await this.Player.findById(playerId).lean();
    if (!player) throw new NotFoundError('Player');
    const to = await this._team(toTeamId);
    if (!level) throw new ValidationError('Choose a competition level');
    const currentId = teamAtLevel(player, level) || (player.levelTeams?.length ? null : idOf(player.team));
    const from = currentId ? await this.Team.findById(currentId).lean() : null;
    if (from && same(from._id, to._id)) throw new BusinessRuleError(`${personName(player)} is already with ${to.name} for ${levelLabel(level)}`);
    return { player, from, to };
  }

  /** Competitions at this level the player is entered in, newest first. */
  async _levelMeets(playerId, level) {
    return this.Competition.find(
      { level, 'registeredTeams.players.player': oid(playerId), isDeleted: { $ne: true } },
      { name: 1, level: 1, endDate: 1, startDate: 1, maxTeamSize: 1, registeredTeams: 1 }
    ).sort({ startDate: -1 }).lean();
  }

  _entryOf(meet, playerId) {
    for (const reg of meet.registeredTeams || []) {
      const entry = (reg.players || []).find((p) => same(p.player, playerId));
      if (entry) return { reg, entry };
    }
    return null;
  }

  /**
   * Move the player, in one step.
   * @param {Object} body
   * @param {string} body.playerId
   * @param {string} body.toTeamId
   * @param {string} body.level
   * @param {string[]} [body.competitionIds]  which entries move (default: all at this level)
   * @param {boolean} [body.overrideLimit]    allow a full squad
   */
  async transfer(actor, { playerId, toTeamId, level, competitionIds, overrideLimit = false, reason } = {}) {
    const why = requireReason(reason);
    const { player, from, to } = await this._transferParties(playerId, toTeamId, level);
    const preview = await this.previewTransfer({ playerId, toTeamId, level });
    const chosen = Array.isArray(competitionIds) ? new Set(competitionIds.map(String)) : null;
    const plan = preview.competitions.filter((c) => !chosen || chosen.has(String(c._id)));

    const full = plan.filter((c) => !c.targetHasRoom);
    if (full.length && !overrideLimit) {
      throw new BusinessRuleError(
        `${to.name}'s squad is full in ${full.map((c) => c.name).join(', ')}. Tick "allow a full squad" to move anyway.`,
        { reason: 'SQUAD_FULL', competitions: full.map((c) => ({ _id: c._id, name: c.name })) }
      );
    }

    const moved = [];
    for (const c of plan) {
      const meet = await this.Competition.findById(c._id).lean();
      const found = this._entryOf(meet, player._id);
      if (!found || !from || !same(found.reg.team, from._id)) continue;
      const { reg: oldReg, entry } = found;

      // The new team's registration in this meet, created if it has none;
      // it carries the old registration's submission, since the fee for this
      // athlete was settled there.
      let target = (meet.registeredTeams || []).find((rt) => same(rt.team, to._id));
      if (!target) {
        await this.Competition.updateOne(
          { _id: meet._id, 'registeredTeams.team': { $ne: to._id } },
          { $push: { registeredTeams: { team: to._id, coach: to.coach, players: [], isSubmitted: !!oldReg.isSubmitted, paymentStatus: oldReg.isSubmitted ? 'completed' : 'pending', isActive: true } } }
        );
        target = { created: true };
      }

      await this.competitions.removePlayerFromRegistration(meet._id, from._id, player._id);
      const { _id: _entryId, ...carried } = entry;
      await this.competitions.addPlayerToRegistration(meet._id, to._id, { ...carried, player: player._id });
      const scores = await this._rehomeScores(meet._id, from._id, to._id, player._id);
      moved.push({ competition: String(meet._id), name: meet.name, createdRegistration: !!target.created, scoresMoved: scores });
      if (scores) await this._recomputeFinals(meet._id);
    }

    // The team at this level, through the same correction the Players page uses.
    if (from) {
      await this.playerTeams.correct({ id: actor.id, type: 'superadmin' }, player._id, { level, teamId: to._id, reason: `Transfer: ${why}` })
        .catch((error) => {
          // Entries left behind on purpose (unticked meets) still block it.
          if (error?.details?.reason !== 'ENTERED_FOR_OLD_TEAM') throw error;
        });
    } else {
      await this.playerTeams.correct({ id: actor.id, type: 'superadmin' }, player._id, { level, teamId: to._id, reason: `Transfer: ${why}` });
    }

    await this.corrections.record({
      actor, entity: 'player', entityId: player._id, action: 'PLAYER_TRANSFERRED', label: personName(player), reason: why,
      before: { team: from?.name || null }, after: { team: to.name },
      extra: { level, from: idOf(from?._id), to: String(to._id), moved },
    });
    return { player: { _id: player._id, name: personName(player) }, from: from?.name || null, to: to.name, moved };
  }

  /**
   * Move this athlete's score rows from the old team's score sheets to the
   * new team's, one sheet per competition type / category, creating the new
   * team's sheet when it has none.
   * @returns {number} rows moved
   */
  async _rehomeScores(competitionId, fromTeamId, toTeamId, playerId) {
    const Score = this.Score;
    const sheets = await Score.find({ competition: competitionId, teamId: fromTeamId, 'playerScores.playerId': oid(playerId) }).lean();
    let count = 0;
    for (const sheet of sheets) {
      const rows = (sheet.playerScores || []).filter((r) => same(r.playerId, playerId));
      if (!rows.length) continue;
      const key = { competition: sheet.competition, teamId: oid(toTeamId), gender: sheet.gender, ageGroup: sheet.ageGroup, competitionType: sheet.competitionType };
      const exists = await Score.collection.findOne(key, { projection: { _id: 1 } });
      if (exists) {
        await Score.collection.updateOne({ _id: exists._id }, { $push: { playerScores: { $each: rows } } });
      } else {
        const { _id, __v, playerScores: _rows, createdAt: _c, updatedAt: _u, ...rest } = sheet;
        await Score.collection.insertOne({ ...rest, ...key, playerScores: rows, createdAt: new Date(), updatedAt: new Date() });
      }
      await Score.collection.updateOne({ _id: sheet._id }, { $pull: { playerScores: { playerId: oid(playerId) } } });
      count += rows.length;
    }
    return count;
  }

  async _recomputeFinals(competitionId) {
    try {
      const q = this._qualification;
      if (q?.recomputeAll) await q.recomputeAll(competitionId);
    } catch (error) {
      this.logger?.warn?.('Finals not recomputed after a transfer', { competitionId: String(competitionId), error: error.message });
    }
  }

  /** Undo for a rename: the same update with the old name. */
  async undoFields(actor, teamId, values, reason) {
    if (values.name === undefined) throw new BusinessRuleError('Only a rename can be undone from History');
    return this.update(actor, teamId, { name: values.name, reason });
  }
}

module.exports = TeamAdminService;
