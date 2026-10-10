import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Camera, Hash, Lock, Mail, MapPin, Phone, Save, Scale, User,
} from 'lucide-react';

import { judgeAPI } from '@/services/public/judge.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';

import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton, ThemedSelect } from '../../components/design-system/forms';
import { GlassCard } from '../../components/design-system/cards';
import { alpha } from '@/styles/tokens';
import AppearanceMenu from '@/components/layout/AppearanceMenu';

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

const SectionHeading = ({ children, hint }) => {
  const theme = useTheme();
  return (
    <div className="mb-5">
      <h2 className="text-lg font-black text-ink">{children}</h2>
      {hint && <p className="text-fg-muted text-xs mt-1">{hint}</p>}
      <div
        className="h-px mt-3"
        style={{ background: `linear-gradient(90deg, ${alpha(theme.colors.primary, 0x40)}, transparent)` }}
      />
    </div>
  );
};

const Field = ({ id, label, icon, error, children }) => {
  const theme = useTheme();
  return (
    <div>
      <label
        htmlFor={id}
        className="block type-tag mb-2 text-accent-fg"
      >
        {label}
      </label>
      {children}
      {error && <p className="text-xs mt-1.5 text-danger-fg" role="alert">{error}</p>}
    </div>
  );
};

const JudgeProfileInner = () => {
  const navigate = useNavigate();
  const theme = useTheme();
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
      <div className="min-h-dvh flex items-center justify-center" style={{ background: theme.colors.background }}>
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 border-2 border-ink/10 rounded-full animate-spin"
            style={{ borderTopColor: theme.colors.primary }}
          />
          <span className="text-fg-muted text-sm">Loading your profile…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh px-4 py-8" style={{ background: theme.colors.background }}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/judge/dashboard')}
            className="flex items-center gap-2 text-fg-muted hover:text-ink/80 transition-colors text-sm min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
          <AppearanceMenu />
        </div>

        {/* Identity card */}
        <GlassCard className="p-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ background: `${alpha(theme.colors.primary, 0x15)}`, border: `1px solid ${alpha(theme.colors.primary, 0x35)}` }}
              >
                {photo
                  ? <img src={photo} alt="" className="w-full h-full object-cover" />
                  : <Scale className="w-9 h-9 text-accent-fg" aria-hidden="true" />}
              </div>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 w-9 h-9 max-md:w-11 max-md:h-11 tap-safe rounded-xl flex items-center justify-center transition-transform hover:scale-105"
                style={{ background: theme.colors.primary }}
                aria-label="Change photo"
              >
                <Camera className="w-4 h-4 text-on-accent" aria-hidden="true" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onChangePhoto}
              />
            </div>

            <div className="min-w-0">
              <p className="type-tag text-accent-fg">
                Judge
              </p>
              <h1 className="text-2xl font-black text-ink mt-0.5 truncate">{profile?.name}</h1>
              <p className="text-fg-muted text-sm truncate">{profile?.email}</p>
            </div>
          </div>
        </GlassCard>

        {/* Account details */}
        <GlassCard className="p-6">
          <SectionHeading hint="Your details, and the credentials organisers see when staffing a panel.">
            Account
          </SectionHeading>

          <form onSubmit={handleProfileSubmit(onSaveProfile)} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="judge-profile-firstName" label="First Name" error={profileErrors.firstName?.message}>
                <ThemedInput
                  id="judge-profile-firstName"
                  icon={User}
                  placeholder="First name"
                  autoComplete="given-name"
                  error={profileErrors.firstName?.message}
                  {...registerProfile('firstName', { required: 'First name is required' })}
                />
              </Field>

              <Field id="judge-profile-lastName" label="Last Name" error={profileErrors.lastName?.message}>
                <ThemedInput
                  id="judge-profile-lastName"
                  icon={User}
                  placeholder="Last name"
                  autoComplete="family-name"
                  error={profileErrors.lastName?.message}
                  {...registerProfile('lastName', { required: 'Last name is required' })}
                />
              </Field>
            </div>

            <Field id="judge-profile-email" label="Email Address" error={profileErrors.email?.message}>
              <ThemedInput
                id="judge-profile-email"
                icon={Mail}
                type="email"
                placeholder="you@example.com"
                error={profileErrors.email?.message}
                {...registerProfile('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
                })}
              />
            </Field>

            <Field id="judge-profile-phone" label="Phone Number" error={profileErrors.phone?.message}>
              <ThemedInput
                id="judge-profile-phone"
                icon={Phone}
                type="tel"
                placeholder="Your phone number"
                error={profileErrors.phone?.message}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="judge-profile-stateUnit" label="State / Unit">
                <ThemedInput
                  id="judge-profile-stateUnit"
                  icon={MapPin}
                  placeholder="e.g. Maharashtra"
                  {...registerProfile('stateUnit')}
                />
              </Field>

              <Field id="judge-profile-registrationNumber" label="MFI Reg. No.">
                <ThemedInput
                  id="judge-profile-registrationNumber"
                  icon={Hash}
                  placeholder="Optional"
                  {...registerProfile('registrationNumber')}
                />
              </Field>
            </div>

            <Field id="judge-profile-certificationLevel" label="Certification Level">
              <ThemedSelect
                id="judge-profile-certificationLevel"
                placeholder="Select level"
                options={CERTIFICATION_LEVELS}
                {...registerProfile('certificationLevel')}
              />
            </Field>

            <ThemedButton type="submit" loading={savingProfile} disabled={savingProfile} className="w-full">
              <Save className="w-4 h-4 mr-2" aria-hidden="true" />
              {savingProfile ? 'Saving…' : 'Save changes'}
            </ThemedButton>
          </form>
        </GlassCard>

        {/* Password */}
        <GlassCard className="p-6">
          <SectionHeading hint="Your current password is required — an open session alone is not enough.">
            Password
          </SectionHeading>

          <form onSubmit={handlePasswordSubmit(onChangePassword)} noValidate className="space-y-4">
            <Field
              id="judge-profile-currentPassword"
              label="Current Password"
              error={passwordErrors.currentPassword?.message}
            >
              <ThemedInput
                id="judge-profile-currentPassword"
                icon={Lock}
                type="password"
                autoComplete="current-password"
                error={passwordErrors.currentPassword?.message}
                {...registerPassword('currentPassword', { required: 'Current password is required' })}
              />
            </Field>

            <Field
              id="judge-profile-newPassword"
              label="New Password"
              error={passwordErrors.newPassword?.message}
            >
              <ThemedInput
                id="judge-profile-newPassword"
                icon={Lock}
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                error={passwordErrors.newPassword?.message}
                {...registerPassword('newPassword', {
                  required: 'New password is required',
                  minLength: { value: 8, message: 'Password must be at least 8 characters' },
                  validate: (value) =>
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value ?? ''))
                    || 'Password needs an uppercase letter, a lowercase letter, and a number',
                })}
              />
            </Field>

            <Field
              id="judge-profile-confirmPassword"
              label="Confirm New Password"
              error={passwordErrors.confirmPassword?.message}
            >
              <ThemedInput
                id="judge-profile-confirmPassword"
                icon={Lock}
                type="password"
                autoComplete="new-password"
                error={passwordErrors.confirmPassword?.message}
                {...registerPassword('confirmPassword', {
                  required: 'Please confirm your new password',
                  validate: (value) =>
                    value === watchPassword('newPassword') || 'Passwords do not match',
                })}
              />
            </Field>

            <ThemedButton type="submit" loading={savingPassword} disabled={savingPassword} className="w-full">
              {savingPassword ? 'Changing…' : 'Change password'}
            </ThemedButton>
          </form>
        </GlassCard>
      </div>
    </div>
  );
};

/**
 * JudgeProfile — the judge's own account.
 *
 * Judges register themselves and own their credentials now; this is where they
 * manage them. The panels they sit on are shown on the dashboard instead —
 * that is the first thing a judge needs on opening the app, and it is not
 * something they can change from here in any case.
 */
const JudgeProfile = () => (
  <ThemeProvider role="judge">
    <JudgeProfileInner />
  </ThemeProvider>
);

export default JudgeProfile;
