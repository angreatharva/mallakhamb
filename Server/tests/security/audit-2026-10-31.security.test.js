/**
 * Regression suite for the security audit of 2026-10-31
 * (SECURITY-AUDIT-2026-10-31.md at the repository root).
 *
 * Every finding the audit CONFIRMED by exploiting it is replayed here against
 * the real application — bootstrap() + createApp(), real routers, real
 * middleware, real services, an in-memory MongoDB — so a guard cannot pass
 * because a stub said so. Each attack is paired with the legitimate use of the
 * same endpoint, which must keep working: the fixes are meant to be invisible
 * to the people who are allowed to do the thing.
 *
 * A NOTE ON FALSE ALL-CLEARS (tests/security/team-detail.security.test.js): a
 * 500 body satisfies every "does not contain" assertion. Leak checks below
 * assert the success status and a non-empty payload first.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');

const PASSWORD = 'Correct#Pass2026';
const METRICS = 'audit-suite-metrics-token';

let app;
let container;
let tokenService;
let csrf;

const oid = () => new mongoose.Types.ObjectId();
const col = (name) => mongoose.connection.collection(name);
const future = (days) => new Date(Date.now() + days * 86400000);

beforeAll(async () => {
  // Read once by the config manager, so set before bootstrap().
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  process.env.METRICS_TOKEN = METRICS;
  process.env.ACCOUNT_RATE_LIMIT_ENABLED = 'true';

  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  ({ container } = bootstrap());
  app = createApp(container);
  tokenService = container.resolve('tokenService');
});

afterAll(() => {
  delete process.env.ACCOUNT_RATE_LIMIT_ENABLED;
});

beforeEach(async () => {
  csrf = (await request(app).get('/api/csrf-token')).body.csrfToken;
});

const bearer = (id, type, competitionId = null) => `Bearer ${tokenService.generateToken(String(id), type, competitionId)}`;
const send = (method, path, auth) => {
  const r = request(app)[method](path).set('X-CSRF-Token', csrf);
  return auth ? r.set('Authorization', auth) : r;
};

/**
 * Two meets. Coach A owns a team entered (in draft) at meet A with two
 * athletes; coach B is any other coach. An admin is assigned to meet A only.
 */
async function seed() {
  const ids = {
    meetA: oid(), meetB: oid(), coachA: oid(), coachB: oid(), team: oid(),
    p1: oid(), p2: oid(), admin: oid(), superadmin: oid(), score: oid(),
  };
  const hash = await bcrypt.hash(PASSWORD, 4);
  const meet = (id, name) => ({
    _id: id, name, place: 'Mumbai', year: 2026, level: 'district', status: 'upcoming',
    startDate: future(20), endDate: future(21), competitionTypes: ['competition_1'],
    ageGroups: [{ gender: 'Male', ageGroup: 'Under14' }], admins: [], isDeleted: false,
    registeredTeams: [], createdAt: new Date(), updatedAt: new Date(),
  });
  await col('competitions').insertMany([
    {
      ...meet(ids.meetA, 'Meet A'),
      registeredTeams: [{
        _id: oid(), team: ids.team, coach: ids.coachA, isActive: true, isSubmitted: false,
        paymentStatus: 'pending',
        players: [
          { player: ids.p1, ageGroup: 'Under14', gender: 'Male' },
          { player: ids.p2, ageGroup: 'Under14', gender: 'Male' },
        ],
      }],
    },
    meet(ids.meetB, 'Meet B'),
  ]);
  await col('coaches').insertMany([
    { _id: ids.coachA, firstName: 'Asha', lastName: 'Coach', email: 'coach.a@example.com', password: hash, isActive: true, loginAttempts: 0, lockUntil: null },
    { _id: ids.coachB, firstName: 'Bala', lastName: 'Coach', email: 'coach.b@example.com', password: hash, isActive: true, loginAttempts: 0, lockUntil: null },
  ]);
  await col('teams').insertOne({ _id: ids.team, name: 'Team A', coach: ids.coachA, isActive: true });
  await col('players').insertMany([
    { _id: ids.p1, firstName: 'Ravi', lastName: 'One', email: 'minor.one@example.com', emailType: 'self', password: hash, gender: 'Male', dateOfBirth: new Date('2013-01-01'), team: ids.team, isActive: true },
    { _id: ids.p2, firstName: 'Sam', lastName: 'Two', email: 'minor.two@example.com', emailType: 'self', password: hash, gender: 'Male', dateOfBirth: new Date('2013-02-01'), team: ids.team, isActive: true },
  ]);
  await col('admins').insertMany([
    { _id: ids.admin, name: 'Meet A Admin', email: 'admin.a@example.com', password: hash, role: 'admin', isActive: true, competitions: [ids.meetA] },
    { _id: ids.superadmin, name: 'Super', email: 'super@example.com', password: hash, role: 'superadmin', isActive: true, competitions: [] },
  ]);
  await col('scores').insertOne({
    _id: ids.score, competition: ids.meetA, teamId: ids.team, gender: 'Male', ageGroup: 'Under14',
    competitionType: 'Competition I', isLocked: true, lockedApparatus: [], lockedBy: ids.admin,
    judgeDetails: [
      { judgeId: oid(), judgeName: 'Judge One', judgeType: 'Senior Judge', email: 'judge.one@example.com' },
      { judgeId: oid(), judgeName: 'Judge Two', judgeType: 'Judge 1', email: 'judge.two@example.com' },
    ],
    playerScores: [{
      playerId: ids.p1, playerName: 'Ravi One', apparatus: 'Pole Mallakhamb',
      finalScore: 8.4, isFinalized: true, judgeSlips: [],
    }],
    createdAt: new Date(), updatedAt: new Date(),
  });
  return ids;
}

