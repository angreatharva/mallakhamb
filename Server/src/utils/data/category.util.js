/**
 * A category's age group and who is in it.
 *
 * Competition II is ONE "All ages" final per gender, holding the top 2 of every
 * age group (owner, 2026-11-17; docs/qualification-plan.md). From 14 to 17 Nov
 * it ran as a final per gender AND age group; a meet where one of those had
 * already started keeps that shape (`perAgeGroupFinals`, migration 018), so its
 * scores and results stay readable.
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

/**
 * Does this meet run Competition II as one "All ages" final per gender? Yes,
 * unless it runs no automatic Competition II (`legacyFinals`) or kept the
 * 14–17 Nov per-age-group finals (`perAgeGroupFinals`).
 */
function runsAllAges(competition) {
  return (competition?.competitionTypes || []).includes('competition_2')
    && !competition?.legacyFinals
    && competition?.perAgeGroupFinals !== true;
}

/** The meet's category age groups for a gender: its own, plus All ages when Competition II runs as one. */
function categoryAgeGroups(competition, gender) {
  const own = (competition?.ageGroups || []).filter((g) => !gender || g.gender === gender).map((g) => g.ageGroup);
  return runsAllAges(competition) ? [...own, ALL_AGES] : own;
}

module.exports = { ageMatches, entryInCompetition, categoryAgeGroups, runsAllAges, ALL_AGES };
