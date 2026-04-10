import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Phone,
  Building,
  Calendar,
  UserCheck,
  UserPlus,
  Users,
  Trophy,
  Layers,
  Flame,
  Dumbbell,
  Star,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import BHALogo from '../../assets/BHA.png';
import { secureStorage } from '../../utils/secureStorage';
import { logger } from '../../utils/logger';

// Design system
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton, ThemedSelect } from '../../components/design-system/forms';
import { HexMesh, RadialBurst } from '../../components/design-system/backgrounds';
import { CoachOrnament, GradientText } from '../../components/design-system/ornaments';
import { useReducedMotion } from '../../components/design-system/animations';

// API services
import { coachAPI, playerAPI } from '../../services/api';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Detect user role from route path.
 * @param {string} pathname - Current route pathname (e.g. "/coach/register")
 * @returns {'coach'|'player'} Detected role
 */
const detectRoleFromPath = (pathname) => {
  const match = pathname.match(/^\/([^/]+)/);
  if (!match) return 'coach';
  const segment = match[1].toLowerCase();
  return segment === 'player' ? 'player' : 'coach';
};

/**
 * Role-specific configuration for UnifiedRegister.
 * @param {'coach'|'player'} role - The user role
 * @returns {Object} Configuration object with title, subtitle, description, and form fields
 */
const getRoleConfig = (role) => {
  const configs = {
    coach: {
      title: 'Coach',
      subtitle: 'Registration',
      description: 'Create your coach account to manage your team and compete.',
      accessLabel: 'Coach Registration',
      formTitle: 'Create Account',
      formSubtitle: 'Register as a coach',
      buttonText: 'Create Account',
      ornament: CoachOrnament,
      background: HexMesh,
      icon: UserCheck,
      features: [
        { icon: Users, label: 'Manage' },
        { icon: Trophy, label: 'Compete' },
        { icon: Layers, label: 'Organize' },
      ],
      loginLink: '/coach/login',
    },
    player: {
      title: 'Athlete',
      subtitle: 'Registration',
      description: 'Register as a player, join your team, and compete in Mallakhamb.',
      accessLabel: 'Player Registration',
      formTitle: 'Create Account',
      formSubtitle: 'Register as a player',
      buttonText: 'Create Account',
      ornament: ({ color }) => (
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}
        >
          <motion.div
            className="absolute w-24 h-24 rounded-full border"
            style={{ borderColor: `${color}30` }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}15)`,
              border: `1px solid ${color}40`,
              boxShadow: `0 0 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}
          >
            <UserPlus className="w-10 h-10" style={{ color }} aria-hidden="true" />
          </div>
        </motion.div>
      ),
      background: RadialBurst,
      icon: UserPlus,
      features: [
        { icon: Flame, label: 'Compete' },
        { icon: Dumbbell, label: 'Train' },
        { icon: Star, label: 'Excel' },
      ],
      loginLink: '/player/login',
    },
  };
  return configs[role] || configs.coach;
};

// ─── Field definitions ────────────────────────────────────────────────────────

const COACH_FIELDS = [
  {
    name: 'name',
    label: 'Full Name',
    type: 'text',
    icon: User,
    placeholder: 'Enter your full name',
    autoComplete: 'name',
    rules: { required: 'Name is required' },
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    icon: Mail,
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
    icon: Phone,
    placeholder: 'Enter your phone number',
    autoComplete: 'tel',
    rules: { required: 'Phone number is required' },
  },
  {
    name: 'organization',
    label: 'Organization',
    type: 'text',
    icon: Building,
    placeholder: 'Your club or organization (optional)',
    autoComplete: 'organization',
    rules: {},
  },
];

const PLAYER_FIELDS = [
  {
    name: 'firstName',
    label: 'First Name',
    type: 'text',
    icon: User,
    placeholder: 'First name',
    autoComplete: 'given-name',
    rules: { required: 'First name is required' },
    half: true,
  },
  {
    name: 'lastName',
    label: 'Last Name',
    type: 'text',
    icon: User,
    placeholder: 'Last name',
    autoComplete: 'family-name',
    rules: { required: 'Last name is required' },
    half: true,
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    icon: Mail,
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
    icon: Phone,
    placeholder: 'Enter your phone number',
    autoComplete: 'tel',
    rules: { required: 'Phone number is required' },
  },
  {
    name: 'dateOfBirth',
    label: 'Date of Birth',
    type: 'date',
    icon: Calendar,
    autoComplete: 'bday',
    rules: { required: 'Date of birth is required' },
    half: true,
  },
  // gender is rendered separately as a ThemedSelect
];

// ─── Inner component (uses theme context) ─────────────────────────────────────

/**
 * UnifiedRegisterInner - Registration form that adapts to coach or player role.
 */
const UnifiedRegisterInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const theme = useTheme();
  useReducedMotion(); // Initialize for accessibility

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      navigate(role === 'coach' ? '/coach/create-team' : '/player/select-team');
    }
  }, [user, userType, role, navigate]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const apiService = role === 'coach' ? coachAPI : playerAPI;
      const response = await apiService.register(data);
      const { token } = response.data;
      const userData = response.data[role]; // coach or player object

      // Store token immediately for player (mirrors existing PlayerRegister behaviour)
      if (role === 'player') {
        secureStorage.setItem('player_token', token);
        secureStorage.setItem('player_user', JSON.stringify(userData));
      }

      login(userData, token, role);
      toast.success('Registration successful!');

      const destination = role === 'coach' ? '/coach/create-team' : '/player/select-team';
      // Small delay ensures storage is committed before navigation
      setTimeout(() => navigate(destination), 100);
    } catch (error) {
      logger.error(`${role} registration error:`, error);
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const BackgroundComponent = config.background;
  const OrnamentComponent = config.ornament;
  const IconComponent = config.icon;
  const fields = role === 'coach' ? COACH_FIELDS : PLAYER_FIELDS;

  // Group half-width player fields into pairs
  const renderFields = () => {
    const result = [];
    let i = 0;
    while (i < fields.length) {
      const field = fields[i];
      const next = fields[i + 1];
      if (field.half && next?.half) {
        result.push(
          <div key={`pair-${i}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderField(field)}
            {renderField(next)}
          </div>
        );
        i += 2;
      } else {
        result.push(<div key={field.name}>{renderField(field)}</div>);
        i += 1;
      }
    }
    return result;
  };

  const renderField = (field) => (
    <div key={field.name}>
      <label
        htmlFor={`${role}-reg-${field.name}`}
        className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
        style={{ color: `${theme.colors.primary}90` }}
      >
        {field.label}
        {field.rules?.required && (
          <span style={{ color: '#EF4444' }} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <ThemedInput
        id={`${role}-reg-${field.name}`}
        icon={field.icon}
        type={field.type}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
        error={errors[field.name]?.message}
        aria-required={!!field.rules?.required}
        aria-describedby={errors[field.name] ? `${role}-reg-${field.name}-error` : undefined}
        {...register(field.name, field.rules)}
      />
      <AnimatePresence>
        {errors[field.name] && (
          <motion.p
            id={`${role}-reg-${field.name}-error`}
            className="text-xs mt-1.5"
            style={{ color: '#EF4444' }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            aria-live="polite"
          >
            {errors[field.name].message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div
      className="min-h-dvh flex relative overflow-hidden"
      style={{ background: theme.colors.background, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Left decorative panel (desktop only) ── */}
      <div
        className="hidden lg:flex flex-col items-center justify-center w-[45%] relative border-r"
        style={{ background: theme.colors.card, borderColor: theme.colors.border }}
      >
        <BackgroundComponent color={theme.colors.primary} />

        <div className="relative z-10 text-center px-12">
          <motion.div
            className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}
          >
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain opacity-80" />
          </motion.div>

          <div className="mb-10">
            <OrnamentComponent color={theme.colors.primary} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}
          >
            <p
              className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: `${theme.colors.primary}80` }}
            >
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3">
              <GradientText
                colors={[theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark]}
              >
                {config.title}
                <br />
                {config.subtitle}
              </GradientText>
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              {config.description}
            </p>
          </motion.div>

          <motion.div
            className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {config.features.map(({ icon: FeatureIcon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: `${theme.colors.primary}12`,
                    border: `1px solid ${theme.colors.primary}25`,
                  }}
                >
                  <FeatureIcon
                    className="w-4 h-4"
                    style={{ color: theme.colors.primary }}
                    aria-hidden="true"
                  />
                </div>
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: `${theme.colors.primary}60` }}
                >
                  {label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.colors.primary}40, transparent)`,
          }}
        />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12 overflow-y-auto">
        {/* Mobile background glow */}
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 50% 30%, ${theme.colors.primary}10, transparent 65%)`,
            }}
          />
        </div>

        {/* Mobile logo */}
        <motion.div
          className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}
        >
          <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-75" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: theme.colors.primary }}
            >
              Mallakhamb
            </p>
            <p className="text-white/30 text-[10px]">{config.title} Portal</p>
          </div>
        </motion.div>

        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          {/* Form header */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="lg:hidden mb-5 flex justify-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: `${theme.colors.primary}15`,
                  border: `1px solid ${theme.colors.primary}35`,
                }}
              >
                <IconComponent
                  className="w-8 h-8"
                  style={{ color: theme.colors.primary }}
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div
                className="h-px flex-1"
                style={{
                  background: `linear-gradient(90deg, ${theme.colors.primary}40, transparent)`,
                }}
              />
              <span
                className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${theme.colors.primary}70` }}
              >
                {config.accessLabel}
              </span>
              <div
                className="h-px flex-1"
                style={{
                  background: `linear-gradient(90deg, transparent, ${theme.colors.primary}40)`,
                }}
              />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">{config.formTitle}</h2>
            <p className="text-white/35 text-sm mt-1">{config.formSubtitle}</p>
          </motion.div>

          {/* Registration form */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            aria-label={`${config.title} registration form`}
          >
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {/* Role-specific fields */}
              {renderFields()}

              {/* Gender select (player only) */}
              {role === 'player' && (
                <div>
                  <label
                    htmlFor="player-reg-gender"
                    className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                    style={{ color: `${theme.colors.primary}90` }}
                  >
                    Gender{' '}
                    <span style={{ color: '#EF4444' }} aria-hidden="true">
                      *
                    </span>
                  </label>
                  <ThemedSelect
                    id="player-reg-gender"
                    placeholder="Select gender"
                    options={[
                      { value: 'Male', label: 'Male' },
                      { value: 'Female', label: 'Female' },
                    ]}
                    aria-required="true"
                    aria-describedby={errors.gender ? 'player-reg-gender-error' : undefined}
                    {...register('gender', { required: 'Gender is required' })}
                  />
                  <AnimatePresence>
                    {errors.gender && (
                      <motion.p
                        id="player-reg-gender-error"
                        className="text-xs mt-1.5"
                        style={{ color: '#EF4444' }}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        role="alert"
                        aria-live="polite"
                      >
                        {errors.gender.message}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Password */}
              <div>
                <label
                  htmlFor={`${role}-reg-password`}
                  className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }}
                >
                  Password{' '}
                  <span style={{ color: '#EF4444' }} aria-hidden="true">
                    *
                  </span>
                </label>
                <ThemedInput
                  id={`${role}-reg-password`}
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  error={errors.password?.message}
                  aria-required="true"
                  aria-describedby={errors.password ? `${role}-reg-password-error` : undefined}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-white/25" />
                      ) : (
                        <Eye className="w-4 h-4 text-white/25" />
                      )}
                    </button>
                  }
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' },
                  })}
                />
                <AnimatePresence>
                  {errors.password && (
                    <motion.p
                      id={`${role}-reg-password-error`}
                      className="text-xs mt-1.5"
                      style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="alert"
                      aria-live="polite"
                    >
                      {errors.password.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor={`${role}-reg-confirmPassword`}
                  className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }}
                >
                  Confirm Password{' '}
                  <span style={{ color: '#EF4444' }} aria-hidden="true">
                    *
                  </span>
                </label>
                <ThemedInput
                  id={`${role}-reg-confirmPassword`}
                  icon={Lock}
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  error={errors.confirmPassword?.message}
                  aria-required="true"
                  aria-describedby={
                    errors.confirmPassword ? `${role}-reg-confirmPassword-error` : undefined
                  }
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirm ? (
                        <EyeOff className="w-4 h-4 text-white/25" />
                      ) : (
                        <Eye className="w-4 h-4 text-white/25" />
                      )}
                    </button>
                  }
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (value) => value === passwordValue || 'Passwords do not match',
                  })}
                />
                <AnimatePresence>
                  {errors.confirmPassword && (
                    <motion.p
                      id={`${role}-reg-confirmPassword-error`}
                      className="text-xs mt-1.5"
                      style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      role="alert"
                      aria-live="polite"
                    >
                      {errors.confirmPassword.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit */}
              <ThemedButton
                type="submit"
                disabled={loading}
                loading={loading}
                className="w-full mt-2"
              >
                {loading ? 'Creating Account...' : config.buttonText}
                {!loading && <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />}
              </ThemedButton>
            </motion.div>
          </form>

          {/* Footer links */}
          <motion.div
            className="mt-7 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: `${theme.colors.primary}12` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65 }}
          >
            <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
              ← Home
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-white/15 text-xs">·</span>
              <Link
                to={config.loginLink}
                className="text-xs transition-colors hover:underline underline-offset-4"
                style={{ color: `${theme.colors.primary}70` }}
              >
                Sign in
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right edge accent line */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{
          background: `linear-gradient(to bottom, transparent, ${theme.colors.primary}30, transparent)`,
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: EASE }}
      />
    </div>
  );
};

// ─── Main export with ThemeProvider wrapper ───────────────────────────────────

/**
 * UnifiedRegister - Role-adaptive registration page for Coach and Player.
 *
 * Detects role from route path:
 * - /coach/register → Coach registration (green theme)
 * - /player/register → Player registration (saffron theme)
 *
 * Validates Requirements: 4.1–4.8, 7.1, 8.2, 8.4, 8.7, 12.2–12.5, 17.2, 17.3, 17.8
 */
const UnifiedRegister = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);

  return (
    <ThemeProvider role={role}>
      <UnifiedRegisterInner />
    </ThemeProvider>
  );
};

export default UnifiedRegister;
