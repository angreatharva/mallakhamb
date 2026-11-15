/**
 * The Super Admin's session after a token refresh (bug 2026-11-15).
 *
 * The Super Admin is an Admin document: its login token says userType
 * 'admin', while its session lives under the 'superadmin' cookies. The
 * refresh record stored the session role and re-issued the access token as
 * 'superadmin', which no repository resolves — every Super Admin request was
 * a 500 from the first refresh (a reload after 15 minutes) until the cookie
 * expired, and Logout failed the same way. Real app, in-memory MongoDB.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');

let app;
let tokenService;

const col = (name) => mongoose.connection.collection(name);
const PASSWORD = 'Correct#Pass2026';

beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';
  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  const { container } = bootstrap();
  app = createApp(container);
  tokenService = container.resolve('tokenService');
});

async function seedOwner() {
  const _id = new mongoose.Types.ObjectId();
  await col('admins').insertOne({
    _id, name: 'Owner', email: 'owner@example.com', password: await bcrypt.hash(PASSWORD, 4),
    role: 'superadmin', isActive: true, competitions: [],
  });
  return _id;
}

/** A browser: keeps cookies, sends the CSRF token and the SPA's role header. */
async function browser() {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/csrf-token')).body.csrfToken;
  const call = (method, path) => agent[method](path).set('X-CSRF-Token', csrf).set('X-User-Type', 'superadmin');
  return { agent, call };
}

const cookieNames = (res) => (res.headers['set-cookie'] || []).map((c) => c.split('=')[0]);
const cookieValue = (res, name) => {
  const hit = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split(';')[0].slice(name.length + 1)) : null;
};

describe('the Super Admin session survives a refresh', () => {
  it('sign in → refresh → Super Admin pages still answer, on cookies alone', async () => {
    await seedOwner();
    const { call } = await browser();

    const login = await call('post', '/api/superadmin/login').send({ email: 'owner@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    // Its own cookie pair, so an admin signed in in another tab keeps theirs.
    expect(cookieNames(login)).toEqual(expect.arrayContaining(['access_token_superadmin', 'refresh_token_superadmin']));
    expect(cookieNames(login)).not.toContain('access_token_admin');

    const refreshed = await call('post', '/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    const token = cookieValue(refreshed, 'access_token_superadmin');
    expect(token).toBeTruthy();
    // The same identity type its login issued.
    expect(jwt.decode(token).userType).toBe('admin');
    expect(jwt.decode(refreshed.body.data.token).userType).toBe('admin');

    const admins = await call('get', '/api/superadmin/admins');
    expect(admins.status).toBe(200);

    // A second refresh keeps working (the new refresh cookie is the superadmin one).
    expect((await call('post', '/api/auth/refresh')).status).toBe(200);
    expect((await call('get', '/api/superadmin/competitions')).status).toBe(200);

    // Logout succeeds and clears the superadmin pair.
    const out = await call('post', '/api/auth/logout');
    expect(out.status).toBe(200);
    expect(cookieNames(out)).toEqual(expect.arrayContaining(['access_token_superadmin', 'refresh_token_superadmin']));
  });

  it('a superadmin-typed token issued before the fix still authenticates', async () => {
    const owner = await seedOwner();
    const { call } = await browser();
    const legacy = tokenService.generateToken(String(owner), 'superadmin');
    const res = await call('get', '/api/superadmin/admins').set('Authorization', `Bearer ${legacy}`);
    expect(res.status).toBe(200);
  });
});
