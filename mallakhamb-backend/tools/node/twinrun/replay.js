#!/usr/bin/env node
'use strict';

/**
 * Replay a recorded corpus and compare every response with the recording.
 *
 *   node twinrun/replay.js testapi                      against Node, started here on a restored database
 *   node twinrun/replay.js testapi --url http://127.0.0.1:8080 --db twin_test_java
 *                                                       against a server that is already running (the Java side)
 *
 * Each run: restore the corpus snapshot, start the clock at the recorded
 * instant, send the requests in order (with this run's ids and tokens swapped
 * in), and compare status, headers, cookies and body. Prints at most 40 lines;
 * the full result goes to build/twinrun/<corpus>.report.json. Exits 1 on any
 * difference.
 */

const fs = require('node:fs');
const path = require('node:path');
const { SERVER_ROOT, BACKEND_ROOT } = require('../lib/server');
const { applyTwinEnvironment, corpusDir, dbUri, assertLocal } = require('./lib/local');
const { restore } = require('./lib/snapshot');
const { startClockAt } = require('./lib/clock');
const { Comparison } = require('./lib/compare');
const { align } = require('./lib/align');
const { readDatabase, loadState, compareStates } = require('./lib/dbdiff');

const MAX_LINES = 40;
/** Request headers that carry a value from an earlier response. */
const REWRITTEN_HEADERS = ['cookie', 'authorization', 'x-csrf-token', 'x-competition-id'];

function parseArgs(argv) {
  const options = { corpus: null, url: null, db: null, restore: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') options.url = argv[++i];
    else if (argv[i] === '--db') options.db = argv[++i];
    else if (argv[i] === '--no-restore') options.restore = false;
    else if (!argv[i].startsWith('--') && !options.corpus) options.corpus = argv[i];
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  if (!options.corpus) throw new Error('Usage: node twinrun/replay.js <corpus> [--url <base url> --db <twin database>] [--no-restore]');
  options.db = options.db || (options.url ? 'twin_test_java' : 'twin_test_node');
  return options;
}

/** `GET /api/teams/6af8…/players?page=2` → `GET /api/teams/:id/players` */
const operationOf = (request) => `${request.method} ${request.path.split('?')[0].replace(/[0-9a-f]{24}/g, ':id')}`;

async function send(baseUrl, request, comparison) {
  const headers = { ...request.headers };
  for (const name of REWRITTEN_HEADERS) if (headers[name]) headers[name] = comparison.rewrite(headers[name]);
  const response = await fetch(baseUrl + comparison.rewrite(request.path), {
    method: request.method,
    headers,
    body: request.body === null ? undefined : comparison.rewrite(request.body),
    redirect: 'manual',
  });
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') responseHeaders[key] = value;
  });
  return {
    status: response.status,
    headers: responseHeaders,
    setCookie: response.headers.getSetCookie ? response.headers.getSetCookie() : [],
    body: await response.text(),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dir = corpusDir(options.corpus);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const entries = fs.readFileSync(path.join(dir, 'requests.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assertLocal(dbUri(options.db));

  if (options.restore) await restore(path.join(dir, 'snapshot.ejson.gz'), options.db);

  let baseUrl = options.url;
  let server = null;
  if (!baseUrl) {
    // Node, in this process: environment first, then the clock, then the Server modules.
    const uri = applyTwinEnvironment(options.db);
    startClockAt(meta.startedAt);
    const { startHarnessServer } = require(path.join(SERVER_ROOT, 'scripts', 'perf', 'lib', 'harness-server.js'));
    server = await startHarnessServer({ uri });
    baseUrl = server.baseUrl;
    // The API logs every 4xx it answers; here those are expected and only bury the report.
    const logger = server.container.resolve('logger');
    for (const transport of (logger.logger || logger).transports || []) transport.silent = true;
  }

  const comparison = new Comparison();
  const failures = [];
  const operations = new Map();
  for (const entry of entries) {
    const replayed = await send(baseUrl.replace(/\/$/, ''), entry.request, comparison);
    const operation = operationOf(entry.request);
    const diffs = comparison.response(operation, entry.response, replayed);
    if (comparison.pending) {
      const { name, ...responses } = comparison.pending;
      comparison.pending = null;
      diffs.push(...(await align(name, { ...responses, comparison, database: options.db })));
    }
    const seen = operations.get(operation) || { requests: 0, different: 0 };
    seen.requests++;
    if (diffs.length > 0) {
      seen.different++;
      failures.push({ seq: entry.seq, operation, path: entry.request.path, diffs });
    }
    operations.set(operation, seen);
  }
  if (server) await server.close();

  const stateFile = path.join(dir, 'final-state.json.gz');
  const stored = fs.existsSync(stateFile) ? compareStates(loadState(stateFile), await readDatabase(options.db), comparison) : null;

  const green = [...operations.values()].filter((operation) => operation.different === 0).length;
  const report = {
    corpus: options.corpus,
    target: options.url || 'node (in-process)',
    requests: entries.length,
    different: failures.length,
    operations: operations.size,
    operationsGreen: green,
    failures,
    storedDifferences: stored,
  };
  const reportFile = path.join(BACKEND_ROOT, 'build', 'twinrun', `${options.corpus}.report.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [];
  for (const failure of failures) {
    lines.push(`#${failure.seq} ${failure.operation}`);
    for (const diff of failure.diffs.slice(0, 3)) lines.push(`    ${diff}`);
    if (failure.diffs.length > 3) lines.push(`    … ${failure.diffs.length - 3} more`);
  }
  if (stored && stored.length > 0) {
    lines.push('database after the run:');
    for (const diff of stored) lines.push(`    ${diff}`);
  }
  for (const line of lines.slice(0, MAX_LINES - 2)) console.log(line);
  if (lines.length > MAX_LINES - 2) console.log(`… ${lines.length - (MAX_LINES - 2)} more lines in ${path.relative(process.cwd(), reportFile)}`);
  console.log(
    `twinrun: ${options.corpus} against ${report.target}: ${entries.length - failures.length}/${entries.length} requests match, ` +
      `${green}/${operations.size} operations green` +
      (stored === null ? '' : stored.length === 0 ? ', stored data matches' : `, ${stored.length} stored differences`),
  );
  // The Server keeps handles open (loggers, timers); the work is done, so leave.
  process.exit(failures.length > 0 || (stored && stored.length > 0) ? 1 : 0);
}

main().catch((error) => {
  console.error(`twinrun: ${error.stack || error.message}`);
  process.exit(2);
});
