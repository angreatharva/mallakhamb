import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import RouteContext from './contexts/RouteContext';
import { CompetitionProvider } from './contexts/CompetitionContext';

// Pages
import Home from './pages/Home';
import PlayerLogin from './pages/PlayerLogin';
import PlayerRegister from './pages/PlayerRegister';
import PlayerSelectTeam from './pages/PlayerSelectTeam';
import PlayerDashboard from './pages/PlayerDashboard';
import CoachLogin from './pages/CoachLogin';
import CoachRegister from './pages/CoachRegister';
import CoachCreateTeam from './pages/CoachCreateTeam';
import CoachSelectCompetition from './pages/CoachSelectCompetition';
import CoachDashboard from './pages/CoachDashboard';
import CoachPayment from './pages/CoachPayment';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import AdminTeams from './pages/AdminTeams';
import ScoringPage from './pages/ScoringPage';
import AdminScoring from './pages/AdminScoring';
import JudgeScoring from './pages/JudgeScoring';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicScores from './pages/PublicScores';

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
    if (path.startsWith('/superadmin')) return 'superadmin';
    if (path.startsWith('/admin')) return 'admin';
    return null;
  };

  // Load authentication data based on current tab context
  const loadAuthData = () => {
    const currentType = getCurrentUserTypeFromURL();

    if (currentType) {
      const token = localStorage.getItem(`${currentType}_token`);
      const userData = localStorage.getItem(`${currentType}_user`);

      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
          setUserType(currentType);
          return;
        } catch (error) {
          console.error('Failed to parse user data:', error);
        }
      }
    }

    // Fallback: check for legacy single-user storage
    const legacyToken = localStorage.getItem('token');
    const legacyUserData = localStorage.getItem('user');
    const legacyType = localStorage.getItem('userType');

    if (legacyToken && legacyUserData && legacyType) {
      try {
        // Migrate to new storage format
        localStorage.setItem(`${legacyType}_token`, legacyToken);
        localStorage.setItem(`${legacyType}_user`, legacyUserData);

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
        console.error('Failed to parse legacy user data:', error);
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
    // Store with type-specific keys
    localStorage.setItem(`${type}_token`, token);
    localStorage.setItem(`${type}_user`, JSON.stringify(userData));
    
    setUser(userData);
    setUserType(type);
  };

  const handleLogout = async () => {
    const currentType = getCurrentUserTypeFromURL();
    
    try {
      // Call backend logout endpoint if token exists
      const token = currentType 
        ? localStorage.getItem(`${currentType}_token`)
        : localStorage.getItem('token');
      
      if (token) {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(err => {
          // Ignore errors from logout endpoint - still clear local data
          console.log('Logout endpoint error (ignored):', err);
        });
      }
    } catch (error) {
      console.log('Logout error (ignored):', error);
    }
    
    // Clear local storage regardless of backend response
    if (currentType) {
      // Remove type-specific data
      localStorage.removeItem(`${currentType}_token`);
      localStorage.removeItem(`${currentType}_user`);
    }
    
    // Also clean up any legacy data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    
    setUser(null);
    setUserType(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if current route is admin route, home page, or public scores
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin');
  const isHomePage = location.pathname === '/';
  const isPublicScores = location.pathname === '/scores';

  return (
    <AuthContext.Provider value={{ user, userType, login, logout: handleLogout }}>
      <CompetitionProvider userType={userType}>
        <div className="min-h-screen bg-gray-50">
          {/* Only show main navbar if not on admin routes, home page, or public scores */}
          {!isAdminRoute && !isHomePage && !isPublicScores && <Navbar user={user} userType={userType} onLogout={handleLogout} />}

        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/scores" element={<PublicScores />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
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
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard/:tab"
            element={
              <ProtectedRoute requiredUserType="admin">
                <AdminDashboard />
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

          {/* Judge Scoring Route - Public for testing */}
          <Route path="/judge" element={<JudgeScoring />} />

          {/* Super Admin Routes */}
          <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
          <Route 
            path="/superadmin/login" 
            element={
              <RouteContext.Provider value={{ routePrefix: "/superadmin", storagePrefix: "superadmin" }}>
                <AdminLogin />
              </RouteContext.Provider>
            } 
          />

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
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
