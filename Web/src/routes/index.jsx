import { Suspense } from 'react';
import PropTypes from 'prop-types';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/middleware/protected-route';
import RouteContext from '@/contexts/RouteContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import CompetitionSelectionScreen from '@/components/competition/CompetitionSelectionScreen';
import LevelSelectionScreen from '@/components/competition/LevelSelectionScreen';
import { CoachPlayerPasswordGate, CoachPlayerPasswordSetup } from '@/pages/coach/CoachPlayerPasswordGate';
import {
  Home,
  PlayerLogin,
  PlayerTeamSelection,
  PlayerDashboard,
  CoachLogin,
  CoachCreateTeam,
  CoachDashboard,
  CoachPayment,
  CoachPaperForm,
  AdminLogin,
  AdminRegister,
  SuperAdminLogin,
  AdminDashboard,
  SuperAdminDashboard,
  SuperAdminAddPlayerPayment,
  AdminTeams,
  AdminScoring,
  JudgeLogin,
  JudgeDashboard,
  JudgeProfile,
  JudgeTeamPlayers,
  JudgeScoring,
  JudgePanelReview,
  JudgeSequence,
  ForgotPassword,
  AccountProfile,
  CoachCodeReset,
  ResetPassword,
  PublicScores,
  LookSpecimen,
  UnifiedRegister,
  NotFound,
} from './lazy-pages';

import { AuthLoadingSpinner as PageLoader } from '@/components/auth/AuthLoadingSpinner';
export { PageLoader };

import { Outlet } from 'react-router-dom';

/**
 * HIGH-W2: per-role error boundary around the routed content.
 *
 * The app previously had ONE boundary, at the root, so any render error
 * replaced the entire UI — a judge mid-slip lost the screen, the socket and
 * any unsaved section scores, recoverable only by a full reload. Scoping the
 * boundary to the role layout contains the failure, and `resetKey` clears it
 * on navigation so a crashed route does not stay latched.
 *
 * @param {{ children: React.ReactNode, homePath: string }} props
 */
