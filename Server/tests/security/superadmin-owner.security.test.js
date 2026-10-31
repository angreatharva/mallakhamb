/**
 * Phase 1 of docs/superadmin-control-plan.md: there is exactly ONE Super
 * Admin, the owner. Nothing reachable over HTTP creates, promotes, demotes,
 * deactivates or deletes one. Real app, in-memory MongoDB.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');

let app;
let tokenService;
let csrf;

const oid = () => new mongoose.Types.ObjectId();
const col = (name) => mongoose.connection.collection(name);

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  const { container } = bootstrap();
  app = createApp(container);
  tokenService = container.resolve('tokenService');
});

beforeEach(async () => {
  csrf = (await request(app).get('/api/csrf-token')).body.csrfToken;
});

const bearer = (id) => `Bearer ${tokenService.generateToken(String(id), 'admin')}`;
const send = (method, path, id) => request(app)[method](path).set('X-CSRF-Token', csrf).set('Authorization', bearer(id));

async function seed() {
  const hash = await bcrypt.hash('Correct#Pass2026', 4);
  const owner = oid();
  const admin = oid();
  await col('admins').insertMany([
    { _id: owner, name: 'Owner', email: 'owner@example.com', password: hash, role: 'superadmin', isActive: true, competitions: [] },
    { _id: admin, name: 'Admin', email: 'admin@example.com', password: hash, role: 'admin', isActive: true, competitions: [] },
  ]);
  return { owner, admin };
}

describe('Phase 1 — one Super Admin', () => {
  it('Add Admin always creates an admin, and refuses a superadmin role', async () => {
    const { owner } = await seed();
    const refused = await send('post', '/api/superadmin/admins', owner)
      .send({ name: 'Second', email: 'second@example.com', password: 'Correct#Pass2026', role: 'superadmin' });
    expect(refused.status).toBe(400);
    expect(await col('admins').countDocuments({ email: 'second@example.com' })).toBe(0);

    const ok = await send('post', '/api/superadmin/admins', owner)
      .send({ name: 'Plain', email: 'plain@example.com', password: 'Correct#Pass2026' });
    expect([200, 201]).toContain(ok.status);
    expect((await col('admins').findOne({ email: 'plain@example.com' })).role).toBe('admin');
  });

  it('/api/admin/register cannot smuggle a role in either', async () => {
    const { owner } = await seed();
    await send('post', '/api/admin/register', owner)
      .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Correct#Pass2026', role: 'superadmin' });
    const stored = await col('admins').findOne({ email: 'sneaky@example.com' });
    if (stored) expect(stored.role).toBe('admin');
    expect(await col('admins').countDocuments({ role: 'superadmin' })).toBe(1);
  });

  it('an admin cannot be promoted', async () => {
    const { owner, admin } = await seed();
    const res = await send('put', `/api/superadmin/admins/${admin}`, owner).send({ role: 'superadmin' });
    expect(res.status).toBe(400);
    expect((await col('admins').findOne({ _id: admin })).role).toBe('admin');
  });

  it('the owner cannot be demoted, deactivated or deleted, but can edit their name', async () => {
    const { owner } = await seed();
    expect((await send('put', `/api/superadmin/admins/${owner}`, owner).send({ role: 'admin' })).status).toBe(400);
    expect((await send('put', `/api/superadmin/admins/${owner}`, owner).send({ isActive: false })).status).toBe(400);
    expect((await send('delete', `/api/superadmin/admins/${owner}`, owner)).status).toBe(400);
    const stored = await col('admins').findOne({ _id: owner });
    expect(stored).toMatchObject({ role: 'superadmin', isActive: true });

    expect((await send('put', `/api/superadmin/admins/${owner}`, owner).send({ name: 'Owner Renamed' })).status).toBe(200);
    expect((await col('admins').findOne({ _id: owner })).name).toBe('Owner Renamed');
  });

  it('an ordinary admin can still be edited and deleted', async () => {
    const { owner, admin } = await seed();
    expect((await send('put', `/api/superadmin/admins/${admin}`, owner).send({ isActive: false })).status).toBe(200);
    expect((await send('delete', `/api/superadmin/admins/${admin}`, owner)).status).toBe(200);
  });

  it('the schema declares the single-owner index', () => {
    const Admin = require('../../src/models/Admin');
    const index = Admin.schema.indexes().find(([, o]) => o.name === 'admin_single_superadmin');
    expect(index).toBeTruthy();
    expect(index[1]).toMatchObject({ unique: true, partialFilterExpression: { role: 'superadmin' } });
  });
});
