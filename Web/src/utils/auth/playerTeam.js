/**
 * Does this player already belong to a squad?
 *
 * `team` comes back as either an id string or a populated object depending on
 * the endpoint, which is why this is not a plain truthiness check. Shared by
 * the level and competition choosers, which route a teamless player to the
 * team step first (Level → Team → Competition).
 *
 * @param {Object|null} user
 * @returns {boolean}
 */
export const playerHasTeam = (user) => Boolean(
  user?.team && (typeof user.team === 'string' ? user.team : (user.team._id || user.team.id))
);
