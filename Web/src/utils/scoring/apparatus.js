/**
 * Which apparatus an athlete's registration covers.
 *
 * The apparatus on a registration entry is stored in `Competition.registeredTeams
 * .players[].apparatus`, which is `Mixed` — and three different shapes have been
 * written to it over the life of the app:
 *
 *   "Rope Mallakhamb"                        a bare name (what the coach dashboard writes)
 *   ["Pole Mallakhamb", "Rope Mallakhamb"]   a list, once an athlete can enter several
 *   { competition_1: ["Rope Mallakhamb"] }   keyed by competition type (what the judge pages read)
 *
 * Reading only one of them is how a Rope athlete came to be judged on the Pole
 * score sheet: the coach had written a string, the judge page indexed it as an
 * object, got `undefined`, skipped the filter, and the slip fell back to its
 * hardcoded Pole default. Every reader goes through here instead.
 *
 * An entry with NO apparatus recorded means "not specified", not "none" — those
 * athletes stay eligible for whatever is being judged, which is the behaviour
 * every competition seeded before this field was used depends on.
 */

import { normalizeApparatus, isApparatusAllowedForGender } from './copRules';

/**
 * The apparatus a score belongs to, as a comparable key.
 *
 * Mirrors `apparatusKey` in Server/src/config/cop-rules.js and must stay in
 * step with it: a stored score's apparatus defaults to Pole, so a row written
 * before a competition used apparatus and a row explicitly marked Pole are the
 * same squad place. An athlete's score is identified by (player, apparatus) —
 * somebody entered for three apparatus earns three separate scores, and
 * comparing on the player alone is what let the second one overwrite the first.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function apparatusKey(value) {
  return normalizeApparatus(value) || 'Pole Mallakhamb';
}

/** The three apparatus a Mallakhamb competition can be judged on (COP §5). */
export const APPARATUS = Object.freeze([
  'Pole Mallakhamb',
  'Hanging Mallakhamb',
  'Rope Mallakhamb',
]);

/**
 * What a meet offers one gender in one competition type.
 *
 * Mirrors `offeredApparatus` in Server/src/utils/data/competition-apparatus.util.js.
 * `competition.apparatusByGender` (`{ competition_1: { Male: [...], Female: [...] } }`)
 * decides when the meet declares it. A meet saved before the gender split has
 * only `apparatusConfig`; its per-type list then applies to both genders, less
 * what COP bars a gender from (Hanging Mallakhamb for women).
 *
 * With no `competitionType`, the answer is the union across every type the
 * meet runs — what a coach picks from when entering an athlete.
 *
 * @param {Object} competition
 * @param {string} [competitionType] - slug, e.g. 'competition_1'
 * @param {string} gender - 'Male' | 'Female'
 * @returns {string[]} in COP order
 */
export function offeredApparatus(competition, competitionType, gender) {
  const types = competitionType
    ? [competitionType]
    : (competition?.competitionTypes?.length
      ? competition.competitionTypes
      : Object.keys(competition?.apparatusConfig || {}));

  const seen = new Set();
  for (const type of types) {
    const configured = competition?.apparatusByGender?.[type]?.[gender];
    const list = Array.isArray(configured)
      ? configured
      : (competition?.apparatusConfig?.[type] || []).filter((name) => isApparatusAllowedForGender(name, gender));
    for (const name of list) seen.add(name);
  }
  return APPARATUS.filter((name) => seen.has(name));
}

/**
 * The apparatus list on a registration entry, for one competition type.
 *
 * @param {Object} entry - a `registeredTeams[].players[]` entry
 * @param {string} [competitionType] - e.g. 'competition_1'
 * @returns {string[]} apparatus names; empty when the entry does not say
 */
export function apparatusFor(entry, competitionType) {
  const raw = entry?.apparatus;
  if (!raw) return [];

  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) return raw.filter(Boolean);

  if (typeof raw === 'object') {
    const forType = competitionType ? raw[competitionType] : null;
    if (Array.isArray(forType)) return forType.filter(Boolean);
    if (typeof forType === 'string' && forType.trim()) return [forType.trim()];

    // No entry for this competition type. Fall back to everything the athlete
    // is registered for anywhere, rather than declaring them ineligible — a
    // competition that never split its config by type still has to work.
    if (!competitionType) {
      return Object.values(raw).flat().filter((a) => typeof a === 'string');
    }
    return [];
  }

  return [];
}

/**
 * Is this athlete registered to be judged on this apparatus?
 *
 * An entry that names no apparatus matches anything — see the note above.
 *
 * @param {Object} entry
 * @param {string} [competitionType]
 * @param {string} [apparatus] - when absent, nothing is being filtered on
 * @returns {boolean}
 */
export function isRegisteredFor(entry, competitionType, apparatus) {
  if (!apparatus) return true;
  const list = apparatusFor(entry, competitionType);
  if (list.length === 0) return true;
  return list.includes(apparatus);
}

/**
 * Every apparatus actually in use across a set of registration entries.
 *
 * This is what the judge's apparatus picker offers when the competition has no
 * `apparatusConfig` of its own — which is the normal state of the seeded
 * competitions, and the reason the picker never appeared at all.
 *
 * @param {Object[]} entries
 * @param {string} [competitionType]
 * @returns {string[]} in COP order, so the picker does not reorder itself
 */
export function apparatusInUse(entries, competitionType) {
  const seen = new Set();
  for (const entry of entries || []) {
    for (const name of apparatusFor(entry, competitionType)) seen.add(name);
  }
  return APPARATUS.filter((name) => seen.has(name));
}

/**
 * The apparatus a slip should be scored on.
 *
 * Precedence: what the judge chose, then what the athlete is registered for
 * when that is unambiguous, and only then the Pole default. The last step is
 * what used to happen unconditionally.
 *
 * @param {string} [chosen] - the apparatus selected for this session
 * @param {Object} [entry] - the athlete's registration entry
 * @param {string} [competitionType]
 * @returns {string}
 */
export function apparatusToJudge(chosen, entry, competitionType) {
  if (chosen) return chosen;
  const registered = apparatusFor(entry, competitionType);
  if (registered.length === 1) return registered[0];
  return 'Pole Mallakhamb';
}

/**
 * The gender a squad entry competes under.
 *
 * A registration entry carries its OWN `gender`, written from the coach's form
 * when the athlete was added. `entry.player.gender` is a separate fact — the
 * athlete's account — and nothing kept the two in step until the server started
 * verifying them on write (coach.service.addPlayerToAgeGroup).
 *
 * The ENTRY is authoritative, because everything downstream is keyed on it: the
 * category, the panel seat, the Score document. These screens used to filter on
 * `entry.player.gender` while pairing it with `entry.ageGroup` — the account for
 * one half of the category and the entry for the other — so a mismatch showed an
 * athlete to one panel and scored them under another.
 *
 * Falls back to the account for entries written before the field was populated.
 *
 * @param {Object} entry - a `registeredTeams[].players[]` entry
 * @returns {string|undefined}
 */
export function entryGender(entry) {
  return entry?.gender ?? entry?.player?.gender;
}
