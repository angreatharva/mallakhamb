import { useState, useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import { CompetitionProvider } from '@/contexts/CompetitionContext';
import { AuthContext } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import { secureStorage } from '@/utils/auth/secureStorage';
import { apiCache } from '@/utils/data/apiCache';
import apiConfig from '@/config/api.config';
import { logger } from '@/infrastructure/logger';
import AppRoutes, { PageLoader } from '@/routes';

function AppContent() {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  const getCurrentUserTypeFromURL = () => {
    const path = location.pathname;
    if (path.startsWith('/player')) return 'player';
    if (path.startsWith('/coach')) return 'coach';
    if (path.startsWith('/judge')) return 'judge';
    if (path.startsWith('/superadmin')) return 'superadmin';
    if (path.startsWith('/admin')) return 'admin';
    return null;
  };

  const loadAuthData = () => {
    const currentType = getCurrentUserTypeFromURL();

    if (currentType) {
      const token = secureStorage.getItem(`${currentType}_token`);
      const userData = secureStorage.getItem(`${currentType}_user`);

      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setUserType(currentType);
          return;
        } catch (error) {
          logger.error('Failed to parse user data:', error);
        }
      }
    }

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

        if (legacyType === getCurrentUserTypeFromURL()) {
          setUser(JSON.parse(legacyUserData));
          setUserType(legacyType);
        }
      } catch (error) {
        logger.error('Failed to parse legacy user data:', error);
      }
    }
  };

  useEffect(() => {
    loadAuthData();
    setLoading(false);

    const handleStorageChange = (e) => {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType && (e.key === `${currentType}_token` || e.key === `${currentType}_user`)) {
        loadAuthData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (!loading) {
      loadAuthData();
    }
  }, [location.pathname]);

  useEffect(() => {
    if ((location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin')) && !user && !loading) {
      loadAuthData();
    }
  }, [location.pathname, user, loading]);

  const login = (userData, token, type) => {
    secureStorage.setItem(`${type}_token`, token);
    secureStorage.setItem(`${type}_user`, JSON.stringify(userData));

    setUser(userData);
    setUserType(type);
  };

  const handleLogout = async (navigate) => {
    const currentType = getCurrentUserTypeFromURL() || userType;

    try {
      const token = currentType
        ? secureStorage.getItem(`${currentType}_token`)
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

    secureStorage.clear();
    localStorage.clear();
    sessionStorage.clear();
    apiCache.clear();

    setUser(null);
    setUserType(null);

    if (navigate && currentType) {
      const loginPaths = {
        player: '/player/login',
        coach: '/coach/login',
        admin: '/admin/login',
        superadmin: '/superadmin/login',
        judge: '/judge/login',
      };

      const loginPath = loginPaths[currentType] || '/';
      navigate(loginPath);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin');
  const isHomePage = location.pathname === '/';
  const isPublicScores = location.pathname === '/scores';
  const isCompetitionSelectionPage = location.pathname === '/coach/select-competition';
  const isLoginPage = location.pathname.includes('/login');
  const isRegisterPage = location.pathname.includes('/register');
  const isForgotPasswordPage = location.pathname.includes('/forgot-password') || location.pathname.includes('/reset-password');

  const shouldHideNavbar =
    isAdminRoute || isHomePage || isPublicScores || isCompetitionSelectionPage || isLoginPage || isRegisterPage || isForgotPasswordPage;

  return (
    <AuthContext.Provider value={{ user, userType, login, logout: handleLogout }}>
      <CompetitionProvider userType={userType}>
        <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
          {!shouldHideNavbar && <Navbar user={user} userType={userType} onLogout={handleLogout} />}

          <div className={!shouldHideNavbar ? 'pt-16' : ''}>
            <AppRoutes />
          </div>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#4ade80',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 4000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </div>
      </CompetitionProvider>
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
