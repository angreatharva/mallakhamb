/**
 * How many judges sit on a panel, from its seats (bug fix 2026-11-08).
 *
 * The averaging method depends on the panel size (3: simple average; 4: the
 * Chief fills the fourth evaluation slot; 5: drop high/low of four). The
 * server used to learn the size from whichever client sent it, or GUESS it
 * from how many marks had arrived. A Scorer's save sends no size, so a
 * 4-judge panel with one judge still to mark was averaged as a 3-judge panel:
 * the Scorer's sheet said 7.00 and the stored final said 6.67, both looking
 * believable.
 *
 * The seats decide, exactly as the judge screens count them
 * (Web/src/utils/scoring/judgePanel.js `panelSeats`): live seats only, one per
 * evaluation role, a seat naming this apparatus beating a category-wide one,
 * seats for another apparatus ignored. Scorer and Time Keeper are not counted.
 */

const EVALUATION_SEATS = Object.freeze(['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4']);

/**
 * @param {Array<{judgeType: string, apparatus?: string|null}>} seats - live seats of one category
 * @param {string|null} apparatus
 * @returns {3|4|5|null} null when the seats do not make a panel
 */
function seatedPanelSize(seats, apparatus = null) {
  const roles = new Set();
  for (const seat of Array.isArray(seats) ? seats : []) {
    if (!seat || !EVALUATION_SEATS.includes(seat.judgeType)) continue;
    if (apparatus && seat.apparatus && seat.apparatus !== apparatus) continue;
    roles.add(seat.judgeType);
  }
  const count = roles.size;
  if (count >= 3 && count <= 5) return count;
  return null;
}

module.exports = { seatedPanelSize, EVALUATION_SEATS };