describe('C1 — /api/scoring is gone', () => {
  it('a freshly self-registered judge can no longer read or rewrite scores there', async () => {
    const ids = await seed();
    const reg = await send('post', '/api/judge/register').send({
      firstName: 'Audit', lastName: 'Probe', email: 'probe.judge@example.com', password: 'AuditJudge#2026x', phone: '9876543210',
    });
    expect(reg.status).toBe(201);
    const judge = `Bearer ${reg.body.data?.token || reg.body.token}`;

    for (const path of [`/api/scoring/competition/${ids.meetA}`, `/api/v1/scoring/competition/${ids.meetA}`]) {
      expect((await send('get', path, judge)).status).toBe(404);
    }
    const put = await send('put', `/api/scoring/${ids.score}`, judge).send({ isLocked: false, remarks: 'x' });
    expect(put.status).toBe(404);
    const stored = await col('scores').findOne({ _id: ids.score });
    expect(stored.remarks).toBeUndefined();
    expect(stored.playerScores[0].finalScore).toBe(8.4);
  });
});

describe('H1 — a meet admin cannot take over another meet', () => {
  it('refuses self-assignment and edits on a meet the admin is not assigned to', async () => {
    const ids = await seed();
    const admin = bearer(ids.admin, 'admin');

    expect((await send('post', `/api/competitions/${ids.meetB}/admins`, admin).send({ adminId: String(ids.admin) })).status).toBe(403);
    expect((await send('put', `/api/competitions/${ids.meetB}`, admin).send({ description: 'x' })).status).toBe(403);
    expect((await send('patch', `/api/competitions/${ids.meetB}/status`, admin).send({ status: 'ongoing' })).status).toBe(403);
    expect((await send('delete', `/api/competitions/${ids.meetB}`, admin)).status).toBe(403);
    expect((await send('get', `/api/competitions/${ids.meetB}/registrations`, admin)).status).toBe(403);

    const after = await col('admins').findOne({ _id: ids.admin });
    expect(after.competitions.map(String)).toEqual([String(ids.meetA)]);
  });

  it('still lets the admin read registrations of their own meet, and the super admin assign admins', async () => {
    const ids = await seed();
    expect((await send('get', `/api/competitions/${ids.meetA}/registrations`, bearer(ids.admin, 'admin'))).status).toBe(200);

    const assign = await send('post', `/api/competitions/${ids.meetB}/admins`, bearer(ids.superadmin, 'admin'))
      .send({ adminId: String(ids.admin) });
    expect(assign.status).toBe(200);
  });
});

