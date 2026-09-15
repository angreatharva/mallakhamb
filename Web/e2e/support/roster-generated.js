import { agedExactly } from './people.js';
import { COACH_ROSTER } from './coach-roster.js';

/**
 * The athletes for every team that does not have a hand-written squad.
 *
 * WHY THESE ARE GENERATED AND THE OTHERS ARE NOT
 *
 * SGAM-A, SGAM-B and SGAM-C are real people who were registered by hand before
 * the roster file existed, and `roster.js` remains the single record of who
 * they are. The other seventeen teams exist to put five squads into each of the
 * twelve meets, and writing two hundred more names out by hand would be two
 * hundred more chances to typo a phone number or a date of birth into a run
 * that fails an hour in.
 *
 * Generated DETERMINISTICALLY, not randomly. A seed file whose contents change
 * every run cannot be re-run against an existing database, diffed, or
 * reconciled with what is already stored — the same reason the hand-written
 * phone numbers were generated once and then written down.
 *
 * WHY THE EMAILS CANNOT COLLIDE
 *
 * An account is identified by `firstname.<surname initial>@gmail.com`
 * (`people.js`), so two people collide only when they share a first name AND a
 * surname initial. Every surname below starts with a letter that NO surname on
 * the hand-written roster uses, which makes a collision with those seventy
 * impossible by construction rather than by luck — and within this set, the
 * pairing walks first names before surnames, so the first 144 of each gender
 * are distinct. `validateRoster` proves it either way, at import.
 *
 * @module e2e/support/roster-generated
 */

/**
 * Surnames whose initials are disjoint from every surname on the hand-written
 * roster (which uses A, B, C, D, G, J, K, M, P and S). Twelve of them, so the
 * pairing below has room for 144 athletes per gender against 12 first names.
 */
const SURNAMES = [
  'Erande', 'Fadke', 'Ingle', 'Latke', 'Naik', 'Oak',
  'Ranade', 'Telang', 'Ubale', 'Vaze', 'Wani', 'Yeole',
];

const MALE_FIRST_NAMES = [
  'Aditya', 'Nikhil', 'Rushikesh', 'Tejas', 'Yash', 'Soham',
  'Vedant', 'Pranav', 'Shreyas', 'Aniket', 'Harshad', 'Chinmay',
];

const FEMALE_FIRST_NAMES = [
  'Aditi', 'Nandini', 'Rutuja', 'Tanaya', 'Yamini', 'Sonal',
  'Vaishali', 'Pallavi', 'Shraddha', 'Anushka', 'Harshada', 'Chaitali',
];

/**
 * The squad every generated team fields: exactly one athlete per category
 * panel, so ten.
 *
 * ONE EACH, not more. Every athlete is added through an eight-interaction modal
 * and every squad is rebuilt once per meet, so the squad size multiplies by
 * thirty-six across a rebuild. Ten is the number that leaves no panel empty,
 * and a panel with nobody to judge looks like a broken competition rather than
 * an unfinished seed — which is the case worth covering. Depth within a
 * category is what the hand-written SGAM squads provide.
 *
 * The ten panels are gender × age group, and the two lists are NOT the same —
 * boys run to Under 18 and Above 18, girls to Under 16 and Above 16
 * (`Web/src/hooks/useAgeGroups.js`).
 *
 * Ages sit clear of every band edge. The bands are cumulative ceilings —
 * Under 14 is 0-13, Above 16 is 16 and up — so an athlete AT the boundary is in
 * the group one day and out of it the next, and the coach dashboard refuses the
 * squad row without saying why.
 */
const MALE_SLOTS = [
  { ageGroup: 'Under10', age: 8 },
  { ageGroup: 'Under12', age: 11 },
  { ageGroup: 'Under14', age: 13 },
  { ageGroup: 'Under18', age: 16 },
  { ageGroup: 'Above18', age: 20 },
];

const FEMALE_SLOTS = [
  { ageGroup: 'Under10', age: 8 },
  { ageGroup: 'Under12', age: 11 },
  { ageGroup: 'Under14', age: 13 },
  { ageGroup: 'Under16', age: 15 },
  { ageGroup: 'Above16', age: 17 },
];

/** Teams whose athletes are written out by hand in roster.js. */
const HAND_WRITTEN_TEAMS = new Set(['SGAM-A', 'SGAM-B', 'SGAM-C']);

/**
 * Phone numbers, from a block no hand-written entry uses.
 *
 * Ten digits with a leading 6-9, which is what the server's `phone()` validator
 * and the registration form both require.
 */
const PHONE_BASE = 7300000000;

/**
 * Build the athletes for every generated team.
 *
 * @returns {Array<{firstName: string, lastName: string, gender: string,
 *   dateOfBirth: string, phone: string, teamName: string, ageGroup: string}>}
 */
function build() {
  const teams = COACH_ROSTER
    .map((coach) => coach.teamName)
    .filter((teamName) => !HAND_WRITTEN_TEAMS.has(teamName));

  const entries = [];

  /*
   * Counted per gender across ALL teams, not per team, because that counter is
   * what keeps the names distinct: first names advance every athlete and the
   * surname only moves once the pool wraps, so the pair repeats no sooner than
   * `firstNames.length * SURNAMES.length` athletes in.
   */
  const counters = { Male: 0, Female: 0 };

  const add = (teamName, gender, firstNames, slot) => {
    const index = counters[gender];
    entries.push({
      firstName: firstNames[index % firstNames.length],
      lastName: SURNAMES[Math.floor(index / firstNames.length) % SURNAMES.length],
      gender,
      dateOfBirth: agedExactly(slot.age),
      phone: String(PHONE_BASE + entries.length),
      teamName,
      ageGroup: slot.ageGroup,
    });
    counters[gender] += 1;
  };

  for (const teamName of teams) {
    for (const slot of MALE_SLOTS) add(teamName, 'Male', MALE_FIRST_NAMES, slot);
    for (const slot of FEMALE_SLOTS) add(teamName, 'Female', FEMALE_FIRST_NAMES, slot);
  }

  const capacity = {
    Male: MALE_FIRST_NAMES.length * SURNAMES.length,
    Female: FEMALE_FIRST_NAMES.length * SURNAMES.length,
  };
  for (const gender of ['Male', 'Female']) {
    if (counters[gender] > capacity[gender]) {
      throw new Error(
        `Generated roster needs ${counters[gender]} ${gender} names but the pools only make ` +
        `${capacity[gender]} distinct first-name/surname-initial pairs. Add more first names ` +
        'or surnames in roster-generated.js — past this point two athletes share an email, ' +
        'and the second one silently fails to register as "already exists".'
      );
    }
  }

  return entries;
}

/** The generated athletes, for the seventeen teams without a hand-written squad. */
export const GENERATED_ENTRIES = build();
