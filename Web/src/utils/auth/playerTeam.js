/**
 * Does this player already belong to a squad?
 *
 * `team` comes back as either an id string or a populated object depending on
 * the endpoint, which is why this is not a plain truthiness check. Shared by
 * the level and competition choosers, which route a teamless player to the
 * team step first (Level → Team → Competition).
 *
 * @param {Object|null} user
 * @param {string|null} [level] the chosen competition level
 * @returns {boolean}
 */
export const playerHasTeam = (user, level = null) => {
  // A team is final per competition level (Player.levelTeams): with a level,
  // only a team chosen AT that level counts. The old single `team` is then
  // just the suggestion on the team step.
  if (level) return (user?.levelTeams || []).some((entry) => entry?.level === level);
  return Boolean(
    user?.team && (typeof user.team === 'string' ? user.team : (user.team._id || user.team.id))
  );
};
