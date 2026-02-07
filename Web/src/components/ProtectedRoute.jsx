import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useResponsive } from '../hooks/useResponsive';

const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();
  const { isMobile, isTablet } = useResponsive();
  const location = useLocation();

  // Detect route context from current URL path
  const detectRouteContext = () => {
    const path = location.pathname;
    if (path.startsWith('/superadmin')) {
      return { storagePrefix: 'superadmin', loginPath: '/superadmin/login' };
    }
    if (path.startsWith('/admin')) {
      return { storagePrefix: 'admin', loginPath: '/admin/login' };
    }
    if (path.startsWith('/coach')) {
      return { storagePrefix: 'coach', loginPath: '/coach/login' };
    }
    if (path.startsWith('/player')) {
      return { storagePrefix: 'player', loginPath: '/player/login' };
    }
    // Default fallback
    return { storagePrefix: requiredUserType || 'admin', loginPath: '/' };
  };

  const { storagePrefix, loginPath } = detectRouteContext();

  // Show loading spinner while auth is being determined
  if (user === null && userType === null) {
    // Check if there's stored auth data for this user type using detected storage prefix
    const token = localStorage.getItem(`${storagePrefix}_token`);
    const userData = localStorage.getItem(`${storagePrefix}_user`);
    
    if (token && userData) {
      // Auth data exists but context hasn't loaded yet, show responsive loading
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="text-center max-w-sm w-full">
            <div className={`animate-spin rounded-full border-b-2 border-purple-600 mx-auto ${
              isMobile ? 'h-8 w-8' : 'h-12 w-12'
            }`}></div>
            <p className={`mt-4 text-gray-600 ${
              isMobile ? 'text-sm' : 'text-base'
            }`}>Loading...</p>
          </div>
        </div>
      );
    }
  }

  // If not authenticated, redirect to the correct login page based on route context
  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  // If user type doesn't match required type, redirect to correct login page
  if (requiredUserType && userType !== requiredUserType) {
    return <Navigate to={loginPath} replace />;
  }

  // Wrap children in responsive container to preserve layouts
  return (
    <div className="min-h-screen w-full">
      {children}
    </div>
  );
};

export default ProtectedRoute;
