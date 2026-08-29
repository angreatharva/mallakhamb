/**
 * Emit the OpenAPI document, and prove it covers the API.
 *
 *   npm --prefix Server run docs:openapi          # write docs/openapi.{json,yaml}
 *   npm --prefix Server run docs:openapi -- --check   # verify only, write nothing
 *
 * The --check mode is the point. An API document is only worth having if it is
 * known to be complete, so this diffs the paths declared in src/docs/openapi.js
 * against the routes read off the LIVE Express router stack and exits non-zero
 * when either side has something the other does not. Add a route without
 * documenting it and this fails; document a route that no longer exists and it
 * fails the same way.
 *
 * Written as YAML by hand rather than with a `yaml` dependency: the document is
 * plain JSON-compatible data (objects, arrays, strings, numbers, booleans), which
 * is a small enough subset to serialise correctly in forty lines, and the API has
 * no other use for a YAML library.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { buildOpenApiDocument } = require('../src/docs/openapi');
const { extractRoutes } = require('./perf/extract-routes');

const OUT_DIR = path.join(__dirname, '..', 'docs');

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

/** Does this string need quoting to survive a YAML round trip? */
function needsQuoting(value) {
  if (value === '') return true;
  if (/^[\s]|[\s]$/.test(value)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;
  if (/:\s|\s#/.test(value)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true;
  if (/^[-+]?[0-9.]+([eE][-+]?[0-9]+)?$/.test(value)) return true;
  return false;
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  if (str.includes('\n')) {
    // Block scalar, so multi-line descriptions stay readable.
    const indent = '  ';
    return `|-\n${str.split('\n').map((line) => `${indent}${line}`).join('\n')}`;
  }
  return needsQuoting(str) ? JSON.stringify(str) : str;
}

/**
 * @param {*} node
 * @param {number} depth
 * @returns {string}
 */
function toYaml(node, depth = 0) {
  const pad = '  '.repeat(depth);

  if (Array.isArray(node)) {
    if (node.length === 0) return '[]';
    return node.map((item) => {
      if (item !== null && typeof item === 'object') {
        const body = toYaml(item, depth + 1);
        return `${pad}- ${body.slice((depth + 1) * 2)}`;
      }
      return `${pad}- ${yamlScalar(item)}`;
    }).join('\n');
  }

  if (node !== null && typeof node === 'object') {
    const entries = Object.entries(node).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const safeKey = needsQuoting(key) ? JSON.stringify(key) : key;
      if (value !== null && typeof value === 'object') {
        const nested = toYaml(value, depth + 1);
        if (nested === '{}' || nested === '[]') return `${pad}${safeKey}: ${nested}`;
        return `${pad}${safeKey}:\n${nested}`;
      }
      const scalar = yamlScalar(value);
      if (scalar.startsWith('|-')) {
        const [head, ...rest] = scalar.split('\n');
        const body = rest.map((line) => `${pad}${line}`).join('\n');
        return `${pad}${safeKey}: ${head}\n${body}`;
      }
      return `${pad}${safeKey}: ${scalar}`;
    }).join('\n');
  }

  return `${pad}${yamlScalar(node)}`;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/** `/api/teams/:id` → `/api/teams/{id}`, the form OpenAPI declares. */
const toOpenApiPath = (expressPath) =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '') || '/';

/**
 * Compare the document against the live router.
 * @param {Object} document
 * @returns {{missing: string[], extra: string[], documented: number, live: number}}
 */
function checkCoverage(document) {
  // Only the unversioned mount: `/api/v1/...` serves the identical router, and
  // the document declares that as a second server rather than duplicating 185
  // paths.
  const live = new Set(
    extractRoutes()
      .filter((route) => !route.path.startsWith('/api/v1/'))
      .filter((route) => route.path.startsWith('/api/'))
      // The docs themselves are not part of the API they describe, and they are
      // only mounted when ENABLE_API_DOCS is set — so whether they appear here
      // depends on the environment this happens to run in.
      .filter((route) => !route.path.startsWith('/api/docs'))
      .map((route) => `${route.method} ${toOpenApiPath(route.path)}`)
  );

  const documented = new Set();
  for (const [apiPath, methods] of Object.entries(document.paths)) {
    for (const method of Object.keys(methods)) {
      documented.add(`${method.toUpperCase()} ${apiPath}`);
    }
  }

  return {
    missing: [...live].filter((key) => !documented.has(key)).sort(),
    extra: [...documented].filter((key) => !live.has(key)).sort(),
    documented: documented.size,
    live: live.size,
  };
}

// ---------------------------------------------------------------------------

function main() {
  const checkOnly = process.argv.includes('--check');
  const serverUrl = process.env.OPENAPI_SERVER_URL || 'http://localhost:5000';

  const document = buildOpenApiDocument({ serverUrl });
  const coverage = checkCoverage(document);

  const report = [];
  report.push(`Live routes:  ${coverage.live}`);
  report.push(`Documented:   ${coverage.documented}`);

  if (coverage.missing.length) {
    report.push(`\n${coverage.missing.length} route(s) live but NOT documented:`);
    coverage.missing.forEach((key) => report.push(`  - ${key}`));
  }
  if (coverage.extra.length) {
    report.push(`\n${coverage.extra.length} path(s) documented but NOT live:`);
    coverage.extra.forEach((key) => report.push(`  + ${key}`));
  }

  const clean = coverage.missing.length === 0 && coverage.extra.length === 0;
  if (clean) report.push('\nComplete — every live route is documented, and nothing else is.');

  process.stderr.write(`${report.join('\n')}\n`);

  if (!checkOnly) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const json = path.join(OUT_DIR, 'openapi.json');
    const yaml = path.join(OUT_DIR, 'openapi.yaml');
    fs.writeFileSync(json, `${JSON.stringify(document, null, 2)}\n`);
    fs.writeFileSync(yaml, `${toYaml(document)}\n`);
    process.stderr.write(`\nWrote ${json}\n      ${yaml}\n`);
  }

  process.exit(clean ? 0 : 1);
}

if (require.main === module) main();

module.exports = { toYaml, checkCoverage, toOpenApiPath };
