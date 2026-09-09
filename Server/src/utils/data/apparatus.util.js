/**
 * Reading and writing `registeredTeams[].players[].apparatus`.
 *
 * That field is `Schema.Types.Mixed` and has been written in THREE shapes over
 * the life of the app:
 *
 *   'Pole Mallakhamb'                                  a bare string (oldest)
 *   ['Pole Mallakhamb', 'Rope Mallakhamb']             a flat list
 *   { competition_1: ['Pole Mallakhamb'], ... }        per competition type
 *
 * Every reader has to cope with all three, and two of them were coping
 * independently: `payment.config.calculatePlayerFee`, which turns the list into
 * money, and `AdminService.getSubmittedTeams`, which turns it into the roster a
 * judge is shown. One decides what a coach is charged; the other decides who a
 * panel sees. Two readings of one ambiguous field is how those two end up
 * disagreeing about the same athlete.
 *
 * THE CANONICAL SHAPE IS THE OBJECT, KEYED BY COMPETITION-TYPE SLUG.
 *
 * It was a live divergence between two clients, not merely untidy history:
 * `CoachDashboard.jsx` writes the flat list and `AddPlayerForm.jsx` (superadmin)
 * writes the object. The object wins because it is the only shape that can say
 * what the domain already models everywhere else — `Competition.apparatusConfig`
 * is a Map of competitionType to apparatus, and COP makes Competition III
 * apparatus-specific. An athlete on Pole in Competition I and Rope in
 * Competition III is `['Pole','Rope']` in the array form, and
 * `apparatusList(array, 'competition_1')` IGNORES the competition type and
 * returns both — putting that athlete on the Rope roster for a category they
 * are not entered in. The array form cannot express the difference; the object
 * form can, so canonicalising on it loses nothing.
 *
 * `apparatusList` still reads all three, deliberately: stored rows lag the
 * migration, and a reader that only understands the canonical shape would go
 * blank rather than degrade.
 *
 * @module utils/data/apparatus.util
 */

const {
  COMPETITION_TYPE_SLUGS,
  COMPETITION_TYPE_DISPLAYS,
  toCompetitionTypeSlug,
} = require('../../config/cop-rules');

/**
 * Is this key recognisably a competition type?
 *
 * `toCompetitionTypeSlug` is a lenient NORMALISER, not a validator — it answers
 * `competition_1` for `''`, `null` and `'somethingElse'` alike, which is the
 * right behaviour where a caller already knows it holds a competition type and
 * only wants it in one spelling. Here the question is the opposite one, so the
 * key has to be matched against the vocabulary first.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isCompetitionTypeKey(key) {
  const raw = String(key ?? '');
  return COMPETITION_TYPE_SLUGS.includes(raw) || COMPETITION_TYPE_DISPLAYS.includes(raw);
}

/**
 * Coerce one value out of the Mixed field into a list of apparatus names.
 *
 * @param {*} value - the raw value, whatever shape it is in
 * @returns {string[]}
 */
function toList(value) {
  // Blanks are dropped rather than carried: `''` used to coerce to `['']`, an
  // athlete entered for an apparatus with no name — which no fee matches and no
  // roster filter can mean, but which every `length` check counted as one.
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => entry.trim());
  }
  return [];
}

/**
 * The apparatus an entry is registered for.
 *
 * With `competitionType`, an object-shaped value is narrowed to that one
 * category; without it, every category's apparatus is flattened together. The
 * string and array shapes ignore `competitionType` entirely — they predate the
 * per-category encoding and carry no category of their own.
 *
 * Duplicates are NOT removed: `calculatePlayerFee` de-duplicates with a Set of
 * its own so an athlete entered for the same apparatus in two categories is not
 * charged the add-on twice, and the roster filter only asks whether a name is
 * present.
 *
 * @param {*} value - `playerEntry.apparatus`
 * @param {string} [competitionType] - slug, e.g. 'competition_1'
 * @returns {string[]}
 */
function apparatusList(value, competitionType = null) {
  if (typeof value === 'string' || Array.isArray(value)) {
    return toList(value);
  }

  if (value && typeof value === 'object') {
    if (competitionType) {
      return toList(value[competitionType]);
    }
    return Object.values(value).flatMap(toList);
  }

  return [];
}

/**
 * Coerce any stored or submitted value into the canonical per-type object.
 *
 * A string or a flat list carries no category of its own, so it is spread
 * across every competition type the meet runs. That is not a guess — it is
 * exactly what `apparatusList` already returns for those shapes when asked
 * about a specific type (it ignores the type and hands back the whole list), so
 * spreading reproduces today's behaviour rather than reinterpreting it. Fees
 * are unaffected for the same reason: `calculatePlayerFee` reads with no
 * competition type and de-duplicates through a Set, so flattening the object
 * back out yields the identical set of apparatus and the identical amount.
 *
 * Unknown keys are dropped and unknown apparatus names are kept — the names are
 * validated at the route, and silently discarding one here would turn a typo
 * into an athlete with no apparatus at all rather than a rejected request.
 *
 * @param {*} value - `playerEntry.apparatus` in any of the three shapes
 * @param {string[]} [competitionTypes] - the meet's types; defaults to all three
 * @returns {Object<string, string[]>} canonical shape, `{}` when nothing is set
 */
function toCanonicalApparatus(value, competitionTypes = COMPETITION_TYPE_SLUGS) {
  const types = (Array.isArray(competitionTypes) && competitionTypes.length > 0
    ? competitionTypes
    : COMPETITION_TYPE_SLUGS
  ).map(toCompetitionTypeSlug).filter(Boolean);

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const canonical = {};
    for (const [key, entry] of Object.entries(value)) {
      // A key that is not a competition type is not per-type data; the only way
      // to read it is as a stray, and keeping it would re-create the ambiguity.
      if (!isCompetitionTypeKey(key)) continue;
      const list = toList(entry);
      if (list.length > 0) canonical[toCompetitionTypeSlug(key)] = list;
    }
    return canonical;
  }

  const list = toList(value);
  if (list.length === 0) return {};

  return types.reduce((canonical, slug) => {
    canonical[slug] = [...list];
    return canonical;
  }, {});
}

/**
 * Is this value already canonical?
 *
 * Used by migration 008 to skip rows that need no rewrite. The invariant worth
 * holding is `isCanonicalApparatus(v)` implies `toCanonicalApparatus(v)` equals
 * `v` — which is why an empty list under a type does NOT count as canonical
 * even though it reads the same: the normaliser drops it, so calling it
 * canonical would leave the migration unable to tidy it. An empty OBJECT is
 * canonical; it is what "no apparatus chosen" stores, and matches the schema
 * default.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isCanonicalApparatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  return Object.entries(value).every(([key, entry]) =>
    COMPETITION_TYPE_SLUGS.includes(key)
    && Array.isArray(entry)
    && entry.length > 0
    && entry.every((a) => typeof a === 'string' && a.trim() === a && a !== '')
  );
}

module.exports = { apparatusList, toCanonicalApparatus, isCanonicalApparatus };
