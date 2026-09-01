/**
 * Do the environment files still agree?
 *
 *   npm run env:check          report differences
 *   npm run env:check -- --fix add missing keys (with the template's value) in
 *                              the template's order, preserving what is set
 *
 * `.env_example` is the template. `.env` and `.env.production` must carry the
 * SAME KEYS IN THE SAME ORDER — only the values differ.
 *
 * They had drifted a long way: `.env` had six keys the template lacked, the
 * template had five `.env` lacked, and CORS_ORIGINS — which the deployed API
 * cannot work without — was missing from the template entirely. Nothing noticed,
 * because a missing variable does not fail at startup; it silently takes a
 * default, and the one that matters shows up as a CORS error in someone else's
 * browser.
 *
 * VALUES ARE NEVER PRINTED. This reports key names only, so it is safe to run
 * anywhere and paste the output.
 */

const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.join(__dirname, '..');
const TEMPLATE = '.env_example';
const TARGETS = ['.env', '.env.production'];

/**
 * Key names in file order, plus the raw lines so --fix can rewrite in place.
 *
 * @param {string} file
 * @returns {{keys: string[], values: Map<string,string>, lines: string[]}|null}
 */
function readEnvFile(file) {
  const full = path.join(SERVER_DIR, file);
  if (!fs.existsSync(full)) return null;

  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  const keys = [];
  const values = new Map();

  for (const line of lines) {
    // Only real assignments — a commented key is documentation, not a setting.
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    keys.push(match[1]);
    values.set(match[1], match[2]);
  }

  return { keys, values, lines };
}

/**
 * Rewrite `file` so it carries every template key, in template order, keeping
 * whatever it already had set.
 *
 * Comments come from the template, so the three files read the same way. A key
 * the target has and the template does not is kept at the end rather than
 * dropped — it may be deliberate, and deleting somebody's setting to satisfy a
 * checker would be worse than reporting it.
 *
 * A MISSING key is filled from the template only for `.env`. For
 * `.env.production` it is left EMPTY, because the template's values are
 * development values and copying them into a production checklist is how
 * `RATE_LIMIT_ENABLED=false` — correct locally, wrong in production — ended up
 * pasted into a live dashboard and turned the limiter off on a public API.
 *
 * Empty is also the right default in its own right: every flag added here reads
 * its default from NODE_ENV, so an unset value in production means the
 * production behaviour, not the development one.
 *
 * @param {string} file
 * @param {Object} template
 * @param {Object} target
 * @returns {string[]} keys that were added blank and need a decision
 */
function rewrite(file, template, target) {
  const out = [];
  const templateKeys = new Set(template.keys);
  const blanked = [];
  const isProduction = file.includes('production');

  for (const line of template.lines) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      out.push(line);
      continue;
    }
    const key = match[1];

    if (target.values.has(key)) {
      out.push(`${key}=${target.values.get(key)}`);
    } else if (isProduction) {
      blanked.push(key);
      out.push(`${key}=`);
    } else {
      out.push(`${key}=${match[2]}`);
    }
  }

  const extra = target.keys.filter((key) => !templateKeys.has(key));
  if (extra.length) {
    out.push('');
    out.push('# -----------------------------------------------------------------------------');
    out.push('# Not in .env_example — kept because removing a setting to satisfy a checker');
    out.push('# would be worse than reporting it. Add them to the template or delete them.');
    out.push('# -----------------------------------------------------------------------------');
    for (const key of extra) out.push(`${key}=${target.values.get(key)}`);
  }

  fs.writeFileSync(path.join(SERVER_DIR, file), `${out.join('\n')}\n`);
  return blanked;
}

function main() {
  const fix = process.argv.includes('--fix');

  const template = readEnvFile(TEMPLATE);
  if (!template) {
    process.stderr.write(`${TEMPLATE} is missing — it is the template, nothing to compare against.\n`);
    process.exit(1);
  }

  process.stdout.write(`Template: ${TEMPLATE} (${template.keys.length} keys)\n\n`);

  let differences = 0;

  for (const file of TARGETS) {
    const target = readEnvFile(file);

    if (!target) {
      process.stdout.write(`  ${file.padEnd(20)} not present — skipped\n`);
      continue;
    }

    const missing = template.keys.filter((key) => !target.values.has(key));
    const extra = target.keys.filter((key) => !template.keys.includes(key));
    // Order only matters once both sides hold the same keys.
    const sameKeys = missing.length === 0 && extra.length === 0;
    const misordered = sameKeys
      && target.keys.join(',') !== template.keys.filter((k) => target.values.has(k)).join(',');

    if (sameKeys && !misordered) {
      process.stdout.write(`  ${file.padEnd(20)} matches (${target.keys.length} keys)\n`);
      continue;
    }

    differences += 1;
    process.stdout.write(`  ${file.padEnd(20)} DIFFERS\n`);
    if (missing.length) process.stdout.write(`      missing: ${missing.join(', ')}\n`);
    if (extra.length) process.stdout.write(`      extra:   ${extra.join(', ')}\n`);
    if (misordered) process.stdout.write('      order differs from the template\n');

    if (fix) {
      const blanked = rewrite(file, template, target);
      process.stdout.write('      -> rewritten in template order, existing values kept\n');
      if (blanked.length) {
        process.stdout.write(`      -> added EMPTY (decide each one): ${blanked.join(', ')}\n`);
        process.stdout.write('         Empty means "use the NODE_ENV default", which for a production\n');
        process.stdout.write('         file is usually what you want. Do not copy the dev value across.\n');
      }
    }
  }

  if (differences === 0) {
    process.stdout.write('\nAll environment files agree.\n');
    process.exit(0);
  }

  if (fix) {
    process.stdout.write('\nRewritten. Re-run without --fix to confirm.\n');
    process.exit(0);
  }

  process.stdout.write('\nRun `npm run env:check -- --fix` to add the missing keys.\n');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { readEnvFile };
