import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import { 
  ResponsiveForm, 
  ResponsiveFormField, 
  ResponsivePasswordInput, 
  ResponsiveButton 
} from '../components/responsive';

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { token } = useParams();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm();

  const password = watch('password');

  const onSubmit = async (data) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await authAPI.resetPassword(token, data.password);
      setMessage('Password has been reset successfully.');
      toast.success('Password reset successful!');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/player/login');
      }, 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Password reset token is invalid or has expired.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="text-center mb-6 md:mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <Lock className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Reset Password</h2>
            <p className="text-gray-600 mt-2">Enter your new password</p>
          </div>

          <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
            <ResponsiveFormField
              label="New Password"
              error={errors.password?.message}
              required
            >
              <ResponsivePasswordInput
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                id="password"
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                placeholder="Enter new password"
                disabled={loading}
                error={!!errors.password}
              />
            </ResponsiveFormField>

            <ResponsiveFormField
              label="Confirm Password"
              error={errors.confirmPassword?.message}
              required
            >
              <ResponsivePasswordInput
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => {
                    if (value !== password) {
                      return 'Passwords do not match';
                    }
                    return true;
                  }
                })}
                id="confirmPassword"
                showPassword={showConfirmPassword}
                onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
                placeholder="Confirm new password"
                disabled={loading}
                error={!!errors.confirmPassword}
              />
            </ResponsiveFormField>

            <ResponsiveButton
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </ResponsiveButton>
          </ResponsiveForm>

          {message && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">{message}</p>
              <p className="text-sm text-green-600 mt-2">
                <Link 
                  to="/player/login" 
                  className="font-medium hover:underline inline-block min-h-[44px] px-2 py-1"
                >
                  Go to Login
                </Link>
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Remember your password?{' '}
              <Link 
                to="/player/login" 
                className="font-medium text-blue-600 hover:text-blue-500 inline-block min-h-[44px] px-2 py-1"
              >
                Back to Login
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              to="/"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 min-h-[44px] px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;