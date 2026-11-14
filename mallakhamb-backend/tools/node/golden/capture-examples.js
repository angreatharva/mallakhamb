#!/usr/bin/env node
'use strict';

/**
 * Imports the worked examples from Node's own unit tests (04 §3).
 *
 * The engine functions are wrapped with a recorder, then each test file is
 * loaded under a minimal stand-in for Jest. Every call a test makes to an
 * engine function is kept as an example input. The tests' assertions are not
 * evaluated here (Jest does that in `Server/`); only the inputs are taken, and
 * `generate.js` records what Node returns for them.
 *
 * Writes `golden/examples.json`, which is committed, so generating vectors
 * doesn't need the tests.
 *
 *   node golden/capture-examples.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { SERVER_ROOT, requireServer } = require('../lib/server');
const { encode, decode } = require('./lib/codec');
const { SUITE_NAMES } = require('./suites');

/** Test files whose subject is a pure engine function. Paths are relative to `Server/tests/unit`. */
const TEST_FILES = [
  'v2-scoring.test.js',
  'calculation.service.test.js',
  'final-score-deductions.test.js',
  'lucky-draw.test.js',
  'ranking-apparatus.test.js',
  'utils/scoring/ranking.util.test.js',
  'utils/scoring/judge-slip.util.test.js',
  'utils/scoring/team-championship.util.test.js',
  'qualification.test.js',
  'late-fee-window.test.js',
  'discount-code.test.js',
  'age-eligibility.test.js',
  'seated-panel.util.test.js',
  'judge-assignment.util.test.js',
  'judge-panel-assignment.test.js',
  'canonical-apparatus.test.js',
  'performance-order.service.test.js',
];

const OUTPUT = path.join(__dirname, 'examples.json');
const suites = SUITE_NAMES.map((name) => require(`./suites/${name}`));

/** engine function → its spec, for functions a suite calls directly. */
const specByFunction = new Map();
/** `Class.method` → spec, for suites that call a service method through a wrapper. */
const specByMethod = new Map();
for (const suite of suites) {
  for (const spec of suite.functions) {
    spec.key = `${suite.engine}.${spec.name}`;
    specByFunction.set(spec.fn, spec);
    if (spec.method) specByMethod.set(spec.method, spec);
  }
}

const captured = new Map(); // spec.key → Map(argsJson → { from, args })
let currentFile = null;
let recording = true;

function record(spec, args) {
  if (!recording) return;
  let encoded;
  try {
    encoded = encode(args);
  } catch {
    return; // an argument plain data can't express (a function, a mock)
  }
  const json = JSON.stringify(encoded);
  const bucket = captured.get(spec.key) || new Map();
  if (!bucket.has(json)) bucket.set(json, { from: currentFile, args: encoded });
  captured.set(spec.key, bucket);
}

/** Replace every engine export the suites cover with a recording wrapper, in place. */
function wrapEngineExports() {
  let wrapped = 0;
  for (const cached of Object.values(require.cache)) {
    if (!cached.filename.startsWith(SERVER_ROOT) || cached.filename.includes('node_modules')) continue;
    const exported = cached.exports;
    if (!exported || (typeof exported !== 'object' && typeof exported !== 'function')) continue;
    for (const [name, value] of Object.entries(exported)) {
      const spec = typeof value === 'function' ? specByFunction.get(value) : null;
      if (!spec) continue;
      exported[name] = function recorded(...args) {
        record(spec, args);
        return value.apply(this, args);
      };
      wrapped++;
    }
    const prototype = typeof exported === 'function' ? exported.prototype : null;
    for (const name of prototype ? Object.getOwnPropertyNames(prototype) : []) {
      const spec = specByMethod.get(`${exported.name}.${name}`);
      if (!spec) continue;
      const original = prototype[name];
      prototype[name] = function recorded(...args) {
        record(spec, args);
        return original.apply(this, args);
      };
      wrapped++;
    }
  }
  return wrapped;
}

/** Anything: callable, constructible, every property is itself. Stands in for `jest` and for matchers. */
function anything() {
  const target = function stub() {};
  return new Proxy(target, {
    get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : anything()),
    apply: () => anything(),
    construct: () => anything(),
  });
}

/** `expect(x)`: when x is a function (`expect(() => f()).toThrow()`), call it so the engine call is recorded. */
function expectStub(value) {
  if (typeof value === 'function') {
    try {
      value();
    } catch {
      /* the test expects a throw */
    }
  }
  return anything();
}
Object.assign(expectStub, { any: () => anything(), anything: () => anything(), objectContaining: () => anything(), arrayContaining: () => anything(), stringContaining: () => anything(), stringMatching: () => anything(), extend: () => {} });

