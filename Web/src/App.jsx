import { useEffect, useLayoutEffect, useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';
import Navbar from '@/components/layout/Navbar';
import { CompetitionProvider } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import AuthProvider from '@/contexts/AuthProvider';
import AppearanceProvider from '@/contexts/AppearanceProvider';
import AppRoutes, { PageLoader } from '@/routes';
import { useMediaQuery } from '@/hooks/useResponsive';
import { verifyCopRulesAgainstServer } from '@/utils/scoring/copRulesSync';
import { getRoleFromPath } from '@/utils/auth/roleFromPath';
import { applyRoleAccent } from '@/utils/ui/appearance';
import { applyLook, onLookClaim } from '@/utils/ui/look';
import { toastOptions as lookToastOptions } from '@/components/ui/toast';
import { loadLookFonts } from '@/styles/fonts';
import { CornerAppearanceMenu } from '@/components/layout/AppearanceMenu';
import SignOutOnBackDialog from '@/components/auth/SignOutOnBackDialog';
import { useSignOutOnBack } from '@/hooks/useSignOutOnBack';

/* Toasts in the look (components/ui/toast.js), with the durations they always had. */
const TOAST_OPTIONS = {
  ...lookToastOptions,
  duration: 4000,
  success: { ...lookToastOptions.success, duration: 3000 },
  error: { ...lookToastOptions.error, duration: 4000 },
};

function AppContent() {
  const { user, userType, loading, logout: handleLogout } = useAuth();
  /*
   * Back from a signed-in screen asks to sign out instead of reopening login
   * or the choosers (hooks/useSignOutOnBack). While that Back is being undone,
   * `location` is the screen the user left, not the URL the browser briefly
   * shows, so the routes and the chrome below never flash the chooser.
   */
  const backGuard = useSignOutOnBack({ signedInRole: user ? userType : null });
  const { location } = backGuard;
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

  // Role accent and look for the CSS tokens, from the URL like everything else
  // here. A layout effect, so a route change never paints one frame in the old
  // role or look. Both only flip an attribute on <html>; nothing remounts.
  // A screen no route names (the 404) claims its look; re-apply when it does.
  const [claims, setClaims] = useState(0);
  useEffect(() => onLookClaim(() => setClaims((n) => n + 1)), []);
  useLayoutEffect(() => {
    applyRoleAccent(getRoleFromPath(location.pathname));
    loadLookFonts(applyLook(location.pathname, location.search));
  }, [location.pathname, location.search, claims]);

  if (loading) {
    return <PageLoader />;
  }

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin');
  const isHomePage = location.pathname === '/';
  const isPublicScores = location.pathname === '/scores';
  /*
   * The two post-login chooser screens, for every role. Both own the full
   * viewport and carry their own "go back" affordances, so the navbar — which
   * includes a competition picker of its own — would be offering a second,
   * contradictory way to do the thing the page is already asking for.
   *
   * Matched by suffix rather than by the one hardcoded coach path this
   * replaced, which left the navbar showing on the other six.
   */
  const isSelectionPage = /\/select-(level|competition)$/.test(location.pathname);
  const isLoginPage = location.pathname.includes('/login');
  const isRegisterPage = location.pathname.includes('/register');
  const isForgotPasswordPage = location.pathname.includes('/forgot-password') || location.pathname.includes('/reset-password');

  const isJudgeRoute = location.pathname.startsWith('/judge');
  // Pages with no header bar of their own: the super admin's player payment, and the bare Teams panel at
  // /admin/teams (the dashboard's Teams tab is the linked one, inside the dashboard header).
  // The account page draws its own header (it has to on the admin side,
  // where there is no shared navbar), so the navbar steps aside everywhere.
  const isProfilePage = /^\/(player|coach|admin|superadmin)\/profile\/?$/.test(location.pathname);
  const isHeaderlessPage = /^\/(admin\/teams|superadmin\/add-player-payment)\/?$/.test(location.pathname);

  // The look specimen (dev/preview only) carries its own controls.
  const isSpecimen = location.pathname === '/__look';

  const shouldHideNavbar =
    isAdminRoute || isJudgeRoute || isHomePage || isPublicScores || isSelectionPage || isLoginPage || isRegisterPage || isForgotPasswordPage || isSpecimen || isProfilePage;

  return (
    <CompetitionProvider userType={userType}>
      <div className="min-h-screen bg-bg">
        {!shouldHideNavbar && <Navbar user={user} userType={userType} onLogout={handleLogout} />}
        {/* Screens with no header bar carry the appearance control in the corner (§14.9). */}
        {(isSelectionPage || isLoginPage || isRegisterPage || isForgotPasswordPage || isHeaderlessPage) && <CornerAppearanceMenu />}

        <div className={!shouldHideNavbar ? 'pt-16' : ''}>
          <AppRoutes location={location} />
        </div>

        <SignOutOnBackDialog open={backGuard.prompting && Boolean(user)} onClose={backGuard.dismiss} />

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
          toastOptions={TOAST_OPTIONS}
        />
      </div>
    </CompetitionProvider>
  );
}



function App() {
  return (
    <ErrorBoundary>
      {/*
        * Outermost after the boundary: the appearance is per device, not per
        * route or session, and a switch must never remount what is inside it
        * (a judge mid-slip keeps every mark). See AppearanceProvider.
        */}
      <AppearanceProvider>
        {/*
          * Honour the device's reduced-motion setting for every framer element
          * (323 of them): movement — scale, x/y, rotate — stops; opacity fades
          * still run. Many screens gate their own animations with
          * useReducedMotion; this covers the looping ones that never did (the
          * floating orbs, pulsing ornaments). Loading spinners are CSS
          * `animate-spin`, which this does not touch, so they keep turning.
          */}
        <MotionConfig reducedMotion="user">
          <Router>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </Router>
        </MotionConfig>
      </AppearanceProvider>
    </ErrorBoundary>
  );
}

export default App;
