/**
 * Auth Events — Decoupled auth event bus
 * 
 * Allows non-React code (e.g. Axios interceptors) to signal auth state
 * changes without importing React Router or triggering full page reloads.
 * React components subscribe via `addEventListener` and use `navigate()`.
 *
 * @module authEvents
 */

import { getLoginPathForRole } from '@/utils/auth/roleFromPath.js';

/** @type {EventTarget} Singleton event bus for auth-related events */
export const authEventBus = new EventTarget();

/** Event name dispatched when the user's session has expired / been invalidated */
export const AUTH_EXPIRED = 'auth:expired';

/**
 * Dispatch an AUTH_EXPIRED event with navigation metadata.
 *
 * @param {Object} options
 * @param {string} options.userType - The role whose session expired (e.g. 'admin')
 * @param {string} options.reason  - Human-readable reason (for logging)
 */
export function dispatchAuthExpired({ userType, reason = 'session_expired' }) {
  authEventBus.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED, {
      detail: {
        userType,
        reason,
        redirectTo: getLoginPathForRole(userType),
      },
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Cross-tab auth sync (HIGH-W4)                                              */
/* -------------------------------------------------------------------------- */

/**
 * AuthProvider used to sync tabs by listening for the window `storage` event.
 * That event fires only for **localStorage** mutations, and obfuscatedStorage
 * writes **sessionStorage** — which is per-tab and never raises it. So the
 * listener was dead code that looked live: logging out in one tab left every
 * other tab rendering an authenticated UI until a request happened to 401.
 *
 * BroadcastChannel is the right primitive here because it is independent of
 * the storage backend. Guarded because jsdom and older Safari lack it.
 */
const AUTH_CHANNEL_NAME = 'mallakhamb:auth';

/** @type {BroadcastChannel|null} */
let authChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  } catch {
    authChannel = null;
  }
}

/** Broadcast that `role` logged out, so other tabs can drop their session. */
export function broadcastLogout(role) {
  if (!authChannel || !role) return;
  try {
    authChannel.postMessage({ type: 'logout', role });
  } catch {
    // A failed cross-tab notification must never break the logout itself.
  }
}

/**
 * Subscribe to cross-tab auth messages.
 * @param {(message: {type: string, role: string}) => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeToAuthBroadcast(handler) {
  if (!authChannel) return () => {};

  const listener = (event) => {
    if (event?.data?.type) handler(event.data);
  };
  authChannel.addEventListener('message', listener);
  return () => authChannel.removeEventListener('message', listener);
}
