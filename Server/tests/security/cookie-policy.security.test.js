/**
 * Cookie transport policy.
 *
 * The SPA and this API are two separate Render services on the Public Suffix
 * List domain `onrender.com`, so in production every SPA→API request is
 * cross-site. A `SameSite=Strict` cookie is never returned on such a request,
 * which silently disabled cookie auth AND would have made the CSRF
 * double-submit check reject every login with 403 (login is a POST with no
 * Bearer token yet, so it is not covered by the Bearer exemption).
 *
 * None of this reproduces locally: `localhost:5173 → localhost:5000` is
 * same-site, so the cookie flows and everything passes. That is precisely why
 * the policy is pinned here rather than left to a manual check.
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');

const {
  baseCookieOptions,
  crossSiteCookiePolicy,
  setAccessTokenCookie,
} = require('../../src/utils/security/cookie.util');
const {
  csrfTokenHandler,
  createCsrfMiddleware,
} = require('../../src/middleware/csrf.middleware');

/** Pull the Set-Cookie header for a given cookie name. */
function setCookieFor(res, name) {
  const all = res.headers['set-cookie'] || [];
  return all.find((c) => c.startsWith(`${name}=`)) || '';
}

describe('cross-site cookie policy', () => {
  describe('crossSiteCookiePolicy', () => {
    it('uses SameSite=None with Secure in production', () => {
      // These two travel together: browsers reject SameSite=None without Secure,
      // so setting one without the other drops the cookie entirely.
      expect(crossSiteCookiePolicy(true)).toEqual({ secure: true, sameSite: 'none' });
    });

    it('stays lax and insecure in development', () => {
      // localhost is same-site, and a Secure cookie would not survive plain HTTP.
      expect(crossSiteCookiePolicy(false)).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('is never strict, which is what broke cross-site delivery', () => {
      expect(crossSiteCookiePolicy(true).sameSite).not.toBe('strict');
      expect(crossSiteCookiePolicy(false).sameSite).not.toBe('strict');
    });
  });

  describe('baseCookieOptions', () => {
    it('keeps auth cookies httpOnly while applying the cross-site policy', () => {
      expect(baseCookieOptions(true)).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      });
    });

    it('lets callers override path without losing the policy', () => {
      const opts = baseCookieOptions(true, { path: '/api/auth/refresh' });
      expect(opts.path).toBe('/api/auth/refresh');
      expect(opts.sameSite).toBe('none');
      expect(opts.secure).toBe(true);
    });
  });

  describe('emitted Set-Cookie headers', () => {
    const realNodeEnv = process.env.NODE_ENV;
    afterEach(() => {
      process.env.NODE_ENV = realNodeEnv;
    });

    it('sends the CSRF cookie as SameSite=None; Secure in production', async () => {
      process.env.NODE_ENV = 'production';

      const app = express();
      app.get('/api/csrf-token', csrfTokenHandler);

      const res = await request(app).get('/api/csrf-token');

      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toEqual(expect.any(String));

      const cookie = setCookieFor(res, 'csrf-token');
      expect(cookie).toMatch(/SameSite=None/i);
      expect(cookie).toMatch(/Secure/i);
      // Must stay readable by JS — the SPA cannot read the API's cookie
      // cross-origin anyway, but this cookie is not a credential.
      expect(cookie).not.toMatch(/HttpOnly/i);
    });

    it('sends the access token cookie as SameSite=None; Secure in production', async () => {
      const app = express();
      app.get('/login', (req, res) => {
        setAccessTokenCookie(res, 'a.b.c', true);
        res.json({ success: true });
      });

      const res = await request(app).get('/login');

      const cookie = setCookieFor(res, 'access_token');
      expect(cookie).toMatch(/SameSite=None/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/HttpOnly/i);
    });
  });

  describe('the double-submit check the policy exists to keep working', () => {
    /** Minimal app mirroring how createApp mounts CSRF ahead of the routes. */
    function buildApp() {
      const app = express();
      app.use(cookieParser());
      app.get('/api/csrf-token', csrfTokenHandler);
      app.use(createCsrfMiddleware());
      app.post('/api/admin/login', (req, res) => res.json({ success: true }));
      return app;
    }

    it('rejects a cookie-only login when the cookie never came back', async () => {
      // This is exactly the production failure: the header is present because the
      // client read it from the response body, but the browser withheld the
      // cookie because it was cross-site.
      const res = await request(buildApp())
        .post('/api/admin/login')
        .set('X-CSRF-Token', 'a'.repeat(64))
        .send({ username: 'a', password: 'b' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('accepts login when the cookie is returned alongside the header', async () => {
      const app = buildApp();
      const agent = request.agent(app);

      const tokenRes = await agent.get('/api/csrf-token');
      const { csrfToken } = tokenRes.body;

      const res = await agent
        .post('/api/admin/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ username: 'a', password: 'b' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
