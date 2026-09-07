/**
 * Reading `registeredTeams[].players[].apparatus`.
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
 * @module utils/data/apparatus.util
 */

/**
 * Coerce one value out of the Mixed field into a list of apparatus names.
 *
 * @param {*} value - the raw value, whatever shape it is in
 * @returns {string[]}
 */
function toList(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
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

module.exports = { apparatusList };
