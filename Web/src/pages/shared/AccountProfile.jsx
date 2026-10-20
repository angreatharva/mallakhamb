import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { accountAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCompetition } from '@/contexts/CompetitionContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { getRoleFromPath } from '@/utils/auth/roleFromPath';
import { AppHeader } from '@/components/shell';
import { Button, Field, Heading, Input, Panel, Select, Tag, TextLink } from '@/components/ui';
import { EmailSection, PasswordSection, SectionHeading } from './account/AccountSections';
import { RELATIONS } from '@/pages/player/registration/playerRegistration';
import PlayerDefaultPasswordSection from '@/pages/coach/PlayerDefaultPasswordSection';

const ROLE_NAME = { player: 'Player', coach: 'Coach', admin: 'Admin', superadmin: 'Super Admin' };

const PHONE_RULE = {
  validate: (value) => {
    if (!value) return true;
    const digits = String(value).replace(/\D/g, '');
    return (digits.length >= 10 && digits.length <= 15) || 'Enter a valid phone number (10–15 digits)';
  },
};

/** The details form's starting values, for whichever role this is. */
const formValues = (user) => ({
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  name: user.name || '',
  phone: user.phone || '',
  guardian: {
    name: user.guardian?.name || '',
    relation: user.guardian?.relation || '',
    phone: user.guardian?.phone || '',
  },
  stateUnit: user.stateUnit || '',
  registrationNumber: user.registrationNumber || '',
  dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
  gender: user.gender || '',
});

/**
 * The account page behind the top-right menu, for players, coaches, admins and
 * super admins (judges keep JudgeProfile, which adds their photo and shares the
 * password and email sections from here).
 *
 * `#password` and `#email` in the URL scroll to those sections, which is how
 * the menu's "Change password" and "Update email" land on them.
 */
