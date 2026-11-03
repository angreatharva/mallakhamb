import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Save } from 'lucide-react';

import { judgeAPI } from '@/services/public/judge.api';
import { accountAPI } from '@/services/api';
import { EmailSection, PasswordSection, SectionHeading } from '@/pages/shared/account/AccountSections';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';

import { AppHeader } from '@/components/shell';
import { Button, Field, Input, Panel, Select, TabPanel, Tabs, TextLink } from '@/components/ui';
import JudgeIdentity from './JudgeIdentity';
import JudgePanelHistory from './JudgePanelHistory';
import { useJudgeLogout } from './useJudgeLogout';

// "Marking insights" (docs/stats-plan.md §5c), loaded only when opened.
const JudgeStats = lazy(() => import('./JudgeStats'));

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'panels', label: 'Panels' },
  { id: 'stats', label: 'Marking insights' },
];

const CERTIFICATION_LEVELS = [
  { value: 'International', label: 'International' },
  { value: 'National', label: 'National' },
  { value: 'State', label: 'State' },
  { value: 'District', label: 'District' },
];

/**
 * JudgeProfile — the judge's own account, in the same shell as every other
 * role's (AccountProfile): masthead, identity, then tabs.
 *
 * Profile is where they manage their details and credentials. Panels lists
 * every seat they hold, finished competitions included — read-only, since
 * seats are given by organisers; choosing a category to judge stays on the
 * dashboard. Marking insights compares their marks with the rest of each panel.
 */
