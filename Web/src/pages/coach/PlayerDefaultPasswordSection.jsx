import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { coachAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Notice, Panel, PasswordInput } from '@/components/ui';
import { PASSWORD_RULES, SectionHeading, errorMessage } from '@/pages/shared/account/AccountSections';

/**
 * The coach's default password for players they register with no email.
 *
 * Shown on the coach's profile, readable on purpose: the coach hands it to the
 * players. Changing it needs the coach's own password, like changing that
 * one, and affects only players registered afterwards — each player's copy is
 * fixed when their account is made.
 */
const PlayerDefaultPasswordSection = ({ idPrefix = 'account', onChanged = null }) => {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  const load = useCallback(async () => {
    try {
      const response = await coachAPI.playerDefaultPassword.get();
      setState(response.data?.data || { isSet: false });
    } catch (error) {
      logger.error('Could not load the default player password', error);
      setState({ isSet: false, failed: true });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSubmit = async ({ password, currentPassword }) => {
    setSaving(true);
    try {
      const response = await coachAPI.playerDefaultPassword.set(password, currentPassword);
      setState(response.data?.data);
      setVisible(true);
      reset();
      toast.success(response.data?.message || 'Default player password saved');
      onChanged?.(response.data?.data);
    } catch (error) {
      logger.error('Could not save the default player password', error);
      toast.error(errorMessage(error, 'Could not save the default player password'));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.password);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy — select it and copy by hand');
    }
  };

  const readable = state?.isSet && state?.readable && state?.password;

  return (
    <Panel id="player-password" className="scroll-mt-24" aria-labelledby={`${idPrefix}-player-password-title`}>
      <SectionHeading hint="Every player you register without an email starts with this password. Give it to them with their Player ID.">
        <span id={`${idPrefix}-player-password-title`}>Default player password</span>
      </SectionHeading>

      {state === null && <p className="text-fg-muted type-body-s m-0 mb-5">Loading…</p>}

      {readable && (
        <div className="grid gap-2 mb-6">
          <p className="ui-field__label type-tag m-0">Current default</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="type-body font-medium break-all" data-testid="player-default-password">
              {visible ? state.password : '•'.repeat(Math.max(8, state.password.length))}
            </code>
            <Button variant="line" size="sm" icon={visible ? EyeOff : Eye} onClick={() => setVisible((v) => !v)}>
              {visible ? 'Hide' : 'Show'}
            </Button>
            <Button variant="line" size="sm" icon={Copy} onClick={copy}>Copy</Button>
          </div>
          {state.setAt && (
            <p className="text-fg-muted type-caption m-0">Set {new Date(state.setAt).toLocaleString()}</p>
          )}
        </div>
      )}

      {state && !state.isSet && !state.failed && (
        <Notice tone="info" title="Not set yet" className="mb-5">
          Set it before you register a player without an email.
        </Notice>
      )}
      {state?.isSet && !state.readable && (
        <Notice tone="warning" title="Set it again" className="mb-5">
          Your saved default can no longer be read. Set a new one; players you already registered keep theirs.
        </Notice>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
        <Field id={`${idPrefix}-playerDefaultPassword`} label={readable ? 'New default password' : 'Default password'} required error={errors.password?.message}>
          <PasswordInput autoComplete="off" placeholder="Min. 8 characters" {...register('password', PASSWORD_RULES)} />
        </Field>
        <Field id={`${idPrefix}-playerDefaultConfirm`} label="Confirm default password" required error={errors.confirm?.message}>
          <PasswordInput
            autoComplete="off"
            {...register('confirm', {
              required: 'Please confirm the default password',
              validate: (value) => value === watch('password') || 'Passwords do not match',
            })}
          />
        </Field>
        <Field id={`${idPrefix}-playerDefaultCurrent`} label="Your current password" required error={errors.currentPassword?.message}>
          <PasswordInput autoComplete="current-password" {...register('currentPassword', { required: 'Your current password is required' })} />
        </Field>
        {readable && (
          <p className="text-fg-muted type-caption m-0">
            Players you already registered keep the password they started with.
          </p>
        )}
        <Button type="submit" variant="line" block loading={saving} icon={saving ? null : KeyRound}>
          {saving ? 'Saving…' : readable ? 'Change default password' : 'Save default password'}
        </Button>
      </form>
    </Panel>
  );
};

PlayerDefaultPasswordSection.propTypes = {
  idPrefix: PropTypes.string,
  onChanged: PropTypes.func,
};

export default PlayerDefaultPasswordSection;
