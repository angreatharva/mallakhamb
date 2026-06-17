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

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scores" element={<PublicScores />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        <Route path="/player" element={<Navigate to="/player/login" replace />} />
        <Route path="/player/login" element={<PlayerLogin />} />
        <Route path="/player/register" element={<UnifiedRegister />} />
        <Route
          path="/player/select-team"
          element={
            <ProtectedRoute requiredUserType="player">
              <PlayerTeamSelection />
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

        <Route path="/coach" element={<Navigate to="/coach/login" replace />} />
        <Route path="/coach/login" element={<CoachLogin />} />
        <Route path="/coach/register" element={<UnifiedRegister />} />
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
              <CompetitionSelectionScreen userType="coach" onCompetitionSelected={() => {}} />
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

        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminRegister />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute requiredUserType="admin">
              <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
                <AdminDashboard />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard/:tab"
          element={
            <ProtectedRoute requiredUserType="admin">
              <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
                <AdminDashboard />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/teams"
          element={
            <ProtectedRoute requiredUserType="admin">
              <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
                <AdminTeams />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/scoring"
          element={
            <ProtectedRoute requiredUserType="admin">
              <RouteContext.Provider value={{ routePrefix: '/admin', storagePrefix: 'admin' }}>
                <AdminScoring />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />

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

        <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
        <Route path="/superadmin/login" element={<SuperAdminLogin />} />
        <Route
          path="/superadmin/dashboard"
          element={
            <ProtectedRoute requiredUserType="superadmin">
              <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
                <SuperAdminDashboard />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/dashboard/:tab"
          element={
            <ProtectedRoute requiredUserType="superadmin">
              <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
                <SuperAdminDashboard />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/add-player-payment"
          element={
            <ProtectedRoute requiredUserType="superadmin">
              <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
                <SuperAdminAddPlayerPayment />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin/scoring"
          element={
            <ProtectedRoute requiredUserType="superadmin">
              <RouteContext.Provider value={{ routePrefix: '/superadmin', storagePrefix: 'superadmin' }}>
                <AdminScoring />
              </RouteContext.Provider>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

