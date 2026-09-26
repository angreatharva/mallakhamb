/**
 * Squad sizes a coach may declare when creating a team, and how many scores
 * each counts toward the Team Championship (per apparatus).
 *
 * Mirrors TEAM_SIZE_COUNTED in Server/src/utils/scoring/team-championship.util.js.
 * The server does the counting; this copy only labels the choice and the cap.
 */
export const TEAM_SIZE_OPTIONS = Object.freeze([
  { value: 4, counted: 3 },
  { value: 6, counted: 5 },
]);

/** What a team created before the size existed is read as, on both stacks. */
export const DEFAULT_TEAM_SIZE = 6;

/**
 * @param {number|null|undefined} maxTeamSize
 * @returns {number} how many scores count per apparatus
 */
export function countedScoresFor(maxTeamSize) {
  const option = TEAM_SIZE_OPTIONS.find((o) => o.value === Number(maxTeamSize))
    || TEAM_SIZE_OPTIONS.find((o) => o.value === DEFAULT_TEAM_SIZE);
  return option.counted;
}
