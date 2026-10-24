/**
 * Conventions shared by every seed roster — player, coach and judge.
 *
 * The three rosters differ in what a person needs (a player has a date of
 * birth, a coach has a team, a judge has a certification level), but the way an
 * account is IDENTIFIED is the same everywhere, so it is defined once here:
 *
 *   email    firstname.<first letter of surname>@gmail.com, lowercase
 *   password <Firstname>@2026
 *
 * Deriving rather than writing them out per entry means the convention is
 * enforced instead of described, and adding a person is one line.
 */

/** @param {{firstName: string, lastName: string}} person */
export const emailFor = ({ firstName, lastName }) =>
  `${firstName}.${lastName[0]}@gmail.com`.toLowerCase();

/** @param {{firstName: string}} person */
export const passwordFor = ({ firstName }) => `${firstName}@2026`;

/**
 * The default password a coach gives the players they register themselves
 * (`PUT /coaches/player-default-password`). Every child the coach registers
 * signs in with it until they change it. Derived like the rest, so the API
 * chain can sign those children in without reading anything back.
 * @param {{firstName: string}} coach
 */
export const playerDefaultPasswordFor = ({ firstName }) => `${firstName}Squad@2026`;

/** @param {{firstName: string, lastName: string}} person */
export const fullName = ({ firstName, lastName }) => `${firstName} ${lastName}`;

/**
 * A date of birth that makes someone exactly this old today.
 *
 * Relative rather than fixed, because the roster is read months after it is
 * written and the age groups have hard bands — a literal birth date drifts an
 * athlete out of Under 14 on their birthday and the coach dashboard then
 * refuses the squad row with no explanation of what changed.
 *
 * Six months back so nobody sits on a band boundary: an athlete who turns the
 * band age today is in one group in the morning and another after midnight, and
 * that is not a fixture anyone should have to debug.
 *
 * Shared by the hand-written roster and the generated one so both age the same
 * way.
 *
 * @param {number} years - the age this person is meant to be
 * @returns {string} yyyy-mm-dd
 */
export function agedExactly(years) {
  const today = new Date();
  const born = new Date(Date.UTC(
    today.getUTCFullYear() - years,
    today.getUTCMonth() - 6,
    15
  ));
  return born.toISOString().slice(0, 10);
}

/**
 * Attach the derived fields to a list of people.
 * @template {{firstName: string, lastName: string}} T
 * @param {T[]} entries
 * @returns {(T & {email: string, password: string})[]}
 */
export const derive = (entries) =>
  entries.map((entry) => ({
    ...entry,
    email: emailFor(entry),
    password: passwordFor(entry),
  }));

/**
 * Validate a derived roster on import.
 *
 * Cheap here, expensive later: a colliding email surfaces as a mystery "already
 * registered" skip halfway through a seventy-person run, and a short password
 * as an API validation error with nothing pointing back at the roster file.
 * `Om@2026` is seven characters and would have failed that way.
 *
 * @param {{email: string, password: string, phone: string, firstName: string, lastName: string, dateOfBirth?: string}[]} people
 * @param {{label: string, requireDateOfBirth?: boolean}} options
 */
export const validateRoster = (people, { label, requireDateOfBirth = false }) => {
  const seen = new Map();

  for (const person of people) {
    const who = fullName(person);
    const clash = seen.get(person.email);
    if (clash) {
      throw new Error(
        `${label} email collision: "${person.email}" is produced by both ` +
        `${fullName(clash)} and ${who}. Change one of the first names.`
      );
    }
    seen.set(person.email, person);

    // Mirrors the server's password rules (Server/src/validators/common.validator.js)
    // and the register form's (Web/src/pages/unified/UnifiedRegister.jsx).
    if (person.password.length < 8) {
      throw new Error(
        `"${person.password}" is ${person.password.length} characters; the server ` +
        `requires 8. Use a longer first name for ${who}.`
      );
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(person.password)) {
      throw new Error(
        `"${person.password}" needs an uppercase letter, a lowercase letter and a ` +
        `number. Check the capitalisation of ${person.firstName}.`
      );
    }

    if (!/^\d{10}$/.test(person.phone)) {
      throw new Error(`${who} has phone "${person.phone}"; expected 10 digits.`);
    }

    if (requireDateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(person.dateOfBirth)) {
      throw new Error(
        `${who} has dateOfBirth "${person.dateOfBirth}"; expected yyyy-mm-dd.`
      );
    }
  }
};

/**
 * Narrow a roster from the environment, e.g. `ONLY=Laxman`.
 *
 * Matches a first name, a last name or an email, case-insensitively, so a
 * single person can be re-run without editing the roster or waiting for the
 * other sixty.
 *
 * @template {{firstName: string, lastName: string, email: string}} T
 * @param {T[]} people
 * @param {string} [only]
 * @returns {T[]}
 */
export const onlyMatching = (people, only = process.env.ONLY) => {
  if (!only) return people;

  const needle = only.trim().toLowerCase();
  const filtered = people.filter((p) =>
    p.firstName.toLowerCase() === needle ||
    p.lastName.toLowerCase() === needle ||
    p.email.toLowerCase() === needle
  );

  if (filtered.length === 0) {
    throw new Error(
      `ONLY="${only}" matches nobody on this roster. Known names: ` +
      people.map(fullName).join(', ')
    );
  }

  return filtered;
};
