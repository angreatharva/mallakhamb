/**
 * The Player ID: the login a player uses when they have no email of their own.
 *
 * Format `firstname.lastname.ddmmyy`, from the name and date of birth given at
 * registration — Aarav Patil born 15 Jun 2016 is `aarav.patil.150616`. The
 * user chose this over a random code so a family can work it out again.
 *
 * Same name and same birthday is not rare (there are a lot of Rahul Sharmas),
 * so the second holder becomes `rahul.sharma.150616.2`, then `.3`. The suffix
 * is picked against the IDs already stored and the unique index settles a race
 * between two registrations — see PlayerRepository.create.
 *
 * An ID is never recomputed. Correcting a name or a date of birth later leaves
 * the login alone; changing it would lock the child out of their account.
 *
 * Stored lower-case, as `Player.loginId`. "Player ID" is only the label: the
 * request bodies already use `playerId` for the player's Mongo `_id`.
 *
 * @module utils/data/player-login-id
 */

// The validators `.escape()` names before they reach the service, so an
// apostrophe arrives as `&#x27;`. Undone first, or `O'Brien` would become
// `ox27brien`.
const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#x2F;': '/', '&#39;': "'" };
const unescapeHtml = (value) => String(value ?? '').replace(/&(?:amp|lt|gt|quot|#x27|#x2F|#39);/g, (m) => HTML_ENTITIES[m]);

/** Longest a single name part may contribute, so an ID stays typeable. */
const MAX_PART = 20;

/** What a stored or typed Player ID may look like. */
const LOGIN_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+){1,3}$/;

/**
 * One name, reduced to plain a–z: accents dropped (`José` → `jose`), spaces and
 * punctuation removed (`Sai Krishna` → `saikrishna`).
 * @param {string} name
 * @returns {string} possibly empty — a name in a non-Latin script has no letters left
 */
function namePart(name) {
  return unescapeHtml(name)
    .normalize('NFD') // é → e + accent mark; the a–z filter drops the mark
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, MAX_PART);
}

/**
 * `ddmmyy` from a date of birth. UTC, because a date-only value
 * ("2016-06-15") is stored as UTC midnight; local time would move it a day
 * west of Greenwich.
 * @param {Date|string} dateOfBirth
 * @returns {string|null} null when the date is not a date
 */
function birthPart(dateOfBirth) {
  // `new Date(null)` is 1 Jan 1970, not "no date".
  if (dateOfBirth == null || dateOfBirth === '') return null;
  const date = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;
  const two = (n) => String(n).padStart(2, '0');
  return `${two(date.getUTCDate())}${two(date.getUTCMonth() + 1)}${two(date.getUTCFullYear() % 100)}`;
}

/**
 * The ID before any duplicate suffix.
 *
 * A missing last name (one-word legacy names, see migration 006) leaves it out
 * rather than producing `name..150616`; a first name with no Latin letters
 * falls back to `player` so the ID is still something a person can type.
 *
 * @param {string} firstName
 * @param {string} lastName
 * @param {Date|string} dateOfBirth
 * @returns {string|null} null without a usable date of birth
 */
function baseLoginId(firstName, lastName, dateOfBirth) {
  const born = birthPart(dateOfBirth);
  if (!born) return null;
  const parts = [namePart(firstName) || 'player', namePart(lastName), born].filter(Boolean);
  return parts.join('.');
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches the base and every suffixed copy of it — `x.150616`, `x.150616.2`.
 * @param {string} base
 * @returns {RegExp}
 */
function siblingsPattern(base) {
  return new RegExp(`^${escapeRegex(base)}(\\.\\d+)?$`);
}

/**
 * The first free ID for a base, given the ones already taken: the base itself,
 * then `.2`, `.3`, … — the lowest gap, so a deleted account's number is reused
 * before a new one is minted.
 * @param {string} base
 * @param {Iterable<string>} taken
 * @returns {string}
 */
function nextFreeLoginId(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}.${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * What the user typed, in the stored form: trimmed and lower-case, so
 * `Aarav.Patil.150616` signs in.
 * @param {string} raw
 * @returns {string}
 */
function normalizeLoginId(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

/**
 * Is a sign-in identifier an email rather than a Player ID? A Player ID can
 * never contain `@`, so this is unambiguous.
 * @param {string} identifier
 * @returns {boolean}
 */
const looksLikeEmail = (identifier) => typeof identifier === 'string' && identifier.includes('@');

/**
 * Whose address a player's `email` is. Accounts from before the choice existed
 * have no `emailType` stored, and `.lean()` reads skip schema defaults, so a
 * missing value has to be read as `self` everywhere — this is that one place.
 * @param {Object|null} player
 * @returns {'self'|'guardian'|'none'}
 */
const emailTypeOf = (player) => player?.emailType || 'self';

/**
 * Query clause for "this address is a player's own": `self`, or never chosen.
 * @returns {Object}
 */
const OWN_EMAIL_CLAUSE = Object.freeze({ $or: [{ emailType: 'self' }, { emailType: { $exists: false } }, { emailType: null }] });

/** The guardian relation the coach registration path records. */
const COACH_RELATION = 'Coach';

/**
 * Did a coach register this player? Their account requests go to the coach
 * only, never the super admin. `registeredByCoach` is set from now on; the
 * players registered before it existed carry the guardian relation "Coach",
 * which nothing but the coach path writes.
 * @param {Object|null} player
 * @returns {boolean}
 */
const isCoachRegistered = (player) =>
  Boolean(player?.registeredByCoach) || player?.guardian?.relation === COACH_RELATION;

/** Query clause matching coach-registered players (see isCoachRegistered). */
const COACH_REGISTERED_CLAUSE = Object.freeze({
  $or: [{ registeredByCoach: { $ne: null } }, { 'guardian.relation': COACH_RELATION }],
});

module.exports = {
  COACH_REGISTERED_CLAUSE,
  COACH_RELATION,
  LOGIN_ID_PATTERN,
  OWN_EMAIL_CLAUSE,
  baseLoginId,
  birthPart,
  emailTypeOf,
  isCoachRegistered,
  looksLikeEmail,
  namePart,
  nextFreeLoginId,
  normalizeLoginId,
  siblingsPattern,
};
