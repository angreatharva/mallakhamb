/**
 * A category's age group and who is in it — with Competition II's "All ages"
 * (docs/qualification-plan.md): one final per gender holding every age
 * group's qualifiers.
 *
 * @module utils/data/category.util
 */

const { ALL_AGES, toCompetitionTypeSlug } = require('../../config/cop-rules');
const { apparatusList } = require('./apparatus.util');

/** Does an entry's own age group belong to this category's? */
function ageMatches(entryAgeGroup, categoryAgeGroup) {
  if (!categoryAgeGroup) return true;
  return categoryAgeGroup === ALL_AGES || entryAgeGroup === categoryAgeGroup;
}

/**
 * Is this squad entry in the given competition (and, when named, on the
 * apparatus)? Competition I is every entry; a final only those the
 * qualification engine put in it.
 */
function entryInCompetition(entry, competitionType, apparatus = null) {
  if (!competitionType) return true;
  const slug = toCompetitionTypeSlug(competitionType);
  if (slug === 'competition_1') return true;
  const list = apparatusList(entry?.apparatus, slug);
  return apparatus ? list.includes(apparatus) : list.length > 0;
}

/** The meet's category age groups for a gender: its own, plus All ages when it runs Competition II. */
function categoryAgeGroups(competition, gender) {
  const own = (competition?.ageGroups || []).filter((g) => !gender || g.gender === gender).map((g) => g.ageGroup);
  const runsII = (competition?.competitionTypes || []).includes('competition_2') && !competition?.legacyFinals;
  return runsII ? [...own, ALL_AGES] : own;
}

module.exports = { ageMatches, entryInCompetition, categoryAgeGroups, ALL_AGES };
