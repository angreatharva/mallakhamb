/**
 * Shared PropTypes for the scoring UI (LOW-W2).
 *
 * The scoring components pass deeply nested `breakdown` objects between the
 * slip form, Panel Review, the mismatch modal and the Senior Judge override
 * modal, with no contract anywhere. That is the one place in this app where an
 * undetected shape change is expensive rather than annoying: these objects
 * carry the numbers that become a competitor's persisted score, and a silently
 * missing `combination.total` renders as 0.00 rather than throwing.
 *
 * The canonical shape is whatever `normalizeBreakdown` in
 * `pages/judge/judgeShared.jsx` produces — these declarations mirror it, and
 * that function is the thing to check if they ever disagree.
 */

import PropTypes from 'prop-types';

/** §3.2 — A/B/C element counts and the resulting difficulty total. */
export const difficultyShape = PropTypes.shape({
  aClass: PropTypes.number,
  bClass: PropTypes.number,
  cClass: PropTypes.number,
  total: PropTypes.number,
});

/**
 * §5 — combination checklist.
 * `checked` is keyed by the checklist item id, so its keys are dynamic.
 */
export const combinationShape = PropTypes.shape({
  total: PropTypes.number,
  checked: PropTypes.objectOf(PropTypes.bool),
});

/**
 * A full COP slip breakdown.
 *
 * `detailed: false` marks a breakdown rebuilt from stored section totals only
 * (see `slipToBreakdown`) — the element counts and per-item checklist are
 * unknown, and callers must not render zeros as if they were judged values.
 */
export const breakdownShape = PropTypes.shape({
  difficulty: difficultyShape,
  combination: combinationShape,
  execution: PropTypes.number,
  bonus: PropTypes.number,
  detailed: PropTypes.bool,
});

/** One judge's entry in the live panel feed. */
export const panelScoreShape = PropTypes.shape({
  judgeType: PropTypes.string,
  score: PropTypes.number,
  breakdown: breakdownShape,
});

/** The panel feed, keyed by judgeType ('Senior Judge', 'Judge 1', …). */
export const panelScoresShape = PropTypes.objectOf(panelScoreShape);

/** A single combination checklist item as served by the COP rules. */
export const checklistItemShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  rule: PropTypes.string.isRequired,
  penalty: PropTypes.number.isRequired,
});

export const combinationChecklistShape = PropTypes.arrayOf(checklistItemShape);

/** The per-section ceilings (D 3.80 / Comb 1.60 / Exec 4.40 / Bonus 0.20). */
export const pointCeilingsShape = PropTypes.shape({
  difficulty: PropTypes.number,
  combination: PropTypes.number,
  execution: PropTypes.number,
  bonus: PropTypes.number,
  total: PropTypes.number,
});

/** What the Senior Judge override modal is editing. */
export const editTargetShape = PropTypes.shape({
  judgeType: PropTypes.string,
  score: PropTypes.number,
  breakdown: breakdownShape,
});
