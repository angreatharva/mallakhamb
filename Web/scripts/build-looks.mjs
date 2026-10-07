#!/usr/bin/env node
/**
 * npm run looks — compile the look packs (src/styles/looks/*.js) into
 *   src/styles/generated/looks.css        imported first by src/index.css
 *   src/styles/generated/looks.meta.json  resolved page/surface colours
 *
 * Both outputs are committed; looks.drift.test.js fails if they and the packs
 * disagree, so a pack edit without this step can't ship. Also runs before
 * `dev` and `build` (predev / prebuild). `--check` writes nothing and exits 1
 * on drift. See docs/design-language/PLAN.md §4.3.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOOK_ID, resolvedLooks } from '../src/styles/looks/index.js';
import { buildLooksCss, buildLooksMeta } from '../src/styles/looks/build.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/styles/generated');
const cssPath = resolve(outDir, 'looks.css');
const metaPath = resolve(outDir, 'looks.meta.json');

const looks = resolvedLooks();
const css = buildLooksCss(looks, DEFAULT_LOOK_ID);
const meta = `${JSON.stringify(buildLooksMeta(looks, DEFAULT_LOOK_ID), null, 2)}\n`;

// Compare ignoring line endings: the working copy may be CRLF (core.autocrlf).
const same = async (path, text) => {
  try {
    return (await readFile(path, 'utf8')).replace(/\r\n/g, '\n') === text;
  } catch {
    return false;
  }
};

const cssSame = await same(cssPath, css);
const metaSame = await same(metaPath, meta);

if (process.argv.includes('--check')) {
  if (cssSame && metaSame) {
    console.log('looks: generated files are up to date');
  } else {
    console.error('looks: generated files are stale — run `npm run looks`');
    process.exit(1);
  }
} else {
  await mkdir(outDir, { recursive: true });
  if (!cssSame) await writeFile(cssPath, css);
  if (!metaSame) await writeFile(metaPath, meta);
  console.log(`looks: ${looks.map((l) => l.id).join(', ')} → src/styles/generated/ (${cssSame && metaSame ? 'unchanged' : 'written'})`);
}
