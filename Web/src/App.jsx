import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import RouteContext from './contexts/RouteContext';
import { CompetitionProvider } from './contexts/CompetitionContext';
import ErrorBoundary from './components/ErrorBoundary';
import { secureStorage } from './utils/secureStorage';
import { apiCache } from './utils/apiCache';
import { logger } from './utils/logger';

// Lazy load all pages for better performance
const Home = lazy(() => import('./pages/public/Home'));
const PlayerLogin = lazy(() => import('./pages/player/PlayerLogin'));
const PlayerRegister = lazy(() => import('./pages/player/PlayerRegister'));
const PlayerSelectTeam = lazy(() => import('./pages/player/PlayerSelectTeam'));
const PlayerDashboard = lazy(() => import('./pages/player/PlayerDashboard'));
const CoachLogin = lazy(() => import('./pages/coach/CoachLogin'));
const CoachRegister = lazy(() => import('./pages/coach/CoachRegister'));
const CoachCreateTeam = lazy(() => import('./pages/coach/CoachCreateTeam'));
const CoachSelectCompetition = lazy(() => import('./pages/coach/CoachSelectCompetition'));
const CoachDashboard = lazy(() => import('./pages/coach/CoachDashboard'));
const CoachPayment = lazy(() => import('./pages/coach/CoachPayment'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const SuperAdminLogin = lazy(() => import('./pages/superadmin/SuperAdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard'));
const AdminTeams = lazy(() => import('./pages/admin/AdminTeams'));
const AdminScoring = lazy(() => import('./pages/admin/AdminScoring'));
const JudgeLogin = lazy(() => import('./pages/judge/JudgeLogin'));
const JudgeScoring = lazy(() => import('./pages/judge/JudgeScoring'));
const ForgotPassword = lazy(() => import('./pages/shared/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/shared/ResetPassword'));
const PublicScores = lazy(() => import('./pages/public/PublicScores'));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#FF6B35' }}></div>
      <p className="mt-4 text-white/45">Loading...</p>
    </div>
  </div>
);

// Create Auth Context
export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Main App Content Component (needs to be inside Router to use useLocation)
function AppContent() {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // Determine current tab's user type based on URL
  const getCurrentUserTypeFromURL = () => {
    const path = location.pathname;
    if (path.startsWith('/player')) return 'player';
    if (path.startsWith('/coach')) return 'coach';
    if (path.startsWith('/judge')) return 'judge';
    if (path.startsWith('/superadmin')) return 'superadmin';
    if (path.startsWith('/admin')) return 'admin';
    return null;
  };

  // Load authentication data based on current tab context
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

    // Fallback: check for legacy single-user storage and migrate
    const legacyToken = localStorage.getItem('token');
    const legacyUserData = localStorage.getItem('user');
    const legacyType = localStorage.getItem('userType');

    if (legacyToken && legacyUserData && legacyType) {
      try {
        // Migrate to new secure storage format
        secureStorage.setItem(`${legacyType}_token`, legacyToken);
        secureStorage.setItem(`${legacyType}_user`, legacyUserData);

        // Remove legacy storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');

        // Set current state if it matches current tab
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

    // Listen for storage changes (cross-tab communication)
    const handleStorageChange = (e) => {
      const currentType = getCurrentUserTypeFromURL();
      if (currentType && (e.key === `${currentType}_token` || e.key === `${currentType}_user`)) {
        loadAuthData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Re-load auth data when URL changes (navigation between player/coach/admin sections)
  useEffect(() => {
    if (!loading) {
      loadAuthData();
    }
  }, [location.pathname]);

  // Additional check for admin routes
  useEffect(() => {
    if ((location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin')) && !user && !loading) {
      loadAuthData();
    }
  }, [location.pathname, user, loading]);

  const login = (userData, token, type) => {
    // Store with type-specific keys using secure storage
    secureStorage.setItem(`${type}_token`, token);
    secureStorage.setItem(`${type}_user`, JSON.stringify(userData));
    
    setUser(userData);
    setUserType(type);
  };

  const handleLogout = async () => {
    const currentType = getCurrentUserTypeFromURL();
    
    try {
      // Call backend logout endpoint if token exists
      const token = currentType 
        ? secureStorage.getItem(`${currentType}_token`)
        : secureStorage.getItem('token');
      
      if (token) {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(() => {
          // Ignore errors from logout endpoint - still clear local data
        });
      }
    } catch (error) {
      // Ignore logout errors
    }
    
    // Clear all storage
    secureStorage.clear();
    localStorage.clear();
    sessionStorage.clear();
    apiCache.clear();
    
    setUser(null);
    setUserType(null);
  };

  if (loading) {
    return <PageLoader />;
  }

  // Check if current route is admin route, home page, public scores, or competition selection pages
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin');
  const isHomePage = location.pathname === '/';
  const isPublicScores = location.pathname === '/scores';
  const isCompetitionSelectionPage = location.pathname === '/coach/select-competition' || location.pathname === '/player/select-team';

  return (
    <AuthContext.Provider value={{ user, userType, login, logout: handleLogout }}>
      <CompetitionProvider userType={userType}>
        <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
          {/* Only show main navbar if not on admin routes, home page, public scores, or competition selection pages */}
          {!isAdminRoute && !isHomePage && !isPublicScores && !isCompetitionSelectionPage && <Navbar user={user} userType={userType} onLogout={handleLogout} />}

        {/* Add padding-top when navbar is shown to prevent content overlap */}
        <div className={!isAdminRoute && !isHomePage && !isPublicScores && !isCompetitionSelectionPage ? 'pt-16' : ''}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/scores" element={<PublicScores />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Player Routes */}
            <Route path="/player" element={<Navigate to="/player/login" replace />} />
            <Route path="/player/login" element={<PlayerLogin />} />
            <Route path="/player/register" element={<PlayerRegister />} />

            {/* Protected Player Routes */}
            <Route
              path="/player/select-team"
              element={
                <ProtectedRoute requiredUserType="player">
                  <PlayerSelectTeam />
                </ProtectedRoute>
              }
            />
            <Route
              path="/player/dashboard"
              element={
                <ProtectedRoute requiredUserType="player">
                  <PlayerDashboard />
                </ProtectedRoute>
              }
            />

            {/* Coach Routes */}
            <Route path="/coach" element={<Navigate to="/coach/login" replace />} />
            <Route path="/coach/login" element={<CoachLogin />} />
            <Route path="/coach/register" element={<CoachRegister />} />

            {/* Protected Coach Routes */}
            <Route
              path="/coach/create-team"
              element={
                <ProtectedRoute requiredUserType="coach">
                  <CoachCreateTeam />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coach/select-competition"
              element={
                <ProtectedRoute requiredUserType="coach">
                  <CoachSelectCompetition />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coach/dashboard"
              element={
                <ProtectedRoute requiredUserType="coach">
                  <CoachDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/coach/payment"
              element={
                <ProtectedRoute requiredUserType="coach">
                  <CoachPayment />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected Admin Routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requiredUserType="admin">
                  <CompetitionProvider userType="admin">
                    <AdminDashboard />
                  </CompetitionProvider>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard/:tab"
              element={
                <ProtectedRoute requiredUserType="admin">
                  <CompetitionProvider userType="admin">
                    <AdminDashboard />
                  </CompetitionProvider>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/teams"
              element={
                <ProtectedRoute requiredUserType="admin">
                  <AdminTeams />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/scoring"
              element={
                <ProtectedRoute requiredUserType="admin">
                  <AdminScoring />
                </ProtectedRoute>
              }
            />

            {/* Judge Routes */}
            <Route path="/judge" element={<Navigate to="/judge/login" replace />} />
            <Route path="/judge/login" element={<JudgeLogin />} />
            <Route 
              path="/judge/scoring" 
              element={
                <ProtectedRoute requiredUserType="judge">
                  <JudgeScoring />
                </ProtectedRoute>
              } 
            />

            {/* Super Admin Routes */}
            <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
            <Route path="/superadmin/login" element={<SuperAdminLogin />} />

            {/* Protected Super Admin Routes */}
            <Route
              path="/superadmin/dashboard"
              element={
                <ProtectedRoute requiredUserType="superadmin">
                  <RouteContext.Provider value={{ routePrefix: "/superadmin", storagePrefix: "superadmin" }}>
                    <SuperAdminDashboard />
                  </RouteContext.Provider>
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/dashboard/:tab"
              element={
                <ProtectedRoute requiredUserType="superadmin">
                  <RouteContext.Provider value={{ routePrefix: "/superadmin", storagePrefix: "superadmin" }}>
                    <SuperAdminDashboard />
                  </RouteContext.Provider>
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/scoring"
              element={
                <ProtectedRoute requiredUserType="superadmin">
                  <RouteContext.Provider value={{ routePrefix: "/superadmin", storagePrefix: "superadmin" }}>
                    <AdminScoring />
                  </RouteContext.Provider>
                </ProtectedRoute>
              }
            />

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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

// Main App Component
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
