import { Suspense } from 'react';
import PropTypes from 'prop-types';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/middleware/protected-route';
import RouteContext from '@/contexts/RouteContext';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import CompetitionSelectionScreen from '@/components/competition/CompetitionSelectionScreen';
import {
  Home,
  PlayerLogin,
  PlayerTeamSelection,
  PlayerDashboard,
  CoachLogin,
  CoachCreateTeam,
  CoachDashboard,
  CoachPayment,
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
  JudgeTeamPlayers,
  JudgeScoring,
  JudgePanelReview,
  ForgotPassword,
  ResetPassword,
  PublicScores,
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

const CoachLayout = () => (
  <ProtectedRoute requiredUserType="coach">
    <RouteErrorBoundary homePath="/coach/dashboard">
      <Outlet />
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

export default function AppRoutes() {
  return (
    // Outer boundary still covers the top-level public routes (Home,
    // PublicScores, password flows), which are lazy and sit outside any layout.
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scores" element={<PublicScores />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Player Routes */}
        <Route path="/player" element={<Navigate to="/player/login" replace />} />
        <Route path="/player/login" element={<PlayerLogin />} />
        <Route path="/player/register" element={<UnifiedRegister />} />
        <Route path="/player" element={<PlayerLayout />}>
          <Route path="select-team" element={<PlayerTeamSelection />} />
          <Route path="dashboard" element={<PlayerDashboard />} />
        </Route>

        {/* Coach Routes */}
        <Route path="/coach" element={<Navigate to="/coach/login" replace />} />
        <Route path="/coach/login" element={<CoachLogin />} />
        <Route path="/coach/register" element={<UnifiedRegister />} />
        <Route path="/coach" element={<CoachLayout />}>
          <Route path="create-team" element={<CoachCreateTeam />} />
          <Route path="select-competition" element={<CompetitionSelectionScreen userType="coach" onCompetitionSelected={() => {}} />} />
          <Route path="dashboard" element={<CoachDashboard />} />
          <Route path="payment" element={<CoachPayment />} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminRegister />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="dashboard/:tab" element={<AdminDashboard />} />
          <Route path="teams" element={<AdminTeams />} />
          <Route path="scoring" element={<AdminScoring />} />
        </Route>

        {/* Judge Routes */}
        <Route path="/judge" element={<Navigate to="/judge/login" replace />} />
        <Route path="/judge/login" element={<JudgeLogin />} />
        <Route path="/judge" element={<JudgeLayout />}>
          <Route path="dashboard" element={<JudgeDashboard />} />
          <Route path="team/:teamId" element={<JudgeTeamPlayers />} />
          <Route path="scoring" element={<JudgeScoring />} />
          <Route path="scoring/panel-review" element={<JudgePanelReview />} />
        </Route>

        {/* SuperAdmin Routes */}
        <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route path="/superadmin" element={<SuperAdminLayout />}>
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="dashboard/:tab" element={<SuperAdminDashboard />} />
          <Route path="add-player-payment" element={<SuperAdminAddPlayerPayment />} />
          <Route path="scoring" element={<AdminScoring />} />
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