const AccountProfile = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, login } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  const role = getRoleFromPath(location.pathname);

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const load = useCallback(async () => {
    try {
      const response = await accountAPI.get();
      const data = response.data?.data;
      setAccount(data);
      reset(formValues(data.user));
    } catch (error) {
      logger.error('Could not load account', error);
      toast.error(error.response?.data?.message || 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  }, [reset]);

  useEffect(() => { load(); }, [load]);

  // Scroll to the section the menu asked for, once it is on the page.
  useEffect(() => {
    if (!account || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [account, location.hash]);

  const user = account?.user;
  const userType = account?.userType;
  const isPlayer = userType === 'player';
  const isAdmin = userType === 'admin';
  // Date of birth and gender decide the player's age group; once on a team
  // only an organiser changes them (the server enforces the same rule).
  const identityLocked = isPlayer && Boolean(user?.team);
  const needsGuardian = isPlayer && (user?.emailType || 'self') !== 'self';

  const onSave = async (values) => {
    setSaving(true);
    try {
      const changes = isAdmin
        ? { name: values.name }
        : { firstName: values.firstName, lastName: values.lastName, phone: values.phone };
      if (isPlayer) {
        Object.assign(changes, { guardian: values.guardian, stateUnit: values.stateUnit, registrationNumber: values.registrationNumber });
        if (!identityLocked) Object.assign(changes, { dateOfBirth: values.dateOfBirth, gender: values.gender });
      }
      const response = await accountAPI.update(changes);
      const data = response.data?.data;
      setAccount(data);
      reset(formValues(data.user));
      // The header greets the stored user; keep it in step with a rename.
      const stored = secureStorage.getItem(`${role}_user`);
      if (stored) login({ ...JSON.parse(stored), ...data.user }, null, role);
      toast.success('Profile updated');
    } catch (error) {
      logger.error('Could not update profile', error);
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not update your profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
  };

  const dashboard = `/${role}/dashboard`;
  const displayName = user ? (user.name || [user.firstName, user.lastName].filter(Boolean).join(' ')) : '';

  return (
    <>
      <AppHeader fixed role={role} homeTo={dashboard} onLogout={handleLogout} profileTo={`/${role}/profile`} />
      <main id="main-content" className="pt-16 bg-bg text-fg min-h-dvh">
        <div className="max-w-3xl mx-auto px-[var(--pad)] py-8 space-y-6">
          <TextLink as={Link} to={dashboard} className="ui-link--quiet">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Dashboard
          </TextLink>

          {loading && (
            <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
              <span className="ui-spinner" aria-hidden="true" />
              Loading your profile…
            </p>
          )}

          {user && (
            <>
              <Panel variant="feature">
                <div className="grid gap-2 min-w-0">
                  <Tag tone="ident">{ROLE_NAME[role] || 'Account'}</Tag>
                  <Heading level={1} step="display-m" asIs className="break-words">{displayName}</Heading>
                  <dl className="grid gap-x-6 gap-y-1 m-0 sm:grid-cols-[auto_1fr]">
                    {isPlayer && user.loginId && (
                      <>
                        <dt className="type-tag text-fg-secondary">Player ID</dt>
                        <dd className="m-0 type-body break-all">{user.loginId}</dd>
                      </>
                    )}
                    <dt className="type-tag text-fg-secondary">Email</dt>
                    <dd className="m-0 type-body break-all">{user.email || 'None'}</dd>
                  </dl>
                </div>
              </Panel>

              <Panel id="details" className="scroll-mt-24" aria-labelledby="account-details-title">
                <SectionHeading hint={identityLocked ? 'Your date of birth and gender are set by your team entry. Ask an organiser to correct them.' : null}>
                  <span id="account-details-title">My profile</span>
                </SectionHeading>
                <form onSubmit={handleSubmit(onSave)} noValidate className="grid gap-5">
                  {isAdmin ? (
                    <Field id="account-name" label="Name" required error={errors.name?.message}>
                      <Input autoComplete="name" {...register('name', { required: 'Name is required' })} />
                    </Field>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <Field id="account-firstName" label="First Name" required error={errors.firstName?.message}>
                        <Input autoComplete="given-name" {...register('firstName', { required: 'First name is required' })} />
                      </Field>
                      <Field id="account-lastName" label="Last Name" error={errors.lastName?.message}>
                        <Input autoComplete="family-name" {...register('lastName')} />
                      </Field>
                    </div>
                  )}

                  {!isAdmin && (
                    <Field id="account-phone" label="Phone Number" error={errors.phone?.message}>
                      <Input type="tel" autoComplete="tel" {...register('phone', PHONE_RULE)} />
                    </Field>
                  )}

                  {isPlayer && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field id="account-dateOfBirth" label="Date of Birth" error={errors.dateOfBirth?.message}>
                          <Input type="date" disabled={identityLocked} {...register('dateOfBirth')} />
                        </Field>
                        <Field id="account-gender" label="Gender">
                          <Select disabled={identityLocked} {...register('gender')}>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </Select>
                        </Field>
                      </div>

                      <Field id="account-guardian-name" label="Parent/Guardian Name" required={needsGuardian} error={errors.guardian?.name?.message}>
                        <Input {...register('guardian.name', needsGuardian ? { required: 'Parent/guardian name is required' } : {})} />
                      </Field>
                      <Field id="account-guardian-relation" label="Relation to Player">
                        <Select {...register('guardian.relation')}>
                          <option value="">Select</option>
                          {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </Field>
                      <Field id="account-guardian-phone" label="Parent/Guardian Phone" required={needsGuardian} error={errors.guardian?.phone?.message}>
                        <Input
                          type="tel"
                          {...register('guardian.phone', {
                            ...PHONE_RULE,
                            ...(needsGuardian && { required: 'Parent/guardian phone is required' }),
                          })}
                        />
                      </Field>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <Field id="account-stateUnit" label="State / Unit">
                          <Input {...register('stateUnit')} />
                        </Field>
                        <Field id="account-registrationNumber" label="MFI Reg. No.">
                          <Input placeholder="Optional" {...register('registrationNumber')} />
                        </Field>
                      </div>
                    </>
                  )}

                  <Button type="submit" block loading={saving} icon={saving ? null : Save}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </form>
              </Panel>

              <PasswordSection role={role} idPrefix="account" />
              {userType === 'coach' && <PlayerDefaultPasswordSection idPrefix="account" />}
              <EmailSection user={user} userType={userType} pending={account.pendingEmailChange} onChanged={load} idPrefix="account" />
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default AccountProfile;
