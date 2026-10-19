/**
 * Silent refresh on 401: requests queued behind a refresh that FAILS.
 *
 * They used to be left pending forever. React StrictMode runs AuthProvider's
 * bootstrap twice in development, so a signed-out visit to a protected page
 * sent two `/auth/me` calls; the second queued behind the first's refresh,
 * never settled, and the app sat on its full-screen loader until a reload.
 */

import { describe, it, expect, vi } from 'vitest';

const responseErrorHandlers = [];
const rawPost = vi.fn();

vi.mock('axios', () => {
  const makeInstance = () => ({
    get: vi.fn().mockResolvedValue({ data: { csrfToken: 'csrf' } }),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: (ok, err) => responseErrorHandlers.push(err) },
    },
  });
  return { default: { create: makeInstance, post: rawPost } };
});

vi.mock('@/config/api.config.js', () => ({
  default: { getBaseUrl: () => 'http://test.local/api', getHeaders: () => ({}) },
}));
vi.mock('@/utils/auth/secureStorage.js', () => ({
  secureStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('@/utils/auth/tokenUtils.js', () => ({ getCompetitionIdFromToken: () => null }));
vi.mock('jwt-decode', () => ({ jwtDecode: () => ({}) }));

const unauthorized = (url) => ({ config: { url, headers: {} }, response: { status: 401, data: {} } });

describe('silent refresh failure', () => {
  it('rejects requests queued behind it instead of leaving them pending', async () => {
    await import('./api-client.js');
    const onError = responseErrorHandlers[0];

    let failRefresh;
    rawPost.mockReturnValue(new Promise((_, reject) => { failRefresh = reject; }));

    const first = onError(unauthorized('/auth/me')).then(() => 'resolved', () => 'rejected');
    // Let the first reach its refresh POST before the second arrives.
    await vi.waitFor(() => expect(rawPost).toHaveBeenCalled());
    const queuedError = unauthorized('/auth/me');
    const second = onError(queuedError).then(() => 'resolved', (e) => e);

    failRefresh(new Error('refresh 401'));

    expect(await first).toBe('rejected');
    expect(await second).toBe(queuedError);
  });
});
