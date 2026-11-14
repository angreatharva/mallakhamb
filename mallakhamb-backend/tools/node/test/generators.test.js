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
