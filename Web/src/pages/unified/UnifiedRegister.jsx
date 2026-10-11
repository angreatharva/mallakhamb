import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { Button, Field, Input, PasswordInput, Select, TextLink } from '@/components/ui';
import { AuthLayout, AuthHeader, AuthLinks } from '@/components/shell';

// API services
import { coachAPI, playerAPI } from '@/services/api';
import { judgeAPI } from '@/services/public/judge.api';


/**
 * Detect user role from route path.
 * @param {string} pathname - Current route pathname (e.g. "/coach/register")
 * @returns {'coach'|'player'|'judge'} Detected role
 */
const detectRoleFromPath = (pathname) => {
  const match = pathname.match(/^\/([^/]+)/);
  if (!match) return 'coach';
  const segment = match[1].toLowerCase();
  if (segment === 'player') return 'player';
  if (segment === 'judge') return 'judge';
  return 'coach';
};

/**
 * Role-specific configuration for UnifiedRegister.
 * @param {'coach'|'player'} role - The user role
 * @returns {Object} Configuration object with title, subtitle, description, and form fields
 */
const getRoleConfig = (role) => {
  // Role-specific content but unified structure
  const roleContent = {
    coach: {
      title: 'Coach',
      subtitle: 'Registration',
      description: 'Create your coach account to manage your team and compete.',
      accessLabel: 'Coach Registration',
    },
    player: {
      title: 'Player',
      subtitle: 'Registration',
      description: 'Register as a player, join your team, and compete in Mallakhamb.',
      accessLabel: 'Player Registration',
    },
    judge: {
      title: 'Judge',
      subtitle: 'Registration',
      description: 'Create your judge account. An organiser will add you to a competition panel.',
      accessLabel: 'Judge Registration',
    },
  };

  const content = roleContent[role] || roleContent.coach;

  // Unified configuration - same for all roles except content and colors
  return {
    title: content.title,
    subtitle: content.subtitle,
    description: content.description,
    accessLabel: content.accessLabel,
    formTitle: 'Create Account',
    formSubtitle: 'Enter your details to register',
    buttonText: 'Create Account',
    loginLink: `/${role}/login`,
  };
};

// ─── Field definitions ────────────────────────────────────────────────────────

/**
 * Shared phone rules. Mirrors the server's `phone()` validator
 * (Server/src/validators/common.validator.js): separators and a country code
 * are fine, but the digit count has to be plausible. Checked here too so the
 * user is told at the field rather than by a rejected submit.
 */
const PHONE_RULES = {
  required: 'Phone number is required',
  validate: (value) => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      return 'Enter a valid phone number (10–15 digits)';
    }
    return true;
  },
};

/**
 * Password rules, matching the server exactly
 * (Server/src/validators/common.validator.js `password()`, and the `minlength: 8`
 * on both models).
 *
 * This form previously asked for six characters and checked nothing else, so a
 * password like "secret" passed every field-level check and was then rejected
 * by the API — the user got a toast about a rule the form had just told them
 * they satisfied. ResetPassword.jsx already asked for eight; registration was
 * the odd one out.
 */
const PASSWORD_RULES = {
  required: 'Password is required',
  minLength: { value: 8, message: 'Password must be at least 8 characters' },
  validate: (value) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(String(value ?? '')) ||
    'Password needs an uppercase letter, a lowercase letter, and a number',
};

const COACH_FIELDS = [
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    placeholder: 'First name',
    autoComplete: 'given-name',
    rules: { required: 'First name is required' },
    half: true,
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    placeholder: 'Last name',
    autoComplete: 'family-name',
    rules: { required: 'Last name is required' },
    half: true,
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'coach@example.com',
    autoComplete: 'email',
    rules: {
      required: 'Email is required',
      pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
    },
  },
  {
    name: 'phone',
    label: 'Phone Number',
    type: 'tel',
    placeholder: 'Enter your phone number',
    autoComplete: 'tel',
    rules: PHONE_RULES,
  },
];

