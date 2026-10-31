/**
 * Phase 6 of docs/superadmin-control-plan.md: a team's entry in a
 * competition, and money recorded by hand.
 *
 *  - add an athlete to a squad, remove one, change their age group, gender
 *    or apparatus. The COP age rule and the team-size limit apply; the owner
 *    may override either with a reason, and the override is in History;
 *  - correct a registration's submission / payment status;
 *  - record a manual (cash, bank) payment or a refund as a ledger line. It
 *    never talks to Razorpay: it records money that moved elsewhere.
 *
 * Writes go BY TEAM through arrayFilters (competitionRepository), never by
 * position. Every change is recorded with a reason.
 *
 * @module services/superadmin/entries-admin.service
 */

const mongoose = require('mongoose');
const { ValidationError, NotFoundError, BusinessRuleError } = require('../../errors');
const { requireReason } = require('./correction.service');
const { checkAgeGroup, groupLabel } = require('../../utils/data/age-eligibility.util');
const { hasRoomInSquad } = require('../../utils/scoring/team-championship.util');
const { toCanonicalApparatus } = require('../../utils/data/apparatus.util');
const { AGE_GROUPS, GENDERS, APPARATUS } = require('../../config/cop-rules');

const same = (a, b) => String(a?._id || a) === String(b?._id || b);
const personName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Athlete';
const oid = (v) => new mongoose.Types.ObjectId(String(v));

class EntriesAdminService {
  constructor({ correctionService, competitionRepository, transactionRepository, logger }) {
    this.corrections = correctionService;
    this.competitions = competitionRepository;
    this.transactions = transactionRepository;
    this.logger = logger;
  }

  get Competition() { return this.competitions.model; }
  get Player() { return mongoose.model('Player'); }
  get Team() { return mongoose.model('Team'); }

  async _meet(competitionId) {
    if (!mongoose.isValidObjectId(competitionId)) throw new ValidationError('Invalid competition id');
    const meet = await this.Competition.findOne({ _id: competitionId, isDeleted: { $ne: true } }).lean();
    if (!meet) throw new NotFoundError('Competition');
    return meet;
  }

  _registration(meet, teamId) {
    const reg = (meet.registeredTeams || []).find((r) => same(r.team, teamId));
    if (!reg) throw new NotFoundError('This team has no entry in this competition');
    return reg;
  }

