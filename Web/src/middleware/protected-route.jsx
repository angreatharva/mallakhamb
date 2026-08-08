import { useEffect } from 'react';
import { AuthLoadingSpinner } from '@/components/auth/AuthLoadingSpinner';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import { isTokenExpired } from '@/utils/auth/tokenUtils';
import { getRoleFromPath, getLoginPathFromPath } from '@/utils/auth/roleFromPath';

/**
 * Route guard.
 *
 * MED-W2: this used to call `secureStorage.removeItem` in the render body.
 * Renders must be pure — React 19 StrictMode double-invokes them in
 * development, and a concurrent render can be discarded after the side effect
 * has already run.
 *
 * The obvious fix — move the eviction into an effect — does NOT work here, and
 * it is worth saying why because it looks correct: storage writes do not
 * trigger a re-render, so the render that discovered the expired token would
 * still see "token present" and sit on the loading spinner forever. That is
 * precisely the limbo the original code was trying to avoid.
 *
 * So the decision is derived PURELY from reading storage (`tokenExpired`), and
 * every check below treats an expired token as absent. The eviction becomes a
 * genuine side effect that no longer needs to influence this render.
 */
const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();
  const location = useLocation();

  // Detect role and login path from current URL using centralized utility
  const storagePrefix = getRoleFromPath(location.pathname) || requiredUserType || 'admin';
  const loginPath = getLoginPathFromPath(location.pathname);

  // Read once. The previous version hit storage three separate times and could
  // observe different values within a single render.
  const storedToken = secureStorage.getItem(`${storagePrefix}_token`);
  const storedUser = secureStorage.getItem(`${storagePrefix}_user`);
  const tokenExpired = !!storedToken && isTokenExpired(storedToken);

  // An expired token counts as no token, so the checks below fall through to
  // the login redirect instead of waiting on a spinner that will never resolve.
  const activeToken = tokenExpired ? null : storedToken;
  const activeUser = tokenExpired ? null : storedUser;

  // Cleanup only — deliberately gates nothing above.
  useEffect(() => {
    if (tokenExpired) {
      secureStorage.removeItem(`${storagePrefix}_token`);
      secureStorage.removeItem(`${storagePrefix}_user`);
    }
  }, [tokenExpired, storagePrefix]);

  // Auth data exists but the context has not caught up yet — hold the route.
  if (!user && activeToken && activeUser) {
    return <AuthLoadingSpinner />;
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
    return <AuthLoadingSpinner />;
  }

  // Wrap children in responsive container to preserve layouts
  return (
    <div className="min-h-screen w-full">
      {children}
    </div>
  );
};

export default ProtectedRoute;
