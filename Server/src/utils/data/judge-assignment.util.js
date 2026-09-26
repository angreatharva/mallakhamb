/**
 * Judge assignment resolution.
 *
 * One judge account can hold several panel assignments — Senior Judge in
 * Under-14 Male, Judge 2 in Under-16 Female, Scorer somewhere else. Four places
 * used to work this out independently by re-querying every Judge row that
 * happened to share a username string: judge login, the socket room auto-join,
 * the running-order permission check and (implicitly) the slip binding in
 * admin.controller.
 *
 * They now all come here, because the answer has to be the same in all of
 * them. In particular: WHICH ROLE a judge holds is a property of the CATEGORY
 * being scored, not of the row they happened to authenticate against. Getting
 * that wrong writes a slip into another judge's slot.
 */

const { toCompetitionTypeSlug } = require('../../config/cop-rules');
const { PANEL_JUDGE_TYPES } = require('../scoring/judge-slip.util');
const { idStr } = require('./objectid.util');

/**
 * Roles that may set a panel's running order.
 *
 * The route guard (`requireSequenceManager`) and the assignment check
 * (`PerformanceOrderService.assertJudgeMaySequence`) are the two halves of ONE
 * authorization decision, and they each used to carry their own copy of this
 * list. Adding a role to one half without the other either refuses somebody who
 * should be allowed, or lets them past the guard and into a 403 from the
 * service — neither of which reads as a missing list.
 */
const SEQUENCE_JUDGE_TYPES = Object.freeze(['Senior Judge', 'Scorer']);

/**
 * The seats a category must have filled before it can be scored at all.
 *
 * The Time Keeper joined this list on 2026-09-26: the panel form asks for the
 * Timer as a required seat. It may be the Scorer's own account (see
 * config/judge-seats maySeatTogether).
 *
 * Not the same question as the panel SIZE, which is 3, 4 or 5 evaluators and
 * decides the averaging method. This is the floor: a chief, two evaluators and
 * somebody to record. `AdminService.getAllJudgesSummary` renders it as
 * `hasMinimumJudges` on the admin dashboard.
 */
const MINIMUM_PANEL_SEATS = Object.freeze(['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer', 'Time Keeper']);


/**
 * Every active assignment held by a judge account.
 *
 * @param {Object} judgeRepository
 * @param {*} judgeAccountId
 * @param {*} [competitionId] - Restrict to one competition when the token
 *   carries a competition context.
 * @returns {Promise<Array>}
 */
async function loadAssignments(judgeRepository, judgeAccountId, competitionId = null) {
  if (!judgeRepository || !judgeAccountId) return [];

  const query = {
    judgeAccount: judgeAccountId,
    isActive: { $ne: false },
  };
  if (competitionId) {
    query.competition = competitionId;
  }

  return (await judgeRepository.find(query)) || [];
}

/**
 * Does this assignment cover the given category?
 *
 * A Scorer is routinely created without competitionTypes (the judge client
 * defaults them to competition_1), so an empty list means "every category in
 * this gender/age group" rather than "none" — the same rule the running-order
 * check has always applied.
 *
 * @param {Object} assignment
 * @param {Object} category - { competition, gender, ageGroup, competitionType, apparatus }
 * @returns {boolean}
 */
function assignmentCoversCategory(assignment, category = {}) {
  if (!assignment) return false;

  if (category.competition && idStr(assignment.competition) !== idStr(category.competition)) {
    return false;
  }
  if (category.gender && assignment.gender !== category.gender) return false;
  if (category.ageGroup && assignment.ageGroup !== category.ageGroup) return false;

  if (category.competitionType) {
    const wanted = toCompetitionTypeSlug(category.competitionType);
    const types = Array.isArray(assignment.competitionTypes) ? assignment.competitionTypes : [];
    if (types.length > 0 && !types.map(toCompetitionTypeSlug).includes(wanted)) {
      return false;
    }
  }

  /*
   * Apparatus is part of a panel's identity: a meet is seated once per
   * (gender, age group, apparatus), and Manage Judges asks which.
   *
   * A seat that names one covers only that apparatus. A seat with NONE is the
   * legacy shape — written before the apparatus rung existed, and before
   * `Judge`'s unique keys carried apparatus at all — and it covers every
   * apparatus in its category. Both are matched here rather than migrated,
   * because backfilling an old seat to a named apparatus would strand the
   * athletes in its category entered for the other two.
   */
  if (category.apparatus && assignment.apparatus && assignment.apparatus !== category.apparatus) {
    return false;
  }

  return true;
}

/**
 * The assignment this judge holds for a category, or null.
 *
 * When a judge somehow holds more than one matching assignment, the most
 * specific one wins (apparatus-scoped over category-wide), then the earliest
 * judgeNo — deterministic rather than "whichever the database returned first".
 *
 * @param {Array} assignments
 * @param {Object} category
 * @returns {Object|null}
 */
function resolveAssignment(assignments, category = {}) {
  const matches = (assignments || []).filter((a) => assignmentCoversCategory(a, category));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  return matches.sort((a, b) => {
    const specificity = (x) => (x.apparatus ? 0 : 1);
    if (specificity(a) !== specificity(b)) return specificity(a) - specificity(b);
    return Number(a.judgeNo || 99) - Number(b.judgeNo || 99);
  })[0];
}

/**
 * Does this judge hold any of these roles, anywhere?
 *
 * Used by the route guards, which run before the category is known (it is in
 * the body). The assignment-level check still has to happen afterwards — see
 * PerformanceOrderService.assertJudgeMaySequence.
 *
 * @param {Array} assignments
 * @param {string[]} roles
 * @returns {boolean}
 */
function hasAnyRole(assignments, roles) {
  return (assignments || []).some((a) => roles.includes(a.judgeType));
}

/**
 * The competitions a judge is assigned to, deduplicated, in assignment order.
 * @param {Array} assignments
 * @returns {string[]}
 */
function competitionsFor(assignments) {
  return [...new Set((assignments || []).map((a) => idStr(a.competition)).filter(Boolean))];
}

module.exports = {
  SEQUENCE_JUDGE_TYPES,
  MINIMUM_PANEL_SEATS,
  // Re-exported, not redefined: the definition lives with the role→field
  // mapping in utils/scoring/judge-slip.util.js, so a sixth evaluation seat
  // cannot appear in one list and not the other.
  PANEL_JUDGE_TYPES,
  loadAssignments,
  assignmentCoversCategory,
  resolveAssignment,
  hasAnyRole,
  competitionsFor,
};
