#!/usr/bin/env node
/**
 * npm run lint:ratchet — lint warnings may go down, never up.
 *
 * Compares ESLint's warning count per rule with lint-baseline.json. A rule
 * above its baseline fails (exit 1) and lists the files that grew. A rule
 * below it passes and says so: lower the baseline in the same change with
 * `npm run lint:ratchet -- --update`, so the gain can't be spent later.
 * Errors are never allowed (that is `npm run lint:ci`'s job too).
 *
 * The starting point is the design-language plan's Phase 0.3
 * (docs/design-language/PLAN.md §10).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'lint-baseline.json');

const eslint = new ESLint({ cwd: root });
const results = await eslint.lintFiles(['.']);

const counts = {};
const byFile = {};
let errors = 0;
for (const result of results) {
  const file = relative(root, result.filePath).split('\\').join('/');
  for (const message of result.messages) {
    if (message.severity === 2) errors += 1;
    if (message.severity !== 1 || !message.ruleId) continue;
    counts[message.ruleId] = (counts[message.ruleId] || 0) + 1;
    byFile[message.ruleId] ??= {};
    byFile[message.ruleId][file] = (byFile[message.ruleId][file] || 0) + 1;
  }
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--update')) {
  const body = { note: 'Warnings per ESLint rule. May only go down: npm run lint:ratchet -- --update after a reduction.', warnings: sorted };
  await writeFile(baselinePath, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`lint-baseline.json written: ${Object.values(sorted).reduce((a, b) => a + b, 0)} warnings`);
  process.exit(errors ? 1 : 0);
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8')).warnings;
let failed = errors > 0;
if (errors) console.error(`✗ ${errors} lint error(s) — run npm run lint`);

for (const rule of new Set([...Object.keys(baseline), ...Object.keys(sorted)])) {
  const was = baseline[rule] || 0;
  const now = sorted[rule] || 0;
  if (now > was) {
    failed = true;
    console.error(`✗ ${rule}: ${now} warnings, baseline ${was}`);
    const top = Object.entries(byFile[rule] || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    for (const [file, n] of top) console.error(`    ${n}  ${file}`);
  } else if (now < was) {
    console.log(`↓ ${rule}: ${now} (baseline ${was}) — lower it: npm run lint:ratchet -- --update`);
  }
}

if (failed) process.exit(1);
console.log('✓ lint ratchet holds');
