import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '@/services/api';
import { validateEmailOrPlayerId } from '@/validators/form.validator';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Input, Notice, PasswordInput, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

const PASSWORD_RULES = {
  required: 'New password is required',
  minLength: { value: 8, message: 'Password must be at least 8 characters' },
  validate: (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value ?? ''))
    || 'Password needs an uppercase letter, a lowercase letter, and a number',
};

/**
 * The second half of a reset for a player registered without an email:
 * "Forgot password" with their Player ID asked their coach, the coach approved
 * it and was shown a 6-digit code, and the player enters it here with a new
 * password. The code works once, for 24 hours.
 */
const CoachCodeReset = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { errors } } = useForm();

  const onSubmit = async ({ identifier, code, password }) => {
    setLoading(true); setError('');
    try {
      await authAPI.resetWithCoachCode(identifier.trim().toLowerCase(), code.trim(), password);
      setDone(true);
      toast.success('Password reset');
      setTimeout(() => navigate('/player/login'), 2000);
    } catch (err) {
      logger.error('Coach-code reset failed', err);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Could not reset your password';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout role="player" title="Player" lede="No email on your account? Your coach can let you back in.">
      <AuthHeader
        tag="Password reset"
        title="Code from your coach"
        lede="Enter your Player ID, the 6-digit code your coach gave you, and a new password."
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id="coach-reset-identifier" label="Player ID" required error={errors.identifier?.message}>
          <Input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="aarav.patil.150616"
            disabled={loading || done}
            {...register('identifier', { validate: validateEmailOrPlayerId })}
          />
        </Field>
        <Field id="coach-reset-code" label="Code from your coach" required error={errors.code?.message}>
          <Input
            numeric
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            disabled={loading || done}
            {...register('code', { required: 'Enter the code', pattern: { value: /^\d{6}$/, message: 'The code is 6 digits' } })}
          />
        </Field>
        <Field id="coach-reset-password" label="New Password" required error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" placeholder="Min. 8 characters" disabled={loading || done} {...register('password', PASSWORD_RULES)} />
        </Field>
        <Field id="coach-reset-confirmPassword" label="Confirm New Password" required error={errors.confirmPassword?.message}>
          <PasswordInput
            autoComplete="new-password"
            disabled={loading || done}
            {...register('confirmPassword', {
              required: 'Please confirm your new password',
              validate: (value) => value === watch('password') || 'Passwords do not match',
            })}
          />
        </Field>
        <Button type="submit" size="lg" block loading={loading} disabled={done} icon={loading ? null : Lock}>
          {loading ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>

      {done && (
        <Notice tone="success" title="Password reset" role="status" aria-live="polite">Taking you to sign in…</Notice>
      )}
      {error && !done && (
        <Notice tone="danger" role="alert" aria-live="assertive">{error}</Notice>
      )}

      <AuthLinks>
        <TextLink as={Link} to="/forgot-password?role=player" className="ui-link--quiet">← No code yet?</TextLink>
        <span className="shell-auth__links-end">
          <TextLink as={Link} to="/player/login">Back to Login</TextLink>
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default CoachCodeReset;
