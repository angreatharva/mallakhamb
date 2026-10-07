/**
 * The committed src/styles/generated/ files are exactly what the packs
 * compile to — a pack edit without `npm run looks` fails here, not in a
 * browser after deploy.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK_ID, resolvedLooks } from './index.js';
import { buildLooksCss, buildLooksMeta } from './build.js';

const generated = (file) =>
  readFileSync(resolve(__dirname, '../generated', file), 'utf8').replace(/\r\n/g, '\n');

describe('generated look files', () => {
  it('looks.css matches the packs (run `npm run looks`)', () => {
    expect(generated('looks.css')).toBe(buildLooksCss(resolvedLooks(), DEFAULT_LOOK_ID));
  });

  it('looks.meta.json matches the packs (run `npm run looks`)', () => {
    expect(JSON.parse(generated('looks.meta.json'))).toEqual(buildLooksMeta(resolvedLooks(), DEFAULT_LOOK_ID));
  });

  it('keeps every non-default look behind its [data-look] attribute', () => {
    const css = buildLooksCss(resolvedLooks(), DEFAULT_LOOK_ID);
    const others = css.split('/* ── look: ').slice(1).filter((part) => !part.startsWith(DEFAULT_LOOK_ID));
    for (const part of others) {
      const id = part.split(' ')[0];
      const selectors = part.match(/^[^{}\n]+(?=,\n|\s\{)/gm) || [];
      for (const selector of selectors) {
        if (selector.startsWith('@media') || selector.startsWith('*/')) continue;
        expect(selector, `a ${id} selector must name the look`).toContain(`[data-look="${id}"]`);
      }
    }
  });
});
