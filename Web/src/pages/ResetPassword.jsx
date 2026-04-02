import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Lock, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import { 
  ResponsiveForm, 
  ResponsiveFormField, 
  ResponsivePasswordInput,
  ResponsiveInput,
  ResponsiveButton 
} from '../components/responsive';

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useParams(); // For legacy URL token method

  // Determine if using OTP method or legacy token method
  const isOTPMethod = !token;

  // Get email from location state (passed from ForgotPassword page)
  const emailFromState = location.state?.email || '';

  // For legacy token method, extract and remove token from URL
  const [resetToken, setResetToken] = useState('');

  useEffect(() => {
    if (token) {
      setResetToken(token);
      // Replace URL without token to prevent it from staying in browser history
      window.history.replaceState(null, '', '/reset-password');
    }
  }, [token]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: emailFromState
    }
  });

  const password = watch('password');

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setTimeout(() => {
        setLockoutSeconds(prev => {
          const newValue = prev - 1;
          if (newValue <= 0) {
            setIsLockedOut(false);
            setAttemptsRemaining(3);
          }
          return newValue;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [lockoutSeconds]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onSubmit = async (data) => {
    if (isLockedOut) {
      toast.error(`Account locked. Try again in ${formatTime(lockoutSeconds)}`);
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      // Use OTP method or legacy token method
      if (isOTPMethod) {
        // New OTP-based method
        await authAPI.resetPasswordWithOTP(data.email, data.otp, data.password);
      } else {
        // Legacy URL token method
        if (!resetToken) {
          setError('Invalid reset link. Please request a new password reset.');
          setLoading(false);
          return;
        }
        await authAPI.resetPassword(resetToken, data.password);
      }
      
      setMessage('Password has been reset successfully!');
      toast.success('Password reset successful!');
      
      // Clear the token from memory if using legacy method
      if (resetToken) {
        setResetToken('');
      }
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/player/login');
      }, 2000);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to reset password. Please try again.';
      const attemptsLeft = err.response?.data?.attemptsRemaining;
      const lockedOut = err.response?.data?.lockedOut;
      const remainingSeconds = err.response?.data?.remainingSeconds;
      
      setError(errorMessage);
      toast.error(errorMessage);
      
      // Only handle rate limiting for OTP method
      if (isOTPMethod) {
        if (lockedOut) {
          setIsLockedOut(true);
          setLockoutSeconds(remainingSeconds || 900); // Default 15 minutes
          setAttemptsRemaining(0);
        } else if (attemptsLeft !== undefined) {
          setAttemptsRemaining(attemptsLeft);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const email = watch('email');
    const otp = watch('otp');

    if (!email || !otp) {
      toast.error('Please enter email and OTP');
      return;
    }

    if (otp.length !== 6) {
      toast.error('OTP must be 6 digits');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      await authAPI.verifyOTP(email, otp);
      setOtpVerified(true);
      toast.success('✅ OTP verified! You can now set your new password.');
      setAttemptsRemaining(3); // Reset on successful verification
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Invalid OTP';
      const attemptsLeft = err.response?.data?.attemptsRemaining;
      const lockedOut = err.response?.data?.lockedOut;
      const remainingSeconds = err.response?.data?.remainingSeconds;
      
      toast.error(errorMessage);
      setError(errorMessage);
      
      if (lockedOut) {
        setIsLockedOut(true);
        setLockoutSeconds(remainingSeconds || 900);
        setAttemptsRemaining(0);
      } else if (attemptsLeft !== undefined) {
        setAttemptsRemaining(attemptsLeft);
      }
    } finally {
      setVerifying(false);
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
            <p className="text-gray-600 mt-2">
              {isOTPMethod ? 'Enter OTP and your new password' : 'Enter your new password'}
            </p>
          </div>

          {isOTPMethod && isLockedOut && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <Shield className="h-5 w-5 text-red-600 mr-2" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Account Locked</p>
                  <p className="text-sm text-red-700">
                    Too many failed attempts. Try again in {formatTime(lockoutSeconds)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isOTPMethod && !isLockedOut && attemptsRemaining < 3 && !otpVerified && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                ⚠️ {attemptsRemaining} attempt(s) remaining
              </p>
            </div>
          )}

          {isOTPMethod && otpVerified && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-green-800">OTP Verified Successfully</p>
                  <p className="text-sm text-green-700">
                    You can now set your new password
                  </p>
                </div>
              </div>
            </div>
          )}

          <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
            {isOTPMethod && (
              <>
                <ResponsiveFormField
                  label="Email Address"
                  error={errors.email?.message}
                  required
                >
                  <ResponsiveInput
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                        message: 'Please enter a valid email'
                      }
                    })}
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    disabled={loading || isLockedOut || otpVerified}
                    error={!!errors.email}
                    className={`${otpVerified ? 'bg-green-50 border-green-500' : ''}`}
                  />
                </ResponsiveFormField>

                <ResponsiveFormField
                  label="OTP Code"
                  error={errors.otp?.message}
                  required
                >
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <ResponsiveInput
                        {...register('otp', {
                          required: 'OTP is required',
                          pattern: {
                            value: /^\d{6}$/,
                            message: 'OTP must be 6 digits'
                          },
                          minLength: {
                            value: 6,
                            message: 'OTP must be 6 digits'
                          },
                          maxLength: {
                            value: 6,
                            message: 'OTP must be 6 digits'
                          }
                        })}
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="Enter 6-digit OTP"
                        disabled={loading || isLockedOut || otpVerified}
                        error={!!errors.otp}
                        className={`${otpVerified ? 'bg-green-50 border-green-500 text-green-900' : ''}`}
                      />
                      {otpVerified && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <ResponsiveButton
                      type="button"
                      variant={otpVerified ? "success" : "secondary"}
                      onClick={handleVerifyOTP}
                      loading={verifying}
                      disabled={loading || verifying || isLockedOut || otpVerified}
                      className={`whitespace-nowrap ${otpVerified ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                    >
                      {otpVerified ? '✓ Verified' : verifying ? 'Verifying...' : 'Verify'}
                    </ResponsiveButton>
                  </div>
                  {otpVerified ? (
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      ✓ OTP verified successfully
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      Check your email for the 6-digit code
                    </p>
                  )}
                </ResponsiveFormField>
              </>
            )}

            <ResponsiveFormField
              label="New Password"
              error={errors.password?.message}
              required
            >
              <ResponsivePasswordInput
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters'
                  }
                })}
                id="password"
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                placeholder="Enter new password"
                disabled={loading || isLockedOut}
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
                disabled={loading || isLockedOut}
                error={!!errors.confirmPassword}
              />
            </ResponsiveFormField>

            <ResponsiveButton
              type="submit"
              variant="primary"
              loading={loading}
              disabled={loading || isLockedOut}
              className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            >
              {loading ? 'Resetting Password...' : 'Reset Password'}
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

          {error && !isLockedOut && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mt-6 text-center">
            {isOTPMethod ? (
              <p className="text-sm text-gray-600">
                Didn't receive OTP?{' '}
                <Link 
                  to="/forgot-password" 
                  className="font-medium text-blue-600 hover:text-blue-500 inline-block min-h-[44px] px-2 py-1"
                >
                  Request New OTP
                </Link>
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                Remember your password?{' '}
                <Link 
                  to="/player/login" 
                  className="font-medium text-blue-600 hover:text-blue-500 inline-block min-h-[44px] px-2 py-1"
                >
                  Back to Login
                </Link>
              </p>
            )}
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
