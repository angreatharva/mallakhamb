import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, Save, Scale } from 'lucide-react';

import { judgeAPI } from '@/services/public/judge.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';

import AppearanceMenu from '@/components/layout/AppearanceMenu';
import {
  Button, Field, Heading, Input, PasswordInput, Panel, Select, Tag, TextLink,
} from '@/components/ui';

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

const SectionHeading = ({ children, hint }) => (
  <div className="mb-5 grid gap-1">
    <Heading level={2} step="display-s">{children}</Heading>
    {hint && <p className="text-fg-muted type-caption m-0">{hint}</p>}
  </div>
);

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
  const photoInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [photo, setPhoto] = useState(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm();

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    watch: watchPassword,
    formState: { errors: passwordErrors },
  } = useForm();

  const load = useCallback(async () => {
    try {
      const response = await judgeAPI.getProfile();
      const data = response.data?.data || {};
      setProfile(data);
      setPhoto(data.photo || null);
      resetProfile({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
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

  const onChangePassword = async (values) => {
    setSavingPassword(true);
    try {
      await judgeAPI.changePassword(values.currentPassword, values.newPassword);
      resetPassword();
      toast.success('Password changed');
    } catch (error) {
      logger.error('Could not change judge password', error);
      toast.error(error.response?.data?.message || 'Could not change your password');
    } finally {
      setSavingPassword(false);
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
      <div className="max-w-3xl mx-auto space-y-6">
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

            <Field id="judge-profile-email" label="Email Address" error={profileErrors.email?.message}>
              <Input
                type="email"
                placeholder="you@example.com"
                {...registerProfile('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
                })}
              />
            </Field>

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

        {/* Password */}
        <Panel>
          <SectionHeading hint="Your current password is required — an open session alone is not enough.">
            Password
          </SectionHeading>

          <form onSubmit={handlePasswordSubmit(onChangePassword)} noValidate className="grid gap-5">
            <Field id="judge-profile-currentPassword" label="Current Password" error={passwordErrors.currentPassword?.message}>
              <PasswordInput
                autoComplete="current-password"
                {...registerPassword('currentPassword', { required: 'Current password is required' })}
              />
            </Field>

            <Field id="judge-profile-newPassword" label="New Password" error={passwordErrors.newPassword?.message}>
              <PasswordInput
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                {...registerPassword('newPassword', {
                  required: 'New password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  validate: (value) =>
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value ?? ''))
                    || 'Password needs an uppercase letter, a lowercase letter, and a number',
                })}
              />
            </Field>

            <Field id="judge-profile-confirmPassword" label="Confirm New Password" error={passwordErrors.confirmPassword?.message}>
              <PasswordInput
                autoComplete="new-password"
                {...registerPassword('confirmPassword', {
                  required: 'Please confirm your new password',
                  validate: (value) =>
                    value === watchPassword('newPassword') || 'Passwords do not match',
                })}
              />
            </Field>

            <Button type="submit" variant="line" block loading={savingPassword}>
              {savingPassword ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
};

export default JudgeProfile;
