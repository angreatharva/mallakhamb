/**
 * The CSRF request interceptor (CRIT-3).
 *
 * Written after noticing api-client.js had no tests at all, despite carrying
 * the interceptor that decides whether every state-changing request in the app
 * is accepted or 403'd.
 *
 * axios is mocked so the interceptors registered at module load can be captured
 * and invoked directly. That tests the logic precisely, with no network and no
 * dependence on axios internals beyond `create`/`interceptors.use`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Interceptors captured from the mocked axios instances, in registration order. */
const requestInterceptors = [];
const responseHandlers = [];
const publicGet = vi.fn();

vi.mock('axios', () => {
  // Every instance shares one `get` mock. Keying on creation order is wrong:
  // the factory is evaluated once while vi.resetModules() re-creates the
  // instances, so an index would drift out of step after the first reload.
  // Only publicApi.get('/csrf-token') is exercised here, so sharing is safe.
  const makeInstance = () => ({
    get: publicGet,
    post: vi.fn(),
    interceptors: {
      request: { use: (fn) => requestInterceptors.push(fn) },
      response: { use: (ok, err) => responseHandlers.push({ ok, err }) },
    },
  });
  return { default: { create: makeInstance } };
});

vi.mock('@/config/api.config.js', () => ({
  default: { getBaseUrl: () => 'http://test.local/api', getHeaders: () => ({}) },
}));
vi.mock('@/utils/auth/secureStorage.js', () => ({
  secureStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/utils/auth/tokenUtils.js', () => ({ getCompetitionIdFromToken: () => null }));
vi.mock('jwt-decode', () => ({ jwtDecode: () => ({}) }));

const TOKEN = 'csrf-token-value';

/** Fresh module state per test, since the token is cached in module scope. */
async function loadClient() {
  requestInterceptors.length = 0;
  responseHandlers.length = 0;
  publicGet.mockReset();
  publicGet.mockResolvedValue({ data: { csrfToken: TOKEN } });

  vi.resetModules();
  const mod = await import('./api-client.js');
  return { mod, requestInterceptor: requestInterceptors[0] };
}

describe('CSRF request interceptor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches X-CSRF-Token to state-changing requests', async () => {
    const { requestInterceptor } = await loadClient();

    for (const method of ['post', 'put', 'patch', 'delete']) {
      const config = await requestInterceptor({ method, headers: {} });
      expect(config.headers['X-CSRF-Token']).toBe(TOKEN);
    }
  });

  it('does NOT attach it to safe methods', async () => {
    const { requestInterceptor } = await loadClient();

    for (const method of ['get', 'head', 'options']) {
      const config = await requestInterceptor({ method, headers: {} });
      expect(config.headers['X-CSRF-Token']).toBeUndefined();
    }
    // A safe request must not have triggered a token fetch either.
    expect(publicGet).not.toHaveBeenCalled();
  });

  it('fetches the token once and reuses it', async () => {
    const { requestInterceptor } = await loadClient();

    await requestInterceptor({ method: 'post', headers: {} });
    await requestInterceptor({ method: 'post', headers: {} });
    await requestInterceptor({ method: 'delete', headers: {} });

    expect(publicGet).toHaveBeenCalledTimes(1);
    expect(publicGet).toHaveBeenCalledWith('/csrf-token');
  });

  it('coalesces concurrent callers onto a single fetch', async () => {
    const { requestInterceptor } = await loadClient();

    // Three writes firing at once — a judge panel submitting together — must
    // not produce three token requests.
    await Promise.all([
      requestInterceptor({ method: 'post', headers: {} }),
      requestInterceptor({ method: 'post', headers: {} }),
      requestInterceptor({ method: 'post', headers: {} }),
    ]);

    expect(publicGet).toHaveBeenCalledTimes(1);
  });

  it('does not block the request when the token cannot be fetched', async () => {
    const { requestInterceptor } = await loadClient();
    publicGet.mockRejectedValue(new Error('offline'));

    // If CSRF is disabled server-side the header is simply unnecessary; a
    // failure here must never stop a judge submitting.
    const config = await requestInterceptor({ method: 'post', headers: {} });

    expect(config).toBeTruthy();
    expect(config.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('reads the token from the response BODY, not document.cookie', async () => {
    // The SPA is a separate origin from the API, so document.cookie can never
    // hold the API's csrf cookie. Reading the body is what makes this work.
    document.cookie = 'csrf-token=a-cookie-value';
    const { requestInterceptor } = await loadClient();

    const config = await requestInterceptor({ method: 'post', headers: {} });

    expect(config.headers['X-CSRF-Token']).toBe(TOKEN);
    expect(config.headers['X-CSRF-Token']).not.toBe('a-cookie-value');
  });

  it('resetCsrfToken forces the next write to refetch', async () => {
    const { mod, requestInterceptor } = await loadClient();

    await requestInterceptor({ method: 'post', headers: {} });
    expect(publicGet).toHaveBeenCalledTimes(1);

    mod.resetCsrfToken();
    await requestInterceptor({ method: 'post', headers: {} });

    expect(publicGet).toHaveBeenCalledTimes(2);
  });
});