const RouteErrorBoundary = ({ children, homePath }) => {
  const location = useLocation();
  return (
    <ErrorBoundary
      resetKey={location.pathname}
      homePath={homePath}
      message="This screen ran into a problem. Your session is still active — you can go back and continue."
    >
      {/*
        * MED-W7: a Suspense boundary per role layout, not just one at the root.
        * With only the root boundary, a slow lazy chunk blanked the ENTIRE view
        * — navbar and shell included — instead of just the pane being loaded.
        * Placing it inside the layout means the shell stays on screen and only
        * the routed content shows the loader.
        */}
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

RouteErrorBoundary.propTypes = {
  children: PropTypes.node,
  homePath: PropTypes.string,
};

// Layout Components
const PlayerLayout = () => (
  <ProtectedRoute requiredUserType="player">
    <RouteErrorBoundary homePath="/player/dashboard">
      <Outlet />
    </RouteErrorBoundary>
  </ProtectedRoute>
);

// A coach sets the default player password before anything else.
const CoachLayout = () => (
  <ProtectedRoute requiredUserType="coach">
    <RouteErrorBoundary homePath="/coach/dashboard">
      <CoachPlayerPasswordGate>
        <Outlet />
      </CoachPlayerPasswordGate>
    </RouteErrorBoundary>
  </ProtectedRoute>
);

const AdminLayout = () => (
  <ProtectedRoute requiredUserType="admin">
    <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
      <RouteErrorBoundary homePath="/admin/dashboard">
        <Outlet />
      </RouteErrorBoundary>
    </RouteContext.Provider>
  </ProtectedRoute>
);

const SuperAdminLayout = () => (
  <ProtectedRoute requiredUserType="superadmin">
    <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
      <RouteErrorBoundary homePath="/superadmin/dashboard">
        <Outlet />
      </RouteErrorBoundary>
    </RouteContext.Provider>
  </ProtectedRoute>
);

const JudgeLayout = () => (
  <ProtectedRoute requiredUserType="judge">
    <RouteErrorBoundary homePath="/judge/dashboard">
      <Outlet />
    </RouteErrorBoundary>
  </ProtectedRoute>
);

/**
 * @param {{ location?: import('react-router-dom').Location }} props -
 *   the location to draw. App passes it on EVERY render, never only some of
 *   the time: `<Routes>` wraps its output in an extra provider when it gets
 *   one, so toggling the prop would remount the whole screen.
 */
export default function AppRoutes({ location }) {
  return (
    // Outer boundary still covers the top-level public routes (Home,
    // PublicScores, password flows), which are lazy and sit outside any layout.
    <Suspense fallback={<PageLoader />}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/scores" element={<PublicScores />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/coach" element={<CoachCodeReset />} />
        {LookSpecimen && <Route path="/__look" element={<LookSpecimen />} />}

        {/* Player Routes */}
        <Route path="/player" element={<Navigate to="/player/login" replace />} />
        <Route path="/player/login" element={<PlayerLogin />} />
        <Route path="/player/register" element={<UnifiedRegister />} />
        <Route path="/player" element={<PlayerLayout />}>
          {/*
            * Level, then team, then competition. A player with no team picks
            * one right after the level; the meets offered next are the ones
            * that team is entered in. A player who already has a team goes
            * straight from the level to the competition.
            */}
          <Route path="select-level" element={<LevelSelectionScreen userType="player" />} />
          <Route path="select-competition" element={<CompetitionSelectionScreen userType="player" />} />
          <Route path="select-team" element={<PlayerTeamSelection />} />
          <Route path="dashboard" element={<PlayerDashboard />} />
          <Route path="profile" element={<AccountProfile />} />
        </Route>

        {/* Coach Routes */}
        <Route path="/coach" element={<Navigate to="/coach/login" replace />} />
        <Route path="/coach/login" element={<CoachLogin />} />
        <Route path="/coach/register" element={<UnifiedRegister />} />
        <Route path="/coach" element={<CoachLayout />}>
          <Route path="setup-player-password" element={<CoachPlayerPasswordSetup />} />
          <Route path="create-team" element={<CoachCreateTeam />} />
          <Route path="select-level" element={<LevelSelectionScreen userType="coach" />} />
          <Route path="select-competition" element={<CompetitionSelectionScreen userType="coach" onCompetitionSelected={() => {}} />} />
          <Route path="dashboard" element={<CoachDashboard />} />
          <Route path="payment" element={<CoachPayment />} />
          <Route path="paper-form" element={<CoachPaperForm />} />
          <Route path="profile" element={<AccountProfile />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminRegister />} />
        <Route path="/admin" element={<AdminLayout />}>
          {/*
            * Both steps are real routes now. Competition selection used to be
            * component state inside UnifiedLogin (`showCompetitionSelection`),
            * so it had no URL, could not be reloaded, and could not be reached
            * again without signing out.
            */}
          <Route path="select-level" element={<LevelSelectionScreen userType="admin" />} />
          <Route path="select-competition" element={<CompetitionSelectionScreen userType="admin" onCompetitionSelected={() => {}} />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="dashboard/:tab" element={<AdminDashboard />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="scoring" element={<AdminScoring />} />
          <Route path="profile" element={<AccountProfile />} />
        </Route>

        {/* Judge Routes */}
        <Route path="/judge" element={<Navigate to="/judge/login" replace />} />
        <Route path="/judge/login" element={<JudgeLogin />} />
        <Route path="/judge/register" element={<UnifiedRegister />} />
        <Route path="/judge" element={<JudgeLayout />}>
          {/*
            * Judges used to land on the dashboard straight from login, with the
            * meet picked silently from their first panel seat. These two steps
            * make that choice explicit — and a judge with seats at more than one
            * meet no longer has the first one chosen for them.
            */}
          <Route path="select-level" element={<LevelSelectionScreen userType="judge" />} />
          <Route path="select-competition" element={<CompetitionSelectionScreen userType="judge" />} />
          <Route path="dashboard" element={<JudgeDashboard />} />
          <Route path="profile" element={<JudgeProfile />} />
          <Route path="team/:teamId" element={<JudgeTeamPlayers />} />
          <Route path="scoring" element={<JudgeScoring />} />
          <Route path="scoring/panel-review" element={<JudgePanelReview />} />
          {/*
            * Running order. Rendered for any judge who navigates here, but the
            * page itself bounces anyone who is not a Senior Judge or Scorer,
            * and the server rejects the writes regardless of what renders.
            */}
          <Route path="sequence" element={<JudgeSequence />} />
        </Route>

        {/* SuperAdmin Routes */}
        <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route path="/superadmin" element={<SuperAdminLayout />}>
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="dashboard/:tab" element={<SuperAdminDashboard />} />
          <Route path="add-player-payment" element={<SuperAdminAddPlayerPayment />} />
          <Route path="scoring" element={<AdminScoring />} />
          <Route path="profile" element={<AccountProfile />} />
        </Route>

        {/*
          * Was `<Navigate to="/" replace />`, which swallowed every unmatched
          * URL into the home page — a stale deep link looked exactly like a
          * successful navigation, and `replace` removed the Back button as a
          * way out.
          */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

AppRoutes.propTypes = {
  location: PropTypes.object,
};

