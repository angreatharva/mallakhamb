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
 * admin never needs to know them. A returning coach is found by any part of
 * their name, phone, email or team; a new one is registered here. One who has
 * not set a default player password sets it here.
 */
const DeskCoachStep = ({ onReady }) => {
  const [query, setQuery] = useState('');
  const [looking, setLooking] = useState(false);
  const [results, setResults] = useState(null); // null: not searched yet
  const [registering, setRegistering] = useState(false);
  const [coach, setCoach] = useState(null);
  const [saving, setSaving] = useState(false);
  const create = useForm();
  const defaults = useForm();
  const team = useForm();

  const search = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) {
      toast.error('Type at least 2 letters of the coach’s name, phone, email or team');
      return;
    }
    setLooking(true);
    try {
      const res = await deskAPI.searchCoaches(query.trim());
      setResults(res.data?.data?.coaches || []);
      setRegistering(false);
    } catch (error) {
      toast.error(errorText(error, 'Could not search for the coach'));
    } finally {
      setLooking(false);
    }
  };

  /** Open the new-coach form, carrying over whatever was typed in the search. */
  const startRegistering = () => {
    const typed = query.trim();
    const digits = typed.replace(/\D/g, '');
    const [firstName, ...rest] = /^[A-Za-z][A-Za-z' -]*$/.test(typed) ? typed.split(/\s+/) : [];
    create.reset({
      email: /@/.test(typed) ? typed : '',
      phone: digits.length >= 10 && !/@/.test(typed) ? typed : '',
      firstName: firstName || '',
      lastName: rest.join(' '),
    });
    setRegistering(true);
    setCoach(null);
  };

  const pick = (found) => { setCoach(found); setRegistering(false); };
  const startOver = () => { setCoach(null); setResults(null); setRegistering(false); };

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

      {!coach && (
        <>
          <p className="type-body-s text-fg-muted m-0">
            Search for the coach by any part of their name, phone, email or team. If they have never
            registered, register them here.
          </p>
          <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" noValidate>
            <Field id="desk-coach-search" label="Name, phone, email or team">
              <Input type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <Button type="submit" variant="line" icon={Search} loading={looking}>Search</Button>
            <Button type="button" icon={UserPlus} onClick={startRegistering}>Register new coach</Button>
          </form>
        </>
      )}

      {!coach && !registering && results && results.length === 0 && (
        <Notice tone="info" title={`No coach matches “${query.trim()}”`}>
          <p className="m-0 mb-3 type-body-s">Try another part of their name or their phone number — or, if they are new, register them.</p>
          <Button size="sm" icon={UserPlus} onClick={startRegistering}>Register new coach</Button>
        </Notice>
      )}

      {!coach && !registering && results && results.length > 0 && (
        <ul className="grid gap-2 m-0 p-0 list-none" aria-label="Matching coaches">
          {results.map((c) => (
            <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 p-3 border border-line rounded-lg">
              <div className="grid gap-0.5 min-w-0">
                <span className="type-body-s font-bold">{`${c.firstName || ''} ${c.lastName || ''}`.trim()}</span>
                <span className="type-caption text-fg-muted break-all">
                  {c.team?.name || 'No team yet'} · {c.email}{c.phone ? ` · ${c.phone}` : ''}
                </span>
              </div>
              <Button size="sm" onClick={() => pick(c)}>This coach</Button>
            </li>
          ))}
        </ul>
      )}

      {!coach && registering && (
        <form onSubmit={createCoach} className="grid gap-4" noValidate>
          <Notice tone="info" title="Register a new coach">
            Hand the screen to the coach to check their details and choose both passwords.
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" icon={UserPlus} loading={saving}>Create coach account</Button>
            <Button type="button" variant="line" onClick={() => setRegistering(false)}>Back to search</Button>
          </div>
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
      {coach && <Button variant="ghost" size="sm" className="justify-self-start" onClick={startOver}>Choose a different coach</Button>}

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
