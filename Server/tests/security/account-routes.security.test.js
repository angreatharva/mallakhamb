/**
 * /api/auth/me/* — the account page's endpoints, over HTTP.
 *
 * The service is covered in tests/integration/account-service.test.js. This
 * file covers what only the route layer does: everything needs a session, the
 * validators run, and a password change hands THIS session new cookies (every
 * other session is signed out by the change).
 */

const express = require('express');
const request = require('supertest');

const createAuthRoutes = require('../../src/routes/auth.routes');
const createAuthController = require('../../src/controllers/auth.controller');
const AccountService = require('../../src/services/auth/account.service');
const CoachRepository = require('../../src/repositories/coach.repository');
const AccountRequestRepository = require('../../src/repositories/account-request.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');
const Coach = require('../../src/models/Coach');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const PASSWORD = 'CorrectHorse1';
const issuedTokens = new Map();

function buildApp() {
  const coachRepository = new CoachRepository(noopLogger);
  const tokenService = {
    generateToken: (userId, userType) => {
      const token = `token-${issuedTokens.size}`;
      issuedTokens.set(token, { userId, userType, iat: Math.ceil(Date.now() / 1000) });
      return token;
    },
    generateRefreshToken: async () => ({ token: 'refresh-token' }),
    revokeAllRefreshTokens: async () => {},
    verifyToken: (token) => {
      const payload = issuedTokens.get(token);
      if (!payload) {
        const err = new Error('Token is not valid');
        err.code = 'INVALID_TOKEN';
        throw err;
      }
      return payload;
    },
  };
  const accountService = new AccountService({
    playerRepository: coachRepository,
    coachRepository,
    adminRepository: coachRepository,
    judgeAccountRepository: coachRepository,
    accountRequestRepository: new AccountRequestRepository(noopLogger),
    tokenService,
    otpService: { sendEmailChangeCode: jest.fn(), notifyEmailChanged: jest.fn(), notifyPasswordChanged: jest.fn() },
    config: { get: () => 10 },
    logger: noopLogger,
  });

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'logger': return noopLogger;
        case 'config': return { get: () => 'test' };
        case 'tokenService': return tokenService;
        case 'accountService': return accountService;
        case 'authenticationService': return { getRepositoryByType: () => coachRepository };
        case 'authController': return createAuthController(container);
        default: return new Proxy({}, { get: () => async () => ({}) });
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(container));
  app.use(errorHandler);
  return { app, tokenService };
}

const { app, tokenService } = buildApp();

describe('/api/auth/me account routes', () => {
  let coach;
  let bearer;

  beforeEach(async () => {
    issuedTokens.clear();
    coach = await Coach.create({ firstName: 'Me', lastName: 'Coach', email: 'me@example.com', password: PASSWORD });
    bearer = `Bearer ${tokenService.generateToken(String(coach._id), 'coach')}`;
  });

  test.each([
    ['get', '/api/auth/me/account'],
    ['put', '/api/auth/me'],
    ['put', '/api/auth/me/password'],
    ['post', '/api/auth/me/email'],
    ['post', '/api/auth/me/email/confirm'],
    ['delete', '/api/auth/me/email'],
  ])('%s %s needs a session', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test('the account page reads the profile without credentials', async () => {
    const res = await request(app).get('/api/auth/me/account').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'me@example.com', firstName: 'Me' });
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.pendingEmailChange).toBeNull();
  });

  test('a weak new password is refused before the service sees it', async () => {
    const res = await request(app).put('/api/auth/me/password').set('Authorization', bearer)
      .send({ currentPassword: PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  test('a password change sets fresh cookies for this session', async () => {
    const res = await request(app).put('/api/auth/me/password').set('Authorization', bearer)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword9' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toMatch(/^token-/);
    const cookies = (res.headers['set-cookie'] || []).join(';');
    expect(cookies).toMatch(/refresh/i);
  });

  test('an email change answers with where the code went', async () => {
    const res = await request(app).post('/api/auth/me/email').set('Authorization', bearer)
      .send({ newEmail: 'next@example.com', currentPassword: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ newEmail: 'next@example.com', status: 'awaiting-code' });
  });

  test('a code that is not six digits is refused', async () => {
    const res = await request(app).post('/api/auth/me/email/confirm').set('Authorization', bearer).send({ code: '12' });
    expect(res.status).toBe(400);
  });
});