  /** Teams entered in a meet, for the picker. */
  async teams(competitionId) {
    const meet = await this._meet(competitionId);
    const ids = (meet.registeredTeams || []).map((r) => r.team);
    const teams = await this.Team.find({ _id: { $in: ids } }, { name: 1 }).lean();
    const byId = new Map(teams.map((t) => [String(t._id), t.name]));
    return (meet.registeredTeams || []).map((r) => ({
      _id: r.team, name: byId.get(String(r.team)) || 'Unknown team', players: (r.players || []).length,
      isSubmitted: !!r.isSubmitted, paymentStatus: r.paymentStatus || null,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** One team's entry with every athlete, and what the meet allows. */
  async entry(competitionId, teamId) {
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    const players = await this.Player.find({ _id: { $in: (reg.players || []).map((p) => p.player) } }, { firstName: 1, lastName: 1, loginId: 1, dateOfBirth: 1 }).lean();
    const byId = new Map(players.map((p) => [String(p._id), p]));
    const scored = new Set((await mongoose.model('Score').find(
      { competition: meet._id, teamId: oid(teamId) }, { 'playerScores.playerId': 1 }
    ).lean()).flatMap((s) => (s.playerScores || []).map((r) => String(r.playerId))));
    const team = await this.Team.findById(teamId, { name: 1 }).lean();
    const transactions = await mongoose.model('Transaction').find({ competition: meet._id, team: oid(teamId) }).sort({ createdAt: -1 }).limit(50).lean();
    return {
      competition: {
        _id: meet._id, name: meet.name, maxTeamSize: meet.maxTeamSize || null,
        competitionTypes: meet.competitionTypes || [], ageGroups: meet.ageGroups || [],
        apparatusByGender: meet.apparatusByGender || null, playerFee: meet.playerFee ?? null,
      },
      team: { _id: teamId, name: team?.name || 'Unknown team' },
      isSubmitted: !!reg.isSubmitted, paymentStatus: reg.paymentStatus || null, paymentAmount: reg.paymentAmount ?? null,
      players: (reg.players || []).map((p) => {
        const person = byId.get(String(p.player));
        const age = checkAgeGroup({ dateOfBirth: person?.dateOfBirth, gender: p.gender, ageGroup: p.ageGroup, competition: meet });
        return {
          player: p.player, name: personName(person), loginId: person?.loginId || null,
          gender: p.gender, ageGroup: p.ageGroup, apparatus: toCanonicalApparatus(p.apparatus, meet.competitionTypes),
          ageOk: age.ok, scored: scored.has(String(p.player)),
        };
      }),
      transactions: transactions.map((t) => ({
        _id: t._id, at: t.createdAt, source: t.source, type: t.type, amount: t.amount, paymentStatus: t.paymentStatus,
        description: t.description || null, kind: t.metadata?.kind || null,
      })),
    };
  }

  _validEntry(meet, { gender, ageGroup, apparatus }) {
    if (!GENDERS.includes(gender)) throw new ValidationError('Choose Male or Female');
    if (!AGE_GROUPS.includes(ageGroup)) throw new ValidationError('Choose an age group');
    if ((meet.ageGroups || []).length && !(meet.ageGroups || []).some((g) => g.gender === gender && g.ageGroup === ageGroup)) {
      throw new ValidationError(`${groupLabel(ageGroup)} (${gender}) is not run at this competition`);
    }
    const canonical = toCanonicalApparatus(apparatus, meet.competitionTypes);
    for (const list of Object.values(canonical)) {
      for (const name of list) if (!APPARATUS.includes(name)) throw new ValidationError(`Unknown apparatus: ${name}`);
    }
    return canonical;
  }

  _checkAge(player, meet, gender, ageGroup, overrideAge) {
    const age = checkAgeGroup({ dateOfBirth: player.dateOfBirth, gender, ageGroup, competition: meet });
    if (age.ok) return null;
    if (!overrideAge) {
      throw new BusinessRuleError(
        `${personName(player)} is ${age.age} on 31 Dec ${age.cutoffYear}, too old for ${groupLabel(ageGroup)}. Tick "allow outside the age rule" to enter anyway.`,
        { reason: 'AGE_GROUP_NOT_ALLOWED' }
      );
    }
    return `age ${age.age} entered in ${groupLabel(ageGroup)} by override`;
  }

  async addPlayer(actor, competitionId, teamId, body = {}) {
    const why = requireReason(body.reason);
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    if (!mongoose.isValidObjectId(body.playerId)) throw new ValidationError('Choose a player');
    const player = await this.Player.findById(body.playerId).lean();
    if (!player) throw new NotFoundError('Player');
    const elsewhere = (meet.registeredTeams || []).find((r) => (r.players || []).some((p) => same(p.player, player._id)));
    if (elsewhere) throw new BusinessRuleError(`${personName(player)} is already entered in this competition${same(elsewhere.team, teamId) ? '' : ' for another team'}. Use "Move a player" to change teams.`);
    const apparatus = this._validEntry(meet, body);
    const ageNote = this._checkAge(player, meet, body.gender, body.ageGroup, body.overrideAge);
    const full = !hasRoomInSquad(meet.maxTeamSize, reg.players || [], body.gender, body.ageGroup);
    if (full && !body.overrideLimit) {
      throw new BusinessRuleError(`The ${body.gender} ${groupLabel(body.ageGroup)} squad is full (${meet.maxTeamSize}). Tick "allow a full squad" to add anyway.`, { reason: 'SQUAD_FULL' });
    }
    const ok = await this.competitions.addPlayerToRegistration(meet._id, teamId, { player: player._id, gender: body.gender, ageGroup: body.ageGroup, apparatus });
    if (!ok) throw new NotFoundError('This team has no entry in this competition');
    await this.corrections.record({
      actor, entity: 'entry', entityId: player._id, action: 'ENTRY_PLAYER_ADDED', label: personName(player), reason: why, competitionId: meet._id,
      after: { team: String(teamId), gender: body.gender, ageGroup: body.ageGroup, apparatus },
      extra: { overrides: [ageNote, full ? 'squad over the limit by override' : null].filter(Boolean) },
    });
    return this.entry(meet._id, teamId);
  }

  async removePlayer(actor, competitionId, teamId, playerId, body = {}) {
    const why = requireReason(body.reason);
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    const entry = (reg.players || []).find((p) => same(p.player, playerId));
    if (!entry) throw new NotFoundError('Squad entry');
    const scored = await mongoose.model('Score').exists({ competition: meet._id, teamId: oid(teamId), 'playerScores.playerId': oid(playerId) });
    if (scored) throw new BusinessRuleError('This athlete already has scores here. Correct the score, or move them with "Move a player".');
    await this.competitions.removePlayerFromRegistration(meet._id, teamId, playerId);
    const player = await this.Player.findById(playerId, { firstName: 1, lastName: 1 }).lean();
    await this.corrections.record({
      actor, entity: 'entry', entityId: playerId, action: 'ENTRY_PLAYER_REMOVED', label: personName(player), reason: why, competitionId: meet._id,
      before: { team: String(teamId), gender: entry.gender, ageGroup: entry.ageGroup, apparatus: entry.apparatus },
    });
    return this.entry(meet._id, teamId);
  }

  async updatePlayer(actor, competitionId, teamId, playerId, body = {}) {
    const why = requireReason(body.reason);
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    const entry = (reg.players || []).find((p) => same(p.player, playerId));
    if (!entry) throw new NotFoundError('Squad entry');
    const next = {
      gender: body.gender ?? entry.gender,
      ageGroup: body.ageGroup ?? entry.ageGroup,
      apparatus: body.apparatus ?? entry.apparatus,
    };
    const apparatus = this._validEntry(meet, next);
    const player = await this.Player.findById(playerId).lean();
    if (!player) throw new NotFoundError('Player');
    const moved = next.gender !== entry.gender || next.ageGroup !== entry.ageGroup;
    let ageNote = null;
    if (moved) {
      ageNote = this._checkAge(player, meet, next.gender, next.ageGroup, body.overrideAge);
      const scored = await mongoose.model('Score').exists({ competition: meet._id, teamId: oid(teamId), 'playerScores.playerId': oid(playerId) });
      if (scored) throw new BusinessRuleError('This athlete already has scores in their current age group; their category cannot change now.');
      if (!hasRoomInSquad(meet.maxTeamSize, reg.players || [], next.gender, next.ageGroup, playerId) && !body.overrideLimit) {
        throw new BusinessRuleError(`The ${next.gender} ${groupLabel(next.ageGroup)} squad is full. Tick "allow a full squad" to move anyway.`, { reason: 'SQUAD_FULL' });
      }
    }
    await this.competitions.updatePlayerInRegistration(meet._id, teamId, playerId, { gender: next.gender, ageGroup: next.ageGroup, apparatus });
    await this.corrections.record({
      actor, entity: 'entry', entityId: playerId, action: 'ENTRY_PLAYER_UPDATED', label: personName(player), reason: why, competitionId: meet._id,
      before: { gender: entry.gender, ageGroup: entry.ageGroup, apparatus: toCanonicalApparatus(entry.apparatus, meet.competitionTypes) },
      after: { gender: next.gender, ageGroup: next.ageGroup, apparatus },
      extra: { team: String(teamId), overrides: [ageNote].filter(Boolean) },
    });
    return this.entry(meet._id, teamId);
  }

  /** Correct a registration's submitted / payment status. */
  async setStatus(actor, competitionId, teamId, body = {}) {
    const why = requireReason(body.reason);
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    const fields = {};
    if (body.isSubmitted !== undefined) {
      fields.isSubmitted = body.isSubmitted === true || body.isSubmitted === 'true';
      if (fields.isSubmitted && !reg.submittedAt) fields.submittedAt = new Date();
    }
    if (body.paymentStatus !== undefined) {
      if (!['pending', 'completed', 'failed'].includes(body.paymentStatus)) throw new ValidationError('Payment status is pending, completed or failed');
      fields.paymentStatus = body.paymentStatus;
    }
    if (!Object.keys(fields).length) throw new ValidationError('Nothing to change');
    await this.competitions.updateRegistrationFields(meet._id, teamId, fields);
    const team = await this.Team.findById(teamId, { name: 1 }).lean();
    await this.corrections.record({
      actor, entity: 'entry', entityId: teamId, action: 'ENTRY_STATUS_UPDATED', label: team?.name, reason: why, competitionId: meet._id,
      before: { isSubmitted: !!reg.isSubmitted, paymentStatus: reg.paymentStatus || null },
      after: { isSubmitted: fields.isSubmitted ?? !!reg.isSubmitted, paymentStatus: fields.paymentStatus ?? reg.paymentStatus ?? null },
    });
    return this.entry(meet._id, teamId);
  }

  /**
   * A ledger line for money that moved outside the app. A refund is stored as
   * a NEGATIVE amount so every total nets it out.
   * @param {Object} body
   * @param {'payment'|'refund'} body.kind
   * @param {number} body.amount  rupees, positive
   * @param {string} [body.method] cash, bank transfer, UPI…
   * @param {string} [body.note]
   */
  async recordMoney(actor, competitionId, teamId, body = {}) {
    const why = requireReason(body.reason);
    const meet = await this._meet(competitionId);
    const reg = this._registration(meet, teamId);
    const kind = body.kind === 'refund' ? 'refund' : body.kind === 'payment' ? 'payment' : null;
    if (!kind) throw new ValidationError('Choose payment or refund');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new ValidationError('Enter an amount in rupees');
    const team = await this.Team.findById(teamId, { name: 1 }).lean();
    const method = String(body.method || 'cash').trim().slice(0, 40);
    const created = await this.transactions.create({
      competition: meet._id, team: oid(teamId), coach: reg.coach, admin: oid(actor.id), recordedBy: oid(actor.id),
      source: 'superadmin', type: 'other', amount: kind === 'refund' ? -amount : amount, paymentStatus: 'completed',
      description: `${kind === 'refund' ? 'Refund to' : 'Manual payment from'} ${team?.name || 'team'} (${method}) — recorded by the Super Admin`,
      metadata: { kind: kind === 'refund' ? 'refund' : 'manual_payment', method, note: String(body.note || '').slice(0, 300), reason: why },
    });
    await this.corrections.record({
      actor, entity: 'payment', entityId: created?._id || teamId, action: kind === 'refund' ? 'REFUND_RECORDED' : 'PAYMENT_RECORDED',
      label: team?.name, reason: why, competitionId: meet._id,
      after: { amount: kind === 'refund' ? -amount : amount, method },
    });
    return this.entry(meet._id, teamId);
  }
}

module.exports = EntriesAdminService;
