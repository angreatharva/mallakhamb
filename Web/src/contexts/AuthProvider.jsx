/**
 * AuthProvider — Centralized authentication state management
 *
 * Extracted from App.jsx (MED-2) to keep the root component as a thin
 * layout shell.  All auth state, login/logout handlers, token lifecycle
 * awareness, and legacy-data migration live here.
 *
 * @module contexts/AuthProvider
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import apiConfig from '@/config/api.config';
import { logger } from '@/infrastructure/logger';
import { authAPI } from '@/services/auth/auth.api';
import { ensureCsrfToken } from '@/services/api-client';
import {
  authEventBus,
  AUTH_EXPIRED,
  broadcastLogout,
  subscribeToAuthBroadcast,
} from '@/utils/auth/authEvents';
import { getRoleFromPath, getLoginPathForRole } from '@/utils/auth/roleFromPath';

/**
 * Routes where no session is expected, so session rehydration must not run.
 * See the note in the bootstrap effect below.
 */
const UNAUTHENTICATED_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // --- Resolve current role from URL (single source) ---
  const currentRole = getRoleFromPath(location.pathname);

  /**
   * Load auth data from secureStorage for the current URL‑derived role.
   * Falls back to migrating legacy un-prefixed keys if present.
   */
  const loadAuthData = useCallback(() => {
    if (currentRole) {
      const userData = secureStorage.getItem(`${currentRole}_user`);

      if (userData) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setUserType(currentRole);
          return true;
        } catch (error) {
          logger.error('Failed to parse user data:', error);
        }
      }
    }

    // Legacy migration: un-prefixed keys → role-prefixed keys
    const legacyToken = localStorage.getItem('token');
    const legacyUserData = localStorage.getItem('user');
    const legacyType = localStorage.getItem('userType');

    if (legacyToken && legacyUserData && legacyType) {
      try {
        secureStorage.setItem(`${legacyType}_token`, legacyToken);
        secureStorage.setItem(`${legacyType}_user`, legacyUserData);

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');

        if (legacyType === currentRole) {
          setUser(JSON.parse(legacyUserData));
          setUserType(legacyType);
        }
      } catch (error) {
        logger.error('Failed to parse legacy user data:', error);
      }
    }
  }, [currentRole]);

  // --- Single consolidated effect for auth loading ---
  // Replaces the 3 redundant useEffects that were in App.jsx
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const restored = loadAuthData();
      if (restored || !currentRole) {
        setLoading(false);
        return;
      }

      // Never try to rehydrate on an unauthenticated entry point. Doing so
      // 401s, which makes the API client attempt a silent refresh, which also
      // fails and dispatches AUTH_EXPIRED, which navigates back to the login
      // page — and the whole thing runs again. Observed as a request loop in
      // the browser; there is simply nothing to restore on these routes.
      if (UNAUTHENTICATED_PATHS.some((p) => location.pathname.includes(p))) {
        setLoading(false);
        return;
      }

      // MED-W1: storage is empty but the httpOnly cookie may still be valid.
      // obfuscatedStorage writes sessionStorage, which is per-tab and does not
      // survive a tab close, while the cookie is origin-scoped and does. So a
      // second tab — or one whose storage was evicted — rendered a logged-out
      // UI even though the server still considered the user authenticated, and
      // there was no way to recover short of logging in again.
      //
      // Ask the server who we are. A 401 just means genuinely logged out; the
      // API client's interceptor will have already attempted a silent refresh.
      try {
        const { data } = await authAPI.me();
        const me = data?.data;
        if (cancelled || !me?.user) return;

        // Only adopt a session that matches the role this URL is for — roles
        // keep independent sessions by design.
        if (me.userType && me.userType !== currentRole) return;

        setUser(me.user);
        setUserType(me.userType || currentRole);
        secureStorage.setItem(`${currentRole}_user`, JSON.stringify(me.user));
        logger.log('Session rehydrated from cookie', { role: me.userType });
      } catch {
        // Not authenticated. Nothing to restore; the guard redirects to login.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname is read
  // at call time on purpose: adding it re-runs this on every navigation, which
  // re-reads storage and can resurrect a session logout has just cleared.
  }, [loadAuthData, currentRole]);

  // --- Cross-tab auth sync (HIGH-W4) ---
  // This used to listen for the window `storage` event, which fires only for
  // localStorage. obfuscatedStorage writes sessionStorage, so the listener
  // could never fire and logging out in one tab left the others rendering an
  // authenticated UI. BroadcastChannel is backend-independent.
  useEffect(() => {
    return subscribeToAuthBroadcast((message) => {
      if (message.type !== 'logout') return;
      // Only react to our own role — roles keep independent sessions by design.
      if (!currentRole || message.role !== currentRole) return;

      secureStorage.clearForRole(currentRole);
      setUser(null);
      setUserType(null);
    });
  }, [currentRole]);

  // --- AUTH_EXPIRED event handler ---
  // Listens for auth expiry events dispatched by Axios interceptors and
  // navigates via React Router instead of doing a full page reload.
  useEffect(() => {
    const handleAuthExpired = (e) => {
      const expiredRole = e.detail?.userType || currentRole || userType;
      if (!expiredRole) return;

      secureStorage.clearForRole(expiredRole);
      sessionStorage.clear();

      setUser(null);
      setUserType(null);
      // The session is settled — there is none. Without this, an expiry raised
      // by the bootstrap's own `/auth/me` left the login page we navigate to
      // behind App's full-screen loader whenever that bootstrap never reached
      // its `finally` (StrictMode cancels the first run in development).
      setLoading(false);

      const redirectTo = getLoginPathForRole(expiredRole);
      navigate(redirectTo, { replace: true });
    };

    authEventBus.addEventListener(AUTH_EXPIRED, handleAuthExpired);
    return () => authEventBus.removeEventListener(AUTH_EXPIRED, handleAuthExpired);
  }, [navigate, currentRole, userType]);

  // --- Login handler ---
  const login = useCallback((userData, token, type) => {
    secureStorage.setItem(`${type}_user`, JSON.stringify(userData));
    if (token) {
      secureStorage.setItem(`${type}_token`, token);
    }

    setUser(userData);
    setUserType(type);
  }, []);

  // --- Logout handler ---
  // Uses clearForRole() to preserve other roles' sessions (MED-3)
  const handleLogout = useCallback(
    async () => {
      const roleToLogout = currentRole || userType;

      try {
        /*
         * Raw fetch on purpose — going through `api` would re-enter the
         * response interceptor, and a 401 here would try a silent refresh for
         * the session we are in the middle of ending.
         *
         * But skipping the client also skips its REQUEST interceptor, which is
         * what normally attaches these two headers, and `POST /auth/logout`
         * needs both: `authMiddleware` to know whose session to revoke, and
         * either a Bearer token or the double-submit CSRF header to get past
         * `csrf.middleware`. With neither, the server answered 403
         * CSRF_TOKEN_MISSING and revoked nothing — while the `.catch` below
         * swallowed it and the client-side clear made it LOOK like a clean
         * logout. The refresh cookie stayed valid for its full lifetime, so on
         * a shared judging tablet the next person could still resume the
         * previous session. `attemptSilentRefresh` in api-client.js documents
         * the same trap; this path was simply missed.
         */
        /*
         * Never let logout HANG on the token fetch. If the API is unreachable
         * the CSRF request can sit unresolved indefinitely, and awaiting it
         * would strand the user in a session they have asked to end — the
         * local clear below is what actually gets them out. Two seconds, then
         * go without it: the Bearer header usually carries the request anyway,
         * and a failed revoke is recoverable where a stuck logout is not.
         */
        const csrf = await Promise.race([
          ensureCsrfToken().catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        const token = secureStorage.getItem(`${roleToLogout}_token`);
        await fetch(`${apiConfig.getBaseUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include' // Send httpOnly cookies
        }).catch(() => {});
      } catch {
        // Ignore logout errors
      }

      // Scoped clear — only remove keys for the current role
      secureStorage.clearForRole(roleToLogout);
      sessionStorage.clear();

      // Tell other tabs holding this role to drop their session too (HIGH-W4).
      broadcastLogout(roleToLogout);

      setUser(null);
      setUserType(null);

      if (navigate && roleToLogout) {
        const loginPath = getLoginPathForRole(roleToLogout);
        navigate(loginPath, { replace: true });
      }
    },
    [currentRole, userType, navigate],
  );

  // --- Context value (memoized to prevent unnecessary re-renders) ---
  const contextValue = useMemo(
    () => ({ user, userType, loading, login, logout: handleLogout }),
    [user, userType, loading, login, handleLogout],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
