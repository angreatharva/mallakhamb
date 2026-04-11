import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRetryConfig, setupInterceptors } from './apiInterceptor.js';

function buildHttpError(config, status) {
  const error = new Error(`HTTP ${status}`);
  error.config = config;
  error.response = { status, data: { message: 'request failed' } };
  return error;
}

function createApiWithAdapter(adapter, retryOverrides = {}) {
  const api = axios.create({ adapter });
  setupInterceptors(api, {
    retryConfig: createRetryConfig(retryOverrides),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
    },
  });
  return api;
}

describe('apiInterceptor', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries 5xx failures and eventually resolves', async () => {
    let attempts = 0;
    const api = createApiWithAdapter(
      async (config) => {
        attempts += 1;
        if (attempts < 3) {
          throw buildHttpError(config, 503);
        }
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
      { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 }
    );

    const response = await api.get('/retry-success');
    expect(response.status).toBe(200);
    expect(attempts).toBe(3);
  });

  it('does not retry 4xx failures', async () => {
    let attempts = 0;
    const api = createApiWithAdapter(
      async (config) => {
        attempts += 1;
        throw buildHttpError(config, 400);
      },
      { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 }
    );

    await expect(api.get('/no-retry')).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(attempts).toBe(1);
  });

  it('applies exponential backoff delays across retries', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let attempts = 0;

    const api = createApiWithAdapter(
      async (config) => {
        attempts += 1;
        if (attempts < 3) {
          throw buildHttpError(config, 500);
        }
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
      { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000 }
    );

    const requestPromise = api.get('/backoff');
    await vi.runAllTimersAsync();
    await requestPromise;

    const timeoutDelays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(timeoutDelays).toEqual(expect.arrayContaining([100, 200]));
    expect(attempts).toBe(3);
  });

  it('stops retrying when request is canceled during backoff', async () => {
    vi.useFakeTimers();
    let attempts = 0;

    const api = createApiWithAdapter(
      async (config) => {
        attempts += 1;
        throw buildHttpError(config, 503);
      },
      { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 1000 }
    );

    const controller = new AbortController();
    const requestPromise = api.get('/cancel', { signal: controller.signal });
    const handledPromise = requestPromise.catch((error) => error);

    // Allow the first failed attempt to schedule retry delay, then cancel while waiting.
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await vi.runAllTimersAsync();

    const cancellationError = await handledPromise;
    expect(cancellationError).toMatchObject({ code: 'ERR_CANCELED' });
    expect(attempts).toBe(1);
  });
});