describe('H2 / M3 — a coach acts only on their own team entry', () => {
  it('another coach cannot remove athletes from the squad', async () => {
    const ids = await seed();
    const res = await send('delete', `/api/competitions/${ids.meetA}/teams/${ids.team}/players/${ids.p1}`, bearer(ids.coachB, 'coach'));
    expect(res.status).toBe(403);
    const comp = await col('competitions').findOne({ _id: ids.meetA });
    expect(comp.registeredTeams[0].players).toHaveLength(2);
  });

  it('the owning coach still can', async () => {
    const ids = await seed();
    const res = await send('delete', `/api/competitions/${ids.meetA}/teams/${ids.team}/players/${ids.p2}`, bearer(ids.coachA, 'coach'));
    expect(res.status).toBe(200);
    const comp = await col('competitions').findOne({ _id: ids.meetA });
    expect(comp.registeredTeams[0].players).toHaveLength(1);
  });

  it('another coach cannot read the entry; the owner reads it without any email', async () => {
    const ids = await seed();
    const path = `/api/competitions/${ids.meetA}/teams/${ids.team}`;
    expect((await send('get', path, bearer(ids.coachB, 'coach'))).status).toBe(403);

    const own = await send('get', path, bearer(ids.coachA, 'coach'));
    expect(own.status).toBe(200);
    expect(own.body.data.players).toHaveLength(2);
    expect(own.text).not.toMatch(/@/);
  });
});

describe('M9 — admin team and player routes respect the meet', () => {
  it('a meet admin cannot name another meet to read a team, and cannot reach player records by id', async () => {
    const ids = await seed();
    const admin = bearer(ids.admin, 'admin', String(ids.meetA));
    expect((await send('get', `/api/admin/teams/${ids.team}?competition=${ids.meetB}`, admin)).status).toBe(403);
    expect((await send('get', `/api/admin/players/${ids.p1}`, admin)).status).toBe(403);
    expect((await send('put', `/api/admin/players/${ids.p1}/status`, admin).send({ status: 'inactive' })).status).toBe(403);
  });

  it('reading a team in their own meet still works', async () => {
    const ids = await seed();
    const admin = bearer(ids.admin, 'admin', String(ids.meetA));
    const res = await send('get', `/api/admin/teams/${ids.team}?competition=${ids.meetA}`, admin);
    expect(res.status).not.toBe(403);
    expect(res.status).toBeLessThan(500);
  });
});

describe('H3 — reset codes are hashed at rest and never served', () => {
  it('stores only the hash, still verifies the emailed code, and no admin listing carries it', async () => {
    const ids = await seed();
    const otpService = container.resolve('otpService');
    const spy = jest.spyOn(otpService, 'generateOTPCode').mockReturnValue('482913');
    try {
      const asked = await send('post', '/api/auth/forgot-password').send({ identifier: 'coach.a@example.com', userType: 'coach' });
      expect(asked.status).toBe(200);
    } finally {
      spy.mockRestore();
    }

    const stored = await col('coaches').findOne({ _id: ids.coachA });
    expect(stored.resetPasswordToken).toBe(crypto.createHash('sha256').update('482913').digest('hex'));

    const listing = await send('get', '/api/superadmin/coaches', bearer(ids.superadmin, 'admin'));
    expect(listing.status).toBe(200);
    expect(JSON.stringify(listing.body.data)).toContain('coach.a@example.com');
    expect(listing.text).not.toContain('resetPassword');
    expect(listing.text).not.toContain(stored.resetPasswordToken);

    const wrong = await send('post', '/api/auth/verify-otp').send({ identifier: 'coach.a@example.com', otp: '000000', userType: 'coach' });
    expect(wrong.status).toBe(400);
    const right = await send('post', '/api/auth/verify-otp').send({ identifier: 'coach.a@example.com', otp: '482913', userType: 'coach' });
    expect(right.status).toBe(200);
    const reset = await send('post', '/api/auth/reset-password-otp')
      .send({ identifier: 'coach.a@example.com', otp: '482913', password: 'NewPass#2026x', userType: 'coach' });
    expect(reset.status).toBe(200);

    const login = await send('post', '/api/coaches/login').send({ email: 'coach.a@example.com', password: 'NewPass#2026x' });
    expect(login.status).toBe(200);
  });
});

