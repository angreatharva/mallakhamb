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
import { authEventBus, AUTH_EXPIRED } from '@/utils/auth/authEvents';
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
      const token = secureStorage.getItem(`${currentRole}_token`);
      const userData = secureStorage.getItem(`${currentRole}_user`);

      if (token && userData) {
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

  // --- Cross-tab storage sync ---
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (
        currentRole &&
        (e.key === `${currentRole}_token` || e.key === `${currentRole}_user`)
      ) {
        loadAuthData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentRole, loadAuthData]);

  // --- AUTH_EXPIRED event handler ---
  // Listens for auth expiry events dispatched by Axios interceptors and
  // navigates via React Router instead of doing a full page reload.
  useEffect(() => {
    const handleAuthExpired = (event) => {
      const { redirectTo, reason } = event.detail;
      logger.warn(`Auth expired (${reason}), redirecting to ${redirectTo}`);

      // Clear React auth state
      setUser(null);
      setUserType(null);

      // Navigate within React Router — no page reload
      navigate(redirectTo, { replace: true });
    };

    authEventBus.addEventListener(AUTH_EXPIRED, handleAuthExpired);
    return () => authEventBus.removeEventListener(AUTH_EXPIRED, handleAuthExpired);
  }, [navigate]);

  // --- Login handler ---
  const login = useCallback((userData, token, type) => {
    secureStorage.setItem(`${type}_token`, token);
    secureStorage.setItem(`${type}_user`, JSON.stringify(userData));

    setUser(userData);
    setUserType(type);
  }, []);

  // --- Logout handler ---
  // Uses clearForRole() to preserve other roles' sessions (MED-3)
  const handleLogout = useCallback(
    async (nav) => {
      const roleToLogout = currentRole || userType;

      try {
        const token = roleToLogout
          ? secureStorage.getItem(`${roleToLogout}_token`)
          : secureStorage.getItem('token');

        if (token) {
          await fetch(`${apiConfig.getBaseUrl()}/auth/logout`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }).catch(() => {});
        }
      } catch {
        // Ignore logout errors
      }

      // Scoped clear — only remove keys for the current role
      secureStorage.clearForRole(roleToLogout);
      sessionStorage.clear();

      setUser(null);
      setUserType(null);

      if (nav && roleToLogout) {
        const loginPath = getLoginPathForRole(roleToLogout);
        nav(loginPath);
      }
    },
    [currentRole, userType],
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
