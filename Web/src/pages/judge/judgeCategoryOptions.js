/**
 * What the judging-category picker may offer, derived from the seats a judge
 * actually holds.
 *
 * The picker is a ladder — competition, gender, age group, competition type,
 * apparatus — and every rung is narrowed by the ones above it. This is the
 * client half of Server/src/utils/data/judge-assignment.util.js
 * (`assignmentCoversCategory`), and it applies the same three rules, because a
 * category the server would accept a slip for is exactly the category the
 * picker has to offer:
 *
 *   - `competitionTypes: []` on a seat covers EVERY competition type — a Scorer
 *     is routinely created that way;
 *   - a seat NAMES an apparatus and covers only that one. Manage Judges asks
 *     which, from the meet's own `apparatusConfig`, and a category running Pole
 *     and Rope is two panels seated separately;
 *   - `apparatus: null` on a seat covers EVERY apparatus in its category. That
 *     is the LEGACY shape, from before the apparatus rung and before `Judge`'s
 *     unique keys carried apparatus. Still honoured, never written;
 *   - a category the judge holds no seat for is never offered.
 *
 * The lists come from GET /api/judge/assignments, which spans every meet the
 * judge is seated at — NOT from the stored login session, which only ever
 * carried the one meet that happened to be active when they signed in.
 */

import { AGE_GROUPS_BY_GENDER, ALL_AGE_GROUPS } from '@/hooks/useAgeGroups';
import { APPARATUS } from '@/utils/scoring/apparatus';
import { isApparatusAllowedForGender, normalizeApparatus } from '@/utils/scoring/copRules';

/** The three competition types, in COP order, with the labels the picker shows. */
export const COMPETITION_TYPES = Object.freeze([
  { value: 'competition_1', label: 'Competition I', sub: 'Team' },
  { value: 'competition_2', label: 'Competition II', sub: 'Individual' },
  { value: 'competition_3', label: 'Competition III', sub: 'Apparatus' },
]);

/** Genders, in the order the admin assignment screen lists them. */
export const GENDERS = Object.freeze(['Male', 'Female']);

/**
 * The id of a reference that may arrive populated or bare.
 *
 * `GET /api/judge/assignments` resolves `competition` to a document; the
 * `allAssignments` copy stored at login leaves it as an id string. Both shapes
 * reach these helpers.
 *
 * @param {unknown} value
 * @returns {string} '' when there is nothing to identify
 */
export const idOf = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id ?? '');
  return String(value);
};

/**
 * Does this seat cover the category chosen so far?
 *
 * Every field is optional: an unanswered rung of the ladder narrows nothing,
 * which is what makes the same predicate usable at each step.
 *
 * @param {Object} seat - a judge assignment
 * @param {Object} [category] - { competitionId, gender, ageGroup, competitionType, apparatus }
 * @returns {boolean}
 */
export function seatCoversCategory(seat, category = {}) {
  if (!seat) return false;

  if (category.competitionId && idOf(seat.competition) !== String(category.competitionId)) {
    return false;
  }
  if (category.gender && seat.gender !== category.gender) return false;
  if (category.ageGroup && seat.ageGroup !== category.ageGroup) return false;

  if (category.competitionType) {
    const types = Array.isArray(seat.competitionTypes) ? seat.competitionTypes : [];
    if (types.length > 0 && !types.includes(category.competitionType)) return false;
  }

  if (category.apparatus && seat.apparatus && seat.apparatus !== category.apparatus) return false;

  return true;
}

/**
 * Every seat covering the category chosen so far.
 * @param {Array} assignments
 * @param {Object} [category]
 * @returns {Array}
 */
export function seatsForCategory(assignments, category = {}) {
  return (assignments || []).filter((seat) => seatCoversCategory(seat, category));
}

/**
 * The meets this judge is seated at, one entry each, in assignment order
 * (newest competition first — the server sorts by createdAt descending).
 *
 * @param {Array} assignments
 * @returns {Array<Object>} competition documents, or `{ _id }` stubs when the
 *   assignment carried only an id
 */
export function competitionsForJudge(assignments) {
  const byId = new Map();

  for (const seat of assignments || []) {
    const id = idOf(seat?.competition);
    if (!id || byId.has(id)) continue;
    const competition = seat.competition;
    byId.set(
      id,
      competition && typeof competition === 'object' ? { ...competition, _id: id } : { _id: id }
    );
  }

  return [...byId.values()];
}

/**
 * The genders this judge holds a seat in, for the chosen meet.
 * @param {Array} assignments
 * @param {Object} [category]
 * @returns {string[]}
 */
