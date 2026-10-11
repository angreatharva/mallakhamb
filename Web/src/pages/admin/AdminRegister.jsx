import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Input, PasswordInput, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

// Import API service
import { adminAPI } from '@/services/api';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionSelectionScreen from '@/components/competition/CompetitionSelectionScreen';
import { PasswordRequirements, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength';

/**
 * AdminRegister - create an admin account, then choose a competition.
 */
const AdminRegister = () => {
  const { login } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showCompetitionSelection, setShowCompetitionSelection] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, watch, setError } = useForm();
  
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  
  // Handle form submission
  const onSubmit = async (data) => {
    // Validate password length
    if (data.password.length < 12) {
      setError('password', { message: 'Password must be at least 12 characters long' });
      return;
    }
    
    // Validate password match
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    
    setLoading(true);
    try {
      const response = await adminAPI.register({
        name: data.name,
        email: data.email,
        password: data.password,
      });
      
      const { token, admin } = response.data;
      
      if (!token || !admin) {
        throw new Error('Invalid registration response');
      }
      
      // Store token and admin profile
      secureStorage.setItem('admin_token', token);
      secureStorage.setItem('admin_user', JSON.stringify(admin));
      
      // Update auth context
      login(admin, token, 'admin');
      
      toast.success('Registration successful! Welcome to Mallakhamb Admin Portal.');
      
      // Show competition selection screen
      setShowCompetitionSelection(true);
    } catch (error) {
      logger.error('Admin registration error:', error);
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        toast.error('Too many registration attempts. Please wait 15 minutes and try again.');
      } else if (error.response?.data?.message?.includes('email already exists') || 
                 error.response?.data?.message?.includes('Email already registered')) {
        toast.error('Email already registered. Please use a different email or login.');
      } else if (error.response?.data?.message?.includes('duplicate')) {
        toast.error('An account with this email already exists.');
      } else {
        toast.error(error.response?.data?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Show competition selection after successful registration
  if (showCompetitionSelection) {
    return (
      <CompetitionProvider userType="admin">
        <CompetitionSelectionScreen userType="admin" onCompetitionSelected={() => {}} />
      </CompetitionProvider>
    );
  }
  
  return (
    <AuthLayout
      role="admin"
      title="Admin"
      lede="Create your admin account to manage competitions, teams, judges, and scoring operations."
    >
      <AuthHeader tag="Create Account" title="Register" lede="Create your admin account" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id="admin-name" label="Full Name" required error={errors.name?.message}>
          <Input
            type="text"
            placeholder="Enter your full name"
            autoComplete="name"
            {...register('name', {
              required: 'Name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' }
            })}
          />
        </Field>

        <Field id="admin-email" label="Email" required error={errors.email?.message}>
          <Input
            type="email"
            placeholder="admin@example.com"
            autoComplete="email"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^\S+@\S+$/i,
                message: 'Invalid email format'
              }
            })}
          />
        </Field>

        <div>
          <Field id="admin-password" label="Password" required error={errors.password?.message}>
            <PasswordInput
              placeholder="••••••••••••"
              autoComplete="new-password"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 12, message: 'Password must be at least 12 characters' }
              })}
            />
          </Field>
          <PasswordStrengthIndicator password={password} minLength={12} strongLength={16} />
          <PasswordRequirements password={password} minLength={12} />
        </div>

        <div>
          <Field id="admin-confirm-password" label="Confirm Password" required error={errors.confirmPassword?.message}>
            <PasswordInput
              placeholder="••••••••••••"
              autoComplete="new-password"
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: (value) => value === password || 'Passwords do not match'
              })}
            />
          </Field>
          {!errors.confirmPassword && confirmPassword && password === confirmPassword && (
            <p className="shell-auth__match type-caption">
              <CheckCircle2 aria-hidden="true" />
              Passwords match
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block loading={loading} iconRight={loading ? null : ArrowRight}>
          {loading ? 'Creating Account...' : 'Create Admin Account'}
        </Button>
      </form>

      <AuthLinks>
        <TextLink as={Link} to="/" className="ui-link--quiet">← Home</TextLink>
        <span className="shell-auth__links-end">
          <span className="type-body-s">Already have an account?</span>
          <TextLink as={Link} to="/admin/login">Sign In</TextLink>
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default AdminRegister;
