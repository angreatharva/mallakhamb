import UnifiedDashboard from './unified/UnifiedDashboard';

/**
 * SuperAdminDashboard - Redirect wrapper for backward compatibility
 * 
 * This component maintains backward compatibility during the migration to UnifiedDashboard.
 * It simply renders the UnifiedDashboard component which will auto-detect the superadmin role.
 * 
 * @deprecated Use UnifiedDashboard directly. This wrapper will be removed in 2 sprints.
 */
const SuperAdminDashboard = () => {
  // Log deprecation warning in development
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'SuperAdminDashboard is deprecated and will be removed in 2 sprints. ' +
      'Please use UnifiedDashboard directly from pages/unified/UnifiedDashboard.jsx'
    );
  }

  return <UnifiedDashboard />;
};

export default SuperAdminDashboard;
