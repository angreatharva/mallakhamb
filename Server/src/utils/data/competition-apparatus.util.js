/**
 * Which apparatus a meet runs, per competition type AND per gender.
 *
 * `Competition.apparatusByGender` is the source:
 *
 *   { competition_1: { Male: ['Pole Mallakhamb', 'Rope Mallakhamb'], Female: ['Rope Mallakhamb'] }, ... }
 *
 * `Competition.apparatusConfig` — the per-type list every other screen reads
 * (judge pickers, lots, scores filters) — is DERIVED from it on write, as the
 * union of both genders. Deriving it rather than asking the client for both
 * means the two can never disagree about what a type runs.
 *
 * A meet saved before the gender split has no `apparatusByGender`; for it, the
 * per-type list applies to both genders, less anything COP bars a gender from
 * (Hanging Mallakhamb for women). That is exactly what the coach dashboard
 * offered before this existed.
 *
 * @module utils/data/competition-apparatus.util
 */

const {
  APPARATUS,
  GENDERS,
  COMPETITION_TYPE_SLUGS,
  isApparatusAllowedForGender,
} = require('../../config/cop-rules');
const { ValidationError } = require('../../errors');

const TYPE_LABELS = { competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III' };

/** Map (hydrated document) or plain object (lean / JSON) — read either. */
function readKey(container, key) {
  if (!container) return undefined;
  if (typeof container.get === 'function') return container.get(key);
  return container[key];
}

/** Stable order, no duplicates, only real apparatus names. */
function tidy(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  return APPARATUS.filter((name) => set.has(name));
}

/**
 * Validate and normalise a submitted `apparatusByGender`, and derive the
 * per-type `apparatusConfig` from it.
 *
 * @param {*} value - the submitted `apparatusByGender`
 * @param {string[]} competitionTypes - the meet's types; only these are kept
 * @returns {{apparatusByGender: Object, apparatusConfig: Object}}
 * @throws {ValidationError} on an unknown key, an unknown or gender-barred
 *   apparatus, or a type that runs nothing for either gender
 */
function normalizeApparatusByGender(value, competitionTypes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('apparatusByGender must be an object keyed by competition type', 'apparatusByGender');
  }

  const types = (Array.isArray(competitionTypes) ? competitionTypes : [])
    .filter((type) => COMPETITION_TYPE_SLUGS.includes(type));

  for (const key of Object.keys(value)) {
    if (!COMPETITION_TYPE_SLUGS.includes(key)) {
      throw new ValidationError(`Invalid competition type in apparatusByGender: ${key}`, 'apparatusByGender');
    }
  }

  const apparatusByGender = {};
  const apparatusConfig = {};

  for (const type of types) {
    const entry = value[type] || {};
    if (typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(`apparatusByGender.${type} must be { Male: [...], Female: [...] }`, 'apparatusByGender');
    }

    const perGender = {};
    for (const gender of GENDERS) {
      const raw = entry[gender] ?? [];
      if (!Array.isArray(raw)) {
        throw new ValidationError(`apparatusByGender.${type}.${gender} must be a list`, 'apparatusByGender');
      }
      const unknown = raw.find((name) => !APPARATUS.includes(name));
      if (unknown !== undefined) {
        throw new ValidationError(`Invalid apparatus "${unknown}" for ${TYPE_LABELS[type]} ${gender}`, 'apparatusByGender');
      }
      const barred = raw.find((name) => !isApparatusAllowedForGender(name, gender));
      if (barred) {
        throw new ValidationError(`${barred} is not part of the ${gender.toLowerCase()} events (COP §11)`, 'apparatusByGender');
      }
      perGender[gender] = tidy(raw);
    }

    const union = tidy([...perGender.Male, ...perGender.Female]);
    if (union.length === 0) {
      throw new ValidationError(`Select at least one apparatus for ${TYPE_LABELS[type]}`, 'apparatusByGender');
    }

    apparatusByGender[type] = perGender;
    apparatusConfig[type] = union;
  }

  return { apparatusByGender, apparatusConfig };
}

/**
 * Fold a submitted `apparatusByGender` into a create/update body.
 *
 * When the body carries one, the derived `apparatusConfig` REPLACES whatever
 * per-type list was sent alongside it. A body without it is left alone, so an
 * older client that only knows `apparatusConfig` keeps working.
 *
 * @param {Object} body
 * @param {string[]} [fallbackTypes] - the stored types, for an update that does not resend them
 * @returns {Object} the body, with both fields normalised
 */
function applyApparatusByGender(body, fallbackTypes = []) {
  if (!body || body.apparatusByGender === undefined) return body;
  const types = Array.isArray(body.competitionTypes) ? body.competitionTypes : fallbackTypes;
  return { ...body, ...normalizeApparatusByGender(body.apparatusByGender, types) };
}

/**
 * What a meet offers one gender in one competition type.
 *
 * @param {Object} competition - hydrated or lean
 * @param {string} competitionType - slug
 * @param {string} gender - 'Male' | 'Female'
 * @returns {string[]}
 */
function offeredApparatus(competition, competitionType, gender) {
  const perType = readKey(competition?.apparatusByGender, competitionType);
  const configured = perType ? readKey(perType, gender) : undefined;
  if (Array.isArray(configured)) return tidy(configured);

  const legacy = readKey(competition?.apparatusConfig, competitionType);
  return tidy(legacy).filter((name) => isApparatusAllowedForGender(name, gender));
}

/**
 * Does this meet declare apparatus per gender at all?
 * @param {Object} competition
 * @returns {boolean}
 */
function hasGenderApparatus(competition) {
  const value = competition?.apparatusByGender;
  if (!value) return false;
  const size = typeof value.size === 'number' ? value.size : Object.keys(value).length;
  return size > 0;
}

module.exports = {
  normalizeApparatusByGender,
  applyApparatusByGender,
  offeredApparatus,
  hasGenderApparatus,
};