describe('M1 — the anonymous results feed carries no judge email or internal ids', () => {
  it('serves the published rows without contact details', async () => {
    const ids = await seed();
    const res = await request(app).get(`/api/public/scores?competitionId=${ids.meetA}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].playerScores).toHaveLength(1);
    expect(res.body.data[0].teamName).toBe('Team A');
    expect(res.text).not.toMatch(/@/);
    expect(res.text).not.toContain(String(ids.admin));
    expect(res.text).not.toContain(String(ids.coachA));
    expect(res.body.data[0].judgeDetails).toEqual([
      { judgeName: 'Judge One', judgeType: 'Senior Judge' },
      { judgeName: 'Judge Two', judgeType: 'Judge 1' },
    ]);
  });
});

describe('M4 — sessions', () => {
  it('a logout survives a restart: a fresh process still refuses the old token', async () => {
    const ids = await seed();
    const auth = bearer(ids.coachA, 'coach');
    const issuedAt = tokenService.verifyToken(auth.slice(7)).iat;
    await new Promise((r) => setTimeout(r, 1100)); // logout must be a later second than iat
    expect((await send('post', '/api/auth/logout', auth)).status).toBe(200);
    expect((await send('get', '/api/auth/me', auth)).status).toBe(401);

    // What a restarted (or failed-over) process does on its first check.
    const TokenInvalidationService = require('../../src/services/auth/token-invalidation.service');
    const SessionRevocation = require('../../src/models/SessionRevocation');
    const quiet = { info() {}, warn() {}, error() {}, debug() {} };
    const restarted = new TokenInvalidationService(null, quiet, {
      load: (now) => SessionRevocation.find({ expiresAt: { $gt: now } }).lean(),
      save: async () => {},
    });
    expect(await restarted.isTokenLoggedOut(String(ids.coachA), issuedAt)).toBe(true);
    expect(await restarted.isTokenLoggedOut(String(ids.coachB), issuedAt)).toBe(false);
  });

  it('rotation stops extending a session after 30 days, and keeps going inside them', () => {
    const now = Math.floor(Date.now() / 1000);
    const old = { userId: 'u', userType: 'coach', iat: now - 13 * 3600, auth_time: now - 31 * 86400 };
    expect(tokenService.rotateTokenIfNeeded(old)).toBeNull();

    const fresh = { userId: 'u', userType: 'coach', iat: now - 13 * 3600, auth_time: now - 2 * 86400 };
    const rotated = tokenService.rotateTokenIfNeeded(fresh);
    expect(rotated).toBeTruthy();
    expect(tokenService.verifyToken(rotated).auth_time).toBe(fresh.auth_time);
  });

  it('only HS256 tokens are accepted', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ userId: 'u', userType: 'admin' })).toString('base64url');
    expect(() => tokenService.verifyToken(`${header}.${body}.`)).toThrow();
  });
});

describe('M6 — health reports', () => {
  it('anonymous callers get statuses only; the metrics token gets the full report', async () => {
    const anon = await request(app).get('/api/health/ready');
    expect([200, 503]).toContain(anon.status);
    expect(anon.body.status).toBeDefined();
    expect(anon.body.checks.database.status).toBeDefined();
    expect(anon.body.checks.database.host).toBeUndefined();
    expect(anon.body.checks.database.name).toBeUndefined();

    const full = await request(app).get('/api/health/ready').set('Authorization', `Bearer ${METRICS}`);
    expect(full.status).toBe(anon.status);
    expect(full.body.checks.database).toHaveProperty('name');
  });
});

describe('L3 — editing an admin writes only the editable fields', () => {
  it('ignores lockout counters and other internals in the body', async () => {
    const ids = await seed();
    const res = await send('put', `/api/superadmin/admins/${ids.admin}`, bearer(ids.superadmin, 'admin'))
      .send({ name: 'Renamed', loginAttempts: 99, lockUntil: future(1), competitions: [] });
    expect(res.status).toBe(200);
    const stored = await col('admins').findOne({ _id: ids.admin });
    expect(stored.name).toBe('Renamed');
    expect(stored.loginAttempts).not.toBe(99);
    expect(stored.competitions.map(String)).toEqual([String(ids.meetA)]);
  });
});

describe('H4 — per-account guessing limits', () => {
  it('stops repeated failures against one account without touching other accounts or correct sign-ins', async () => {
    await seed();
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await send('post', '/api/coaches/login').send({ email: 'coach.b@example.com', password: `wrong-${i}` })).status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);

    // Another account from the same address is unaffected — a venue is never
    // throttled as a group — and correct sign-ins are never counted.
    for (let i = 0; i < 12; i += 1) {
      const ok = await send('post', '/api/coaches/login').send({ email: 'coach.a@example.com', password: PASSWORD });
      expect(ok.status).toBe(200);
    }
  });
});
