import { useState } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Search, UserPlus, Users } from 'lucide-react';
import { deskAPI } from '@/services/user/desk.api';
import { Button, Field, Heading, Input, Notice, Panel, PasswordInput, SpecList } from '@/components/ui';
import { errorText } from './deskShared';

const PASSWORD_HELP = 'At least 8 characters, with an upper-case letter, a lower-case letter and a number.';
const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PHONE_RULE = {
  required: 'Phone number is required',
  validate: (v) => { const d = String(v || '').replace(/\D/g, ''); return (d.length >= 10 && d.length <= 15) || 'Enter 10 to 15 digits'; },
};

/**
 * Steps 1 and 2: who the coach is, and their team.
 *
 * The coach is at the desk and types their own passwords on this screen; the
 * admin never needs to know them. A returning coach is found by email; one
 * who has not set a default player password sets it here.
 */
const DeskCoachStep = ({ onReady }) => {
  const [email, setEmail] = useState('');
  const [looking, setLooking] = useState(false);
  const [coach, setCoach] = useState(undefined); // undefined: not looked up; null: none found
  const [saving, setSaving] = useState(false);
  const create = useForm();
  const defaults = useForm();
  const team = useForm();

  const lookUp = async (event) => {
    event?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error('Enter the coach’s email address');
      return;
    }
    setLooking(true);
    try {
      const res = await deskAPI.findCoach(email.trim());
      const found = res.data?.data?.coach || null;
      setCoach(found);
      if (!found) create.reset({ email: email.trim() });
    } catch (error) {
      toast.error(errorText(error, 'Could not look the coach up'));
    } finally {
      setLooking(false);
    }
  };

  const createCoach = create.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await deskAPI.createCoach(values);
      setCoach(res.data?.data);
      toast.success('Coach account created');
    } catch (error) {
      toast.error(errorText(error, 'Could not create the coach'));
    } finally {
      setSaving(false);
    }
  });

  const setDefault = defaults.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await deskAPI.setDefaultPassword(coach._id, values);
      setCoach(res.data?.data);
      toast.success('Default player password saved');
    } catch (error) {
      toast.error(errorText(error, 'Could not save the password'));
    } finally {
      setSaving(false);
    }
  });

  const makeTeam = team.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await deskAPI.ensureTeam(coach._id, values);
      const made = res.data?.data;
      setCoach({ ...coach, team: { _id: made._id, name: made.name } });
    } catch (error) {
      toast.error(errorText(error, 'Could not create the team'));
    } finally {
      setSaving(false);
    }
  });

  const needsDefault = coach && !coach.hasDefaultPlayerPassword;
  const needsPhone = coach && !coach.phone;
  const ready = coach && !needsDefault && coach.team;

  return (
    <Panel className="grid gap-5 p-5">
      <Heading level={3} step="display-s">Coach</Heading>

      <form onSubmit={lookUp} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
        <Field id="desk-coach-email" label="Coach’s email" required>
          <Input type="email" autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setCoach(undefined); }} />
        </Field>
        <Button type="submit" variant="line" icon={Search} loading={looking}>Find coach</Button>
      </form>

      {coach === null && (
        <form onSubmit={createCoach} className="grid gap-4" noValidate>
          <Notice tone="info" title="New coach">
            No account uses this email. Hand the screen to the coach to fill in their details and choose both passwords.
          </Notice>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="desk-coach-first" label="First name" required error={create.formState.errors.firstName?.message}>
              <Input autoComplete="off" {...create.register('firstName', { required: 'Required' })} />
            </Field>
            <Field id="desk-coach-last" label="Last name" required error={create.formState.errors.lastName?.message}>
              <Input autoComplete="off" {...create.register('lastName', { required: 'Required' })} />
            </Field>
            <Field id="desk-coach-mail" label="Email" required error={create.formState.errors.email?.message}>
              <Input type="email" autoComplete="off" {...create.register('email', { required: 'Required' })} />
            </Field>
            <Field id="desk-coach-phone" label="Phone" required help="The contact for the players they register." error={create.formState.errors.phone?.message}>
              <Input type="tel" inputMode="tel" autoComplete="off" {...create.register('phone', PHONE_RULE)} />
            </Field>
            <Field id="desk-coach-password" label="Coach’s password" required help="At least 8 characters." error={create.formState.errors.password?.message}>
              <PasswordInput autoComplete="new-password" {...create.register('password', { required: 'Required', minLength: { value: 8, message: 'At least 8 characters' } })} />
            </Field>
            <Field id="desk-coach-default" label="Default player password" required help={`Every player registered now starts with it. ${PASSWORD_HELP}`} error={create.formState.errors.playerDefaultPassword?.message}>
              <PasswordInput autoComplete="new-password" {...create.register('playerDefaultPassword', { required: 'Required', pattern: { value: STRONG, message: PASSWORD_HELP } })} />
            </Field>
          </div>
          <Button type="submit" icon={UserPlus} loading={saving}>Create coach account</Button>
        </form>
      )}

      {coach && (
        <SpecList items={[
          { label: 'Coach', value: `${coach.firstName || ''} ${coach.lastName || ''}`.trim() },
          { label: 'Email', value: coach.email },
          { label: 'Phone', value: coach.phone || '—' },
          { label: 'Team', value: coach.team?.name || 'No team yet' },
        ]} />
      )}

      {coach && !coach.isActive && (
        <Notice tone="warning" title="This coach’s account is deactivated">Entries can still be made, but they cannot sign in.</Notice>
      )}

      {needsDefault && (
        <form onSubmit={setDefault} className="grid gap-4" noValidate>
          <Notice tone="warning" title="No default player password yet">
            The coach chooses it now. Every player registered from this form signs in with their Player ID and this password.
          </Notice>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="desk-default-pw" label="Default player password" required help={PASSWORD_HELP} error={defaults.formState.errors.playerDefaultPassword?.message}>
              <PasswordInput autoComplete="new-password" {...defaults.register('playerDefaultPassword', { required: 'Required', pattern: { value: STRONG, message: PASSWORD_HELP } })} />
            </Field>
            {needsPhone && (
              <Field id="desk-default-phone" label="Coach’s phone" required error={defaults.formState.errors.phone?.message}>
                <Input type="tel" inputMode="tel" {...defaults.register('phone', PHONE_RULE)} />
              </Field>
            )}
          </div>
          <Button type="submit" loading={saving}>Save</Button>
        </form>
      )}

      {coach && !needsDefault && !coach.team && (
        <form onSubmit={makeTeam} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
          <Field id="desk-team-name" label="Team name" required error={team.formState.errors.name?.message}>
            <Input autoComplete="off" {...team.register('name', { required: 'Team name is required' })} />
          </Field>
          <Button type="submit" icon={Users} loading={saving}>Create team</Button>
        </form>
      )}

      {ready && <Button onClick={() => onReady(coach)}>Continue with {coach.team.name}</Button>}
    </Panel>
  );
};

DeskCoachStep.propTypes = { onReady: PropTypes.func.isRequired };

export default DeskCoachStep;
