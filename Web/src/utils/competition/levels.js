/**
 * Competition levels — the single client-side source of truth.
 *
 * These four values MIRROR the server's `Competition.level` enum
 * (Server/src/models/Competition.js), which is a required field validated on both
 * create and update (Server/src/validators/competition.validator.js). They are
 * stored lowercase; anything that renders them capitalises for display rather
 * than storing a second casing.
 *
 * A level is a property of the COMPETITION, never of the person. Nothing is
 * recorded on a player, coach, admin or judge account to say what level they
 * belong to — a district athlete who qualifies upward would immediately
 * contradict such a field, and the competition is the authority on its own
 * level. Selecting a level narrows the list of meets a signed-in user is
 * choosing between; it grants nothing. Access is still decided by the existing
 * checks (admin assignment, judge panel seats).
 *
 * Deliberately NOT reused from the judge's `certificationLevel`
 * (Server/src/models/JudgeAccount.js), which is a judging credential that happens
 * to share three of these words and uses different casing.
 *
 * @module utils/competition/levels
 */

/** The four levels, in ladder order. Mirrors the server enum exactly. */
export const COMPETITION_LEVELS = ['district', 'state', 'national', 'international'];

/**
 * Display copy per level. The blurb is shown under the title on the level
 * chooser so the four cards are not four identical words.
 */
export const LEVEL_META = {
  district: {
    label: 'District',
    blurb: 'Meets held at district level.',
  },
  state: {
    label: 'State',
    blurb: 'State championships and state-unit meets.',
  },
  national: {
    label: 'National',
    blurb: 'National championships.',
  },
  international: {
    label: 'International',
    blurb: 'International meets and invitationals.',
  },
};

/**
 * Coerce an arbitrary value to a valid level, or null.
 *
 * Used on everything read back from storage or a URL, both of which can hold a
 * stale value from before a level was renamed — returning null there sends the
 * user to the chooser instead of filtering the list down to nothing and looking
 * like they have no competitions.
 *
 * @param {unknown} value
 * @returns {string|null} A member of COMPETITION_LEVELS, or null
 */
export const normalizeLevel = (value) => {
  const candidate = String(value ?? '').trim().toLowerCase();
  return COMPETITION_LEVELS.includes(candidate) ? candidate : null;
};

/** Human label for a level, falling back to the raw value. */
export const levelLabel = (level) => LEVEL_META[normalizeLevel(level)]?.label ?? String(level ?? '');

/**
 * Competitions at one level.
 *
 * A null/unknown level returns the list untouched, so a caller that has not
 * chosen yet shows everything rather than nothing.
 *
 * @param {Array<Object>} competitions
 * @param {string|null} level
 * @returns {Array<Object>}
 */
export const competitionsAtLevel = (competitions, level) => {
  const list = Array.isArray(competitions) ? competitions : [];
  const wanted = normalizeLevel(level);
  if (!wanted) return list;
  return list.filter((c) => normalizeLevel(c?.level) === wanted);
};

/**
 * How many competitions sit at each level.
 *
 * The chooser shows these counts so a user can see that a level is empty BEFORE
 * committing to it — picking a level with nothing behind it and landing on an
 * empty list is the main way this flow can waste someone's time.
 *
 * @param {Array<Object>} competitions
 * @returns {Record<string, number>} Every level present as a key, zero included
 */
export const countByLevel = (competitions) => {
  const counts = Object.fromEntries(COMPETITION_LEVELS.map((l) => [l, 0]));
  for (const competition of Array.isArray(competitions) ? competitions : []) {
    const level = normalizeLevel(competition?.level);
    if (level) counts[level] += 1;
  }
  return counts;
};
