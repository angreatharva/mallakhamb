/**
 * The owner's correction tools (docs/superadmin-control-plan.md, Phases 2–6),
 * end to end: real app, real services, in-memory MongoDB. Each block proves a
 * correction does what it says, keeps a reason and a before/after record in
 * History, and refuses what it must refuse.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');

let app;
let container;
let tokenService;
let csrf;

const oid = () => new mongoose.Types.ObjectId();
const col = (name) => mongoose.connection.collection(name);
const REASON = 'Fixing a typo from the form';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  ({ container } = bootstrap());
  app = createApp(container);
  tokenService = container.resolve('tokenService');
});

beforeEach(async () => {
  csrf = (await request(app).get('/api/csrf-token')).body.csrfToken;
});

const bearer = (id, type = 'admin') => `Bearer ${tokenService.generateToken(String(id), type)}`;
const as = (id, type) => ({
  get: (path) => request(app).get(path).set('Authorization', bearer(id, type)),
  send: (method, path, body = {}) => request(app)[method](path).set('X-CSRF-Token', csrf).set('Authorization', bearer(id, type)).send(body),
});

const history = async (owner, params = '') => (await as(owner).get(`/api/superadmin/history${params}`)).body.data;

/**
 * One owner, one admin, two coaches with a team each, a meet with coach A's
 * team entered (two athletes), and a third athlete with no team yet.
 */
async function seed() {
  const hash = await bcrypt.hash('Correct#Pass2026', 4);
  const ids = {
    owner: oid(), admin: oid(), coachA: oid(), coachB: oid(), teamA: oid(), teamB: oid(),
    p1: oid(), p2: oid(), p3: oid(), meet: oid(), judgeAcc: oid(),
  };
  await col('admins').insertMany([
    { _id: ids.owner, name: 'Owner', email: 'owner@example.com', password: hash, role: 'superadmin', isActive: true, competitions: [] },
    { _id: ids.admin, name: 'Admin One', email: 'admin@example.com', password: hash, role: 'admin', isActive: true, competitions: [ids.meet] },
  ]);
  await col('coaches').insertMany([
    { _id: ids.coachA, firstName: 'Coach', lastName: 'Alpha', email: 'alpha@example.com', password: hash, isActive: true, team: ids.teamA },
    { _id: ids.coachB, firstName: 'Coach', lastName: 'Beta', email: 'beta@example.com', password: hash, isActive: true, team: ids.teamB },
  ]);
  await col('teams').insertMany([
    { _id: ids.teamA, name: 'Alpha Club', coach: ids.coachA, isActive: true },
    { _id: ids.teamB, name: 'Beta Club', coach: ids.coachB, isActive: true },
  ]);
  const dob = new Date('2012-05-04');
  await col('players').insertMany([
    { _id: ids.p1, firstName: 'Riya', lastName: 'Mane', email: 'riya@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', team: ids.teamA, isActive: true, levelTeams: [{ level: 'district', team: ids.teamA }] },
    { _id: ids.p2, firstName: 'Asha', lastName: 'Rao', email: 'asha@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', team: ids.teamA, isActive: true, levelTeams: [{ level: 'district', team: ids.teamA }] },
    { _id: ids.p3, firstName: 'Mira', lastName: 'Joshi', email: 'mira@example.com', emailType: 'self', password: hash, dateOfBirth: dob, gender: 'Female', isActive: true, levelTeams: [] },
  ]);
  const year = new Date().getFullYear();
  await col('competitions').insertOne({
    _id: ids.meet, name: 'District Meet', level: 'district', place: 'Pune', year,
    startDate: new Date(Date.now() + 7 * 86400000), endDate: new Date(Date.now() + 9 * 86400000),
    competitionTypes: ['competition_1'], playerFee: 500, maxTeamSize: 6, status: 'upcoming', isDeleted: false,
    admins: [ids.admin],
    ageGroups: [{ gender: 'Female', ageGroup: 'Under14' }, { gender: 'Female', ageGroup: 'Under16' }, { gender: 'Female', ageGroup: 'Above16' }],
    registeredTeams: [{
      _id: oid(), team: ids.teamA, coach: ids.coachA, gender: 'Female', isSubmitted: true, paymentStatus: 'completed',
      players: [
        { _id: oid(), player: ids.p1, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['pole'] } },
        { _id: oid(), player: ids.p2, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['pole'] } },
      ],
    }],
  });
  await col('judges').insertOne({ _id: ids.judgeAcc, firstName: 'Judge', lastName: 'Kale', email: 'kale@example.com', password: hash, isActive: true });
  return ids;
}

