'use strict';

/**
 * The whole API surface, asked by every kind of user (04 §2, "generated from openapi.json").
 *
 * Run under `record-preload.js` by `record.js surface`. For every operation in
 * `Server/docs/openapi.json` it sends requests as an anonymous caller and as a
 * signed-in player, coach, judge, admin and super admin. What comes back (401,
 * 403, 404, 400, 200…) is not judged here: it is recorded, and the Java side
 * has to answer the same. That makes this corpus the route-by-route record of
 * who Node lets in and who it refuses.
 *
 * Passes, in order:
 *   1. every operation, every caller, with ids that exist nowhere and an empty body
 *   2. every GET, every caller, with real ids from the fixture
 *   3. every operation with an id, with a malformed id
 *   4. every parameterless GET again under /api/v1
 *   5. the operations that change or end a session (login, register, password, logout), last
 */

const path = require('node:path');

const SERVER_ROOT = process.cwd();
const { ApiClient } = require(path.join(SERVER_ROOT, 'scripts', 'perf', 'lib', 'client.js'));
const { startHarnessServer } = require(path.join(SERVER_ROOT, 'scripts', 'perf', 'lib', 'harness-server.js'));
const spec = require(path.join(SERVER_ROOT, 'docs', 'openapi.json'));

const PASSWORD = 'Perftest@2026';
/** The fixture's accounts (Server/scripts/perf/seedScale.js). */
const PERSONAS = {
  player: { login: '/api/players/login', email: 'perf.player1@perf.example.com' },
  coach: { login: '/api/coaches/login', email: 'perf.coach1@perf.example.com' },
  judge: { login: '/api/judge/login', email: 'perf.judge1@perf.example.com' },
  admin: { login: '/api/admin/login', email: 'perf.admin@perf.example.com' },
  superadmin: { login: '/api/superadmin/login', email: 'perf.superadmin@perf.example.com' },
};
const NOWHERE = '0123456789abcdef01234567';
const MALFORMED = 'not-an-id';
const WORDS = { status: 'ongoing', ageGroup: 'Under12' };

const operations = [];
for (const [template, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      operations.push({ method: method.toUpperCase(), template, id: operation.operationId, params: template.match(/\{[^}]+\}/g) || [] });
    }
  }
}

/** Operations that sign someone in or out, or change a password or address: they would break the callers used by the other passes. */
const changesSession = (operation) =>
  operation.method !== 'GET' && (operation.template.startsWith('/api/auth/') || /\/(login|register|password)$/.test(operation.template));

const fill = (template, idFor) => template.replace(/\{([^}]+)\}/g, (_match, name) => WORDS[name] || idFor(name));

/** Which fixture document an id parameter means, from its name or, for a bare `{id}`, from the path. */
function realIdFor(template, real) {
  return (name) => {
    const byName = { teamId: real.team, playerId: real.player, competitionId: real.competition, adminId: real.admin, judgeId: real.seat, scoreId: real.score, coachId: real.coach };
    if (byName[name]) return byName[name];
    if (name === 'id') {
      for (const [word, key] of [['competition', 'competition'], ['team', 'team'], ['player', 'player'], ['judge', 'seat'], ['admin', 'admin'], ['coach', 'coach'], ['score', 'score']]) {
        if (template.includes(word) && real[key]) return real[key];
      }
    }
    return NOWHERE;
  };
}

/** One document id per collection, straight from the fixture (before any request is sent). */
async function fixtureIds() {
  const { MongoClient } = require(path.join(SERVER_ROOT, 'node_modules', 'mongodb'));
  const client = new MongoClient(process.env.PERF_MONGODB_URI);
  await client.connect();
  const db = client.db();
  const first = async (collection) => {
    const document = await db.collection(collection).find({}).sort({ _id: 1 }).limit(1).next();
    return document ? String(document._id) : null;
  };
  const real = {
    competition: await first('competitions'),
    team: await first('teams'),
    player: await first('players'),
    coach: await first('coaches'),
    admin: await first('admins'),
    seat: await first('judgeassignments'),
    score: await first('scores'),
  };
  await client.close();
  return real;
}

async function main() {
  const real = await fixtureIds();
  const server = await startHarnessServer({ uri: process.env.PERF_MONGODB_URI });
  const logger = server.container.resolve('logger');
  for (const transport of (logger.logger || logger).transports || []) transport.silent = true;

  const callers = { anonymous: new ApiClient({ baseUrl: server.baseUrl, label: 'anonymous' }) };
  for (const [role, persona] of Object.entries(PERSONAS)) {
    const client = new ApiClient({ baseUrl: server.baseUrl, label: role });
    const signedIn = await client.login(persona.login, { email: persona.email, password: PASSWORD });
    if (!signedIn.ok) throw new Error(`surface: ${role} could not sign in (${signedIn.status})`);
    client.competitionId = real.competition;
    callers[role] = client;
  }

  let sent = 0;
  const ask = async (caller, operation, requestPath) => {
    const options = operation.method === 'GET' || operation.method === 'DELETE' ? {} : { body: {} };
    await caller.request(operation.method, requestPath, options);
    sent++;
  };
  const everyCaller = async (operation, requestPath) => {
    for (const caller of Object.values(callers)) await ask(caller, operation, requestPath);
  };

  const ordinary = operations.filter((operation) => !changesSession(operation));

  // 1. Ids that exist nowhere, an empty body.
  for (const operation of ordinary) await everyCaller(operation, fill(operation.template, () => NOWHERE));

  // 2. Reads, with real ids.
  for (const operation of ordinary.filter((op) => op.method === 'GET' && op.params.length > 0)) {
    await everyCaller(operation, fill(operation.template, realIdFor(operation.template, real)));
  }

  // 3. A malformed id: asked by nobody and by the super admin.
  for (const operation of ordinary.filter((op) => op.params.some((param) => !WORDS[param.slice(1, -1)]))) {
    const requestPath = fill(operation.template, () => MALFORMED);
    await ask(callers.anonymous, operation, requestPath);
    await ask(callers.superadmin, operation, requestPath);
  }

  // 4. The /api/v1 prefix answers the same as /api.
  for (const operation of ordinary.filter((op) => op.method === 'GET' && op.params.length === 0)) {
    const requestPath = operation.template.replace(/^\/api\//, '/api/v1/');
    await ask(callers.anonymous, operation, requestPath);
    await ask(callers.superadmin, operation, requestPath);
  }

  // 5. Session operations last; logout at the very end.
  const session = operations.filter(changesSession).sort((a, b) => Number(a.template.endsWith('/logout')) - Number(b.template.endsWith('/logout')));
  for (const operation of session) await everyCaller(operation, fill(operation.template, () => NOWHERE));

  process.stderr.write(`surface: ${operations.length} operations, ${sent} requests sent\n`);
  await server.close();
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`surface failed: ${error.stack}\n`);
  process.exit(1);
});