const PLAYER_FIELDS = [
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    placeholder: 'First name',
    autoComplete: 'given-name',
    rules: { required: 'First name is required' },
    half: true,
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    placeholder: 'Last name',
    autoComplete: 'family-name',
    rules: { required: 'Last name is required' },
    half: true,
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'you@example.com',
    autoComplete: 'email',
    rules: {
      required: 'Email is required',
      pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
    },
  },
  {
    name: 'phone',
    label: 'Phone Number',
    type: 'tel',
    placeholder: 'Enter your phone number',
    autoComplete: 'tel',
    rules: PHONE_RULES,
  },
  {
    name: 'dateOfBirth',
    label: 'Date of Birth',
    type: 'date',
    autoComplete: 'bday',
    rules: { required: 'Date of birth is required' },
    half: true,
  },
  // gender is rendered separately as a Select
];

/**
 * Judge registration fields.
 *
 * Name, address and phone identify the person; the three judging credentials
 * are optional and are what an organiser sees when searching for someone to
 * seat on a panel. Nothing here grants any access — an account with no panel
 * assignment can read nothing about any competition.
 */
const JUDGE_FIELDS = [
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    placeholder: 'First name',
    autoComplete: 'given-name',
    rules: { required: 'First name is required' },
    half: true,
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    placeholder: 'Last name',
    autoComplete: 'family-name',
    rules: { required: 'Last name is required' },
    half: true,
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    placeholder: 'judge@example.com',
    autoComplete: 'email',
    rules: {
      required: 'Email is required',
      pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
    },
  },
  {
    name: 'phone',
    label: 'Phone Number',
    type: 'tel',
    placeholder: 'Enter your phone number',
    autoComplete: 'tel',
    rules: PHONE_RULES,
  },
  {
    name: 'stateUnit',
    label: 'State / Unit',
    type: 'text',
    placeholder: 'e.g. Maharashtra',
    rules: {},
    half: true,
  },
  {
    name: 'registrationNumber',
    label: 'MFI Reg. No.',
    type: 'text',
    placeholder: 'Optional',
    rules: {},
    half: true,
  },
  // certificationLevel is rendered separately as a Select
];

/**
 * Where each role lands once it has an account.
 *
 * Registration itself is unchanged by the level flow — a level belongs to a
 * competition, not to a person, so nothing here records one. These are only the
 * hand-offs into the flow.
 */
