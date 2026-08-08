import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import { CompetitionProvider } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import AuthProvider from '@/contexts/AuthProvider';
import AppRoutes, { PageLoader } from '@/routes';
import { verifyCopRulesAgainstServer } from '@/utils/scoring/copRulesSync';

function AppContent() {
  const { user, userType, loading, logout: handleLogout } = useAuth();
  const location = useLocation();

  // MED-W5: verify the bundled COP tables against the server's once per load.
  // Fire-and-forget — a failure here must never block or break scoring; the
  // bundled tables stay in use either way. It exists so a drift is LOUD instead
  // of silently persisting wrong scores.
  useEffect(() => {
    verifyCopRulesAgainstServer();
  }, []);

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

  const isJudgeRoute = location.pathname.startsWith('/judge');

  const shouldHideNavbar =
    isAdminRoute || isJudgeRoute || isHomePage || isPublicScores || isCompetitionSelectionPage || isLoginPage || isRegisterPage || isForgotPasswordPage;

  return (
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
  );
}



function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
