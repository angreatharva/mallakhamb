/**
 * Verification for HIGH-W4 in docs/AUDIT.md.
 *
 * AuthProvider synced tabs by listening for the window `storage` event, which
 * fires only for localStorage mutations and only in OTHER tabs. But
 * obfuscatedStorage writes sessionStorage, which is per-tab and never raises
 * that event — so the listener was dead code that looked live. Logging out in
 * one tab left every other tab rendering an authenticated UI until some request
 * happened to 401.
 *
 * Cross-tab sync now goes over BroadcastChannel, which is independent of the
 * storage backend. These tests use a SECOND raw channel to stand in for the
 * other tab: a BroadcastChannel never receives its own postMessage, which is
 * the correct behaviour here (a tab must not react to its own logout) but means
 * the test cannot use one channel for both ends.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { broadcastLogout, subscribeToAuthBroadcast } from './authEvents';

const CHANNEL_NAME = 'mallakhamb:auth';

/**
 * Wait for a condition that a queued BroadcastChannel delivery will satisfy.
 * Polling rather than a fixed sleep: delivery is asynchronous and a hard-coded
 * timeout is flaky once the whole suite is running in parallel.
 */
async function waitFor(predicate, { timeout = 2000, interval = 10 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return predicate();
}

/** Let queued BroadcastChannel deliveries flush (for negative assertions). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('HIGH-W4 — cross-tab auth sync (FIXED)', () => {
  /** @type {BroadcastChannel} */
  let otherTab;

  beforeEach(() => {
    otherTab = new BroadcastChannel(CHANNEL_NAME);
  });

  afterEach(() => {
    otherTab.close();
  });

  it('is actually supported in this environment', () => {
    // Guards the tests below from silently becoming vacuous: the production
    // code degrades to a no-op when BroadcastChannel is missing.
    expect(typeof BroadcastChannel).toBe('function');
  });

  it('publishes a logout other tabs can observe', async () => {
    const received = [];
    otherTab.addEventListener('message', (event) => received.push(event.data));

    broadcastLogout('admin');
    await waitFor(() => received.length > 0);

    expect(received).toContainEqual({ type: 'logout', role: 'admin' });
  });

  it('delivers another tab’s logout to a subscriber', async () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToAuthBroadcast(handler);

    otherTab.postMessage({ type: 'logout', role: 'judge' });
    await waitFor(() => handler.mock.calls.length > 0);

    expect(handler).toHaveBeenCalledWith({ type: 'logout', role: 'judge' });
    unsubscribe();
  });

  it('stops delivering after unsubscribe', async () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToAuthBroadcast(handler);
    unsubscribe();

    otherTab.postMessage({ type: 'logout', role: 'coach' });
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores malformed messages', async () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToAuthBroadcast(handler);

    otherTab.postMessage({ nope: true });
    otherTab.postMessage(null);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not throw when broadcasting without a role', () => {
    expect(() => broadcastLogout(undefined)).not.toThrow();
  });
});
