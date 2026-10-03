/**
 * GET /metrics end to end (deploy/monitoring/PLAN.md Phase 1).
 *
 * The real bootstrap() and createApp(), so the mount order is the production
 * one: /metrics ahead of CORS/CSRF/coalescing, and the request middleware ahead
 * of every router. Also checks the MongoDB driver really emits pool and command
 * events on the MongoClient — the assumption the old `connection.db.on(...)`
 * listener got wrong.
 */

const mongoose = require('mongoose');
const request = require('supertest');

const TOKEN = 'integration-test-metrics-token';

let app;
let container;

beforeAll(() => {
  // Before bootstrap(): the config manager reads the environment once.
  process.env.METRICS_TOKEN = TOKEN;
  process.env.JWT_SECRET = process.env.JWT_SECRET
    || '0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

  const { bootstrap } = require('../../src/infrastructure/bootstrap');
  const { createApp } = require('../../src/infrastructure/createApp');
  ({ container } = bootstrap());
  app = createApp(container);
});

const scrape = () => request(app).get('/metrics').set('Authorization', `Bearer ${TOKEN}`);

describe('GET /metrics', () => {
  test('is closed without the token', async () => {
    await request(app).get('/metrics').expect(401);
    await request(app).get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
  });

  test('serves Prometheus text with the token, uncached', async () => {
    const res = await scrape().expect(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toMatch(/^# HELP /m);
    expect(res.text).toMatch(/^app_info\{/m);
    expect(res.text).toMatch(/^process_cpu_seconds_total /m);
  });

  test('counts API requests by route pattern, and leaves out the probes', async () => {
    const teamId = new mongoose.Types.ObjectId().toString();

    await request(app).get('/api/csrf-token');
    await request(app).get('/api/v1/csrf-token');
    await request(app).get('/api/public/cop-rules');
    await request(app).get(`/api/teams/${teamId}`);
    await request(app).get('/api/health/ping');
    await request(app).get('/api/health/live');

    const { text } = await scrape().expect(200);

    // /api/v1 and /api fold into one series.
    expect(text).toMatch(/http_server_requests_seconds_count\{method="GET",uri="\/api\/csrf-token",status="200",outcome="SUCCESS"\} 2/);
    expect(text).toMatch(/http_server_requests_seconds_count\{[^}]*uri="\/api\/public\/cop-rules"/);
    // No concrete id ever reaches a label.
    expect(text).not.toContain(teamId);
    // Probes and the scrape itself are excluded.
    expect(text).not.toMatch(/uri="\/api\/health\/(ping|live)"/);
    expect(text).not.toMatch(/uri="\/metrics"/);
  });

  test('the old /api/health/metrics is gone (Phase 6), even with the token', async () => {
    await request(app).get('/api/health/metrics').expect(404);
    await request(app).get('/api/health/metrics').set('Authorization', `Bearer ${TOKEN}`).expect(404);
    await request(app).get('/api/v1/health/metrics').set('Authorization', `Bearer ${TOKEN}`).expect(404);
  });
});

describe('MongoDB driver events arrive on the MongoClient', () => {
  test('pool gauges and command timings fill in from a real connection', async () => {
    const { createMetrics } = require('../../src/infrastructure/prometheus/registry');
    const metrics = createMetrics({ collectDefaults: false });

    const { host, port } = mongoose.connection;
    const conn = mongoose.createConnection(`mongodb://${host}:${port}/prom_probe`, {
      monitorCommands: true,
      minPoolSize: 2,
    });
    // Same ordering as DatabaseConnection.connect(): the client exists
    // synchronously, before any socket opens.
    expect(metrics.mongo.attach(conn.getClient())).toBe(true);

    try {
      await conn.asPromise();
      await conn.collection('probes').insertOne({ at: new Date() });
      await conn.collection('probes').find({}).toArray();

      const text = await metrics.metrics();
      expect(text).toMatch(/mongodb_driver_commands_seconds_count\{command="insert",collection="probes",status="SUCCESS"\} 1/);
      expect(text).toMatch(/mongodb_driver_commands_seconds_count\{command="find",collection="probes",status="SUCCESS"\} 1/);
      const poolSize = Number(/^mongodb_driver_pool_size (\d+)/m.exec(text)?.[1]);
      expect(poolSize).toBeGreaterThan(0);
    } finally {
      await conn.close();
    }
  });
});
