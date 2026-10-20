import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Check, Copy, Download, UserPlus } from 'lucide-react';
import { coachAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { Button, Dialog, Field, Input, Notice, Select, SpecList } from '@/components/ui';
import { needsConsent } from '@/pages/player/registration/playerRegistration';
import { errorMessage } from '@/pages/shared/account/AccountSections';

const NAME_RULES = (label) => ({
  required: `${label} is required`,
  minLength: { value: 2, message: `${label} must be at least 2 characters` },
  maxLength: { value: 50, message: `${label} must be at most 50 characters` },
});

/** What "Download" saves for the coach to hand over: sign-in details and nothing more. */
export const signInCardText = (player, password, loginUrl) => [
  'Mallakhamb — Player sign-in',
  '',
  `Name:      ${[player.firstName, player.lastName].filter(Boolean).join(' ')}`,
  `Player ID: ${player.loginId}`,
  `Password:  ${password}`,
  '',
  `Sign in at ${loginUrl} with this Player ID and password.`,
  'You can change the password from My profile after signing in.',
  '',
].join('\n');

/**
 * A coach registering a player who has no email ("No email at all"), straight
 * onto the coach's team. The player signs in with their Player ID and the
 * coach's default player password, so the coach must have set one first.
 *
 * A player with the same name and date of birth may already exist — usually
 * the child registered themselves. The server stops at that (409) and the
 * coach chooses: use the existing account, or register anyway.
 *
 * After saving, the dialog shows the sign-in card. `onEnterAgeGroup` hands the
 * new player to the dashboard's existing age-group step.
 */
const RegisterPlayerDialog = ({ open, onClose, onRegistered = null, onEnterAgeGroup = null, canEnterAgeGroup = true }) => {
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState(null);
  const [created, setCreated] = useState(null);
  const [coach, setCoach] = useState(null);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();

  useEffect(() => {
    if (!open) return;
    coachAPI.getProfile()
      .then((response) => setCoach(response.data?.data || null))
      .catch((error) => logger.error('Could not load the coach profile', error));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDefaults(null);
    coachAPI.playerDefaultPassword.get()
      .then((response) => setDefaults(response.data?.data || { isSet: false }))
      .catch((error) => {
        logger.error('Could not load the default player password', error);
        setDefaults({ isSet: false, failed: true });
      });
  }, [open]);

  const close = () => {
    reset();
    setDuplicates(null);
    setCreated(null);
    onClose();
  };

  const submit = async (values, confirmDuplicate = false) => {
    setSaving(true);
    try {
      const body = {
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: values.dateOfBirth,
        gender: values.gender,
        guardianConsent: needsConsent(values.dateOfBirth) ? Boolean(values.guardianConsent) : undefined,
        ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
      };
      const response = await coachAPI.registerPlayer(body);
      const result = response.data?.data;
      setDuplicates(null);
      setCreated(result);
      toast.success(response.data?.message || 'Player registered');
      onRegistered?.(result);
    } catch (error) {
      const details = error?.response?.data?.error?.details;
      if (error?.response?.status === 409 && details?.reason === 'POSSIBLE_DUPLICATE') {
        setDuplicates(details.matches || []);
      } else {
        logger.error('Could not register the player', error);
        toast.error(errorMessage(error, 'Could not register the player'));
      }
    } finally {
      setSaving(false);
    }
  };

  const password = defaults?.readable ? defaults.password : null;
  const ready = Boolean(password);
  const showConsent = needsConsent(watch('dateOfBirth'));
  const consentGiven = watch('guardianConsent');

  if (created) {
    const { player } = created;
    const loginUrl = `${window.location.origin}/player/login`;
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(`Player ID: ${player.loginId}\nPassword: ${password}`);
        toast.success('Copied');
      } catch {
        toast.error('Could not copy — please write it down');
      }
    };
    const download = () => {
      const blob = new Blob([signInCardText(player, password, loginUrl)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `player-id-${player.loginId}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };

    return (
      <Dialog open={open} onClose={close} title="Player registered">
        <div className="grid gap-5">
          <Notice tone="success" title={`${player.firstName} ${player.lastName} is on ${created.team?.name || 'your team'}`}>
            Give them these sign-in details. The Player ID has also been emailed to you.
          </Notice>
          <SpecList
            items={[
              { label: 'Player ID', value: <code className="break-all" data-testid="new-player-id">{player.loginId}</code> },
              { label: 'Password', value: <code className="break-all">{password}</code> },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="line" icon={Copy} onClick={copy}>Copy</Button>
            <Button variant="line" icon={Download} onClick={download}>Download</Button>
          </div>
          {onEnterAgeGroup && (
            <Button
              block
              disabled={!canEnterAgeGroup}
              onClick={() => { const next = player; close(); onEnterAgeGroup(next); }}
            >
              Enter in an age group now
            </Button>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="line" className="flex-1" onClick={() => { reset(); setCreated(null); }}>
              Register another
            </Button>
            <Button variant="line" className="flex-1" onClick={close}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={close} title="Register a player (no email)" wide>
      {defaults === null && <p className="text-fg-muted type-body-s m-0">Loading…</p>}

      {defaults && !ready && (
        <div className="grid gap-4">
          <Notice tone="warning" title={defaults.isSet ? 'Set your default player password again' : 'Set your default player password first'}>
            Players you register sign in with their Player ID and your default player password.
          </Notice>
          <Button as={Link} to="/coach/profile#player-password" onClick={close}>Go to my profile</Button>
        </div>
      )}

      {ready && (
        <form onSubmit={handleSubmit((values) => submit(values))} noValidate className="grid gap-5">
          <p className="text-fg-muted type-body-s m-0">
            For a player without an email. They join your team and sign in with a Player ID and your default player password.
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="coach-reg-firstName" label="First Name" required error={errors.firstName?.message}>
              <Input autoComplete="off" {...register('firstName', NAME_RULES('First name'))} />
            </Field>
            <Field id="coach-reg-lastName" label="Last Name" required error={errors.lastName?.message}>
              <Input autoComplete="off" {...register('lastName', NAME_RULES('Last name'))} />
            </Field>
            <Field id="coach-reg-dateOfBirth" label="Date of Birth" required error={errors.dateOfBirth?.message}>
              <Input type="date" {...register('dateOfBirth', { required: 'Date of birth is required' })} />
            </Field>
            <Field id="coach-reg-gender" label="Gender" required error={errors.gender?.message}>
              <Select defaultValue="" {...register('gender', { required: 'Gender is required' })}>
                <option value="" disabled>Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </Select>
            </Field>
          </div>

          {/* The coach is the player's contact of record; the server fills it in. */}
          <div className="grid gap-1">
            <p className="ui-field__label type-tag m-0">Parent/guardian contact</p>
            {coach ? (
              <p className="type-body-s m-0" data-testid="coach-contact">
                {[coach.firstName, coach.lastName].filter(Boolean).join(' ')} · Coach · {coach.phone || 'no phone on your profile'}
              </p>
            ) : (
              <p className="type-body-s text-fg-muted m-0">You, as their coach</p>
            )}
            <p className="text-fg-muted type-caption m-0">You are the contact for players you register.</p>
          </div>

          {coach && !coach.phone && (
            <Notice tone="warning" title="Add your phone number first">
              It is the contact for players you register.{' '}
              <Link to="/coach/profile#details" onClick={close}>Go to my profile</Link>
            </Notice>
          )}

          {showConsent && (
            <div className="grid gap-1">
              <label className="ui-check" data-checked={consentGiven || undefined}>
                <input
                  id="coach-reg-guardianConsent"
                  type="checkbox"
                  className="sr-only"
                  aria-invalid={errors.guardianConsent ? 'true' : undefined}
                  aria-describedby={errors.guardianConsent ? 'coach-reg-guardianConsent-error' : undefined}
                  {...register('guardianConsent', {
                    validate: (value) => value === true || 'The parent or guardian must agree for a player under 18',
                  })}
                />
                <span className="ui-check__box" aria-hidden="true">
                  {consentGiven && <Check className="w-3 h-3" />}
                </span>
                <span className="type-body-s">The player&apos;s parent or guardian has agreed to this registration.</span>
              </label>
              {errors.guardianConsent && (
                <p id="coach-reg-guardianConsent-error" className="ui-field__error type-caption" role="alert">
                  {errors.guardianConsent.message}
                </p>
              )}
            </div>
          )}

          {duplicates && (
            <Notice tone="warning" title="This player may already be registered">
              <ul className="m-0 mb-3 pl-5">
                {duplicates.map((match) => (
                  <li key={match.loginId} className="type-body-s">
                    {match.name} · Player ID <code>{match.loginId}</code>{match.team ? ` · ${match.team}` : ' · no team'}
                  </li>
                ))}
              </ul>
              <p className="type-body-s m-0 mb-3">
                If this is the same child, don&apos;t register them again — ask them to join your team with that Player ID.
              </p>
              <Button variant="line" size="sm" loading={saving} onClick={handleSubmit((values) => submit(values, true))}>
                It&apos;s a different player — register anyway
              </Button>
            </Notice>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" className="flex-1" loading={saving} disabled={Boolean(coach && !coach.phone)} icon={saving ? null : UserPlus}>
              {saving ? 'Registering…' : 'Register player'}
            </Button>
            <Button variant="line" className="flex-1" onClick={close}>Cancel</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
};

RegisterPlayerDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onRegistered: PropTypes.func,
  onEnterAgeGroup: PropTypes.func,
  canEnterAgeGroup: PropTypes.bool,
};

export default RegisterPlayerDialog;
