/**
 * CSRF for browsers that refuse third-party cookies.
 *
 * Every browser on an iPhone is WebKit, and WebKit blocks third-party cookies
 * by default. The SPA and the API are different sites in production, so the
 * `csrf-token` cookie was never stored there, the double-submit comparison
 * could never pass, and login and registration answered 403 on every iPhone.
 *
 * `request(app)` (no agent) keeps no cookie jar, which is exactly that browser.
 * `request.agent(app)` keeps one, which is every other browser.
 *
 * The contract pinned here:
 *   - no cookies at all + a header this server signed, in date  → allowed
 *   - no cookies at all + anything else in the header           → 403
 *   - an auth cookie present → full double-submit, as before    → 403 without
 *     the csrf cookie, however well-signed the header is
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const {
  csrfTokenHandler,
  createCsrfMiddleware,
  generateCsrfToken,
  verifySignedToken,
  TOKEN_TTL_MS,
} = require('../../src/middleware/csrf.middleware');

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/api/csrf-token', csrfTokenHandler);
  app.use(createCsrfMiddleware());
  app.post('/api/coaches/register', (req, res) => res.status(201).json({ success: true }));
  app.post('/api/coaches/login', (req, res) => res.json({ success: true }));
  app.post('/api/auth/refresh', (req, res) => res.json({ success: true }));
  return app;
}

/** Fetch a token the way the SPA does — from the body, discarding the cookie. */
async function tokenFromBody(app) {
  const res = await request(app).get('/api/csrf-token');
  return res.body.csrfToken;
}

describe('CSRF without third-party cookies (iPhone / Safari ITP)', () => {
  describe('a browser that stores no cookies', () => {
    it('can register', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/coaches/register')
        .set('X-CSRF-Token', await tokenFromBody(app))
        .send({});
      expect(res.status).toBe(201);
    });

    it('can log in', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/coaches/login')
        .set('X-CSRF-Token', await tokenFromBody(app))
        .send({});
      expect(res.status).toBe(200);
    });

    it('is still refused with no header at all (an HTML form post)', async () => {
      const res = await request(buildApp()).post('/api/coaches/login').send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('is refused with a token this server did not sign', async () => {
      const res = await request(buildApp())
        .post('/api/coaches/login')
        .set('X-CSRF-Token', 'f'.repeat(64))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('is refused with a tampered signature', async () => {
      const app = buildApp();
      const token = await tokenFromBody(app);
      const tampered = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
      const res = await request(app)
        .post('/api/coaches/login')
        .set('X-CSRF-Token', tampered)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('is refused when the expiry was pushed out without re-signing', async () => {
      const [nonce, , sig] = generateCsrfToken().split('.');
      const forged = `${nonce}.${(Date.now() + 10 * TOKEN_TTL_MS).toString(36)}.${sig}`;
      const res = await request(buildApp())
        .post('/api/coaches/login')
        .set('X-CSRF-Token', forged)
        .send({});
      expect(res.status).toBe(403);
    });

    it('is refused with an expired token, which the client recovers from by re-fetching', async () => {
      const stale = generateCsrfToken(Date.now() - TOKEN_TTL_MS - 1000);
      const res = await request(buildApp())
        .post('/api/coaches/login')
        .set('X-CSRF-Token', stale)
        .send({});
      expect(res.status).toBe(403);
      // api-client.js retries once on either CSRF code with a fresh token.
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });
  });

  describe('a request riding on an auth cookie keeps the full double-submit', () => {
    it('is refused with a perfectly signed header but no csrf cookie', async () => {
      // A signed header proves nothing about WHO holds the auth cookie; with
      // ambient credentials in play, only the cookie match counts.
      const app = buildApp();
      const res = await request(app)
        .post('/api/coaches/login')
        .set('Cookie', 'access_token=a.b.c')
        .set('X-CSRF-Token', await tokenFromBody(app))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('covers the refresh cookie too', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=opaque')
        .set('X-CSRF-Token', await tokenFromBody(app))
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('a browser that does keep cookies is unaffected', () => {
    it('passes when cookie and header match', async () => {
      const agent = request.agent(buildApp());
      const { csrfToken } = (await agent.get('/api/csrf-token')).body;
      const res = await agent.post('/api/coaches/login').set('X-CSRF-Token', csrfToken).send({});
      expect(res.status).toBe(200);
    });

    it('fails when the header is a DIFFERENT signed token than the cookie', async () => {
      // Signed is not enough once a cookie is present — it must be THIS one.
      const agent = request.agent(buildApp());
      await agent.get('/api/csrf-token');
      const res = await agent
        .post('/api/coaches/login')
        .set('X-CSRF-Token', generateCsrfToken())
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
    });

    it('exempts Bearer requests exactly as before', async () => {
      const res = await request(buildApp())
        .post('/api/coaches/login')
        .set('Authorization', 'Bearer x.y.z')
        .send({});
      expect(res.status).toBe(200);
    });
  });

  describe('verifySignedToken', () => {
    it('accepts what generateCsrfToken issues', () => {
      expect(verifySignedToken(generateCsrfToken())).toBe(true);
    });

    it.each([
      ['undefined', undefined],
      ['empty', ''],
      ['a legacy unsigned token', 'a'.repeat(64)],
      ['too many parts', 'a.b.c.d'],
      ['a non-hex nonce', `${'z'.repeat(64)}.zz.sig`],
    ])('rejects %s', (_label, value) => {
      expect(verifySignedToken(value)).toBe(false);
    });

    it('rejects a token signed under a different secret', () => {
      const original = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'x'.repeat(40);
      const token = generateCsrfToken();
      process.env.JWT_SECRET = 'y'.repeat(40);
      try {
        expect(verifySignedToken(token)).toBe(false);
      } finally {
        process.env.JWT_SECRET = original;
        if (original === undefined) delete process.env.JWT_SECRET;
      }
    });
  });
});
