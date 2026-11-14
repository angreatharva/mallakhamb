#!/usr/bin/env node
'use strict';

/**
 * Golden vector generator (04 §3).
 *
 * Runs the real Node engine functions on fixed worked cases and on
 * seeded-random cases, and writes one JSON Lines file per function:
 *
 *   {"id":"scoring.calculateIndividualScore#12","args":[…],"result":…}
 *   {"id":"fees.assertPaymentWindowOpen#3","args":[…],"throws":{"name":…,"message":…}}
 *
 * The Java engines must return exactly the same result for the same args.
 *
 *   node golden/generate.js                 write the committed set
 *   node golden/generate.js --verify        replay the committed set against Node; exit 1 on any difference
 *   node golden/generate.js --full          write the 100,000-per-engine set to build/golden-full
 *                                           (not committed) and record its hashes
 *   node golden/generate.js --count 500     random cases per function for the committed set
 *
 * Output is deterministic: same Node code, same files, same hashes.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { BACKEND_ROOT } = require('../lib/server');
const { encode, decode } = require('./lib/codec');
const { Rng, hash32 } = require('./lib/rng');

const EDITION = 'cop-2022-11';
const BASE_SEED = 20221101;
const DEFAULT_COUNT = 400;
const FULL_PER_ENGINE = 100_000;
const COMMITTED_DIR = path.join(BACKEND_ROOT, 'golden', EDITION);
const FULL_DIR = path.join(BACKEND_ROOT, 'build', 'golden-full', EDITION);

const { SUITE_NAMES } = require('./suites');

const SUITES = SUITE_NAMES.map((name) => require(`./suites/${name}`));

/** Worked examples taken from Node's unit tests by `capture-examples.js`: `engine.function` → [{ from, args }]. */
const EXAMPLES_FILE = path.join(__dirname, 'examples.json');
const EXAMPLES = fs.existsSync(EXAMPLES_FILE) ? JSON.parse(fs.readFileSync(EXAMPLES_FILE, 'utf8')) : {};