describe('Phase 2 — History and Undo', () => {
  it('an admin edit lands in History with the reason and before/after, and can be undone', async () => {
    const ids = await seed();
    const edit = await as(ids.owner).send('put', `/api/superadmin/admins/${ids.admin}`, { name: 'Admin Renamed', reason: REASON });
    expect(edit.status).toBe(200);

    const page = await history(ids.owner, '?entity=admin');
    const row = page.rows.find((r) => r.action === 'ADMIN_UPDATED');
    expect(row).toMatchObject({ reason: REASON, label: 'Admin One', undoable: true });
    expect(row.changes).toEqual([{ field: 'name', from: 'Admin One', to: 'Admin Renamed' }]);

    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'x' })).status).toBe(400);
    const undo = await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Renamed the wrong admin' });
    expect(undo.status).toBe(200);
    expect((await col('admins').findOne({ _id: ids.admin })).name).toBe('Admin One');

    const again = await history(ids.owner, '?entity=admin');
    expect(again.rows.find((r) => r._id === row._id)).toMatchObject({ undoable: false });
    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Second undo try' })).status).toBe(422);
  });

  it('sign-ins are not listed, and History is the owner\'s alone', async () => {
    const ids = await seed();
    await col('auditlogs').insertOne({ adminId: ids.admin, adminType: 'admin', action: 'LOGIN', resource: 'API', resourceId: 'x', createdAt: new Date() });
    const page = await history(ids.owner);
    expect(page.rows.some((r) => r.action === 'LOGIN')).toBe(false);
    expect((await as(ids.admin).get('/api/superadmin/history')).status).toBe(403);
  });

  it('a deleted competition can be listed and restored, with a reason', async () => {
    const ids = await seed();
    await col('competitions').updateOne({ _id: ids.meet }, { $set: { isDeleted: true } });
    const deleted = await as(ids.owner).get('/api/superadmin/competitions-deleted');
    expect(deleted.body.data.map((c) => String(c._id))).toEqual([String(ids.meet)]);
    expect((await as(ids.owner).send('post', `/api/superadmin/competitions/${ids.meet}/restore`, {})).status).toBe(400);
    expect((await as(ids.owner).send('post', `/api/superadmin/competitions/${ids.meet}/restore`, { reason: REASON })).status).toBe(200);
    expect((await col('competitions').findOne({ _id: ids.meet })).isDeleted).toBe(false);
    expect((await history(ids.owner, '?entity=competition')).rows[0]).toMatchObject({ action: 'COMPETITION_RESTORED', reason: REASON });
  });
});


describe('Phase 3 — accounts', () => {
  it('finds players, coaches and judges by name, email or Player ID', async () => {
    const ids = await seed();
    const found = (await as(ids.owner).get('/api/superadmin/accounts?q=riya')).body.data;
    expect(found.map((a) => a.type)).toContain('player');
    const judge = (await as(ids.owner).get('/api/superadmin/accounts?q=kale@example')).body.data;
    expect(judge[0]).toMatchObject({ type: 'judge', name: 'Judge Kale' });
  });

  it('edits a player with a reason, records it, and the edit can be undone', async () => {
    const ids = await seed();
    const path = `/api/superadmin/accounts/player/${ids.p1}`;
    expect((await as(ids.owner).send('put', path, { lastName: 'Mane-Patil' })).status).toBe(400);
    const res = await as(ids.owner).send('put', path, { lastName: 'Mane-Patil', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Riya Mane-Patil');
    const row = (await history(ids.owner, '?entity=player')).rows[0];
    expect(row).toMatchObject({ action: 'PLAYER_UPDATED', reason: REASON, undoable: true });
    expect(row.changes).toEqual([{ field: 'lastName', from: 'Mane', to: 'Mane-Patil' }]);
    expect((await as(ids.owner).send('post', `/api/superadmin/history/${row._id}/undo`, { reason: 'Name was right' })).status).toBe(200);
    expect((await col('players').findOne({ _id: ids.p1 })).lastName).toBe('Mane');
  });

  it('a date-of-birth fix reports entries the age rule no longer allows, and moves them on request', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('put', `/api/superadmin/accounts/player/${ids.p1}`, {
      dateOfBirth: `${new Date().getFullYear() - 18}-03-01`, reason: REASON, fixAgeGroups: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.moved).toEqual([{ competition: 'District Meet', from: 'Under14', to: 'Above16' }]);
    const meet = await col('competitions').findOne({ _id: ids.meet });
    const entry = meet.registeredTeams[0].players.find((p) => String(p.player) === String(ids.p1));
    expect(entry.ageGroup).toBe('Above16');
  });

  it('an email already used by another player is refused', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('put', `/api/superadmin/accounts/player/${ids.p1}`, { email: 'asha@example.com', reason: REASON });
    expect(res.status).toBe(409);
  });

  it('reset password returns a temporary password that works, and signs the account out', async () => {
    const ids = await seed();
    const res = await as(ids.owner).send('post', `/api/superadmin/accounts/coach/${ids.coachA}/reset-password`, { reason: REASON });
    expect(res.status).toBe(200);
    const temp = res.body.data.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
    const stored = await col('coaches').findOne({ _id: ids.coachA });
    expect(await bcrypt.compare(temp, stored.password)).toBe(true);
    expect(await col('sessionrevocations').findOne({ _id: String(ids.coachA) })).toBeTruthy();
    const row = (await history(ids.owner, '?entity=coach')).rows[0];
    expect(row).toMatchObject({ action: 'PASSWORD_RESET_BY_OWNER', undoable: false });
    expect(JSON.stringify(row)).not.toContain(temp);
  });

  it('deactivates a judge account, never a coach or the owner', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/judge/${ids.judgeAcc}/active`, { isActive: false, reason: REASON })).status).toBe(200);
    expect((await col('judges').findOne({ _id: ids.judgeAcc })).isActive).toBe(false);
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/coach/${ids.coachA}/active`, { isActive: false, reason: REASON })).status).toBe(422);
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/admin/${ids.owner}/active`, { isActive: false, reason: REASON })).status).toBe(422);
  });

  it('sign out everywhere is recorded', async () => {
    const ids = await seed();
    expect((await as(ids.owner).send('post', `/api/superadmin/accounts/player/${ids.p2}/sign-out`, { reason: REASON })).status).toBe(200);
    expect(await col('sessionrevocations').findOne({ _id: String(ids.p2) })).toBeTruthy();
  });
});
