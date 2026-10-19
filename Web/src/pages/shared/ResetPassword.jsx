import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '@/services/api';
import { validatePasswordStrength, validateEmailOrPlayerId } from '@/validators/form.validator';
import { portalFromSearch, accountTypeFor, accountFieldFor, loginPathFor, withPortal } from './resetPortal';
import { Button, Field, Input, PasswordInput, Notice, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

const PORTAL_NAME = { player: 'Player', coach: 'Coach', admin: 'Admin', superadmin: 'Super Admin', judge: 'Judge' };
const STEPS = ['Verify OTP', 'New Password'];

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const portal = portalFromSearch(location.search);
  const userType = accountTypeFor(portal);
  const isPlayer = portal === 'player';
  const account = accountFieldFor(portal);
  const emailFromState = location.state?.email || '';

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { email: emailFromState },
  });
  const password = watch('password');

  // The server answers every failed code with one message and discards a code
  // after too many wrong guesses, so there is no attempt counter to show here.
  const handleVerifyOTP = async () => {
    const email = watch('email');
    const otp = watch('otp');
    if (!email || !otp) { toast.error(`Please enter ${isPlayer ? 'email or Player ID' : 'email'} and OTP`); return; }
    if (otp.length !== 6) { toast.error('OTP must be 6 digits'); return; }
    setVerifying(true); setError('');
    try {
      await authAPI.verifyOTP(email.trim().toLowerCase(), otp, userType);
      setOtpVerified(true);
      toast.success('OTP verified! Set your new password.');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Invalid OTP';
      toast.error(msg); setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true); setError('');
    try {
      await authAPI.resetPasswordWithOTP(data.email.trim().toLowerCase(), data.otp, data.password, userType);
      setSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate(loginPathFor(portal)), 2000);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to reset password. Please try again.';
      setError(msg); toast.error(msg);
      // A code rejected at this step (expired, or replaced by a newer one) must
      // be re-entered, so unlock the code field again. A weak-password
      // rejection keeps the verified code.
      if (err.response?.status === 400 && !/password/i.test(msg)) setOtpVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const step = otpVerified ? 2 : 1;

  return (
    <AuthLayout
      role={portal}
      title={PORTAL_NAME[portal] || 'Account'}
      lede="Check your email for the 6-digit code, then choose a new password."
    >
      <AuthHeader tag="Password reset" title="Reset Password" lede="Verify your OTP then set a new password" />

      {/* Step indicator: the current step carries the accent rule. */}
      <ol className="shell-steps" aria-label="Progress">
        {STEPS.map((label, i) => {
          const s = i + 1;
          return (
            <li key={label} className="shell-steps__step" data-state={step > s ? 'done' : step === s ? 'current' : 'todo'}
              aria-current={step === s ? 'step' : undefined}>
              <span className="type-num-m" aria-hidden="true">{String(s).padStart(2, '0')}</span>
              <span className="type-tag">{label}</span>
            </li>
          );
        })}
      </ol>

      {otpVerified && (
        <Notice tone="success" role="status" aria-live="polite" className="ui-fade-in">
          OTP verified — set your new password below
        </Notice>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id="email" label={account.label} required error={errors.email?.message}>
          <Input
            {...register('email', isPlayer
              ? { validate: validateEmailOrPlayerId }
              : {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' },
              })}
            type={account.type} autoComplete={account.autoComplete}
            autoCapitalize="none" spellCheck={false}
            placeholder={account.placeholder}
            disabled={loading || otpVerified}
          />
        </Field>

        <Field
          id="otp"
          label="OTP Code"
          required
          error={errors.otp?.message}
          help={!otpVerified && !errors.otp ? 'Check your email for the 6-digit code' : null}
        >
          <Input
            {...register('otp', {
              required: 'OTP is required',
              pattern: { value: /^\d{6}$/, message: 'OTP must be 6 digits' },
            })}
            numeric type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            placeholder="6-digit code"
            disabled={loading || otpVerified}
          />
        </Field>
        <Button
          variant="line"
          onClick={handleVerifyOTP}
          loading={verifying}
          disabled={loading || otpVerified}
        >
          {otpVerified ? '✓ Verified' : 'Verify'}
        </Button>

        {/* New password — only shown after OTP verified */}
        {otpVerified && (
          <div className="grid gap-5 ui-fade-in">
            <Field id="password" label="New Password" required error={errors.password?.message}>
              <PasswordInput
                {...register('password', {
                  required: 'Password is required',
                  // The server's rule, checked before the round trip.
                  validate: v => validatePasswordStrength(v).errors[0] || true,
                })}
                autoComplete="new-password"
                placeholder="8+ characters, A–Z, a–z and 0–9"
                disabled={loading}
              />
            </Field>

            <Field id="confirmPassword" label="Confirm Password" required error={errors.confirmPassword?.message}>
              <PasswordInput
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: v => v === password || 'Passwords do not match',
                })}
                autoComplete="new-password"
                placeholder="Repeat your password"
                disabled={loading}
              />
            </Field>

            <Button type="submit" size="lg" block loading={loading} disabled={success} icon={loading || success ? null : Lock}>
              {loading ? 'Resetting Password…' : success ? 'Password Reset — Redirecting…' : 'Reset Password'}
            </Button>
          </div>
        )}
      </form>

      {success && (
        <Notice tone="success" title="Password reset successfully!" role="status" aria-live="polite" className="ui-fade-in">
          <TextLink as={Link} to={loginPathFor(portal)}>Go to Login →</TextLink>
        </Notice>
      )}

      {error && !success && (
        <Notice tone="danger" role="alert" aria-live="assertive" className="ui-fade-in">
          {error}
        </Notice>
      )}

      <AuthLinks>
        <TextLink as={Link} to="/" className="ui-link--quiet">← Back to Home</TextLink>
        <span className="shell-auth__links-end">
          <TextLink as={Link} to={withPortal('/forgot-password', portal)}>Request New OTP</TextLink>
          <TextLink as={Link} to={loginPathFor(portal)}>Back to Login</TextLink>
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default ResetPassword;
