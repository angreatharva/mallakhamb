/**
 * A competition's age groups as one write: the COP brackets it runs, the
 * custom groups the Super Admin made up for it, and which gender runs each
 * (owner, 2026-11-15 — see config/cop-rules "Custom age groups").
 *
 * Both competition write paths call `applyAgeGroups` — the Super Admin's
 * create/edit and the admin route — so the stored `ageGroups` can never name a
 * custom key the meet does not define, and a custom group cannot be deleted
 * while a player is still entered in it.
 *
 * @module utils/data/custom-age-groups.util
 */

const { ValidationError } = require('../../errors');
const {
  AGE_GROUPS,
  GENDERS,
  MAX_CUSTOM_AGE_GROUPS,
  CUSTOM_AGE_GROUP_LABEL_MAX,
  CUSTOM_AGE_MAX,
  isCustomAgeGroup,
  customAgeGroupKey,
  ageGroupLabel,
} = require('../../config/cop-rules');

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const fail = (message, extra = {}) => new ValidationError(message, { field: 'customAgeGroups', ...extra });

/** Display labels of the COP brackets, which a custom name may not reuse. */
const COP_LABELS = new Set(AGE_GROUPS.map((g) => ageGroupLabel(g).toLowerCase()));

/** '' / null / undefined → null; otherwise a whole age 0–99 or a 400. */
function readAge(value, what, label) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > CUSTOM_AGE_MAX) {
    throw fail(`${label}: ${what} must be a whole number from 0 to ${CUSTOM_AGE_MAX}`);
  }
  return n;
}

/**
 * Check and tidy the definitions sent by the form. A row with a key keeps it,
 * so renaming a group never orphans the entries and scores stored under it; a
 * row without one is new and gets one from its name.
 *
 * @param {Array} list
 * @returns {Array<{key:string,label:string,minAge:number|null,maxAge:number|null}>}
 */
function normalizeCustomAgeGroups(list) {
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) throw fail('Custom age groups must be a list');
  if (list.length > MAX_CUSTOM_AGE_GROUPS) throw fail(`At most ${MAX_CUSTOM_AGE_GROUPS} custom age groups per competition`);

  const out = [];
  const labels = new Set();
  for (const raw of list) {
    const label = String(raw?.label ?? '').replace(/\s+/g, ' ').trim();
    if (!label) throw fail('Every custom age group needs a name');
    if (label.length > CUSTOM_AGE_GROUP_LABEL_MAX) {
      throw fail(`"${label.slice(0, 20)}…" is too long — at most ${CUSTOM_AGE_GROUP_LABEL_MAX} characters`);
    }
    if (/[<>]/.test(label)) throw fail(`${label}: < and > are not allowed in a name`);
    const lower = label.toLowerCase();
    if (COP_LABELS.has(lower)) throw fail(`"${label}" is already a COP age group — tick it in the grid instead`);
    if (labels.has(lower)) throw fail(`Two custom age groups are both called "${label}"`);
    labels.add(lower);

    const minAge = readAge(raw?.minAge, 'the minimum age', label);
    const maxAge = readAge(raw?.maxAge, 'the maximum age', label);
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      throw fail(`${label}: the minimum age (${minAge}) is above the maximum (${maxAge})`);
    }

    const key = raw?.key ? String(raw.key) : null;
    if (key && !isCustomAgeGroup(key)) throw fail(`${label}: invalid key`);
    out.push({ key, label, minAge, maxAge });
  }

  const taken = [];
  for (const def of out) {
    if (!def.key) continue;
    if (taken.includes(def.key)) throw fail(`${def.label}: duplicate key`);
    taken.push(def.key);
  }
  for (const def of out) {
    if (def.key) continue;
    def.key = customAgeGroupKey(def.label, taken);
    taken.push(def.key);
  }
  return out;
}

/**
 * Validate and complete the age-group part of a competition write, in place.
 *
 *  - `customAgeGroups` (when sent) is tidied and keyed; a group that still
 *    holds a squad entry cannot be removed.
 *  - `ageGroups` (when sent) may name a COP bracket, or a custom key only if
 *    the meet defines it. (A COP bracket is not checked against the gender:
 *    stored meets may already hold such a pair, and the form never offers one.)
 *  - Removing a custom group drops its `ageGroups` rows even when the form did
 *    not send them.
 *
 * @param {Object} body - the write (mutated)
 * @param {Object|null} existing - the stored competition on an edit
 * @returns {Object} body
 * @throws {ValidationError}
 */
function applyAgeGroups(body, existing = null) {
  if (!body || typeof body !== 'object') return body;
  const sentCustom = has(body, 'customAgeGroups');
  const sentGroups = has(body, 'ageGroups');
  if (!sentCustom && !sentGroups) return body;

  const stored = plain(existing) || {};
  const before = (stored.customAgeGroups || []).filter((d) => isCustomAgeGroup(d?.key));
  let custom = before;

  if (sentCustom) {
    custom = normalizeCustomAgeGroups(body.customAgeGroups);
    const kept = new Set(custom.map((d) => d.key));
    const removed = before.filter((d) => !kept.has(d.key));
    if (removed.length) {
      const inUse = new Map();
      for (const rt of stored.registeredTeams || []) {
        for (const p of rt?.players || []) {
          if (removed.some((d) => d.key === p?.ageGroup)) inUse.set(p.ageGroup, (inUse.get(p.ageGroup) || 0) + 1);
        }
      }
      if (inUse.size) {
        const [key, count] = [...inUse.entries()][0];
        const def = removed.find((d) => d.key === key);
        throw fail(
          `${def.label} still has ${count} player${count === 1 ? '' : 's'} entered — move them to another age group before removing it`,
          { reason: 'CUSTOM_AGE_GROUP_IN_USE' }
        );
      }
    }
    body.customAgeGroups = custom;
  }

  const keys = new Set(custom.map((d) => d.key));
  const source = sentGroups ? body.ageGroups : (stored.ageGroups || []);
  if (source !== null && source !== undefined && !Array.isArray(source)) {
    throw new ValidationError('Age groups must be an array', { field: 'ageGroups' });
  }
  const seen = new Set();
  const groups = [];
  for (const row of source || []) {
    const gender = row?.gender;
    const ageGroup = row?.ageGroup;
    if (!GENDERS.includes(gender)) throw new ValidationError('Invalid gender in age groups', { field: 'ageGroups' });
    if (isCustomAgeGroup(ageGroup)) {
      if (!keys.has(ageGroup)) {
        // A row for a group this same write removed is dropped; any other
        // unknown key is a mistake.
        const justRemoved = sentCustom && before.some((d) => d.key === ageGroup);
        if (sentGroups && !justRemoved) {
          throw new ValidationError(`Age group ${ageGroup} is not defined for this competition`, { field: 'ageGroups' });
        }
        continue;
      }
    } else if (!AGE_GROUPS.includes(ageGroup)) {
      throw new ValidationError('Invalid age group in age groups', { field: 'ageGroups' });
    }
    const id = `${gender}:${ageGroup}`;
    if (seen.has(id)) continue;
    seen.add(id);
    groups.push({ gender, ageGroup });
  }
  body.ageGroups = groups;
  return body;
}

module.exports = { applyAgeGroups, normalizeCustomAgeGroups };
