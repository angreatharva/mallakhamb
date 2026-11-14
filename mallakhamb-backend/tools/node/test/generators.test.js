'use strict';

/**
 * The generators must be deterministic (CI checks the committed reports are
 * current) and must account for every Mongoose enum field.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.resolve(ROOT, '..', '..', 'generated');
const FILES = ['vocabulary.json', 'VOCABULARY-DRIFT.md', 'catalogues.json', 'CATALOGUE-REPORT.md'];

const run = (script) => execFileSync(process.execPath, [path.join(ROOT, 'gen', script)], { cwd: ROOT, encoding: 'utf8' });
const snapshot = () => Object.fromEntries(FILES.map((name) => [name, fs.readFileSync(path.join(GENERATED, name), 'utf8')]));

test('the committed reports are what the generators produce now', () => {
  const committed = snapshot();
  run('gen-enums.js');
  run('gen-catalogues.js');
  const fresh = snapshot();
  for (const name of FILES) {
    assert.equal(fresh[name], committed[name], `${name} is stale: run "npm run gen" in tools/node and commit the result`);
  }
});

test('every Mongoose enum field belongs to exactly one concept or is rule data', () => {
  const vocabulary = JSON.parse(fs.readFileSync(path.join(GENERATED, 'vocabulary.json'), 'utf8'));
  const assigned = vocabulary.concepts.reduce((n, concept) => n + concept.usages.length, 0);
  assert.equal(assigned + vocabulary.ruleDataFields.length, vocabulary.fieldCount);
});

test('Java constant names are valid and unique within each enum', () => {
  const vocabulary = JSON.parse(fs.readFileSync(path.join(GENERATED, 'vocabulary.json'), 'utf8'));
  for (const concept of vocabulary.concepts) {
    const names = concept.values.map((value) => value.constant);
    for (const name of names) assert.match(name, /^[A-Z][A-Z0-9_]*$/, `${concept.name}.${name}`);
    assert.equal(new Set(names).size, names.length, `${concept.name} has duplicate constants`);
  }
});

test('every code declared in error-codes.js that Node uses appears in the catalogue', () => {
  const catalogues = JSON.parse(fs.readFileSync(path.join(GENERATED, 'catalogues.json'), 'utf8'));
  for (const name of ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'BUSINESS_RULE_VIOLATION']) {
    assert.ok(catalogues.codes[name], `${name} missing from catalogues.json`);
  }
});

test('the committed golden vectors replay exactly against the Node engines', () => {
  const output = execFileSync(process.execPath, [path.join(ROOT, 'golden', 'generate.js'), '--verify'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(output, /replay exactly/);
});

test('the golden codec round-trips the values plain JSON loses', () => {
  const { encode, decode } = require('../golden/lib/codec');
  const value = { a: undefined, b: Number.NaN, c: -0, d: Infinity, e: new Date('2026-12-12T00:00:00.000Z'), f: [1, null, 'x'] };
  const back = decode(JSON.parse(JSON.stringify(encode(value))));
  assert.ok('a' in back && back.a === undefined);
  assert.ok(Number.isNaN(back.b));
  assert.ok(Object.is(back.c, -0));
  assert.equal(back.d, Infinity);
  assert.equal(back.e.toISOString(), '2026-12-12T00:00:00.000Z');
  assert.deepEqual(back.f, [1, null, 'x']);
});

test('the same seed gives the same random cases', () => {
  const { Rng } = require('../golden/lib/rng');
  const draw = () => {
    const rng = new Rng(42);
    return [rng.next(), rng.int(1, 100), rng.grid(0, 10, 0.05), rng.shuffle([1, 2, 3, 4, 5])];
  };
  assert.deepEqual(draw(), draw());
  assert.deepEqual(draw()[3].slice().sort(), [1, 2, 3, 4, 5]);
});

test('Node gives the answers printed in the Code of Points for its worked examples', () => {
  const golden = path.resolve(ROOT, '..', '..', 'golden', 'cop-2022-11');
  const cases = (file) =>
    fs.readFileSync(path.join(golden, file), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((row) => String(row.from).startsWith('COP'));

  const [average, base] = cases('scoring/calculateIndividualScore.jsonl');
  assert.equal(average.result.executionAverage, 8.1); // §2.1.2
  assert.equal(base.result.executionAverage, 9.05); // §2.1.3
  assert.equal(base.result.toleranceUsed, 0.1);
  assert.equal(base.result.baseScoreApplied, true);
  assert.equal(base.result.averageMarks, 9.225);

  const [under14, tooYoungAGroup, under12] = cases('eligibility/checkAgeGroup.jsonl');
  assert.deepEqual([under14.result.ok, under14.result.lowest], [true, 'Under14']); // §1.8.3.4
  assert.equal(tooYoungAGroup.result.ok, false);
  assert.deepEqual([under12.result.ok, under12.result.lowest], [true, 'Under12']); // §1.8.3.5
});

test('the examples taken from the Node tests are current', () => {
  const file = path.join(ROOT, 'golden', 'examples.json');
  const committed = fs.readFileSync(file, 'utf8');
  execFileSync(process.execPath, [path.join(ROOT, 'golden', 'capture-examples.js')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(fs.readFileSync(file, 'utf8'), committed, 'examples.json is stale: run "npm run golden:examples" and "npm run golden"');
});
