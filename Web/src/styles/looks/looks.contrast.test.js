/**
 * The contrast matrix: every pair in contract.js CONTRAST_PAIRS, for every
 * look × appearance (× role, where the pair says so), as pure maths — no
 * browser, milliseconds. A translucent colour is composited over the surface
 * it is measured on.
 *
 * A look may list pairs it knowingly fails in `contrastExceptions`, each with
 * a reason. `classic` uses that for today's design, which must not move;
 * `prime-time` must pass with none.
 */
import { describe, expect, it } from 'vitest';
import { APPEARANCES, CONTRAST_PAIRS, ROLES, SURFACES } from './contract.js';
import { resolvedLooks } from './index.js';
import { resolveTokens } from './build.js';
import { contrast, parseColor } from './color.js';

/** Every measured pair: { look, appearance, role, fg, on, ratio, min }. */
export const measure = (look) => {
  const rows = [];
  for (const appearance of APPEARANCES) {
    for (const pair of CONTRAST_PAIRS) {
      for (const role of pair.perRole ? ROLES : ['public']) {
        const tokens = resolveTokens(look, appearance, role);
        const surfaces = pair.on === 'surfaces' ? SURFACES : [pair.on];
        for (const on of surfaces) {
          const ratio = contrast(parseColor(tokens[pair.fg]), parseColor(tokens[on]));
          rows.push({ look: look.id, appearance, role: pair.perRole ? role : undefined, fg: pair.fg, on, ratio, min: pair.min });
        }
      }
    }
  }
  return rows;
};

const excused = (look, row) => look.contrastExceptions.some((ex) =>
  ex.fg === row.fg
  && (ex.on === undefined || ex.on === row.on)
  && (ex.appearance === undefined || ex.appearance === row.appearance)
  && (ex.role === undefined || ex.role === row.role));

const label = (r) => `${r.look}/${r.appearance}${r.role ? `/${r.role}` : ''}: --${r.fg} on --${r.on} = ${r.ratio.toFixed(2)} (needs ${r.min})`;

describe.each(resolvedLooks().map((look) => [look.id, look]))('contrast — look "%s"', (id, look) => {
  const rows = measure(look);

  it('meets every contract pair, except the ones it lists with a reason', () => {
    const failing = rows.filter((r) => r.ratio + 1e-9 < r.min && !excused(look, r)).map(label);
    expect(failing).toEqual([]);
  });

  it('lists no exception it no longer needs', () => {
    const stale = look.contrastExceptions.filter((ex) => !rows.some((r) => r.ratio + 1e-9 < r.min && excused({ contrastExceptions: [ex] }, r)));
    expect(stale).toEqual([]);
  });

  it('gives every exception a reason', () => {
    expect(look.contrastExceptions.filter((ex) => !ex.reason)).toEqual([]);
  });
});
