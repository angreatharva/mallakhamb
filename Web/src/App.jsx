import { useEffect } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import { CompetitionProvider } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import AuthProvider from '@/contexts/AuthProvider';
import AppRoutes, { PageLoader } from '@/routes';
import { useMediaQuery } from '@/hooks/useResponsive';
import { verifyCopRulesAgainstServer } from '@/utils/scoring/copRulesSync';

function AppContent() {
  const { user, userType, loading, logout: handleLogout } = useAuth();
  const location = useLocation();
  /*
   * Declared up here, above the `loading` early-return below, because a hook
   * after a conditional return changes the hook order between renders — the
   * same fault HIGH-W1 fixed in JudgeScoring.
   */
  const isPhone = useMediaQuery('(max-width: 767px)');

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

        {/*
          * Toasts move to the top CENTRE on phones, and are held clear of the
          * header.
          *
          * `top-right` puts them over the sticky bar on a narrow screen — on
          * the judge scoring sheet they landed squarely on the athlete's name
          * and the live score, which is the worst possible place to cover
          * while somebody is marking a routine. `position` is a prop rather
          * than something CSS can reach, so this is one of the few places the
          * breakpoint has to be read in JavaScript.
          */}
        {/*
          * Clear of the header on DESKTOP too. The default offset is ~16px,
          * which puts a toast squarely over the top-right of a 64px header —
          * i.e. over the Logout button on every role's dashboard. It is only
          * for the four seconds the toast lives, but "the welcome toast eats
          * your first click on Logout" is a real thing users hit, and it was
          * caught here by an e2e click failing with the toast named as the
          * element intercepting pointer events.
          */}
        <Toaster
          position={isPhone ? 'top-center' : 'top-right'}
          containerStyle={isPhone ? { top: 76, left: 12, right: 12 } : { top: 76 }}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
              // Long validation messages otherwise widen the toast past the
              // viewport and take the page's horizontal scroll with them.
              maxWidth: 'min(92vw, 24rem)',
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
