import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, User, Calendar, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { playerAPI } from '../services/api';
import { useAuth } from '../App';
import { 
  ResponsiveForm, 
  ResponsiveFormField, 
  ResponsiveInput, 
  ResponsiveSelect,
  ResponsivePasswordInput, 
  ResponsiveButton,
  ResponsiveFormGrid
} from '../components/responsive';

const PlayerRegister = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && userType === 'player') {
      if (!user.team) {
        navigate('/player/select-team');
      } else {
        navigate('/player/dashboard');
      }
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
      const response = await playerAPI.register(data);
      const { token, player } = response.data;

      // Use the auth context login function
      login(player, token, 'player');

      toast.success('Registration successful!');
      navigate('/player/select-team');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
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
                <User className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Player Registration</h2>
            <p className="text-gray-600 mt-2">Create your player account</p>
          </div>

          <ResponsiveForm onSubmit={handleSubmit(onSubmit)}>
            <ResponsiveFormField
              label="First Name"
              error={errors.firstName?.message}
              required
            >
              <ResponsiveInput
                {...register('firstName', {
                  required: 'First name is required'
                })}
                type="text"
                placeholder="Enter your first name"
                error={!!errors.firstName}
              />
            </ResponsiveFormField>

            <ResponsiveFormField
              label="Last Name"
              error={errors.lastName?.message}
              required
            >
              <ResponsiveInput
                {...register('lastName', {
                  required: 'Last name is required'
                })}
                type="text"
                placeholder="Enter your last name"
                error={!!errors.lastName}
              />
            </ResponsiveFormField>

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
              label="Date of Birth"
              error={errors.dateOfBirth?.message}
              required
            >
              <ResponsiveInput
                {...register('dateOfBirth', {
                  required: 'Date of birth is required'
                })}
                type="date"
                placeholder="dd/mm/yyyy"
                error={!!errors.dateOfBirth}
              />
            </ResponsiveFormField>

            <ResponsiveFormField
              label="Gender"
              error={errors.gender?.message}
              required
            >
              <ResponsiveSelect
                {...register('gender', {
                  required: 'Gender is required'
                })}
                error={!!errors.gender}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </ResponsiveSelect>
            </ResponsiveFormField>

            <ResponsiveFormField
              label="Password"
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
              className="w-full bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </ResponsiveButton>
          </ResponsiveForm>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link 
                to="/player/login" 
                className="font-medium text-blue-600 hover:text-blue-500 inline-block min-h-[44px] px-2 py-1"
              >
                Login here
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

export default PlayerRegister;
