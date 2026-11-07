/**
 * A seeded random source for the demo seed.
 *
 * Every draw in the demo comes from here, so one `--seed` always produces the
 * same season: the same people, the same marks, the same stories. Math.random
 * would make the cheat sheet (DEMO-ACCOUNTS.md) wrong on every run.
 *
 * @module scripts/demo/rng
 */

/** mulberry32: small, fast, good enough for fixtures. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of a string, to derive independent streams. */
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A random stream. `rng.fork('label')` gives an independent stream, so adding
 * a draw in one part of the generator does not shift every number after it.
 */
function createRng(seed) {
  const next = mulberry32(typeof seed === 'number' ? seed : hash(seed));
  const rng = {
    next,
    /** Float in [min, max). */
    float: (min = 0, max = 1) => min + (max - min) * next(),
    /** Integer in [min, max] inclusive. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** Normal(0, sd) by Box–Muller. */
    normal: (sd = 1) => {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: (list) => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    fork: (label) => createRng(hash(`${seed}:${label}`)),
  };
  return rng;
}

module.exports = { createRng, hash };
