import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { useAuth } from '../App';
import { useRouteContext } from '../contexts/RouteContext';
import { CompetitionProvider } from '../contexts/CompetitionContext';
import CompetitionSelectionScreen from '../components/CompetitionSelectionScreen';
import { 
  ResponsiveForm, 
  ResponsiveFormField, 
  ResponsiveInput, 
  ResponsivePasswordInput, 
  ResponsiveButton 
} from '../components/responsive';
import { 
  ResponsiveHeading, 
  ResponsiveText, 
  ResponsiveLink 
} from '../components/responsive/ResponsiveTypography';

const AdminLogin = ({ routePrefix: routePrefixProp }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCompetitionSelection, setShowCompetitionSelection] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  
  // Get route context from hook or use prop
  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  const storagePrefix = contextValue.storagePrefix;
  
  // Determine which API to use based on route context
  const apiService = storagePrefix === 'superadmin' ? superAdminAPI : adminAPI;
  const expectedUserType = storagePrefix === 'superadmin' ? 'superadmin' : 'admin';

  // Redirect if already logged in
  useEffect(() => {
    if (user && userType === expectedUserType && !showCompetitionSelection) {
      navigate(`${routePrefix}/dashboard`);
    }
  }, [user, userType, expectedUserType, navigate, routePrefix, showCompetitionSelection]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await apiService.login(data);
      const { token, admin } = response.data;
      
      // Use the auth context login function with appropriate user type
      login(admin, token, expectedUserType);
      
      toast.success('Login successful!');
      
      // Super admins don't need competition selection - go directly to dashboard
      if (expectedUserType === 'superadmin') {
        navigate(`${routePrefix}/dashboard`);
      } else {
        // Show competition selection screen for regular admins
        setShowCompetitionSelection(true);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // If competition selection is needed, show the selection screen
  if (showCompetitionSelection) {
    return (
      <CompetitionProvider userType={expectedUserType}>
        <CompetitionSelectionScreen 
          userType={expectedUserType}
          onCompetitionSelected={() => {
            // Navigation is handled by CompetitionSelectionScreen
          }}
        />
      </CompetitionProvider>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="text-center mb-6 md:mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-purple-100 p-3 rounded-full">
                <Shield className="h-8 w-8 text-purple-600" />
              </div>
            </div>
            <ResponsiveHeading level={2} className="text-gray-900">
              {routePrefix === '/superadmin' ? 'Super Admin Login' : 'Admin Login'}
            </ResponsiveHeading>
            <ResponsiveText className="text-gray-600 mt-2">
              Sign in to {routePrefix === '/superadmin' ? 'super admin' : 'admin'} dashboard
            </ResponsiveText>
          </div>

          <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
            <ResponsiveFormField
              label="Email Address"
              error={errors.email?.message}
              required
            >
              <ResponsiveInput
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                placeholder="Enter your email"
                error={!!errors.email}
              />
            </ResponsiveFormField>

            <ResponsiveFormField
              label="Password"
              error={errors.password?.message}
              required
            >
              <ResponsivePasswordInput
                {...register('password', {
                  required: 'Password is required'
                })}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                placeholder="Enter your password"
                error={!!errors.password}
              />
            </ResponsiveFormField>

            <ResponsiveButton
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </ResponsiveButton>
          </ResponsiveForm>

          <div className="mt-6 text-center space-y-2">
            <ResponsiveText size="sm" className="text-gray-600">
              <ResponsiveLink 
                to="/forgot-password" 
                variant="primary"
                className="font-medium text-purple-600 hover:text-purple-500"
              >
                Forgot Password?
              </ResponsiveLink>
            </ResponsiveText>
          </div>

          <div className="mt-4 text-center">
            <ResponsiveLink
              to="/"
              variant="secondary"
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Home
            </ResponsiveLink>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;