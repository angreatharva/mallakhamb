/**
 * The `uri` label (deploy/monitoring/PLAN.md §5.2).
 *
 * Driven through a real Express app shaped like the API — one router mounted at
 * both `/api/v1` and `/api` — because the interesting cases are exactly the
 * ones Express itself creates: a route that throws, after which Express has
 * restored `req.baseUrl` to '' by the time the response finishes, and a
 * router-level guard that ends the request before any route matched.
 */

const express = require('express');
const request = require('supertest');

const {
  trackRouting,
  routeLabel,
  normalizeUri,
  createUriCap,
  UNKNOWN,
  OTHER,
} = require('../../../src/infrastructure/prometheus/route-label');

function buildApp() {
  const labels = [];
  const app = express();

  app.use((req, res, next) => {
    trackRouting(req);
    res.on('finish', () => labels.push({ status: res.statusCode, uri: routeLabel(req) }));
    next();
  });

  const api = express.Router();

  const teams = express.Router();
  teams.get('/:teamId', (req, res) => res.json({ ok: true }));
  teams.get('/:teamId/boom', () => { throw new Error('boom'); });
  api.use('/teams', teams);

  const guardedRespond = express.Router();
  guardedRespond.use((req, res) => res.status(401).json({ error: 'nope' }));
  guardedRespond.get('/secret', (req, res) => res.json({ ok: true }));
  api.use('/admin', guardedRespond);

  const guardedNext = express.Router();
  guardedNext.use((req, res, next) => {
    const err = new Error('unauthorized');
    err.status = 401;
    next(err);
  });
  guardedNext.get('/secret', (req, res) => res.json({ ok: true }));
  api.use('/judge', guardedNext);

  app.use('/api/v1', api);
  app.use('/api', api);

  app.use((req, res) => res.status(404).json({ error: 'not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

  return { app, labels };
}

describe('routeLabel through Express', () => {
  test('a parameterised route is labelled by its pattern, not the concrete path', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/api/teams/abc');
    expect(labels.pop()).toEqual({ status: 200, uri: '/api/teams/:teamId' });
  });

  test('/api/v1/x and /api/x get the same label', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/api/v1/teams/abc');
    await request(app).get('/api/teams/abc');
    expect(labels.map((l) => l.uri)).toEqual(['/api/teams/:teamId', '/api/teams/:teamId']);
  });

  test('a route that throws keeps its full pattern (baseUrl is restored before finish)', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/api/v1/teams/abc/boom');
    expect(labels.pop()).toEqual({ status: 500, uri: '/api/teams/:teamId/boom' });
  });

  test('a request no router claimed is UNKNOWN', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/nowhere/at/all');
    expect(labels.pop()).toEqual({ status: 404, uri: UNKNOWN });
  });

  test('a router-level guard that responds itself is labelled baseUrl + /**', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/api/admin/secret');
    expect(labels.pop()).toEqual({ status: 401, uri: '/api/admin/**' });
  });

  test('a router-level guard that calls next(err) is still labelled baseUrl + /**', async () => {
    const { app, labels } = buildApp();
    await request(app).get('/api/v1/judge/secret');
    expect(labels.pop()).toEqual({ status: 401, uri: '/api/judge/**' });
  });
});

describe('normalizeUri', () => {
  test('replaces a raw ObjectId segment with :id', () => {
    expect(normalizeUri('/api/teams/64b7f0c2a1b2c3d4e5f60718/players'))
      .toBe('/api/teams/:id/players');
  });

  test('folds only the leading /api/v1 segment', () => {
    expect(normalizeUri('/api/v1')).toBe('/api');
    expect(normalizeUri('/api/v10/x')).toBe('/api/v10/x');
  });

  test('leaves UNKNOWN alone', () => {
    expect(normalizeUri(UNKNOWN)).toBe(UNKNOWN);
  });
});

describe('createUriCap', () => {
  test('the value past the cap becomes OTHER, known values still pass, and it warns once', () => {
    const onOverflow = jest.fn();
    const cap = createUriCap({ max: 400, onOverflow });

    for (let i = 0; i < 400; i += 1) expect(cap(`/r/${i}`)).toBe(`/r/${i}`);

    expect(cap('/r/400')).toBe(OTHER);
    expect(cap('/r/401')).toBe(OTHER);
    expect(cap('/r/7')).toBe('/r/7');
    expect(onOverflow).toHaveBeenCalledTimes(1);
  });
});
