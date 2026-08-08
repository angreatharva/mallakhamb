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
import {
  authEventBus,
  AUTH_EXPIRED,
  broadcastLogout,
  subscribeToAuthBroadcast,
} from '@/utils/auth/authEvents';
import { getRoleFromPath, getLoginPathForRole } from '@/utils/auth/roleFromPath';

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
          return;
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
    loadAuthData();
    setLoading(false);
  }, [loadAuthData]);

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
      const expiredRole = e.detail?.role || currentRole || userType;
      if (!expiredRole) return;

      secureStorage.clearForRole(expiredRole);
      sessionStorage.clear();

      setUser(null);
      setUserType(null);

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
        await fetch(`${apiConfig.getBaseUrl()}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
