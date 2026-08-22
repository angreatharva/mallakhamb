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

/** Roles that may set a panel's running order. */
const SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer'];

/** Roles that submit an evaluation slip. */
const PANEL_JUDGE_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];

const idStr = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

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

  // Apparatus narrows a Competition III panel. An assignment with no apparatus
  // covers every apparatus in its category; one with an apparatus covers only
  // that apparatus.
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
  PANEL_JUDGE_TYPES,
  loadAssignments,
  assignmentCoversCategory,
  resolveAssignment,
  hasAnyRole,
  competitionsFor,
};