const JudgeProfile = () => {
  const location = useLocation();
  const handleLogout = useJudgeLogout();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'profile';
  const setTab = (next) => setParams(next === 'profile' ? {} : { tab: next });

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photo, setPhoto] = useState(null);
  // An email change in progress (the shared account endpoints own it).
  const [pendingEmailChange, setPendingEmailChange] = useState(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm();

  const load = useCallback(async () => {
    try {
      const [response, account] = await Promise.all([
        judgeAPI.getProfile(),
        accountAPI.get().catch(() => null),
      ]);
      const data = response.data?.data || {};
      setProfile(data);
      setPendingEmailChange(account?.data?.data?.pendingEmailChange || null);
      setPhoto(data.photo || null);
      resetProfile({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || '',
        stateUnit: data.stateUnit || '',
        registrationNumber: data.registrationNumber || '',
        certificationLevel: data.certificationLevel || '',
      });
    } catch (error) {
      logger.error('Could not load judge profile', error);
      toast.error(error.response?.data?.message || 'Could not load your profile');
    } finally {
      setLoading(false);
    }
  }, [resetProfile]);

  useEffect(() => { load(); }, [load]);

  // The account menu's "Change password" / "Update email" land on #password /
  // #email; scroll there once the sections are on the page.
  useEffect(() => {
    if (!profile || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [profile, location.hash]);

  const onSaveProfile = async (values) => {
    setSavingProfile(true);
    try {
      const response = await judgeAPI.updateProfile({
        ...values,
        certificationLevel: values.certificationLevel || null,
      });
      const updated = response.data?.data || {};
      setProfile(updated);

      // The judge pages read the signed-in judge from storage, so a rename has
      // to land there too or the dashboard keeps greeting the old name.
      const stored = secureStorage.getItem('judge_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          secureStorage.setItem('judge_user', JSON.stringify({
            ...parsed,
            name: updated.name,
            email: updated.email,
          }));
        } catch {
          // A corrupt entry is not worth failing a successful save over.
        }
      }

      toast.success('Profile updated');
    } catch (error) {
      logger.error('Could not update judge profile', error);
      toast.error(error.response?.data?.message || 'Could not update your profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <>
      <AppHeader fixed role="judge" segment={profile?.name || null} homeTo="/judge/dashboard" profileTo="/judge/profile" onLogout={handleLogout} />
      <main id="main-content" className="pt-16 bg-bg text-fg min-h-dvh">
      <div className={`${tab === 'profile' ? 'max-w-3xl' : 'max-w-6xl'} mx-auto px-[var(--pad)] py-8 space-y-6`}>
        <TextLink as={Link} to="/judge/dashboard" className="ui-link--quiet">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Dashboard
        </TextLink>

        {loading && (
          <p className="type-body-s text-fg-muted flex items-center gap-3 m-0" role="status">
            <span className="ui-spinner" aria-hidden="true" />
            Loading your profile…
          </p>
        )}

        {!loading && (
        <>
        <JudgeIdentity profile={profile} photo={photo} onPhotoChange={setPhoto} />

        <Tabs
          label="Profile sections"
          idBase="judge-profile"
          value={tab}
          onChange={setTab}
          tabs={TABS}
        />

        {tab === 'stats' && (
          <TabPanel idBase="judge-profile" tabId="stats" className="outline-none">
            <Suspense fallback={<p className="type-body-s text-fg-muted m-0">Loading insights…</p>}>
              <JudgeStats />
            </Suspense>
          </TabPanel>
        )}

        {tab === 'panels' && (
          <TabPanel idBase="judge-profile" tabId="panels" className="outline-none">
            <JudgePanelHistory assignments={profile?.assignments || []} title="Panels you sit on" />
          </TabPanel>
        )}

        {tab === 'profile' && (
        <div role="tabpanel" id="judge-profile-panel-profile" aria-labelledby="judge-profile-tab-profile" className="space-y-6">
        {/* Account details */}
        <Panel>
          <SectionHeading hint="Your details, and the credentials organisers see when staffing a panel.">
            My profile
          </SectionHeading>

          <form onSubmit={handleProfileSubmit(onSaveProfile)} noValidate className="grid gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field id="judge-profile-firstName" label="First Name" error={profileErrors.firstName?.message}>
                <Input
                  placeholder="First name"
                  autoComplete="given-name"
                  {...registerProfile('firstName', { required: 'First name is required' })}
                />
              </Field>

              <Field id="judge-profile-lastName" label="Last Name" error={profileErrors.lastName?.message}>
                <Input
                  placeholder="Last name"
                  autoComplete="family-name"
                  {...registerProfile('lastName', { required: 'Last name is required' })}
                />
              </Field>
            </div>

            <Field id="judge-profile-phone" label="Phone Number" error={profileErrors.phone?.message}>
              <Input
                type="tel"
                placeholder="Your phone number"
                {...registerProfile('phone', {
                  validate: (value) => {
                    if (!value) return true;
                    const digits = String(value).replace(/\D/g, '');
                    return (digits.length >= 10 && digits.length <= 15)
                      || 'Enter a valid phone number (10–15 digits)';
                  },
                })}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field id="judge-profile-stateUnit" label="State / Unit">
                <Input placeholder="e.g. Maharashtra" {...registerProfile('stateUnit')} />
              </Field>

              <Field id="judge-profile-registrationNumber" label="MFI Reg. No.">
                <Input placeholder="Optional" {...registerProfile('registrationNumber')} />
              </Field>
            </div>

            <Field id="judge-profile-certificationLevel" label="Certification Level">
              <Select {...registerProfile('certificationLevel')}>
                <option value="" disabled>Select level</option>
                {CERTIFICATION_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
                {/* A level no longer offered (Club) stays shown until the judge picks another. */}
                {profile?.certificationLevel && !CERTIFICATION_LEVELS.some((l) => l.value === profile.certificationLevel) && (
                  <option value={profile.certificationLevel}>{profile.certificationLevel}</option>
                )}
              </Select>
            </Field>

            <Button type="submit" block loading={savingProfile} icon={savingProfile ? null : Save}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Panel>

        {/* Password and email: the same sections every role's account page has. */}
        <PasswordSection role="judge" idPrefix="judge-profile" />
        {profile && (
          <EmailSection user={profile} userType="judge" pending={pendingEmailChange} onChanged={load} idPrefix="judge-profile" />
        )}
        </div>
        )}
        </>
        )}
      </div>
      </main>
    </>
  );
};

export default JudgeProfile;
