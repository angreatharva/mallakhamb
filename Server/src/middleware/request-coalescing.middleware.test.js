/**
 * Request coalescing.
 *
 * The case that matters here is the non-JSON response. Coalescing captured the
 * result by overriding `res.json`, so a handler answering with `res.send`,
 * `res.end` or a redirect never settled the promise the middleware was holding:
 * the in-flight entry was never cleared, and every later identical GET awaited
 * a promise that would never resolve. `GET /api/health/metrics?format=prometheus`
 * served exactly one scrape and then hung for the life of the process.
 */

const express = require('express');
const request = require('supertest');

const RequestCoalescingMiddleware = require('./request-coalescing.middleware');

const silentLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/**
 * @param {Function} register - receives the app to mount routes on
 * @returns {{app: express.Application, coalescer: RequestCoalescingMiddleware}}
 */
function buildApp(register) {
  const coalescer = new RequestCoalescingMiddleware(silentLogger);
  const app = express();
  app.use(coalescer.middleware());
  register(app);
  return { app, coalescer };
}

describe('RequestCoalescingMiddleware', () => {
  describe('non-JSON responses', () => {
    it('serves a res.send route repeatedly instead of hanging after the first call', async () => {
      const { app } = buildApp((a) => {
        a.get('/api/thing', (req, res) => {
          res.set('Content-Type', 'text/plain').send('metrics payload');
        });
      });

      for (let i = 0; i < 3; i += 1) {
        const response = await request(app).get('/api/thing').timeout(2000);
        expect(response.status).toBe(200);
        expect(response.text).toBe('metrics payload');
      }
    });

    it('clears the in-flight entry after a res.send response', async () => {
      const { app, coalescer } = buildApp((a) => {
        a.get('/api/thing', (req, res) => res.send('ok'));
      });

      await request(app).get('/api/thing');

      // A leaked entry is what made every subsequent request hang, so assert on
      // the map directly rather than only on the symptom.
      expect(coalescer.getStats().inFlightRequests).toBe(0);
    });

    it('lets a concurrent waiter do its own work when the result cannot be replayed', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/thing', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          res.send(`call ${calls}`);
        });
      });

      const [first, second] = await Promise.all([
        request(app).get('/api/thing').timeout(2000),
        request(app).get('/api/thing').timeout(2000),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      // Both must get a real body. Replaying is the optimisation; correctness is
      // that a request the middleware cannot serve from the shared result falls
      // through and produces its own.
      expect(first.text).toMatch(/^call \d$/);
      expect(second.text).toMatch(/^call \d$/);
    });
  });

  describe('JSON responses', () => {
    it('still coalesces concurrent identical GETs into one handler run', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/thing', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          res.json({ value: 'shared' });
        });
      });

      const responses = await Promise.all([
        request(app).get('/api/thing'),
        request(app).get('/api/thing'),
        request(app).get('/api/thing'),
      ]);

      expect(calls).toBe(1);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ value: 'shared' });
      });
    });

    it('does not coalesce sequential requests', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/thing', (req, res) => {
          calls += 1;
          res.json({ calls });
        });
      });

      await request(app).get('/api/thing');
      await request(app).get('/api/thing');

      expect(calls).toBe(2);
    });

    it('propagates the status code to coalesced waiters', async () => {
      const { app } = buildApp((a) => {
        a.get('/api/thing', async (req, res) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          res.status(201).json({ created: true });
        });
      });

      const responses = await Promise.all([
        request(app).get('/api/thing'),
        request(app).get('/api/thing'),
      ]);

      responses.forEach((response) => expect(response.status).toBe(201));
    });
  });

  describe('exemptions', () => {
    /**
     * This middleware is mounted app-wide, so `req.path` is the FULL path. The
     * exemptions used to test `startsWith('/health')`, which never matched
     * `/api/health/...` — so the probes it was written to protect were being
     * coalesced.
     */
    it.each([
      '/api/health',
      '/api/health/live',
      '/api/health/metrics',
      '/api/v1/health/ready',
      '/api/metrics',
    ])('does not coalesce %s', async (path) => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get(path, async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          res.json({ ok: true });
        });
      });

      await Promise.all([request(app).get(path), request(app).get(path)]);

      expect(calls).toBe(2);
    });

    it('still coalesces a path that merely contains the word health', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/admin/system/health', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          res.json({ ok: true });
        });
      });

      await Promise.all([
        request(app).get('/api/admin/system/health'),
        request(app).get('/api/admin/system/health'),
      ]);

      expect(calls).toBe(1);
    });

    it('does not coalesce non-GET requests', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.post('/api/thing', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          res.json({ ok: true });
        });
      });

      await Promise.all([request(app).post('/api/thing'), request(app).post('/api/thing')]);

      expect(calls).toBe(2);
    });
  });

  describe('keying', () => {
    it('treats different query strings as different requests', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/thing', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          res.json({ q: req.query.q });
        });
      });

      await Promise.all([
        request(app).get('/api/thing?q=a'),
        request(app).get('/api/thing?q=b'),
      ]);

      expect(calls).toBe(2);
    });

    it('treats different competition contexts as different requests', async () => {
      let calls = 0;
      const { app } = buildApp((a) => {
        a.get('/api/thing', async (req, res) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          res.json({ ok: true });
        });
      });

      await Promise.all([
        request(app).get('/api/thing').set('X-Competition-Id', 'comp-a'),
        request(app).get('/api/thing').set('X-Competition-Id', 'comp-b'),
      ]);

      expect(calls).toBe(2);
    });
  });

  describe('errors', () => {
    it('clears the in-flight entry when the handler throws', async () => {
      const { app, coalescer } = buildApp((a) => {
        a.get('/api/thing', (req, res, next) => next(new Error('boom')));
        a.use((error, req, res, _next) => res.status(500).json({ error: error.message }));
      });

      const response = await request(app).get('/api/thing');

      expect(response.status).toBe(500);
      expect(coalescer.getStats().inFlightRequests).toBe(0);
    });
  });
});
