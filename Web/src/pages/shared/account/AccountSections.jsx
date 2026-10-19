import { useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { KeyRound, MailCheck, Send, X } from 'lucide-react';
import { accountAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Heading, Input, Notice, Panel, PasswordInput, Segmented } from '@/components/ui';

/**
 * The parts of the account page every role shares: changing the password and
 * changing the email. JudgeProfile uses them too, beside its own sections.
 *
 * `role` throughout is the PORTAL role from the URL (player, coach, admin,
 * superadmin, judge) — it names the stored session (`${role}_token`).
 */

const errorMessage = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

export const SectionHeading = ({ children, hint = null }) => (
  <div className="mb-5 grid gap-1">
    <Heading level={2} step="display-s">{children}</Heading>
    {hint && <p className="text-fg-muted type-caption m-0">{hint}</p>}
  </div>
);
SectionHeading.propTypes = { children: PropTypes.node.isRequired, hint: PropTypes.node };

const PASSWORD_RULES = {
  required: 'New password is required',
  minLength: { value: 8, message: 'Password must be at least 8 characters' },
  validate: (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value ?? ''))
    || 'Password needs an uppercase letter, a lowercase letter, and a number',
};

/**
 * Change the password, knowing the current one. The server signs every other
 * session out and hands this one a new token, which has to replace the stored
 * one — a phone that cannot keep the cookie signs in with it.
 */
