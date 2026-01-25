import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../services/api';
import { useAuth } from '../App';
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

const AdminLogin = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && userType === 'admin') {
      navigate('/admin/dashboard');
    }
  }, [user, userType, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await adminAPI.login(data);
      const { token, admin } = response.data;
      
      // Use the auth context login function
      login(admin, token, 'admin');
      
      toast.success('Login successful!');
      
      // Navigate using React Router instead of forcing page reload
      navigate('/admin/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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
            <ResponsiveHeading level={2} className="text-gray-900">Admin Login</ResponsiveHeading>
            <ResponsiveText className="text-gray-600 mt-2">Sign in to admin dashboard</ResponsiveText>
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