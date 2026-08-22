/**
 * Running-order helpers.
 *
 * Two different payloads carry the same ordering information and both are
 * indexed here so the pages never re-implement the merge:
 *
 *  - `GET .../lots` returns the full roster: teams with `position`/`lotNo`, each
 *    holding players with `position`/`lotNo`.
 *  - The `performance_order_updated` socket event carries the same shape,
 *    trimmed to ids and ordering fields only.
 *
 * The sort is positional-with-fallback rather than a plain lookup. A team or
 * athlete registered after the last draw has no stored position, and `null`
 * compares as 0 in a naive numeric sort — which would silently promote a
 * brand-new entrant to the top of a drawn running order. Unordered rows are
 * appended in name order instead.
 */

const idOf = (value) => (value == null ? '' : String(value._id ?? value.id ?? value));

/**
 * Build lookup maps from either payload shape.
 *
 * @param {Object|null} payload - roster response or socket event body
 * @returns {{teams: Map<string, {position: number|null, lotNo: number|null}>,
 *            players: Map<string, {position: number|null, lotNo: number|null}>}}
 *          `players` is keyed `"<teamId>:<playerId>"` — an athlete's running
 *          position is a property of the team's slot, not of the athlete, so a
 *          player-only key would collide for anyone rostered twice.
 */
export function indexPerformanceOrder(payload) {
  const teams = new Map();
  const players = new Map();

  for (const team of payload?.teams || []) {
    const teamId = idOf(team._id);
    if (!teamId) continue;

    teams.set(teamId, {
      position: typeof team.position === 'number' ? team.position : null,
      lotNo: team.lotNo ?? null,
    });

    for (const player of team.players || []) {
      const playerId = idOf(player._id);
      if (!playerId) continue;
      players.set(`${teamId}:${playerId}`, {
        position: typeof player.position === 'number' ? player.position : null,
        lotNo: player.lotNo ?? null,
      });
    }
  }

  return { teams, players };
}

/**
 * Sort rows into running order and stamp each with its lot number.
 *
 * @template T
 * @param {T[]} rows
 * @param {Map<string, {position: number|null, lotNo: number|null}>} lookup
 * @param {Object} accessors
 * @param {(row: T) => string} accessors.key - lookup key for the row
 * @param {(row: T) => string} accessors.name - tiebreak for rows with no position
 * @returns {(T & {lotNo: number|null, runningPosition: number|null})[]} a new array
 */
export function applyRunningOrder(rows, lookup, { key, name }) {
  const decorated = (rows || []).map((row) => {
    const stored = lookup?.get(key(row));
    return {
      ...row,
      lotNo: stored?.lotNo ?? null,
      runningPosition: typeof stored?.position === 'number' ? stored.position : null,
    };
  });

  const ordered = decorated.filter((r) => r.runningPosition !== null);
  const unordered = decorated.filter((r) => r.runningPosition === null);

  ordered.sort((a, b) => a.runningPosition - b.runningPosition);
  unordered.sort((a, b) => String(name(a) ?? '').localeCompare(String(name(b) ?? '')));

  return [...ordered, ...unordered];
}

/**
 * Does a socket `performance_order_updated` event concern the category the
 * current screen is showing?
 *
 * `competitionType` is compared loosely on purpose: the server broadcasts the
 * slug form, but a page's session may hold either the slug or the display form
 * depending on which screen navigated to it.
 *
 * @param {Object} event
 * @param {{gender: string, ageGroup: string, competitionType: string}} category
 * @returns {boolean}
 */
export function eventMatchesCategory(event, category) {
  if (!event || !category) return false;
  if (event.gender !== category.gender) return false;
  if (event.ageGroup !== category.ageGroup) return false;

  const normalize = (value) => ({
    'Competition I': 'competition_1',
    'Competition II': 'competition_2',
    'Competition III': 'competition_3',
  }[value] || value);

  return normalize(event.competitionType) === normalize(category.competitionType);
}

export { idOf as orderIdOf };
