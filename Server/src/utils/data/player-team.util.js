/**
 * A player's team at a competition level — pure helpers and query filters.
 *
 * The rule (owner, 2026-10-28): a player's team is FINAL at each level.
 * Player A is SGAM's at District and Maharashtra's at State; nobody can take
 * them for another team at a level where they already have one, and only a
 * Super Admin corrects a mistake. `Player.levelTeams` holds the choices; the
 * old single `Player.team` is the first team the player ever had and the
 * suggestion at a level not chosen yet.
 *
 * Writes go through services/team/player-team.service. Docs:
 * docs/team-per-level-plan.md.
 *
 * @module utils/data/player-team.util
 */

const { convertToObjectId } = require('./objectid.util');

const idOf = (value) => (value?._id ?? value)?.toString?.() ?? null;

/** 'district' → 'District', 'dso' → 'DSO'. */
function levelLabel(level) {
  const value = String(level || '');
  if (value === 'dso') return 'DSO';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The level entry on this player, or null. */
function levelEntry(player, level) {
  return (player?.levelTeams || []).find((entry) => entry.level === level) || null;
}

/** The team id the player is final with at this level, or null. */
function teamAtLevel(player, level) {
  return idOf(levelEntry(player, level)?.team);
}

/** Is this team on the player's record at all — any level, or the old team? */
function isOnTeam(player, teamId) {
  const id = idOf(teamId);
  if (!id || !player) return false;
  if (idOf(player.team) === id) return true;
  return (player.levelTeams || []).some((entry) => idOf(entry.team) === id);
}

/**
 * What a team may do with this player at this level.
 *  - 'held'    : the player is this team's at the level;
 *  - 'other'   : another team holds the level — final, refuse;
 *  - 'free'    : no team at the level yet, and the player is on this team's
 *                roster (old team, or theirs at another level);
 *  - 'stranger': no team at the level, and not on this team's roster at all.
 */
function standingAt(player, teamId, level) {
  const holder = teamAtLevel(player, level);
  if (holder) return holder === idOf(teamId) ? 'held' : 'other';
  return isOnTeam(player, teamId) ? 'free' : 'stranger';
}

/** Mongo filter: everyone on this team's roster, at any level. */
function rosterFilter(teamId) {
  const id = convertToObjectId(teamId);
  return { $or: [{ team: id }, { 'levelTeams.team': id }] };
}

/**
 * Mongo filter: this team's roster as it stands at one level — players the
 * team holds there, plus its roster players with no team at the level yet.
 * Never a player another team holds at the level. Returned under `$and`.
 */
function rosterAtLevelFilter(teamId, level) {
  const id = convertToObjectId(teamId);
  // Always under `$and`, so a caller can add its own `$or` beside it.
  if (!level) return { $and: [rosterFilter(teamId)] };
  return {
    $and: [
      rosterFilter(teamId),
      { levelTeams: { $not: { $elemMatch: { level, team: { $ne: id } } } } },
    ],
  };
}

module.exports = {
  levelLabel,
  levelEntry,
  teamAtLevel,
  isOnTeam,
  standingAt,
  rosterFilter,
  rosterAtLevelFilter,
};
