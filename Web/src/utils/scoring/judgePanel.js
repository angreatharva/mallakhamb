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
 * The panel as a scoring SHEET draws it: five seats, even when four sat.
 *
 * A 4-judge panel is not scored as four. The rule — `calculateAverageMarks` in
 * copRules here, `calculateIndividualScore` on the server — puts the Sr.
 * Judge's mark into the vacant fourth evaluation slot and then runs the 5-judge
 * method unchanged: sort the four, drop the highest and the lowest, average the
 * middle two. The Sr. Judge is counted twice, once as an evaluator and once as
 * the Chief the tolerance is measured against.
 *
 * That doubling was invisible. The sheet drew one column per SEAT, so a 4-judge
 * panel showed four columns while the Average beside them was computed over
 * five marks — one of which appeared nowhere on screen, and a Scorer reading
 * the sheet had no way to see which mark was used twice. This returns the seats
 * the sheet draws: the four real ones plus a fifth, `Judge 4`, holding the Sr.
 * Judge again.
 *
 * The copy is a DISPLAY seat and nothing else:
 *   - `scoreField` points it back at `seniorJudge`, so the column mirrors that
 *     one cell rather than owning a value of its own. There is no second mark
 *     to type and no way for the two to disagree.
 *   - it must not reach `judgeDetails` — that is the record of who sat, and
 *     this person sat once.
 *   - it must not reach `judgeScores.judge4`. Nobody gave that mark, and the
 *     tie-break's panel mean divides by the seats the panel HAS (sum / 4 for a
 *     four, sum / 5 for a five — see Server tie-breaker.util.js), so a 4-judge
 *     panel that stored five marks would be averaged over five.
 *   - it must not be counted as panel SIZE. Pass the real `panelSeats` length
 *     to anything that picks an averaging method; `judges.length` is no longer
 *     that number once this has been applied.
 *
 * Panels of 3 and 5 come back untouched — a 3 has no Chief role and no slot to
 * fill, a 5 has no vacancy.
 *
 * @param {Array} seats - ONE panel, as `panelSeats` returns it
 * @returns {Array} the seats to draw, ordered Senior Judge → Judge 4
 */
export function mirrorChiefSeat(seats) {
  const panel = Array.isArray(seats) ? seats : [];
  if (panel.length !== 4) return panel;

  const chief = panel.find((seat) => seat?.judgeType === 'Senior Judge');
  // Four seats with no Judge 4 is exactly Senior + Judge 1 + Judge 2 + Judge 3;
  // anything else already fills the slot this would copy into.
  if (!chief || panel.some((seat) => seat?.judgeType === 'Judge 4')) return panel;

  return [
    ...panel,
    {
      ...chief,
      // Its own id: the column and the panel chip are keyed on it, and two
      // keyed alike collapse into one.
      _id: `${chief._id}::chief-copy`,
      judgeType: 'Judge 4',
      scoreField: 'seniorJudge',
      isChiefCopy: true,
    },
  ];
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
