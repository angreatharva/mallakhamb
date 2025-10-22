import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';

const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();

  // Show loading spinner while auth is being determined
  if (user === null && userType === null) {
    // Check if there's stored auth data for this user type
    const token = localStorage.getItem(`${requiredUserType}_token`);
    const userData = localStorage.getItem(`${requiredUserType}_user`);
    
    if (token && userData) {
      // Auth data exists but context hasn't loaded yet, show loading
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
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

  return children;
};

export default ProtectedRoute;