function parseArgs(argv) {
  const options = { count: DEFAULT_COUNT, full: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--full') options.full = true;
    else if (argv[i] === '--verify') options.verify = true;
    else if (argv[i] === '--count') options.count = Number(argv[++i]);
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  if (!Number.isInteger(options.count) || options.count < 0) throw new Error('--count needs a whole number');
  return options;
}

/** Run one case. The function receives a decoded copy, so what is recorded is exactly what was passed. */
function runCase(fn, encodedArgs) {
  try {
    return { result: encode(fn(...decode(encodedArgs))) };
  } catch (error) {
    // A JavaScript runtime error (a null dereference, say) has engine-specific wording; only its kind is recorded.
    const isRuntimeError = error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError;
    const thrown = isRuntimeError ? { name: error.name } : { name: error.name, message: error.message };
    if (error.statusCode !== undefined) thrown.statusCode = error.statusCode;
    if (error.code !== undefined) thrown.code = error.code;
    return { throws: thrown };
  }
}

/** Every case of one function, as JSONL lines: the fixed cases, the COP's worked examples, the examples from Node's tests, then `count` random ones. */
function* casesOf(engine, spec, count) {
  const prefix = `${engine}.${spec.name}`;
  let index = 0;
  const lineOf = (encodedArgs, from) =>
    JSON.stringify({ id: `${prefix}#${index++}`, ...(from ? { from } : {}), args: encodedArgs, ...runCase(spec.fn, encodedArgs) });
  const line = (args) => lineOf(encode(args));
  for (const args of spec.fixed || []) yield line(args);
  for (const example of spec.cop || []) yield lineOf(encode(example.args), example.from);
  for (const example of EXAMPLES[prefix] || []) yield lineOf(example.args, example.from);
  if (!spec.gen) return;
  const rng = new Rng(hash32(prefix) ^ BASE_SEED);
  for (let i = 0; i < count; i++) yield line(spec.gen(rng));
}

/** Write one function's cases; returns the count and the sha256 of the file. */
function writeFunction(dir, engine, spec, count) {
  const file = path.join(dir, engine, `${spec.name}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hash = crypto.createHash('sha256');
  const out = fs.openSync(file, 'w');
  let cases = 0;
  let thrown = 0;
  let buffer = '';
  for (const line of casesOf(engine, spec, count)) {
    buffer += `${line}\n`;
    cases++;
    if (line.includes('"throws":{')) thrown++;
    if (buffer.length > 1 << 20) {
      hash.update(buffer);
      fs.writeSync(out, buffer);
      buffer = '';
    }
  }
  hash.update(buffer);
  fs.writeSync(out, buffer);
  fs.closeSync(out);
  return { cases, thrown, sha256: hash.digest('hex') };
}

function generate(dir, countFor) {
  fs.rmSync(dir, { recursive: true, force: true });
  const manifest = { edition: EDITION, seed: BASE_SEED, engines: {} };
  for (const suite of SUITES) {
    const functions = {};
    let total = 0;
    for (const spec of suite.functions) {
      functions[spec.name] = writeFunction(dir, suite.engine, spec, countFor(suite));
      total += functions[spec.name].cases;
    }
    manifest.engines[suite.engine] = { cases: total, functions };
    console.log(`  ${suite.engine.padEnd(12)} ${String(total).padStart(7)} cases in ${suite.functions.length} functions`);
  }
  return manifest;
}

const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** Replay the committed files against the Node code as it is now. */
function verify() {
  const manifest = JSON.parse(fs.readFileSync(path.join(COMMITTED_DIR, 'manifest.json'), 'utf8'));
  let cases = 0;
  const failures = [];
  for (const suite of SUITES) {
    for (const spec of suite.functions) {
      const file = path.join(COMMITTED_DIR, suite.engine, `${spec.name}.jsonl`);
      const text = fs.readFileSync(file, 'utf8');
      const recorded = manifest.engines[suite.engine].functions[spec.name];
      if (!recorded || crypto.createHash('sha256').update(text).digest('hex') !== recorded.sha256) {
        failures.push(`${suite.engine}/${spec.name}.jsonl does not match its hash in manifest.json`);
      }
      for (const line of text.split('\n')) {
        if (!line) continue;
        const { id, from, args, ...expected } = JSON.parse(line);
        cases++;
        const actual = runCase(spec.fn, args);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          failures.push(`${id}: Node now gives ${JSON.stringify(actual).slice(0, 160)}, the vector says ${JSON.stringify(expected).slice(0, 160)}`);
        }
      }
    }
  }
  if (failures.length > 0) {
    for (const failure of failures.slice(0, 20)) console.error(`golden: ${failure}`);
    console.error(`golden: ${failures.length} difference(s) in ${cases} cases. If Node changed on purpose, regenerate and commit.`);
    process.exit(1);
  }
  console.log(`golden: ${cases} committed cases replay exactly against Node`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verify) return verify();

  if (options.full) {
    console.log(`golden: full set, ${FULL_PER_ENGINE} random cases per engine → ${path.relative(BACKEND_ROOT, FULL_DIR)}`);
    const manifest = generate(FULL_DIR, (suite) => Math.ceil(FULL_PER_ENGINE / Math.max(1, suite.functions.filter((spec) => spec.gen).length)));
    writeJson(path.join(FULL_DIR, 'manifest.json'), manifest);
    // Only the hashes of the full set are committed; the files are rebuilt on demand.
    writeJson(path.join(COMMITTED_DIR, 'manifest.full.json'), manifest);
    return undefined;
  }

  console.log(`golden: committed set, ${options.count} random cases per function → ${path.relative(BACKEND_ROOT, COMMITTED_DIR)}`);
  const fullManifestFile = path.join(COMMITTED_DIR, 'manifest.full.json');
  const fullManifest = fs.existsSync(fullManifestFile) ? fs.readFileSync(fullManifestFile) : null;
  const manifest = generate(COMMITTED_DIR, () => options.count);
  manifest.randomCasesPerFunction = options.count;
  writeJson(path.join(COMMITTED_DIR, 'manifest.json'), manifest);
  if (fullManifest) fs.writeFileSync(fullManifestFile, fullManifest);
  return undefined;
}

main();
