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
    ageGroups: [{ gender: 'Female', ageGroup: 'Under14' }],
    registeredTeams: [{
      _id: oid(), team: ids.teamA, coach: ids.coachA, gender: 'Female', isSubmitted: true, paymentStatus: 'completed',
      players: [
        { _id: oid(), player: ids.p1, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['pole'] } },
        { _id: oid(), player: ids.p2, gender: 'Female', ageGroup: 'Under14', apparatus: { competition_1: ['pole'] } },
      ],
    }],
  });
  await col('judgeaccounts').insertOne({ _id: ids.judgeAcc, firstName: 'Judge', lastName: 'Kale', email: 'kale@example.com', password: hash, isActive: true });
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