const HOME_AFTER_REGISTER = {
  // A coach needs a squad before a meet will take them; create-team hands on to
  // the level chooser.
  coach: '/coach/create-team',
  // Level, then competition, then team: a squad only means something inside a
  // meet, and the teams endpoint is scoped by competition.
  player: '/player/select-level',
  // A new judge is on no panel yet; the dashboard says so and shows the seats
  // as soon as an organiser adds them.
  judge: '/judge/dashboard',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * UnifiedRegister - the registration page for coach, player and judge; the
 * role comes from the URL (/coach/register, /player/register, /judge/register).
 */
const UnifiedRegister = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const [loading, setLoading] = useState(false);

  const role = detectRoleFromPath(location.pathname);
  const config = getRoleConfig(role);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const passwordValue = watch('password');

  // Redirect if already authenticated
  useEffect(() => {
    if (user && userType === role) {
      navigate(HOME_AFTER_REGISTER[role] || '/');
    }
  }, [user, userType, role, navigate]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const apiService = role === 'coach' ? coachAPI : role === 'judge' ? judgeAPI : playerAPI;
      const response = await apiService.register(data);

      /*
       * The API wraps every auth payload as `{ success, data: { user, token } }`
       * (Server/src/utils/security/login-response.util.js), and the register
       * path returns the account under `user` rather than `player`/`coach`.
       *
       * This used to read `response.data.token` and `response.data[role]`, so
       * both came back undefined: `undefined` went into storage, the auth
       * context never got a user, and ProtectedRoute bounced the redirect to
       * the login page. Registration succeeded server-side, which is why it
       * looked like a routing quirk rather than a bug.
       *
       * Same unwrapping as UnifiedLogin, on purpose — these two must not drift.
       */
      const payload = response.data?.data || response.data || {};
      const { token } = payload;
      const userData = payload[role] || payload.user || payload.profile;

      if (!token || !userData) {
        throw new Error('Invalid registration response: missing token or user data');
      }

      // Store the token immediately for a player, before the redirect.
      if (role === 'player') {
        secureStorage.setItem('player_token', token);
        secureStorage.setItem('player_user', JSON.stringify(userData));
      }

      // The judge pages read their identity from storage rather than context.
      if (role === 'judge') {
        secureStorage.setItem('judge_token', token);
        secureStorage.setItem('judge_user', JSON.stringify(userData));
      }

      login(userData, token, role);
      toast.success('Registration successful!');

      const destination = HOME_AFTER_REGISTER[role] || '/';
      // Small delay ensures storage is committed before navigation
      setTimeout(() => navigate(destination), 100);
    } catch (error) {
      logger.error(`${role} registration error:`, error);
      toast.error(error.response?.data?.message || error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const fields = role === 'coach' ? COACH_FIELDS : role === 'judge' ? JUDGE_FIELDS : PLAYER_FIELDS;

  // Group half-width fields into pairs
  const renderFields = () => {
    const result = [];
    let i = 0;
    while (i < fields.length) {
      const field = fields[i];
      const next = fields[i + 1];
      if (field.half && next?.half) {
        result.push(
          <div key={`pair-${i}`} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderField(field)}
            {renderField(next)}
          </div>
        );
        i += 2;
      } else {
        result.push(renderField(field));
        i += 1;
      }
    }
    return result;
  };

  const renderField = (field) => (
    <Field
      key={field.name}
      id={`${role}-reg-${field.name}`}
      label={field.label}
      required={!!field.rules?.required}
      error={errors[field.name]?.message}
    >
      <Input
        type={field.type}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
        {...register(field.name, field.rules)}
      />
    </Field>
  );

  return (
    <AuthLayout role={role} title={config.title} lede={config.description}>
      <AuthHeader tag={config.accessLabel} title={config.formTitle} lede={config.formSubtitle} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label={`${config.title} registration form`} className="grid gap-5">
        {renderFields()}

        {/* Gender (player only) */}
        {role === 'player' && (
          <Field id="player-reg-gender" label="Gender" required error={errors.gender?.message}>
            <Select {...register('gender', { required: 'Gender is required' })}>
              <option value="" disabled>Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </Select>
          </Field>
        )}

        {/* Certification level (judge only) */}
        {role === 'judge' && (
          <Field id="judge-reg-certificationLevel" label="Certification Level">
            <Select {...register('certificationLevel')}>
              <option value="" disabled>Select level (optional)</option>
              <option value="National">National</option>
              <option value="State">State</option>
              <option value="District">District</option>
              <option value="Club">Club</option>
            </Select>
          </Field>
        )}

        <Field id={`${role}-reg-password`} label="Password" required error={errors.password?.message}>
          <PasswordInput
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            {...register('password', PASSWORD_RULES)}
          />
        </Field>

        <Field id={`${role}-reg-confirmPassword`} label="Confirm Password" required error={errors.confirmPassword?.message}>
          <PasswordInput
            placeholder="Re-enter your password"
            autoComplete="new-password"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) =>
                value === passwordValue || 'Passwords do not match',
            })}
          />
        </Field>

        <Button type="submit" size="lg" block loading={loading} iconRight={loading ? null : ArrowRight}>
          {loading ? 'Creating Account...' : config.buttonText}
        </Button>
      </form>

      <AuthLinks>
        <TextLink as={Link} to="/" className="ui-link--quiet">← Home</TextLink>
        <span className="shell-auth__links-end">
          <TextLink as={Link} to={config.loginLink}>Sign in</TextLink>
        </span>
      </AuthLinks>
    </AuthLayout>
  );
};

export default UnifiedRegister;
