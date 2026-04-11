import UnifiedDashboard from '../unified/UnifiedDashboard';
import { ThemeProvider } from '../../components/design-system/theme';

/**
 * SuperAdminDashboard - Redirect wrapper for backward compatibility
 *
 * This component maintains backward compatibility during the migration to UnifiedDashboard.
 * It simply renders the UnifiedDashboard component which will auto-detect the superadmin role.
 */
const SuperAdminDashboard = () => {
  return (
    <ThemeProvider role="superadmin">
      <UnifiedDashboard />
    </ThemeProvider>
  );
};

export default SuperAdminDashboard;
