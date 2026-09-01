/**
 * Ground-truth route table, read off the live Express router stack.
 *
 * A hand-maintained API list drifts the moment somebody adds a route, so both
 * the OpenAPI spec (scripts/perf/openapi.js) and the benchmark harness are
 * checked against THIS rather than against the route files read by eye.
 *
 *   node scripts/perf/extract-routes.js [out.json]
 *
 * Booting the app needs no database — createApp only wires middleware — so this
 * runs offline and in CI.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { bootstrap } = require('../../src/infrastructure/bootstrap');
const { createApp } = require('../../src/infrastructure/createApp');

/**
 * Turn the regexp Express compiles for a mounted router back into its path.
 * `/^\/api\/v1\/?(?=\/|$)/i` → `/api/v1`.
 *
 * @param {RegExp} regexp
 * @returns {string}
 */
function mountPathOf(regexp) {
  if (!regexp) return '';
  const source = regexp.source;
  if (source === '^\\/?$' || source === '^\\/?(?=\\/|$)') return '';
  return source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/')
    .replace(/\(\?:\(\[\^\\?\/]\+\?\)\)/g, ':param');
}

/**
 * @param {Array} stack - an Express router stack
 * @param {string} prefix - the path this stack is mounted at
 * @param {Array} out
 */
function walk(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      for (const method of methods) {
        out.push({
          method: method.toUpperCase(),
          path: (prefix + layer.route.path).replace(/\/{2,}/g, '/'),
          // The middleware names are how the spec knows which routes are
          // authenticated and which validate a body.
          handlers: layer.route.stack.map((s) => s.name).filter(Boolean),
        });
      }
    } else if (layer.handle?.stack) {
      walk(layer.handle.stack, prefix + mountPathOf(layer.regexp), out);
    }
  }
}

/** @returns {{method: string, path: string, handlers: string[]}[]} */
function extractRoutes() {
  const { container } = bootstrap();
  const app = createApp(container);

  const found = [];
  walk(app._router.stack, '', found);

  const seen = new Set();
  return found.filter((route) => {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (require.main === module) {
  const routes = extractRoutes();
  const out = path.resolve(process.argv[2] || path.join(__dirname, 'routes.generated.json'));
  fs.writeFileSync(out, `${JSON.stringify(routes, null, 2)}\n`);
  // stderr, because the logger already owns stdout.
  process.stderr.write(`${routes.length} routes → ${out}\n`);
  process.exit(0);
}

module.exports = { extractRoutes };
