/**
 * Turning a list of seats into ONE panel.
 *
 * A category's seats are no longer one panel. A meet is seated per
 * (gender, age group, apparatus) — Manage Judges asks which — so
 * `GET /judges?gender=Male&ageGroup=Under14&competitionTypes=competition_1`
 * answers with the Pole panel, the Rope panel and the Hanging panel end to end.
 *
 * WHY THAT MATTERS MORE THAN IT LOOKS. Every screen here does the same thing
 * with the list: it counts it. `calculateAverageMarks(scores, judges.length)`
 * picks the averaging method from that number — flat mean at 3, the chief
 * copied into the vacant fourth slot at 4, drop-high-low at 5. Three panels
 * concatenated make 15, which clamps to the 5-judge rule and scores every
 * category by drop-high-low. It does not fail; it produces a believable number
 * by the wrong method, which is the worst shape a scoring bug can take.
 *
 * Asking the server for one apparatus is the real fix and the screens that know
 * which apparatus they are on do exactly that. This exists for the residue:
 *
 *   - a LEGACY category-wide seat (`apparatus: null`) comes back ALONGSIDE the
 *     named seats, because the server answers an apparatus filter with
 *     `{ $in: [apparatus, null, ''] }` — correctly, since such a seat really
 *     does judge that apparatus. Two rows, one seat.
 *   - a team whose athletes are entered for more than one apparatus has no
 *     single panel to show, and the scorer's sheet is one table.
 *
 * @module utils/scoring/judgePanel
 */

/** Panel judge slots, in display order. The Scorer is not one of them. */
export const PANEL_TYPES = Object.freeze([
  'Senior Judge',
  'Judge 1',
  'Judge 2',
  'Judge 3',
  'Judge 4',
]);

/** Is this seat a staffed evaluation seat? */
const isStaffedPanelSeat = (seat) =>
  !!seat && !seat.isEmpty && !!seat.name?.trim() && PANEL_TYPES.includes(seat.judgeType);

/**
 * The evaluation seats of a single panel, in slot order.
 *
 * One seat per role. Where a role appears twice — a legacy category-wide seat
 * and a named one — the seat that NAMES the apparatus wins, because it was
 * seated deliberately for it; the category-wide seat is the fallback that
 * predates the question being asked.
 *
 * Seats for other apparatus are dropped when `apparatus` is given. Without it
 * every apparatus is folded together, which is the best a screen showing a
 * mixed-apparatus team can do and is why `apparatus` is worth passing wherever
 * it is known.
 *
 * @param {Array} seats - rows from `GET .../judges`
 * @param {string} [apparatus] - narrow to one panel
 * @returns {Array} at most one seat per role, ordered Senior Judge → Judge 4
 */
export function panelSeats(seats, apparatus = null) {
  const byRole = new Map();

  for (const seat of Array.isArray(seats) ? seats : []) {
    if (!isStaffedPanelSeat(seat)) continue;
    if (apparatus && seat.apparatus && seat.apparatus !== apparatus) continue;

    const held = byRole.get(seat.judgeType);
    // A named seat displaces a category-wide one; anything else keeps the first
    // it saw, so the order the server returned decides and the result is stable.
    if (!held || (!held.apparatus && seat.apparatus)) {
      byRole.set(seat.judgeType, seat);
    }
  }

  return PANEL_TYPES.filter((role) => byRole.has(role)).map((role) => byRole.get(role));
}

/**
 * The single apparatus a set of rows is entered for, or null.
 *
 * Null covers both "none recorded" and "more than one" — in either case there
 * is no one panel to ask for, and the caller falls back to folding them
 * together.
 *
 * @param {Array} rows - objects carrying an `apparatus`
 * @returns {string|null}
 */
export function soleApparatus(rows) {
  const names = new Set(
    (Array.isArray(rows) ? rows : []).map((row) => row?.apparatus).filter(Boolean)
  );
  return names.size === 1 ? [...names][0] : null;
}
