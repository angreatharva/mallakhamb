/**
 * The metrics token gate (deploy/monitoring/PLAN.md D2–D4).
 */

const express = require('express');
const request = require('supertest');

const { createMetricsAuthMiddleware } = require('../../../src/middleware/metrics-auth.middleware');

function appWith(tokens) {
  const app = express();
  app.get('/metrics', createMetricsAuthMiddleware(tokens), (req, res) => res.send('ok'));
  return app;
}

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

describe('metrics auth', () => {
  test('no token configured → 404, even with a credential', async () => {
    await request(appWith([])).get('/metrics').expect(404);
    await request(appWith([])).get('/metrics').set('Authorization', 'Bearer anything').expect(404);
  });

  test('missing credential → 401', async () => {
    const res = await request(appWith(['s3cret'])).get('/metrics').expect(401);
    expect(res.headers['www-authenticate']).toMatch(/Bearer/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('wrong token → 401', async () => {
    await request(appWith(['s3cret'])).get('/metrics').set('Authorization', 'Bearer nope').expect(401);
  });

  test('a token that only shares a prefix → 401', async () => {
    await request(appWith(['s3cret'])).get('/metrics').set('Authorization', 'Bearer s3cre').expect(401);
  });

  test('Bearer with the right token → passes', async () => {
    await request(appWith(['s3cret'])).get('/metrics').set('Authorization', 'Bearer s3cret').expect(200, 'ok');
  });

  test('Basic with any username and the token as password → passes', async () => {
    await request(appWith(['s3cret'])).get('/metrics').set('Authorization', basic('grafana', 's3cret')).expect(200);
  });

  test('Basic with the token as USERNAME does not pass', async () => {
    await request(appWith(['s3cret'])).get('/metrics').set('Authorization', basic('s3cret', '')).expect(401);
  });

  test('the second token in a rotation list is accepted', async () => {
    const app = appWith(['old-token', 'new-token']);
    await request(app).get('/metrics').set('Authorization', 'Bearer new-token').expect(200);
    await request(app).get('/metrics').set('Authorization', 'Bearer old-token').expect(200);
  });

  test('a getter is read per request, so config changes apply without a rebuild', async () => {
    let tokens = [];
    const app = appWith(() => tokens);
    await request(app).get('/metrics').expect(404);
    tokens = ['later'];
    await request(app).get('/metrics').set('Authorization', 'Bearer later').expect(200);
  });
});
