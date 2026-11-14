'use strict';

/**
 * A small seeded random source for the golden vectors.
 *
 * The plan names fast-check (04 §3). A hand-rolled generator is used instead
 * because the vectors are committed and hashed: they must not change when a
 * library is upgraded. mulberry32 is fully specified here, so the same seed
 * gives the same cases on any Node version.
 */

/** FNV-1a, to turn a suite name into a seed. */
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [min, max], both included. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability. */
  chance(probability) {
    return this.next() < probability;
  }

  pick(list) {
    return list[this.int(0, list.length - 1)];
  }

  /** A new array with the same items in random order (Fisher-Yates). */
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** `count` distinct items from the list. */
  sample(list, count) {
    return this.shuffle(list).slice(0, count);
  }

  /**
   * A mark on a decimal grid, as the double a client sends: the nearest double
   * to the decimal text ("8.35"), not `k * step` with its accumulated error.
   */
  grid(min, max, step, decimals = 2) {
    const steps = Math.round((max - min) / step);
    return Number((min + this.int(0, steps) * step).toFixed(decimals));
  }
}

module.exports = { Rng, hash32 };
