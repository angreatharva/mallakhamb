/**
 * Verification for task 3.3 / MED-7 — GET /api/public/cop-rules.
 *
 * The COP tables are mirrored by hand in Web/src/utils/scoring/copRules.js.
 * That is not merely untidy: the client computes the slip total and posts it,
 * and the server only checks it against the section ceilings rather than
 * recomputing — so a one-sided edit persists WRONG SCORES instead of producing
 * a visible mismatch. This endpoint exists so the client can fetch the tables.
 *
 * Two things matter here and are asserted below:
 *   1. It stays ANONYMOUS. It is declared in the same router as three routes
 *      that Phase 1 authenticated, so a future guard could easily capture it.
 *   2. It serves the server's OWN constants, not a second hand-written copy —
 *      otherwise this endpoint would just add a third place to drift.
 */

const express = require('express');
const request = require('supertest');

const createPublicRoutes = require('../../src/routes/public.routes');
const createPublicController = require('../../src/controllers/public.controller');
const { errorHandler } = require('../../src/middleware/error.middleware');
const copRules = require('../../src/config/cop-rules');

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

function buildApp() {
  const container = {
    resolve: (key) => {
      switch (key) {
        case 'logger':
          return noopLogger;
        case 'config':
          return { get: () => 'test' };
        case 'tokenService':
          return { verifyToken: () => { throw new Error('no token'); } };
        case 'authenticationService':
          return { getRepositoryByType: () => ({ findById: async () => null }) };
        case 'publicService':
          // cop-rules does not touch the service; the other routes are not
          // exercised in this file.
          return new Proxy({}, { get: () => async () => [] });
        case 'publicController':
          return createPublicController(container);
        case 'adminController':
        case 'paymentController':
          return new Proxy({}, { get: () => (req, res) => res.json({ success: true }) });
        default:
          return {};
      }
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/public', createPublicRoutes(container));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

describe('GET /api/public/cop-rules', () => {
  test('is reachable with no credentials', async () => {
    // The judge client needs these tables before a session exists, and the
    // payload contains no competition, team or athlete data.
    const res = await request(app).get('/api/public/cop-rules');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeTruthy();
  });

  test('serves the server’s own constants rather than a second copy', async () => {
    const res = await request(app).get('/api/public/cop-rules');
    const { data } = res.body;

    // Byte-for-byte against the module the scoring engine actually uses. If
    // someone hand-writes a divergent payload, this fails.
    expect(data).toEqual(JSON.parse(JSON.stringify(copRules.getCopRulesData())));
    expect(data.pointCeilings).toEqual(JSON.parse(JSON.stringify(copRules.POINT_CEILINGS)));
    expect(data.elementClassValues).toEqual(
      JSON.parse(JSON.stringify(copRules.ELEMENT_CLASS_VALUES))
    );
  });

  test('carries the tables the client currently mirrors by hand', async () => {
    const { data } = (await request(app).get('/api/public/cop-rules')).body;

    expect(data.edition).toBe(copRules.COP_EDITION);
    expect(data.timeLimitSeconds).toBe(90);
    expect(Array.isArray(data.toleranceTiers)).toBe(true);
    expect(data.toleranceTiers.length).toBeGreaterThan(0);
    expect(Array.isArray(data.timeDeductionTiers)).toBe(true);
    expect(Object.keys(data.combinationChecklists).length).toBeGreaterThan(0);
    // §1.4 — Hanging Mallakhamb is not contested by women.
    expect(data.apparatusGenderRules['Hanging Mallakhamb'].blockedForGenders).toContain('Female');
  });

  test('exposes no functions — only serializable data', async () => {
    const body = JSON.stringify((await request(app).get('/api/public/cop-rules')).body);
    expect(body).not.toContain('function');
  });

  test('is cacheable and honours If-None-Match', async () => {
    const first = await request(app).get('/api/public/cop-rules');

    expect(first.headers.etag).toBeTruthy();
    expect(first.headers['cache-control']).toContain('max-age');

    const second = await request(app)
      .get('/api/public/cop-rules')
      .set('If-None-Match', first.headers.etag);

    expect(second.status).toBe(304);
  });
});

describe('the extracted COP tables did not change any behaviour', () => {
  /**
   * `getTolerance` and `getTimeDeduction` were if-ladders; the thresholds were
   * lifted into data so they could be served. These pin the boundaries — an
   * off-by-one here would silently change every panel's tolerance check.
   */
  test.each([
    [10, 0.10], [9, 0.10], [8.99, 0.20], [8, 0.20], [7, 0.30],
    [6, 0.40], [5, 0.50], [4.99, 1.00], [0, 1.00], [-1, 1.00],
  ])('getTolerance(%p) === %p', (input, expected) => {
    expect(copRules.getTolerance(input)).toBeCloseTo(expected, 5);
  });

  test.each([
    [-5, 0], [0, 0], [1, 0.20], [3, 0.20], [3.5, 0.30], [5, 0.30],
    [6, 0.40], [9, 0.40], [9.5, 0.50], [10, 0.50], [50, 0.50],
  ])('getTimeDeduction(%p) === %p', (input, expected) => {
    expect(copRules.getTimeDeduction(input)).toBeCloseTo(expected, 5);
  });

  test('non-numeric input falls back safely', () => {
    expect(copRules.getTolerance('x')).toBeCloseTo(1.00, 5);
    expect(copRules.getTimeDeduction('x')).toBe(0);
  });
});
