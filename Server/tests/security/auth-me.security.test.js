/**
 * GET /api/auth/me (MED-W1).
 *
 * Written after a coverage pass showed `auth.controller.js` at 0% — this
 * endpoint was built and shipped without a single test executing it. It hands
 * a user document back to the client, so "it returns something" is not enough:
 * what it must NOT return matters more.
 */

const express = require('express');
const request = require('supertest');

const createAuthRoutes = require('../../src/routes/auth.routes');
const createAuthController = require('../../src/controllers/auth.controller');
const CoachRepository = require('../../src/repositories/coach.repository');
const { errorHandler } = require('../../src/middleware/error.middleware');

const Coach = require('../../src/models/Coach');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };
const issuedTokens = new Map();

const EMAIL = 'me-endpoint@example.com';
const PASSWORD = 'CorrectHorse1';

function buildApp() {
  const coachRepository = new CoachRepository(noopLogger);

  const container = {
    resolve: (key) => {
      switch (key) {
        case 'logger':
          return noopLogger;
        case 'config':
          return { get: () => 'test' };
        case 'tokenService':
          return {
            generateToken: () => 'stub-token',
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
        case 'authenticationService':
          return { getRepositoryByType: () => coachRepository };
        case 'authController':
          return createAuthController(container);
        default:
          return new Proxy({}, { get: () => async () => ({}) });
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(container));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe('GET /api/auth/me', () => {
  let coach;

  beforeEach(async () => {
    issuedTokens.clear();
    coach = await Coach.create({ firstName: 'Me', lastName: 'Coach', email: EMAIL, password: PASSWORD });
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a token that resolves to nobody', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer forged');
    expect(res.status).toBe(401);
  });

  test('returns the authenticated principal and its role', async () => {
    const token = 'good-token';
    issuedTokens.set(token, { userId: String(coach._id), userType: 'coach' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(EMAIL);
    expect(String(res.body.data.user._id)).toBe(String(coach._id));
    // The client only adopts a session whose userType matches the URL role,
    // so this field is load-bearing, not decorative.
    expect(res.body.data.userType).toBe('coach');
  });

  /**
   * The decisive one. This endpoint re-serialises a user document, and the
   * schema `toJSON` transform does NOT run on repository results (`.lean()`).
   * Login had exactly this bug — it leaked resetPasswordToken until it was
   * given an explicit strip.
   */
  test('leaks no credential, reset token or lockout counter', async () => {
    const token = 'good-token';
    issuedTokens.set(token, { userId: String(coach._id), userType: 'coach' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(EMAIL); // proves it really returned data

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[aby]\$/);          // no bcrypt hash
    expect(body).not.toContain('password');
    expect(body).not.toContain('resetPasswordToken');
    expect(body).not.toContain('resetPasswordExpires');
    expect(body).not.toContain('loginAttempts');
    expect(body).not.toContain('lockUntil');
  });
});
