import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';
import { useResponsive } from '../hooks/useResponsive';

const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();
  const { isMobile, isTablet } = useResponsive();

  // Show loading spinner while auth is being determined
  if (user === null && userType === null) {
    // Check if there's stored auth data for this user type
    const token = localStorage.getItem(`${requiredUserType}_token`);
    const userData = localStorage.getItem(`${requiredUserType}_user`);
    
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

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requiredUserType && userType !== requiredUserType) {
    return <Navigate to="/" replace />;
  }

  // Wrap children in responsive container to preserve layouts
  return (
    <div className="min-h-screen w-full">
      {children}
    </div>
  );
};

export default ProtectedRoute;