export const PasswordSection = ({ role, idPrefix }) => {
  const { login } = useAuth();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setSaving(true);
    try {
      const response = await accountAPI.changePassword(currentPassword, newPassword);
      const { token, user } = response.data?.data || {};
      if (token && user) login(user, token, role);
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      logger.error('Could not change password', error);
      toast.error(errorMessage(error, 'Could not change your password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel id="password" className="scroll-mt-24" aria-labelledby={`${idPrefix}-password-title`}>
      <SectionHeading hint="Your current password is required. Every other device you are signed in on will be signed out.">
        <span id={`${idPrefix}-password-title`}>Change password</span>
      </SectionHeading>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id={`${idPrefix}-currentPassword`} label="Current Password" required error={errors.currentPassword?.message}>
          <PasswordInput autoComplete="current-password" {...register('currentPassword', { required: 'Current password is required' })} />
        </Field>
        <Field id={`${idPrefix}-newPassword`} label="New Password" required error={errors.newPassword?.message}>
          <PasswordInput autoComplete="new-password" placeholder="Min. 8 characters" {...register('newPassword', PASSWORD_RULES)} />
        </Field>
        <Field id={`${idPrefix}-confirmPassword`} label="Confirm New Password" required error={errors.confirmPassword?.message}>
          <PasswordInput
            autoComplete="new-password"
            {...register('confirmPassword', {
              required: 'Please confirm your new password',
              validate: (value) => value === watch('newPassword') || 'Passwords do not match',
            })}
          />
        </Field>
        <Button type="submit" variant="line" block loading={saving} icon={saving ? null : KeyRound}>
          {saving ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Panel>
  );
};
PasswordSection.propTypes = { role: PropTypes.string.isRequired, idPrefix: PropTypes.string.isRequired };

const WHOSE = { self: 'Your own', guardian: "A parent's or guardian's", none: 'No email' };

/**
 * Change the email in two steps: send a code to the new address, then enter
 * it. A player picks whether the new address is their own or a guardian's;
 * a player who had no email then waits for their coach to approve it.
 */
export const EmailSection = ({ user, userType, pending, onChanged, idPrefix }) => {
  const isPlayer = userType === 'player';
  const currentType = isPlayer ? (user.emailType || 'self') : null;
  const [busy, setBusy] = useState(false);
  const [emailType, setEmailType] = useState(currentType === 'guardian' ? 'guardian' : 'self');
  const start = useForm();
  const confirm = useForm();

  const run = async (work, success) => {
    setBusy(true);
    try {
      const response = await work();
      if (success) toast.success(response.data?.message || success);
      await onChanged();
      return true;
    } catch (error) {
      logger.error('Email change failed', error);
      toast.error(errorMessage(error, 'Could not change your email'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onStart = ({ newEmail, currentPassword }) => run(
    () => accountAPI.requestEmailChange({ newEmail, currentPassword, emailType: isPlayer ? emailType : undefined }),
    'Code sent'
  ).then((ok) => ok && start.reset());

  const onConfirm = ({ code }) => run(() => accountAPI.confirmEmailChange(code.trim()), 'Email updated').then((ok) => ok && confirm.reset());

  const onCancel = () => run(() => accountAPI.cancelEmailChange(), 'Email change cancelled');

  return (
    <Panel id="email" className="scroll-mt-24" aria-labelledby={`${idPrefix}-email-title`}>
      <SectionHeading hint="A new address only replaces the old one after you enter the code we send to it.">
        <span id={`${idPrefix}-email-title`}>Update email</span>
      </SectionHeading>

      <dl className="grid gap-1 m-0 mb-5">
        <dt className="type-tag text-fg-secondary">Current email</dt>
        <dd className="m-0 type-body break-all">{user.email || 'None'}</dd>
        {isPlayer && <dd className="m-0 type-caption text-fg-muted">{WHOSE[currentType]}</dd>}
      </dl>

      {pending?.status === 'awaiting-coach' && (
        <div className="grid gap-4">
          <Notice tone="info" title="Waiting for your coach">
            {pending.newEmail} is confirmed. Your coach now needs to approve it before it is added to your account.
          </Notice>
          <Button variant="line" icon={X} onClick={onCancel} loading={busy}>Cancel this change</Button>
        </div>
      )}

      {pending?.status === 'awaiting-code' && (
        <form onSubmit={confirm.handleSubmit(onConfirm)} noValidate className="grid gap-5">
          <Notice tone="info">We sent a 6-digit code to <strong className="break-all">{pending.newEmail}</strong>. It expires in a few minutes.</Notice>
          <Field id={`${idPrefix}-code`} label="Code" required error={confirm.formState.errors.code?.message}>
            <Input
              numeric
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              {...confirm.register('code', { required: 'Enter the code', pattern: { value: /^\d{6}$/, message: 'The code is 6 digits' } })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button type="submit" loading={busy} icon={busy ? null : MailCheck}>Confirm</Button>
            <Button variant="line" icon={X} onClick={onCancel} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}

      {!pending && (
        <form onSubmit={start.handleSubmit(onStart)} noValidate className="grid gap-5">
          {isPlayer && (
            <div className="grid gap-2">
              <span className="type-tag text-fg-secondary" aria-hidden="true">Whose email is it?</span>
              <Segmented
                label="Whose email is it?"
                value={emailType}
                onChange={setEmailType}
                options={[{ value: 'self', label: 'My own' }, { value: 'guardian', label: "Parent's / guardian's" }]}
              />
              <p className="type-caption text-fg-muted m-0">
                {emailType === 'self'
                  ? 'You can sign in with your own email as well as your Player ID.'
                  : 'Brothers and sisters can share it. You keep signing in with your Player ID.'}
              </p>
            </div>
          )}
          {isPlayer && currentType === 'none' && (
            <Notice tone="info">Because your account has no email yet, your coach approves the new address after you confirm it.</Notice>
          )}
          <Field id={`${idPrefix}-newEmail`} label="New Email" required error={start.formState.errors.newEmail?.message}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...start.register('newEmail', {
                required: 'New email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' },
              })}
            />
          </Field>
          <Field id={`${idPrefix}-emailPassword`} label="Current Password" required error={start.formState.errors.currentPassword?.message}>
            <PasswordInput autoComplete="current-password" {...start.register('currentPassword', { required: 'Current password is required' })} />
          </Field>
          <Button type="submit" variant="line" block loading={busy} icon={busy ? null : Send}>Send code</Button>
        </form>
      )}
    </Panel>
  );
};
EmailSection.propTypes = {
  user: PropTypes.shape({ email: PropTypes.string, emailType: PropTypes.string }).isRequired,
  userType: PropTypes.string.isRequired,
  pending: PropTypes.shape({ newEmail: PropTypes.string, status: PropTypes.string }),
  onChanged: PropTypes.func.isRequired,
  idPrefix: PropTypes.string.isRequired,
};
