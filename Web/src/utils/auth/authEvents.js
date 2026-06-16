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
