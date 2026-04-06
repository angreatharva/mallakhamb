import UnifiedDashboard from '../unified/UnifiedDashboard';

/**
 * AdminDashboard - Redirect wrapper for backward compatibility
 * 
 * This component maintains backward compatibility during the migration to UnifiedDashboard.
 * It simply renders the UnifiedDashboard component which will auto-detect the admin role.
 */
const AdminDashboard = ({ routePrefix: routePrefixProp }) => {
  return <UnifiedDashboard routePrefix={routePrefixProp} />;
};

export default AdminDashboard;
