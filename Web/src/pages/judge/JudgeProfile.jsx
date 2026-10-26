import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, Save, Scale } from 'lucide-react';

import { judgeAPI } from '@/services/public/judge.api';
import { accountAPI } from '@/services/api';
import { EmailSection, PasswordSection, SectionHeading } from '@/pages/shared/account/AccountSections';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';

import AppearanceMenu from '@/components/layout/AppearanceMenu';
import {
  Button, Field, Heading, Input, Panel, Select, TabPanel, Tabs, Tag, TextLink,
} from '@/components/ui';

// "Marking insights" (docs/stats-plan.md §5c), loaded only when opened.
const JudgeStats = lazy(() => import('./JudgeStats'));

const CERTIFICATION_LEVELS = [
  { value: 'National', label: 'National' },
  { value: 'State', label: 'State' },
  { value: 'District', label: 'District' },
  { value: 'Club', label: 'Club' },
];

/**
 * Downscale a chosen image before it is sent.
 *
 * Photos are stored inline on the account (there is no object storage in this
 * project and the deployment disk is ephemeral), so the client is responsible
 * for keeping them small — a phone photo would otherwise blow past the API's
 * body limit.
 *
 * @param {File} file
 * @param {number} size - Longest edge, in pixels
 * @returns {Promise<string>} JPEG data URL
 */
const downscaleImage = (file, size = 256) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not an image'));
      image.onload = () => {
        const scale = Math.min(size / image.width, size / image.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/**
 * JudgeProfile — the judge's own account.
 *
 * Judges register themselves and own their credentials now; this is where they
 * manage them. The panels they sit on are shown on the dashboard instead —
 * that is the first thing a judge needs on opening the app, and it is not
 * something they can change from here in any case.
 */
const JudgeProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const photoInputRef = useRef(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stats' ? 'stats' : 'profile';
  const setTab = (next) => setParams(next === 'stats' ? { tab: 'stats' } : {});

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

  const onChangePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await downscaleImage(file);
      await judgeAPI.updateProfile({ photo: dataUrl });
      setPhoto(dataUrl);
      toast.success('Photo updated');
    } catch (error) {
      logger.error('Could not update judge photo', error);
      toast.error(error.response?.data?.message || error.message || 'Could not update your photo');
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <p className="type-body-s text-fg-muted flex items-center gap-3 m-0">
          <span className="ui-spinner" aria-hidden="true" />
          Loading your profile…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-[var(--pad)] py-8 bg-bg text-fg">
      <div className={`${tab === 'stats' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto space-y-6`}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <TextLink as="button" type="button" className="ui-link--quiet" onClick={() => navigate('/judge/dashboard')}>
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Dashboard
          </TextLink>
          <AppearanceMenu />
        </div>

        {/* Identity */}
        <Panel variant="feature">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <div className="w-20 h-20 overflow-hidden flex items-center justify-center bg-surface-raised rounded-[var(--radius-panel)]">
                {photo
                  ? <img src={photo} alt="" className="w-full h-full object-cover" />
                  : <Scale className="w-9 h-9 text-accent-fg" aria-hidden="true" />}
              </div>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="ui-btn ui-btn--solid ui-icon-btn absolute -bottom-2 -right-2"
                aria-label="Change photo"
              >
                <span className="ui-btn__label" style={{ display: 'contents' }}>
                  <Camera aria-hidden="true" />
                </span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onChangePhoto}
              />
            </div>

            <div className="min-w-0 grid gap-1">
              <Tag tone="ident">Judge</Tag>
              <Heading level={1} step="display-m" asIs className="truncate">{profile?.name}</Heading>
              <p className="text-fg-muted type-body-s truncate m-0">{profile?.email}</p>
            </div>
          </div>
        </Panel>

        <Tabs
          label="Profile sections"
          idBase="judge-profile"
          value={tab}
          onChange={setTab}
          tabs={[{ id: 'profile', label: 'Profile' }, { id: 'stats', label: 'Marking insights' }]}
        />

        {tab === 'stats' && (
          <TabPanel idBase="judge-profile" tabId="stats" className="outline-none">
            <Suspense fallback={<p className="type-body-s text-fg-muted m-0">Loading insights…</p>}>
              <JudgeStats />
            </Suspense>
          </TabPanel>
        )}

        {tab === 'profile' && (
        <div role="tabpanel" id="judge-profile-panel-profile" aria-labelledby="judge-profile-tab-profile" className="space-y-6">
        {/* Account details */}
        <Panel>
          <SectionHeading hint="Your details, and the credentials organisers see when staffing a panel.">
            Account
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
      </div>
    </div>
  );
};

export default JudgeProfile;