export function gendersForJudge(assignments, category = {}) {
  const seats = seatsForCategory(assignments, category);
  return GENDERS.filter((gender) => seats.some((seat) => seat.gender === gender));
}

/**
 * The age groups this judge holds a seat in, FOR THE CHOSEN GENDER.
 *
 * Boys and girls do not run the same brackets — boys to Under 18 and Above 18,
 * girls to Under 16 and Above 16 — so a judge seated across both was being
 * offered one merged, unordered list: Under12, Under16, Under18, Above16,
 * Above18, Under10, Under14, with no indication that half of them belonged to
 * the other gender. `AGE_GROUPS_BY_GENDER` is the app's single source of that
 * rule and supplies the age order at the same time.
 *
 * A bracket the judge is seated in but that the gender does not normally run
 * (only reachable through legacy data — the admin screen derives its own list
 * from the same rule) is kept, at the end. Hiding it would leave a real panel
 * unreachable with nothing on screen to explain why.
 *
 * @param {Array} assignments
 * @param {Object} [category] - `gender` decides the list; without it every
 *   bracket held is returned in age order
 * @returns {string[]}
 */
export function ageGroupsForJudge(assignments, category = {}) {
  const held = new Set(
    seatsForCategory(assignments, category).map((seat) => seat.ageGroup).filter(Boolean)
  );

  const forGender = AGE_GROUPS_BY_GENDER[category.gender] || [];
  const ordered = forGender.filter((ageGroup) => held.has(ageGroup));
  const leftovers = ALL_AGE_GROUPS.filter((ageGroup) => held.has(ageGroup) && !forGender.includes(ageGroup));

  return [...ordered, ...leftovers];
}

/**
 * The competition types this judge holds a seat for in the chosen category.
 * @param {Array} assignments
 * @param {Object} [category]
 * @returns {string[]} slugs, in COP order
 */
export function competitionTypesForJudge(assignments, category = {}) {
  const seats = seatsForCategory(assignments, category);

  return COMPETITION_TYPES
    .map((type) => type.value)
    .filter((value) => seats.some((seat) => {
      const types = Array.isArray(seat.competitionTypes) ? seat.competitionTypes : [];
      return types.length === 0 || types.includes(value);
    }));
}

/** Canonical apparatus name, keeping anything unrecognized as written. */
const canonicalApparatus = (name) => normalizeApparatus(name) || String(name || '').trim();

/** COP order, with names this app does not know about last. */
const byApparatusOrder = (a, b) => {
  const rank = (name) => {
    const index = APPARATUS.indexOf(name);
    return index === -1 ? APPARATUS.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
};

/**
 * The apparatus this judge may be asked to judge.
 *
 * In order of authority:
 *
 *   1. THE SEAT, when it names one. Admins no longer seat a panel per
 *      apparatus — every seat is written `apparatus: null` — but rows created
 *      before that change still carry one, and a judge holding only the Rope
 *      seat must not be offered Pole.
 *   2. THE MEET's `apparatusConfig` for this competition type.
 *   3. What the ATHLETES in the category are actually registered for.
 *
 * There is no "all of them" answer. The judge says what they are scoring right
 * now, because that decides the combination checklist and which of an
 * athlete's scores the marks belong to — an athlete entered for three
 * apparatus earns three separate scores. An empty list is still a valid state
 * (nobody has entered, or the meet declares nothing), and the caller lets that
 * through rather than stranding the judge.
 *
 * @param {Array} assignments
 * @param {Object} [category] - { competitionId, gender, ageGroup, competitionType }
 * @param {Object} [sources]
 * @param {string[]} [sources.configured] - the meet's apparatusConfig for this type
 * @param {string[]} [sources.registered] - apparatus the entered athletes hold
 * @returns {string[]} in COP order
 */
export function apparatusOptionsForJudge(assignments, category = {}, sources = {}) {
  const seats = seatsForCategory(assignments, category);
  const seatScoped = seats.map((seat) => seat.apparatus).filter(Boolean);
  /*
   * Narrowed to the seat only when EVERY covering seat names an apparatus. One
   * category-wide seat among them covers all of them — the same rule the
   * server applies in `assignmentCoversCategory` — so narrowing on a mixture
   * would hide apparatus the judge is genuinely seated for.
   */
  let offered;
  if (seats.length > 0 && seatScoped.length === seats.length) {
    offered = seatScoped;
  } else if (sources.configured?.length) {
    offered = sources.configured;
  } else {
    offered = sources.registered || [];
  }

  return [...new Set(offered.map(canonicalApparatus).filter(Boolean))]
    .filter((name) => isApparatusAllowedForGender(name, category.gender))
    .sort(byApparatusOrder);
}
