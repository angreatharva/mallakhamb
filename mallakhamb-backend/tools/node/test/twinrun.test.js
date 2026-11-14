'use strict';

/**
 * The twin-run is only worth something if it fails when the two sides differ.
 * These tests feed the comparator pairs that must match and pairs that must
 * not. They need no database and no server.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { Comparison } = require('../twinrun/lib/compare');
const { compareStates } = require('../twinrun/lib/dbdiff');
const { assertLocal, dbUri } = require('../twinrun/lib/local');

const ID_A = '6af84557b0b75f21a1ee29d2';
const ID_B = '6af99999b0b75f21a1ee0000';
const ID_C = '6af11111b0b75f21a1ee1111';
const jwt = (claims) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${'s'.repeat(43)}`;
const response = (body, extra = {}) => ({ status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, setCookie: [], body: JSON.stringify(body), ...extra });
const diff = (a, b, operation = 'GET /api/x') => new Comparison().response(operation, a, b);

test('identical responses match', () => {
  assert.deepEqual(diff(response({ success: true, data: [1, 'a', null] }), response({ success: true, data: [1, 'a', null] })), []);
});

test('a generated id may differ, but must map one-to-one', () => {
  assert.deepEqual(diff(response({ _id: ID_A, owner: ID_A }), response({ _id: ID_B, owner: ID_B })), []);
  assert.equal(diff(response({ _id: ID_A, owner: ID_A }), response({ _id: ID_B, owner: ID_C })).length, 1, 'one recorded id became two');
  assert.equal(diff(response({ a: ID_A, b: ID_B }), response({ a: ID_C, b: ID_C })).length, 1, 'two recorded ids became one');
});

test('timestamps may differ; a timestamp against something else may not', () => {
  assert.deepEqual(diff(response({ at: '2026-11-14T11:24:23.561Z' }), response({ at: '2026-11-14T11:30:00.000Z' })), []);
  assert.equal(diff(response({ at: '2026-11-14T11:24:23.561Z' }), response({ at: 'yesterday' })).length, 1);
});

test('a token is compared by its claims', () => {
  const recorded = jwt({ userId: ID_A, userType: 'coach', iat: 1, exp: 2 });
  assert.deepEqual(diff(response({ token: recorded }), response({ token: jwt({ userId: ID_A, userType: 'coach', iat: 5, exp: 9 }) })), []);
  assert.equal(diff(response({ token: recorded }), response({ token: jwt({ userId: ID_A, userType: 'admin', iat: 5, exp: 9 }) })).length, 1, 'a different role in the token');
  assert.ok(diff(response({ token: recorded }), response({ token: jwt({ userId: ID_A, userType: 'coach', iat: 5 }) })).length > 0, 'a token with no expiry');
});

test('every real difference is reported', () => {
  const base = { success: true, data: { name: 'Team', total: 9.225, players: [{ n: 1 }, { n: 2 }], flag: false } };
  const changed = (edit) => {
    const copy = JSON.parse(JSON.stringify(base));
    edit(copy);
    return diff(response(base), response(copy)).length;
  };
  assert.ok(changed((b) => { b.data.name = 'team'; }) > 0, 'a string');
  assert.ok(changed((b) => { b.data.total = 9.23; }) > 0, 'a number');
  assert.ok(changed((b) => { b.data.total = '9.225'; }) > 0, 'a number sent as a string');
  assert.ok(changed((b) => { b.data.flag = null; }) > 0, 'false against null');
  assert.ok(changed((b) => { b.data.players.pop(); }) > 0, 'a shorter array');
  assert.ok(changed((b) => { b.data.players.reverse(); }) > 0, 'array order');
  assert.ok(changed((b) => { b.data.email = 'x@y.z'; }) > 0, 'a field only the replay sends (the PII case)');
  assert.ok(changed((b) => { delete b.data.flag; }) > 0, 'a missing field');
  assert.ok(changed((b) => { b.data = { total: 9.225, name: 'Team', players: b.data.players, flag: false }; }) > 0, 'key order');
});

test('status, headers and cookies are compared', () => {
  const body = { success: true };
  assert.ok(diff(response(body), response(body, { status: 201 })).length > 0, 'status');
  assert.ok(diff(response(body), response(body, { headers: { 'content-type': 'text/html' } })).length > 0, 'content type');
  assert.ok(diff(response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-new-token': jwt({ a: 1 }) } }), response(body)).length > 0, 'X-New-Token missing');

  const cookie = (attributes) => response(body, { setCookie: [`access_token_coach=${jwt({ userId: ID_A, exp: 1 })}; ${attributes}`] });
  const full = 'Max-Age=900; Path=/; Expires=Sat, 14 Nov 2026 11:39:23 GMT; HttpOnly; Secure; SameSite=None';
  assert.deepEqual(diff(cookie(full), cookie(full.replace('11:39:23', '12:00:00'))), [], 'only the expiry instant differs');
  assert.ok(diff(cookie(full), cookie(full.replace('; HttpOnly', ''))).length > 0, 'HttpOnly dropped');
  assert.ok(diff(cookie(full), cookie(full.replace('SameSite=None', 'SameSite=Lax'))).length > 0, 'SameSite changed');
  assert.ok(diff(cookie(full), cookie(full.replace('Max-Age=900', 'Max-Age=3600'))).length > 0, 'lifetime changed');
  assert.ok(diff(cookie(full), response(body)).length > 0, 'cookie not set');
});

test('invariants cover only what they name', () => {
  assert.deepEqual(diff(response({ error: { correlationId: '1-aaaa', message: 'No' } }), response({ error: { correlationId: '2-bbbb', message: 'No' } })), []);
  assert.ok(diff(response({ error: { correlationId: '1-aaaa', message: 'No' } }), response({ error: { correlationId: '2-bbbb', message: 'Nope' } })).length > 0);
  assert.ok(diff(response({ error: { correlationId: '1-aaaa' } }), response({ error: { correlationId: 7 } })).length > 0, 'an invariant still has a type');

  const health = (body, status = 200) => response(body, { status });
  assert.deepEqual(diff(health({ status: 'healthy', memory: { used: 85 } }), health({ status: 'unhealthy', memory: { used: 77 } }, 503), 'GET /api/health'), []);
  assert.ok(diff(health({ status: 'healthy', memory: { used: 85 } }), health({ status: 'healthy' }), 'GET /api/health').length > 0, 'a health key is missing');
  assert.ok(diff(health({ status: 'healthy' }), health({ status: 'healthy' }, 500), 'GET /api/health').length > 0, 'a status the rule does not allow');
});

test('a request is rewritten with the replay\'s ids and tokens', () => {
  const comparison = new Comparison();
  comparison.response('POST /api/x', response({ _id: ID_A, csrfToken: 'recorded-token' }), response({ _id: ID_B, csrfToken: 'replayed-token' }));
  assert.equal(comparison.rewrite(`/api/teams/${ID_A}/players?team=${ID_A}`), `/api/teams/${ID_B}/players?team=${ID_B}`);
  assert.equal(comparison.rewrite('csrf-token=recorded-token'), 'csrf-token=replayed-token');
  assert.equal(comparison.rewrite(`{"team":"${ID_C}"}`), `{"team":"${ID_C}"}`, 'an id from the snapshot is left alone');
});

test('stored data: types, missing fields and counts are differences', () => {
  const doc = (extra = {}) => ({ _id: { $oid: ID_A }, name: 'Team', size: { $numberInt: '6' }, createdAt: { $date: { $numberLong: '1' } }, __v: { $numberInt: '0' }, ...extra });
  const stored = (a, b) => compareStates({ teams: a }, { teams: b }, new Comparison());
  assert.deepEqual(stored([doc()], [doc({ createdAt: { $date: { $numberLong: '99' } } })]), [], 'only the timestamp differs');
  assert.ok(stored([doc()], [doc({ size: { $numberDouble: '6.0' } })]).length > 0, 'Int32 stored as Double');
  assert.ok(stored([doc()], [doc({ size: '6' })]).length > 0, 'a number stored as a string');
  assert.ok(stored([doc()], [doc({ createdAt: '2026-11-14' })]).length > 0, 'a date stored as a string');
  const { __v, ...withoutVersion } = doc();
  assert.ok(stored([doc()], [withoutVersion]).length > 0, '__v not stored');
  assert.ok(stored([doc()], [doc({ extra: true })]).length > 0, 'an extra stored field');
  assert.ok(stored([doc()], []).length > 0, 'a document that was never written');
  assert.deepEqual(stored([doc({ password: `$2a$12$${'a'.repeat(53)}` })], [doc({ password: `$2a$12$${'b'.repeat(53)}` })]), [], 'two bcrypt hashes of the same cost');
  assert.ok(stored([doc({ password: `$2a$12$${'a'.repeat(53)}` })], [doc({ password: 'plain-text' })]).length > 0, 'a password stored unhashed');
});

test('only a twin test database on this machine is accepted', () => {
  assert.equal(assertLocal(dbUri('twin_test_node')), 'mongodb://127.0.0.1:27017/twin_test_node');
  assert.throws(() => assertLocal('mongodb+srv://user:pw@cluster.example.net/BRMC_dev'));
  assert.throws(() => assertLocal('mongodb://user:pw@127.0.0.1:27017/twin_test_node'), 'credentials mean it is not the local throwaway');
  assert.throws(() => assertLocal('mongodb://10.0.0.70:27017/twin_test_node'));
  assert.throws(() => assertLocal('mongodb://127.0.0.1:27017/mallakhambcompetition_prod'));
  assert.throws(() => assertLocal('mongodb://127.0.0.1:27017,10.0.0.70:27017/twin_test_node'));
});

test('every recorded response matches itself, and stops matching when one value changes', () => {
  const file = path.resolve(__dirname, '..', '..', '..', 'twinrun', 'corpus', 'testapi', 'requests.jsonl');
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(entries.length > 100);
  let mutated = 0;
  for (const entry of entries) {
    const operation = `${entry.request.method} ${entry.request.path.split('?')[0].replace(/[0-9a-f]{24}/g, ':id')}`;
    assert.deepEqual(new Comparison().response(operation, entry.response, entry.response), [], `#${entry.seq} against itself`);
    const body = JSON.parse(entry.response.body);
    if (typeof body.success !== 'boolean' || operation.endsWith('/health')) continue;
    const changed = { ...entry.response, body: JSON.stringify({ ...body, success: !body.success }) };
    assert.ok(new Comparison().response(operation, entry.response, changed).length > 0, `#${entry.seq} with success flipped`);
    mutated++;
  }
  assert.ok(mutated > 100);
});
