/**
 * defineLook — the shape of a look pack, and `extends` resolution.
 *
 * A pack (docs/design-language/PLAN.md §4.3):
 *
 *   defineLook({
 *     id: 'prime-time',
 *     extends: null,               // or another look's id: start from its values
 *     roles: {                     // contract ROLE_TOKENS, per role × appearance
 *       public: { dark: { accent, 'accent-fg', ident, 'ident-fg' }, light: { … } },
 *       player: { … }, …
 *     },
 *     shared: { … },               // APPEARANCE_TOKENS identical in both appearances
 *     appearances: { dark: { … }, light: { … } },   // the rest, per appearance
 *     look: { … },                 // LOOK_TOKENS: type, shape, motion
 *     reduceMotion: true,          // zero every duration under prefers-reduced-motion
 *     contrastExceptions: [],      // pairs this look knowingly fails, each with a reason
 *   })
 *
 * Values are CSS text. A `triplet` token may be written as #hex. A value may
 * reference another token with var(--name), exactly as CSS would resolve it.
 * `accent`, `accent-fg`, `ident` and `ident-fg` need not be written per
 * appearance: the generator points them at the role half for that appearance.
 *
 * Only the generator, the tests and the specimen page import packs (plan §4.6).
 */

const deepMerge = (base, over) => {
  if (over === undefined) return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)
    || over === null || typeof over !== 'object' || Array.isArray(over)) return over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value);
  return out;
};

export const defineLook = (pack) => {
  if (!pack || typeof pack.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(pack.id)) {
    throw new Error(`defineLook: a look needs a kebab-case id (got ${JSON.stringify(pack?.id)})`);
  }
  return Object.freeze({ extends: null, reduceMotion: false, contrastExceptions: [], ...pack });
};

/**
 * The pack with its `extends` chain applied, parent first.
 * @param {string} id
 * @param {Record<string, object>} registry id → pack
 */
export const resolveLook = (id, registry, seen = []) => {
  const pack = registry[id];
  if (!pack) throw new Error(`Unknown look "${id}"`);
  if (seen.includes(id)) throw new Error(`Look extends cycle: ${[...seen, id].join(' → ')}`);
  if (!pack.extends) return pack;
  const parent = resolveLook(pack.extends, registry, [...seen, id]);
  const { extends: _ignored, contrastExceptions = [], ...own } = pack;
  return {
    ...deepMerge(parent, own),
    id: pack.id,
    extends: pack.extends,
    // Exceptions never inherit: a child look states its own.
    contrastExceptions,
  };
};
