/**
 * A category's age group and who is in it.
 *
 * Competition II is a final per gender AND age group (owner, 2026-11-14), so a
 * Competition II category is an ordinary age group. The one exception is a
 * meet whose Competition II had already started as ONE "All ages" final per
 * gender (`allAgesFinals`, migration 017): it keeps that category, which holds
 * every age group's qualifiers (docs/qualification-plan.md).
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

/** Does this meet run Competition II as the old one "All ages" final per gender? */
function runsAllAges(competition) {
  return (competition?.competitionTypes || []).includes('competition_2')
    && !competition?.legacyFinals
    && competition?.allAgesFinals === true;
}

/** The meet's category age groups for a gender: its own, plus All ages on an `allAgesFinals` meet. */
function categoryAgeGroups(competition, gender) {
  const own = (competition?.ageGroups || []).filter((g) => !gender || g.gender === gender).map((g) => g.ageGroup);
  return runsAllAges(competition) ? [...own, ALL_AGES] : own;
}

module.exports = { ageMatches, entryInCompetition, categoryAgeGroups, runsAllAges, ALL_AGES };
