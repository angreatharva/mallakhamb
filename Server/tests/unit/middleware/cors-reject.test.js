/**
 * A request from an origin outside CORS_ORIGINS is refused in production. It
 * used to be refused with a 500 (a plain Error), which reads as a server
 * fault and counts toward the "High 5xx" alert; it is a 403 now, and still
 * stops before any route runs.
 */
const express = require('express');
const request = require('supertest');
const { createCorsMiddleware } = require('../../../src/middleware/security.middleware');
const { errorHandler } = require('../../../src/middleware/error.middleware');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function app(nodeEnv) {
  const values = { 'server.corsOrigins': ['https://app.example.com'], 'server.nodeEnv': nodeEnv };
  const container = { resolve: (name) => (name === 'config' ? { get: (k) => values[k] } : logger) };
  const a = express();
  a.use(createCorsMiddleware(container));
  a.post('/api/auth/login', (req, res) => res.json({ reached: true }));
  a.use(errorHandler);
  return a;
}

describe('CORS in production', () => {
  it('refuses a foreign origin with 403 and no Access-Control-Allow-Origin, before the route', async () => {
    const res = await request(app('production')).post('/api/auth/login').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.body.reached).toBeUndefined();
  });

  it('refuses a foreign preflight with 403 too', async () => {
    const res = await request(app('production')).options('/api/auth/login')
      .set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('lets a listed origin through with its Access-Control-Allow-Origin', async () => {
    const res = await request(app('production')).post('/api/auth/login').set('Origin', 'https://app.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('lets a request with no Origin through (server-to-server, curl)', async () => {
    const res = await request(app('production')).post('/api/auth/login');
    expect(res.status).toBe(200);
  });
});
