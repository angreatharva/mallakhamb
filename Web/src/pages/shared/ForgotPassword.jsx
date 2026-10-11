import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '@/services/api';
import { validateEmailFormat } from '@/validators/form.validator';
import { portalFromSearch, accountTypeFor, loginPathFor, withPortal } from './resetPortal';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Input, Notice, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

const PORTAL_NAME = { player: 'Player', coach: 'Coach', admin: 'Admin', superadmin: 'Super Admin', judge: 'Judge' };

const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const portal = portalFromSearch(location.search);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true); setSent(false); setError('');
    toast.loading('Sending OTP…', { id: 'forgot-password' });
    try {
      logger.log('🔐 Sending forgot password request for:', data.email);
      const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 120000));
      await Promise.race([authAPI.forgotPassword(data.email, accountTypeFor(portal)), timeout]);
      setSent(true);
      // The server answers the same for every address, so neither can we.
      toast.success('Check your email for the code.', { id: 'forgot-password' });
      setTimeout(() => navigate(withPortal('/reset-password', portal), { state: { email: data.email } }), 2000);
    } catch (err) {
      logger.error('❌ Forgot password error:', err);
      let msg = 'An error occurred. Please try again.';
      if (err.message === 'timeout') msg = 'Server is starting up. Please try again in a moment.';
      else if (err.response?.data?.error?.message || err.response?.data?.message) {
        msg = err.response.data.error?.message || err.response.data.message;
      }
      else if (err.message?.includes('Network Error')) msg = 'Network error. Check your connection.';
      setError(msg);
      toast.error(msg, { id: 'forgot-password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      role={portal}
      title={PORTAL_NAME[portal] || 'Account'}
      lede="Locked out? A one-time code to your email gets you back in."
    >
      <AuthHeader
        tag="Password reset"
        title="Forgot Password?"
        lede="Enter your email and we'll send you a one-time code to reset your password."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id="email" label="Email Address" required error={errors.email?.message}>
          <Input
            {...register('email', {
              required: 'Email is required',
              validate: v => validateEmailFormat(v) || 'Please enter a valid email address',
            })}
            type="email" autoComplete="email"
            placeholder="you@example.com"
            disabled={loading || sent}
          />
        </Field>

        <Button type="submit" size="lg" block loading={loading} disabled={sent} icon={loading || sent ? null : Send}>
          {loading ? 'Sending OTP…' : sent ? 'OTP Sent — Redirecting…' : 'Send OTP'}
        </Button>

        {loading && (
          <Notice tone="info" className="ui-fade-in">
            This may take a moment if the server is starting up.
          </Notice>
        )}
      </form>

      {sent && (
        <Notice tone="success" title="If that email has an account, a 6-digit code is on its way" role="status" aria-live="polite" className="ui-fade-in">
          Redirecting to reset page…
        </Notice>
      )}

      {error && !sent && (
        <Notice tone="danger" role="alert" aria-live="assertive" className="ui-fade-in">
          {error}
        </Notice>
      )}

      <AuthLinks>
        <TextLink as={Link} to="/" className="ui-link--quiet">← Back to Home</TextLink>
        <span className="shell-auth__links-end">
          <span className="type-body-s">Remember your password?</span>
          <TextLink as={Link} to={loginPathFor(portal)}>Back to Login</TextLink>
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default ForgotPassword;
