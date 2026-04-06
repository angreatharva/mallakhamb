import UnifiedDashboard from '../unified/UnifiedDashboard';

/**
 * SuperAdminDashboard - Redirect wrapper for backward compatibility
 * 
 * This component maintains backward compatibility during the migration to UnifiedDashboard.
 * It simply renders the UnifiedDashboard component which will auto-detect the superadmin role.
 */
const SuperAdminDashboard = () => {
  return <UnifiedDashboard />;
};

export default SuperAdminDashboard;
