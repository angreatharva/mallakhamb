/**
 * A player's team at each competition level — the ONE place it is written.
 *
 * The rule (owner, 2026-10-28; docs/team-per-level-plan.md):
 *  - a player's team is final at each level (District, State, National,
 *    International, DSO, University), forever;
 *  - it is set when the player joins a team, or a coach / the desk / a Super
 *    Admin registers them onto a team for a competition at that level;
 *  - nobody takes a player another team holds at a level — not a coach, not an
 *    Admin at the desk. Only a Super Admin corrects a mistake;
 *  - when someone other than the player sets a team at a NEW level, the player
 *    (or guardian) and the coaches who hold them at other levels are emailed.
 *
 * Every path that joins, registers or enters a player calls this service:
 * player join-team, coach add-to-team, Register Player, Super Admin Add
 * Player, admin assign, the walk-in desk, and squad entry.
 *
 * @module services/team/player-team.service
 */

const { ConflictError, NotFoundError, BusinessRuleError } = require('../../errors');
const { levelLabel, teamAtLevel, standingAt } = require('../../utils/data/player-team.util');

const mongoose = require('mongoose');

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;

/** A loaded player document (not an id — an ObjectId has an `_id` too). */
const isDoc = (value) => Boolean(value) && typeof value === 'object'
  && !(value instanceof mongoose.Types.ObjectId) && Boolean(value._id);

class PlayerTeamService {
  constructor({ playerRepository, teamRepository, auditLogRepository = null, otpService = null, logger }) {
    this.playerRepository = playerRepository;
    this.teamRepository = teamRepository;
    this.auditLogRepository = auditLogRepository;
    this.otpService = otpService;
    this.logger = logger;
  }

  /** @private */
  async _teamName(teamId) {
    if (!teamId) return 'another team';
    const team = await this.teamRepository.findById(teamId, { select: 'name' });
    return team?.name || 'another team';
  }