/** Load one test file under the stand-in; returns the number of tests run and failed. */
async function runTestFile(file) {
  const hooks = [[]];
  const tests = [];
  const describe = (_name, body) => {
    hooks.push([]);
    body();
    hooks.pop();
  };
  const it = (_name, body) => {
    if (typeof body === 'function') tests.push({ body, before: hooks.flat() });
  };
  const each = (register) => (table) => (name, body) => {
    for (const row of table) register(name, () => body(...(Array.isArray(row) ? row : [row])));
  };
  describe.each = each(describe);
  it.each = each(it);
  describe.skip = () => {};
  describe.only = describe;
  it.skip = () => {};
  it.only = it;
  it.todo = () => {};

  const beforeEach = (body) => hooks[hooks.length - 1].push(body);
  const once = (body) => hooks[hooks.length - 1].push(body);
  const mockFn = () => anything();
  const jest = { fn: mockFn, mock: () => {}, spyOn: () => anything(), clearAllMocks() {}, resetAllMocks() {}, restoreAllMocks() {}, useFakeTimers() {}, useRealTimers() {}, setSystemTime() {}, resetModules() {}, setTimeout() {} };
  Object.assign(globalThis, { describe, it, test: it, expect: expectStub, beforeEach, afterEach() {}, beforeAll: once, afterAll() {}, jest });

  require(file);
  let failed = 0;
  for (const test of tests) {
    try {
      for (const hook of test.before) await hook();
      await test.body();
    } catch {
      failed++; // an assertion helper the stand-in doesn't model; calls made before it are still recorded
    }
  }
  return { tests: tests.length, failed };
}

/** Keep an example only if it replays: same result from the decoded copy, twice, and not dependent on "now". */
function keep(spec, example) {
  if (spec.deterministic && !spec.deterministic(decode(example.args))) return false;
  const run = () => {
    try {
      return JSON.stringify(encode(spec.fn(...decode(example.args))));
    } catch (error) {
      return `throws ${error.name}`;
    }
  };
  try {
    return run() === run();
  } catch {
    return false;
  }
}

// A test may leave a rejected promise behind (its `rejects` assertion is not modelled here).
process.on('unhandledRejection', () => {});

async function main() {
  // Load everything the suites touch, so the exports exist to be wrapped.
  requireServer('services/scoring/calculation.service');
  const wrapped = wrapEngineExports();
  const originals = new Map([...specByFunction.values(), ...specByMethod.values()].map((spec) => [spec.key, spec]));

  const silenced = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  let report = [];

  // The tests run twice. An input that differs between the passes was built from "now" or from a
  // random id, so it can't be a stable vector; only inputs seen in both passes are kept.
  let firstPass = null;
  for (const pass of [1, 2]) {
  report = [];
  for (const relative of TEST_FILES) {
    const file = path.join(SERVER_ROOT, 'tests', 'unit', relative);
    if (!fs.existsSync(file)) {
      report.push(`${relative}: not found`);
      continue;
    }
    currentFile = `Server/tests/unit/${relative}`;
    delete require.cache[require.resolve(file)];
    Object.assign(console, { log() {}, warn() {}, error() {}, info() {}, debug() {} });
    try {
      const { tests, failed } = await runTestFile(file);
      report.push(`${relative}: ${tests} tests loaded${failed ? `, ${failed} stopped early` : ''}`);
    } catch (error) {
      report.push(`${relative}: could not be loaded (${error.message.split('\n')[0]})`);
    } finally {
      Object.assign(console, silenced);
    }
  }

  if (pass === 1) {
    firstPass = new Map([...captured.entries()].map(([key, bucket]) => [key, new Map(bucket)]));
    captured.clear();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  }
  for (const [key, bucket] of firstPass) {
    const second = captured.get(key) || new Map();
    for (const json of [...bucket.keys()]) if (!second.has(json)) bucket.delete(json);
    captured.set(key, bucket);
  }
  for (const key of [...captured.keys()]) if (!firstPass.has(key)) captured.delete(key);
  recording = false;
  const fixedArgs = (spec) => new Set((spec.fixed || []).map((args) => JSON.stringify(encode(args))));
  const output = {};
  let total = 0;
  for (const key of [...captured.keys()].sort()) {
    const spec = originals.get(key);
    const already = fixedArgs(spec);
    const examples = [...captured.get(key).entries()]
      .filter(([json, example]) => !already.has(json) && keep(spec, example))
      .map(([, example]) => example);
    if (examples.length === 0) continue;
    output[key] = examples;
    total += examples.length;
  }

  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 1)}\n`);
  for (const line of report) console.log(`  ${line}`);
  console.log(`capture-examples: ${wrapped} engine functions wrapped, ${total} examples for ${Object.keys(output).length} functions → golden/examples.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
