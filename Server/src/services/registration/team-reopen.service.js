/**
 * Reopening a submitted team — one rule for every screen that does it
 * (Super Admin → Fix → Entries, and the walk-in desk).
 *
 * A team that has PAID gets everyone in its squad written into `paidEntries`
 * in the same update that reopens it, so when it is submitted again only the
 * players added after this are charged (owner, 2026-11-17). Players removed
 * later are never refunded (owner, 2026-11-18). The late fee is per player,
 * so it too falls only on the new ones.
 *
 * @module services/registration/team-reopen.service
 */

const { ConflictError, NotFoundError } = require('../../errors');
const { paidEntriesAfterPayment } = require('../../config/payment.config');

const same = (a, b) => Boolean(a) && Boolean(b) && String(a?._id || a) === String(b?._id || b);

/**
 * The registration fields that reopen `reg`. Used by Fix (inside its own
 * status edit) and by `reopenTeam` below, so both stamp paid players the same way.
 * @param {Object} reg   the registeredTeams entry
 * @param {Object} meet  the competition (fees, deadline)
 * @returns {{isSubmitted: false, paidEntries?: Array}}
 */
function reopenFields(reg, meet) {
  const fields = { isSubmitted: false };
  if (reg.paymentStatus === 'completed') {
    fields.paidEntries = paidEntriesAfterPayment(reg.players || [], reg.paidEntries || [], meet, reg.submittedAt || new Date());
  }
  return fields;
}

class TeamReopenService {
  constructor({ competitionRepository, correctionService, teamRepository, logger }) {
    this.competitions = competitionRepository;
    this.corrections = correctionService;
    this.teams = teamRepository;
    this.logger = logger;
  }

  /**
   * Reopen the team `coachId` entered in `meet`. The caller has already
   * checked who may do this and that the meet is not frozen.
   *
   * @param {{id: string, type: 'admin'|'superadmin', name?: string}} actor
   * @param {{meet: Object, coachId: string, reason: string, via: string}} args
   * @returns {Promise<{paidPlayers: number, paidAmount: number|null}>}
   */
  async reopenTeam(actor, { meet, coachId, reason, via }) {
    const reg = (meet.registeredTeams || []).find((r) => same(r.coach, coachId));
    if (!reg) throw new NotFoundError('This team has no entry in this competition');
    if (!reg.isSubmitted) throw new ConflictError('This team is not submitted — it is already open.', { reason: 'NOT_SUBMITTED' });

    const fields = reopenFields(reg, meet);
    await this.competitions.updateRegistrationFields(meet._id, reg.team, fields);
    const team = this.teams ? await this.teams.findById(reg.team, { select: 'name' }) : null;
    const paidPlayers = (fields.paidEntries || reg.paidEntries || []).length;
    await this.corrections?.record({
      actor,
      entity: 'entry',
      entityId: reg.team,
      action: 'ENTRY_REOPENED',
      label: team?.name,
      reason,
      competitionId: meet._id,
      before: { isSubmitted: true },
      after: { isSubmitted: false },
      extra: { via, paidPlayers, paymentStatus: reg.paymentStatus || null },
    });
    this.logger?.info?.('Team reopened', { competition: String(meet._id), team: String(reg.team), via, paidPlayers });
    return { paidPlayers, paidAmount: reg.paymentAmount ?? null };
  }
}

module.exports = TeamReopenService;
module.exports.reopenFields = reopenFields;
