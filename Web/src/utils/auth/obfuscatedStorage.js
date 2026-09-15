/**
 * Obfuscated Storage (HIGH-3 — short-term rename)
 *
 * ⚠️  THIS IS NOT A SECURITY BOUNDARY.
 *
 * This module wraps **sessionStorage** with client-side AES encryption. It
 * provides obfuscation — not security — because:
 *   1. The encryption key is a constant, not a secret.
 *   2. The key material is visible in the bundle source.
 *   3. Any script running in the same origin can read the same sessionStorage.
 *
 * The backend matters: sessionStorage is per-tab and NEVER fires the window
 * `storage` event, so nothing can sync tabs by listening for it. That stale
 * "wraps localStorage" comment is exactly why AuthProvider shipped a dead
 * cross-tab listener (HIGH-W4); cross-tab logout now uses BroadcastChannel.
 *
 * The long-term fix (Phase 2, item 2.1) is to move tokens to httpOnly
 * cookies so they never appear in JavaScript-accessible storage at all.
 *
 * Renamed from `secureStorage` to `obfuscatedStorage` to make the actual
 * security posture explicit and prevent false confidence.
 */
import CryptoJS from 'crypto-js';
import { logger } from '@/infrastructure/logger.js';

/**
 * The obfuscation key.
 *
 * This used to mix in a browser fingerprint (screen dimensions, timezone
 * offset, UA prefix). That added no security — an attacker running script on
 * this origin reads the exact same values — but it made the key *volatile*:
 * moving the window to a monitor with a different resolution, changing display
 * scaling, or crossing a DST boundary all produced a different key. Every
 * previously written entry then decrypted to garbage and threw
 * "Malformed UTF-8 data", silently logging the user out.
 *
 * A constant key gives the same obfuscation with a stable read path.
 */
const getEncryptionKey = () =>
  import.meta.env.VITE_STORAGE_KEY || 'mallakhamb-india-2026';

/**
 * Known per-role storage key suffixes.
 * When clearing for a specific role we remove `${role}_${suffix}` keys.
 */
/*
 * Every per-role key, so `clearForRole` actually ends a session.
 *
 * `current_competition` and `selected_level` were missing, and the logout path
 * only got away with it because it follows `clearForRole` with a nuclear
 * `sessionStorage.clear()`. The cross-tab logout handler in AuthProvider does
 * NOT — it calls `clearForRole` alone — so a tab told to drop its session kept
 * the previous user's meet and level, and the next sign-in for that role
 * inherited both.
 */
const ROLE_KEY_SUFFIXES = ['token', 'user', 'current_competition', 'selected_level'];

export const obfuscatedStorage = {
  setItem: (key, value) => {
    try {
      const encrypted = CryptoJS.AES.encrypt(value, getEncryptionKey()).toString();
      sessionStorage.setItem(key, encrypted);
    } catch (error) {
      logger.error('Failed to encrypt data:', error);
      // Do not fall back to plain storage - fail silently to avoid exposing sensitive data
    }
  },
  
  getItem: (key) => {
    const encrypted = sessionStorage.getItem(key);
    if (!encrypted) return null;

    try {
      const decrypted = CryptoJS.AES.decrypt(encrypted, getEncryptionKey());
      const value = decrypted.toString(CryptoJS.enc.Utf8);
      return value || null;
    } catch (error) {
      // Ciphertext we cannot read is unusable — most often an entry written
      // under an older key. Evict it so callers (which read several keys per
      // render) don't re-throw on every subsequent read.
      sessionStorage.removeItem(key);
      logger.warn(`Discarding unreadable storage entry "${key}":`, error);
      return null; // Do not fall back to plain storage
    }
  },
  
  removeItem: (key) => {
    sessionStorage.removeItem(key);
  },

  /**
   * Remove only the storage keys belonging to a specific role.
   * Other roles' sessions are preserved so concurrent logins survive.
   *
   * @param {string} role - The role to clear (e.g. 'admin', 'superadmin')
   */
  clearForRole: (role) => {
    if (!role) return;
    for (const suffix of ROLE_KEY_SUFFIXES) {
      sessionStorage.removeItem(`${role}_${suffix}`);
    }
    // Also clear any legacy un-prefixed keys
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('userType');
  },

  /**
   * Nuclear clear — removes ALL sessionStorage keys.
   * Prefer clearForRole() in logout flows to preserve other sessions.
   */
  clear: () => {
    sessionStorage.clear();
  }
};

/**
 * @deprecated Use `obfuscatedStorage` instead. This alias exists only for
 * backward compatibility during migration and will be removed in Phase 2.
 */
export const secureStorage = obfuscatedStorage;
