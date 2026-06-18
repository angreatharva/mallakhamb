import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/middleware/protected-route';
import RouteContext from '@/contexts/RouteContext';
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
  JudgeScoring,
  ForgotPassword,
  ResetPassword,
  PublicScores,
  UnifiedRegister,
} from './lazy-pages';

import { AuthLoadingSpinner as PageLoader } from '@/components/auth/AuthLoadingSpinner';
export { PageLoader };

import { Outlet } from 'react-router-dom';

// Layout Components
const PlayerLayout = () => (
  <ProtectedRoute requiredUserType="player">
    <Outlet />
  </ProtectedRoute>
);

const CoachLayout = () => (
  <ProtectedRoute requiredUserType="coach">
    <Outlet />
  </ProtectedRoute>
);

const AdminLayout = () => (
  <ProtectedRoute requiredUserType="admin">
    <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
      <Outlet />
    </RouteContext.Provider>
  </ProtectedRoute>
);

const SuperAdminLayout = () => (
  <ProtectedRoute requiredUserType="superadmin">
    <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
      <Outlet />
    </RouteContext.Provider>
  </ProtectedRoute>
);

const JudgeLayout = () => (
  <ProtectedRoute requiredUserType="judge">
    <Outlet />
  </ProtectedRoute>
);

export default function AppRoutes() {
  return (
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
          <Route path="scoring" element={<JudgeScoring />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

