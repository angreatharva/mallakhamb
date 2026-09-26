/**
 * Keep-alive: pings the service's own public URL so Render's free plan never
 * sleeps, and stays off anywhere that URL is not known.
 */

const express = require('express');
const request = require('supertest');
const { resolveKeepAlive, startKeepAlive } = require('../../../src/infrastructure/keep-alive');
const createHealthRoutes = require('../../../src/routes/health.routes');

describe('resolveKeepAlive', () => {
  it('is off locally, where no public URL is known', () => {
    expect(resolveKeepAlive({})).toBeNull();
  });

  it('pings /api/health/ping on the Render URL every 10 minutes by default', () => {
    expect(resolveKeepAlive({ RENDER_EXTERNAL_URL: 'https://mallakhamb-server.onrender.com/' })).toEqual({
      url: 'https://mallakhamb-server.onrender.com/api/health/ping',
      intervalMs: 10 * 60_000,
    });
  });

  it('prefers an explicit KEEP_ALIVE_URL', () => {
    expect(resolveKeepAlive({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', KEEP_ALIVE_URL: 'https://b.example/ping' }).url)
      .toBe('https://b.example/ping');
  });

  it('can be turned off', () => {
    expect(resolveKeepAlive({ RENDER_EXTERNAL_URL: 'https://a.onrender.com', KEEP_ALIVE: 'false' })).toBeNull();
  });

  it('keeps the interval inside the 15-minute sleep window', () => {
    expect(resolveKeepAlive({ RENDER_EXTERNAL_URL: 'https://a', KEEP_ALIVE_INTERVAL_MINUTES: '30' }).intervalMs).toBe(14 * 60_000);
    expect(resolveKeepAlive({ RENDER_EXTERNAL_URL: 'https://a', KEEP_ALIVE_INTERVAL_MINUTES: '0.1' }).intervalMs).toBe(60_000);
  });
});

describe('startKeepAlive', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pings on the interval and stops when asked', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const keepAlive = startKeepAlive({ env: { RENDER_EXTERNAL_URL: 'https://a.onrender.com' }, fetchImpl });

    jest.advanceTimersByTime(10 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://a.onrender.com/api/health/ping');

    keepAlive.stop();
    jest.advanceTimersByTime(30 * 60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('survives a failed ping', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const keepAlive = startKeepAlive({ logger, env: { KEEP_ALIVE_URL: 'https://a/ping' }, fetchImpl });

    jest.advanceTimersByTime(10 * 60_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.warn).toHaveBeenCalledWith('Keep-alive ping failed', expect.objectContaining({ error: 'ECONNRESET' }));
    keepAlive.stop();
  });

  it('does nothing when off', () => {
    const fetchImpl = jest.fn();
    const keepAlive = startKeepAlive({ env: {}, fetchImpl });
    jest.advanceTimersByTime(60 * 60_000);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(keepAlive.url).toBeNull();
  });
});

describe('GET /api/health/ping', () => {
  const app = express();
  app.use('/api/health', createHealthRoutes({
    resolve: () => ({
      liveness: (req, res) => res.status(200).json({ status: 'alive', uptime: 1 }),
    }),
  }));

  it('answers 200 without auth and is never cached', async () => {
    const res = await request(app).get('/api/health/ping');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD, which some pingers use', async () => {
    const res = await request(app).head('/api/health/ping');
    expect(res.status).toBe(200);
  });
});
