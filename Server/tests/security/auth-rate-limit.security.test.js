/**
 * Which /api/auth endpoints are rate limited, and which must not be.
 *
 * The per-IP auth limiter is 10 requests per 15 minutes in production, and it
 * used to wrap the ENTIRE `/auth` router. At a venue a whole panel shares one
 * NAT address, so six judges opening the app — `me` + `set-competition` each —
 * exhausted it, and the application was down for that venue for fifteen minutes
 * in the middle of a competition.
 *
 * The codebase already knew about this shape of failure: the judge login
 * limiter is keyed by username rather than IP for exactly this reason. The rest
 * of `/auth` was left on the per-IP limiter.
 *
 * These tests pin both halves — the endpoints that must stay limited, because
 * they are what an attacker guesses against, and the session endpoints that
 * must not be, because a shared address is normal for them.
 */

const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');

const { loadRoutes } = require('../../src/routes');

/** A limiter with a tiny budget, so the boundary is reachable in a test. */
const LIMIT = 3;

/**
 * Mount the real route table with a stub container.
 *
 * Only the wiring is under test — which paths the limiter is attached to — so
 * every controller is a stub that answers 200. Resolving the real ones would
 * drag in the database and test something else.
 */
function buildApp() {
  const ok = (req, res) => res.json({ success: true });
  const handler = new Proxy({}, { get: () => ok });

  const container = {
    resolve: (name) => {
      if (name === 'config') {
        return { get: (key) => (key === 'security.csrfEnabled' ? false : 'test') };
      }
      if (name === 'logger') {
        return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
      }
      // Every controller and every service the routers ask for.
      return handler;
    },
  };

  const app = express();
  app.use(express.json());

  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: LIMIT,
    keyGenerator: () => 'one-shared-venue-ip',
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'AUTH_RATE_LIMIT_EXCEEDED' } }),
  });

  loadRoutes(app, container, { authLimiter });
  return app;
}

/**
 * Send the same request LIMIT + 2 times and report the statuses seen.
 * @returns {Promise<number[]>}
 */
async function hammer(app, method, path) {
  const statuses = [];
  for (let i = 0; i < LIMIT + 2; i += 1) {
    const response = await request(app)[method](path).send({});
    statuses.push(response.status);
  }
  return statuses;
}

describe('/api/auth rate limiting', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
  });

  describe('endpoints an attacker guesses against stay limited', () => {
    it.each([
      ['post', '/api/auth/forgot-password'],
      ['post', '/api/auth/verify-otp'],
      ['post', '/api/auth/reset-password-otp'],
      ['post', '/api/auth/reset-password/some-token'],
    ])('%s %s is limited', async (method, path) => {
      const statuses = await hammer(app, method, path);
      expect(statuses).toContain(429);
    });
  });

  describe('session endpoints are NOT limited by shared IP', () => {
    /*
     * These are what a venue calls repeatedly and legitimately. A 429 on any of
     * them is the outage described at the top of this file.
     */
    it.each([
      ['get', '/api/auth/me'],
      ['post', '/api/auth/refresh'],
      ['post', '/api/auth/logout'],
      ['post', '/api/auth/set-competition'],
      ['get', '/api/auth/competitions/assigned'],
    ])('%s %s is never 429', async (method, path) => {
      const statuses = await hammer(app, method, path);
      expect(statuses).not.toContain(429);
    });
  });

  it('one venue can rehydrate a six-judge panel without being throttled', async () => {
    // The concrete scenario: each judge loads the app, which is `me` followed
    // by `set-competition`. Twelve requests from one address.
    const statuses = [];
    for (let judge = 0; judge < 6; judge += 1) {
      statuses.push((await request(app).get('/api/auth/me')).status);
      statuses.push((await request(app).post('/api/auth/set-competition').send({}).then((r) => r.status)));
    }

    expect(statuses).not.toContain(429);
  });

  it('the versioned mount behaves the same way', async () => {
    // /api/v1 serves the identical router; a limiter attached at the wrong
    // level could cover one mount and not the other.
    const statuses = await hammer(app, 'get', '/api/v1/auth/me');
    expect(statuses).not.toContain(429);
  });
});
