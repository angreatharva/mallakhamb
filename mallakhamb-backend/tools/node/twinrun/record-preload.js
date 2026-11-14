'use strict';

/**
 * Preload for recording a corpus: `node -r record-preload.js <a Server harness script>`.
 *
 * The harness scripts in `Server/scripts/perf` start the real API in-process
 * and drive it with `fetch`. This preload changes nothing in `Server/`. It:
 *
 *   1. points the process at a local twin database and switches mail, payment
 *      and OCR off (before any Server module loads);
 *   2. wraps `fetch`, so every request the script makes and every response the
 *      API gives is written to the corpus, in order;
 *   3. just before the first request, saves the database as the snapshot every
 *      replay starts from, and notes the time as the clock's start instant.
 *
 * Settings come from the environment: TWINRUN_CORPUS (name), TWINRUN_DB.
 */

const fs = require('node:fs');
const path = require('node:path');
const { applyTwinEnvironment, corpusDir } = require('./lib/local');

const corpus = process.env.TWINRUN_CORPUS;
const database = process.env.TWINRUN_DB || 'twin_test_node';
if (!corpus) throw new Error('record-preload: TWINRUN_CORPUS is not set');

applyTwinEnvironment(database);

const dir = corpusDir(corpus);
const requestsFile = path.join(dir, 'requests.jsonl');
const snapshotFile = path.join(dir, 'snapshot.ejson.gz');
const metaFile = path.join(dir, 'meta.json');

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(requestsFile, '');

const realFetch = globalThis.fetch;
let seq = 0;
let ready = null;

/** Save the starting state once, before the first request reaches the API. */
function snapshotOnce() {
  if (!ready) {
    ready = (async () => {
      const { dump } = require('./lib/snapshot');
      const startedAt = new Date().toISOString();
      const counts = await dump(database, snapshotFile);
      fs.writeFileSync(metaFile, `${JSON.stringify({ corpus, startedAt, snapshot: counts }, null, 2)}\n`);
    })();
  }
  return ready;
}

const headersOf = (headers) => {
  const out = {};
  new Headers(headers || {}).forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

/** Text bodies are kept as text; anything else (a PDF, an image) as base64, so no byte is lost. */
async function bodyOf(response) {
  const type = response.headers.get('content-type') || '';
  if (type === '' || /json|text|xml|javascript|urlencoded/.test(type)) return { body: await response.text() };
  return { body: null, bodyBase64: Buffer.from(await response.arrayBuffer()).toString('base64') };
}

/**
 * One request at a time. A load script (meetDay.js) sends requests concurrently, and the order the
 * API handles them in would then be chance. Queued, the recorded order is the order they were served
 * in, which a replay can repeat.
 */
let queue = Promise.resolve();
globalThis.fetch = function queuedFetch(input, init) {
  const result = queue.then(() => recordingFetch(input, init));
  queue = result.catch(() => {});
  return result;
};

async function recordingFetch(input, init = {}) {
  await snapshotOnce();
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const entry = {
    seq: seq++,
    request: {
      method: (init.method || 'GET').toUpperCase(),
      path: url.pathname + url.search,
      headers: headersOf(init.headers),
      body: typeof init.body === 'string' ? init.body : null,
    },
  };
  if (init.body && typeof init.body !== 'string') entry.request.unsupportedBody = init.body.constructor.name;

  const response = await realFetch(input, init);
  const headers = headersOf(response.headers);
  delete headers['set-cookie'];
  entry.response = {
    status: response.status,
    headers,
    setCookie: response.headers.getSetCookie ? response.headers.getSetCookie() : [],
    ...(await bodyOf(response.clone())),
  };
  fs.appendFileSync(requestsFile, `${JSON.stringify(entry)}\n`);
  return response;
}
