import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '@/services/api';
import { validateEmailFormat, validateEmailOrPlayerId } from '@/validators/form.validator';
import { portalFromSearch, accountTypeFor, accountFieldFor, loginPathFor, withPortal } from './resetPortal';
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
  const isPlayer = portal === 'player';
  const account = accountFieldFor(portal);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true); setSent(false); setError('');
    toast.loading('Sending OTP…', { id: 'forgot-password' });
    try {
      logger.log('🔐 Sending forgot password request for:', data.email);
      const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 120000));
      const identifier = data.email.trim().toLowerCase();
      await Promise.race([authAPI.forgotPassword(identifier, accountTypeFor(portal)), timeout]);
      setSent(true);
      // The server answers the same for every address, so neither can we.
      toast.success('Check your email for the code.', { id: 'forgot-password' });
      setTimeout(() => navigate(withPortal('/reset-password', portal), { state: { email: identifier } }), 2000);
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
        lede={isPlayer
          ? "Enter your email or Player ID and we'll send a one-time code to reset your password."
          : "Enter your email and we'll send you a one-time code to reset your password."}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        {/* The field keeps the name `email` for every portal; a player's may hold a Player ID. */}
        <Field id="email" label={account.label} required error={errors.email?.message}>
          <Input
            {...register('email', {
              validate: isPlayer
                ? validateEmailOrPlayerId
                : (v) => validateEmailFormat(v) || 'Please enter a valid email address',
            })}
            type={account.type} autoComplete={account.autoComplete}
            autoCapitalize="none" spellCheck={false}
            placeholder={account.placeholder}
            disabled={loading || sent}
          />
        </Field>

        {isPlayer && (
          <Notice tone="info">
            Enter your Player ID and the code goes to the email on your account — yours or your parent&apos;s.
            Entering a parent&apos;s email sends the Player IDs registered with it. No email on your account?
            Ask your coach to reset your password.
          </Notice>
        )}

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
        <Notice tone="success" title={isPlayer ? 'If that account has an email, a 6-digit code is on its way' : 'If that email has an account, a 6-digit code is on its way'} role="status" aria-live="polite" className="ui-fade-in">
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
