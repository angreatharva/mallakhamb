import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import { secureStorage } from '@/utils/auth/secureStorage';
import { isTokenExpired } from '@/utils/auth/tokenUtils';
import { getRoleFromPath, getLoginPathFromPath } from '@/utils/auth/roleFromPath';

const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();
  const { isMobile } = useResponsive();
  const location = useLocation();

  // Detect role and login path from current URL using centralized utility
  const storagePrefix = getRoleFromPath(location.pathname) || requiredUserType || 'admin';
  const loginPath = getLoginPathFromPath(location.pathname);

  // Clear storage if token is expired to avoid infinite spinner/limbo state
  const token = secureStorage.getItem(`${storagePrefix}_token`);
  if (token && isTokenExpired(token)) {
    secureStorage.removeItem(`${storagePrefix}_token`);
    secureStorage.removeItem(`${storagePrefix}_user`);
  }

  // Show loading spinner while auth is being determined
  if (user === null && userType === null) {
    // Check if there's stored auth data for this user type using detected storage prefix
    const currentToken = secureStorage.getItem(`${storagePrefix}_token`);
    const userData = secureStorage.getItem(`${storagePrefix}_user`);
    
    if (currentToken && userData) {
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

  // Also check if auth data exists in storage even if user state hasn't loaded yet
  const activeToken = secureStorage.getItem(`${storagePrefix}_token`);
  const userData = secureStorage.getItem(`${storagePrefix}_user`);
  
  // If we have stored auth data but user state is not yet loaded, show loading
  if (!user && activeToken && userData) {
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

  // If not authenticated, redirect to the correct login page based on route context
  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  // If user type doesn't match required type, redirect to correct login page
  // But only if userType is actually loaded (not null/undefined during loading)
  if (requiredUserType && userType && userType !== requiredUserType) {
    return <Navigate to={loginPath} replace />;
  }
  
  // If user exists but userType hasn't loaded yet, show loading
  if (user && !userType && requiredUserType) {
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

  // Wrap children in responsive container to preserve layouts
  return (
    <div className="min-h-screen w-full">
      {children}
    </div>
  );
};

export default ProtectedRoute;
