// Backward compatibility re-exports
// These will be removed after 2 sprints when all consumers have migrated

// Admin pages
export { default as AdminDashboard } from './admin/AdminDashboard';
export { default as AdminLogin } from './admin/AdminLogin';
export { default as AdminTeams } from './admin/AdminTeams';
export { default as AdminScores } from './admin/AdminScores';
export { default as AdminJudges } from './admin/AdminJudges';
export { default as AdminScoring } from './admin/AdminScoring';
export { default as AdminTransactions } from './admin/AdminTransactions';

// SuperAdmin pages
export { default as SuperAdminDashboard } from './superadmin/SuperAdminDashboard';
export { default as SuperAdminLogin } from './superadmin/SuperAdminLogin';
export { default as SuperAdminManagement } from './superadmin/SuperAdminManagement';
export { default as SuperAdminSystemStats } from './superadmin/SuperAdminSystemStats';

// Coach pages
export { default as CoachLogin } from './coach/CoachLogin';
export { default as CoachRegister } from './coach/CoachRegister';
export { default as CoachDashboard } from './coach/CoachDashboard';
export { default as CoachCreateTeam } from './coach/CoachCreateTeam';
export { default as CoachSelectCompetition } from './coach/CoachSelectCompetition';
export { default as CoachPayment } from './coach/CoachPayment';

// Player pages
export { default as PlayerLogin } from './player/PlayerLogin';
export { default as PlayerRegister } from './player/PlayerRegister';
export { default as PlayerDashboard } from './player/PlayerDashboard';
export { default as PlayerSelectTeam } from './player/PlayerSelectTeam';

// Judge pages
export { default as JudgeLogin } from './judge/JudgeLogin';
export { default as JudgeScoring } from './judge/JudgeScoring';

// Public pages
export { default as Home } from './public/Home';
export { default as PublicScores } from './public/PublicScores';

// Shared pages
export { default as ForgotPassword } from './shared/ForgotPassword';
export { default as ResetPassword } from './shared/ResetPassword';
export { default as DesignTokenAuditPage } from './shared/DesignTokenAuditPage';

// Unified components
export { default as UnifiedLogin } from './unified/UnifiedLogin';
export { default as UnifiedDashboard } from './unified/UnifiedDashboard';
export { default as UnifiedRegister } from './unified/UnifiedRegister';
export { default as UnifiedCompetitionSelection } from './unified/UnifiedCompetitionSelection';

// Deprecation warnings in development
if (process.env.NODE_ENV === 'development') {
  console.warn(
    '[Pages Refactoring] You are importing from the root pages/index.js. ' +
    'This is deprecated and will be removed in 2 sprints. ' +
    'Please update imports to use the new folder structure. ' +
    'See MIGRATION.md for details.'
  );
}