  /**
   * The refusal every path gives when another team holds the level.
   * @private
   */
  async _heldElsewhere(player, level, holderId) {
    const name = [player.firstName, player.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'");
    const teamName = await this._teamName(holderId);
    return new ConflictError(
      `${name} is registered with ${teamName} for ${levelLabel(level)}. A player's team is final for each level; only the Super Admin can correct it.`,
      { reason: 'TEAM_FINAL_AT_LEVEL', level, team: { _id: holderId, name: teamName }, player: idOf(player) }
    );
  }

  /**
   * Make `teamId` the player's team at `level`. Does nothing when it already
   * is; refuses (409 TEAM_FINAL_AT_LEVEL) when another team is.
   *
   * @param {Object} args
   * @param {Object|string} args.player   a player document, or an id
   * @param {string} args.teamId
   * @param {string} args.level
   * @param {{id: *, type: 'player'|'coach'|'admin'|'superadmin'|'system'}} args.actor
   * @param {string} [args.via]            which path, for the record ('join-team', 'squad-entry', …)
   * @returns {Promise<{created: boolean, player: Object}>}
   */
  async setTeamAtLevel({ player, teamId, level, actor, via = null }) {
    let doc = isDoc(player) ? player : await this.playerRepository.findById(player);
    if (!doc) throw new NotFoundError('Player');
    if (!level) throw new BusinessRuleError('The competition level is missing');

    const holder = teamAtLevel(doc, level);
    if (holder) {
      if (holder === idOf(teamId)) return { created: false, player: doc };
      throw await this._heldElsewhere(doc, level, holder);
    }

    const created = await this.playerRepository.setTeamAtLevel(doc._id, {
      level,
      team: teamId,
      setBy: actor?.id || null,
      setByType: actor?.type || 'system',
      via,
    });
    const fresh = await this.playerRepository.findById(doc._id);
    if (!created) {
      // Someone else set this level between our read and our write.
      const winner = teamAtLevel(fresh, level);
      if (winner === idOf(teamId)) return { created: false, player: fresh };
      throw await this._heldElsewhere(fresh, level, winner);
    }

    await this._audit(actor, 'PLAYER_TEAM_SET', doc._id, { level, team: idOf(teamId), via });
    if (actor?.type && actor.type !== 'player') await this._notify(fresh, teamId, level);
    return { created: true, player: fresh };
  }

  /**
   * Before a team enters (or registers) a player at a competition of `level`:
   * the team must hold the player there, or the level must be free and the
   * player on the team's roster — in which case the level is set now.
   *
   * @param {Object} args  as setTeamAtLevel, plus
   * @param {boolean} [args.claim=false]  the desk/coach matched this child by
   *   name and birth date and chose to reuse their Player ID: a player who is
   *   not on this team's roster may then be taken at a level they have no team at
   * @returns {Promise<{created: boolean, player: Object}>}
   */
  async ensureForEntry({ player, teamId, level, actor, via = 'squad-entry', claim = false }) {
    const doc = isDoc(player) ? player : await this.playerRepository.findById(player);
    if (!doc) throw new NotFoundError('Player');
    if (!level) return { created: false, player: doc }; // a meet saved without a level: nothing to hold

    const standing = standingAt(doc, teamId, level);
    if (standing === 'held') return { created: false, player: doc };
    if (standing === 'other') throw await this._heldElsewhere(doc, level, teamAtLevel(doc, level));
    if (standing === 'stranger' && !claim) {
      const name = [doc.firstName, doc.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'");
      throw new BusinessRuleError(`${name} is not on this team.`, { reason: 'NOT_ON_TEAM', player: idOf(doc) });
    }
    return this.setTeamAtLevel({ player: doc, teamId, level, actor, via });
  }

  /**
   * May this team add the player to its roster (no level known)? Refused when
   * any OTHER team already holds the player at any level or as their team —
   * a roster add never moves anyone. Levels are set later, at entry.
   */
  async assertRosterAdd(player, teamId) {
    const id = idOf(teamId);
    const others = [
      idOf(player.team),
      ...(player.levelTeams || []).map((entry) => idOf(entry.team)),
    ].filter((t) => t && t !== id);
    if (others.length) {
      const name = [player.firstName, player.lastName].filter(Boolean).join(' ').replace(/&#x27;/gi, "'");
      const teamName = await this._teamName(others[0]);
      throw new ConflictError(
        `${name} is already with ${teamName}. A team can register them only at a level where they have no team yet, from that competition.`,
        { reason: 'ON_ANOTHER_TEAM', team: { _id: others[0], name: teamName } }
      );
    }
  }

  /** Is the player held at any level by this team? (A roster removal must not drop a final team.) */
  holdsAnyLevel(player, teamId) {
    return (player?.levelTeams || []).some((entry) => idOf(entry.team) === idOf(teamId));
  }

  /** @private */
  async _notify(player, teamId, level) {
    try {
      const others = (player.levelTeams || []).filter((e) => e.level !== level && idOf(e.team) !== idOf(teamId));
      const teamIds = [...new Set(others.map((e) => idOf(e.team)))];
      const teams = teamIds.length ? await this.teamRepository.find({ _id: { $in: teamIds } }, { select: 'name coach' }) : [];
      const byId = new Map((teams || []).map((t) => [String(t._id), t]));
      await this.otpService?.notifyLevelTeamSet?.({
        player,
        teamName: await this._teamName(teamId),
        levelName: levelLabel(level),
        others: others.map((e) => ({
          coachId: byId.get(idOf(e.team))?.coach || null,
          teamName: byId.get(idOf(e.team))?.name || 'your team',
          levelName: levelLabel(e.level),
        })),
      });
    } catch (error) {
      this.logger?.error?.('Could not notify about a level team', { error: error.message });
    }
  }

  /** @private */
  async _audit(actor, action, playerId, details) {
    if (!actor?.id || actor.type === 'system') return;
    try {
      await this.auditLogRepository?.logAction?.({
        adminId: actor.id,
        adminType: actor.type,
        action,
        resource: 'player',
        resourceId: String(playerId),
        details,
      });
    } catch (error) {
      this.logger?.error?.('Could not write the level-team audit log', { error: error.message, action });
    }
  }
}

module.exports = PlayerTeamService;
