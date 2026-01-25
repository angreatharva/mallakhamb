import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import { validateEmailFormat } from '../utils/validation';
import { 
  ResponsiveForm, 
  ResponsiveFormField, 
  ResponsiveInput, 
  ResponsiveButton 
} from '../components/responsive';

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await authAPI.forgotPassword(data.email);
      setMessage('If an account with that email exists, a password reset link has been sent.');
      toast.success('Password reset email sent!');
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'An error occurred. Please try again later.';
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
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Forgot Password</h2>
            <p className="text-gray-600 mt-2">Enter your email to reset your password</p>
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
                  validate: (value) => {
                    if (!validateEmailFormat(value)) {
                      return 'Please enter a valid email address';
                    }
                    return true;
                  }
                })}
                id="email"
                type="email"
                placeholder="Enter your email"
                disabled={loading}
                error={!!errors.email}
              />
            </ResponsiveFormField>

            <ResponsiveButton
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </ResponsiveButton>
          </ResponsiveForm>

          {message && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">{message}</p>
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

export default ForgotPassword;