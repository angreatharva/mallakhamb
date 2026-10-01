import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  ArrowRight, Eye, EyeOff, Lock, Mail, User, Shield, UserCheck, Scale, Crown,
  BarChart2, Settings, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import BHALogo from '../../assets/BHA.png';
import { useRateLimit } from '../../hooks/useRateLimit';
import { loginSchema, judgeLoginSchema } from '@/validators/form.validator';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import AccountLockoutMessage from '@/components/auth/AccountLockoutMessage';

// Import design system components
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton } from '../../components/design-system/forms';
import { 
  HexGrid 
} from '../../components/design-system/backgrounds';
import { 
  GradientText 
} from '../../components/design-system/ornaments';
import { useReducedMotion } from '../../components/design-system/animations';

// Import API services
import { adminAPI, superAdminAPI, coachAPI, playerAPI } from '@/services/api';
import { FG, alpha } from '@/styles/tokens';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Detect user role from route path
 * @param {string} pathname - Current route pathname
 * @returns {string} Detected role (admin, superadmin, coach, player, judge)
 */
const detectRoleFromPath = (pathname) => {
  const roleMatch = pathname.match(/^\/([^/]+)/);
  if (!roleMatch) return 'admin';
  
  const segment = roleMatch[1].toLowerCase();
  const roleMap = {
    admin: 'admin',
    superadmin: 'superadmin',
    'super-admin': 'superadmin',
    coach: 'coach',
    player: 'player',
    judge: 'judge',
  };
  
  return roleMap[segment] || 'admin';
};

/**
 * Get role-specific configuration
 * @param {string} role - The user role (admin, superadmin, coach, player, judge)
 * @returns {Object} Configuration object with UI elements, icons, and navigation paths
 */
const getRoleConfig = (role) => {
  // Unified ornament component - same design for all roles, only color changes
  const UnifiedOrnament = ({ color }) => (
    <motion.div className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
      <motion.div className="absolute w-24 h-24 rounded-full border"
        style={{ borderColor: `${alpha(color, 0x30)}` }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${alpha(color, 0x20)}, ${alpha(color, 0x15)})`,
          border: `1px solid ${alpha(color, 0x40)}`,
          boxShadow: `0 0 40px ${alpha(color, 0x20)}, inset 0 1px 0 rgb(var(--ink) / 0.08)`,
        }}>
        {/* Role-specific icon but same size and positioning */}
        {role === 'admin' && <Shield className="w-10 h-10" style={{ color }} aria-hidden="true" />}
        {role === 'superadmin' && <Crown className="w-10 h-10" style={{ color }} aria-hidden="true" />}
        {role === 'coach' && <UserCheck className="w-10 h-10" style={{ color }} aria-hidden="true" />}
        {role === 'player' && <User className="w-10 h-10" style={{ color }} aria-hidden="true" />}
        {role === 'judge' && <Scale className="w-10 h-10" style={{ color }} aria-hidden="true" />}
      </div>
    </motion.div>
  );

  // Role-specific content but unified structure
  const roleContent = {
    admin: {
      title: 'Admin',
      subtitle: 'Portal',
      description: 'Manage competitions, teams, judges, and scoring operations.',
      accessLabel: 'Admin Access',
    },
    superadmin: {
      title: 'Super Admin',
      subtitle: 'Portal',
      description: 'Full sovereign access to all competitions, administrators, and platform systems.',
      accessLabel: 'Super Admin Access',
    },
    coach: {
      title: 'Coach',
      subtitle: 'Portal',
      description: 'Manage your team, handle registrations, and guide your athletes to victory.',
      accessLabel: 'Coach Access',
    },
    player: {
      title: 'Player',
      subtitle: 'Portal',
      description: 'Register, join your team, and compete in the ancient art of Mallakhamb.',
      accessLabel: 'Player Access',
    },
    judge: {
      title: 'Judge',
      subtitle: 'Portal',
      description: 'Score performances with precision. Your judgment shapes the competition.',
      accessLabel: 'Judge Access',
    },
  };

  const content = roleContent[role] || roleContent.admin;

  // Unified configuration - same for all roles except content and colors
  return {
    title: content.title,
    subtitle: content.subtitle,
    description: content.description,
    accessLabel: content.accessLabel,
    formTitle: 'Sign In',
    formSubtitle: 'Enter your credentials to continue',
    buttonText: 'Sign In',
    ornament: UnifiedOrnament,
    background: HexGrid, // Same background for all
    icon: role === 'admin' ? Shield : 
          role === 'superadmin' ? Crown :
          role === 'coach' ? UserCheck :
          role === 'player' ? User :
          role === 'judge' ? Scale : Shield,
    features: [
      { icon: BarChart2, label: 'Secure' },
      { icon: Users, label: 'Reliable' },
      { icon: Settings, label: 'Modern' },
    ], // Same features for all
    // Judges hold their own accounts now and sign in with their email like
    // everyone else. The old usernames were generated from the panel slot
    // (J1-M-U14-1), which is why they could collide across meets.
    usesEmail: true,
    registerLink: ['coach', 'player', 'judge'].includes(role) ? `/${role}/register` : null,
    forgotPasswordLink: '/forgot-password',
  };
};

/**
 * UnifiedLogin - Inner component that uses theme context
 */
const UnifiedLoginInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const theme = useTheme();
  useReducedMotion(); // Initialize for accessibility
  
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockoutEndTime, setLockoutEndTime] = useState(null);
  const [rateLimitEndTime, setRateLimitEndTime] = useState(null);
  const [loginError, setLoginError] = useState(null);
  
  // Clear lockout/rate limit when timer expires
  useEffect(() => {
    if (lockoutEndTime) {
      const checkLockout = setInterval(() => {
        if (new Date() >= lockoutEndTime) {
          setLockoutEndTime(null);
          clearInterval(checkLockout);
        }
      }, 1000);
      return () => clearInterval(checkLockout);
    }
  }, [lockoutEndTime]);
  
  useEffect(() => {
    if (rateLimitEndTime) {
      const checkRateLimit = setInterval(() => {
        if (new Date() >= rateLimitEndTime) {
          setRateLimitEndTime(null);
          clearInterval(checkRateLimit);
        }
      }, 1000);
      return () => clearInterval(checkRateLimit);
    }
  }, [rateLimitEndTime]);
  
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  const { checkRateLimit, recordAttempt, reset } = useRateLimit(5, 60000);
  
  // Clear login error when user starts typing
  useEffect(() => {
    if (loginError) {
      setLoginError(null);
    }
  }, [location.pathname]); // Clear error when navigating between login pages
  
  // Detect role from path
  const role = detectRoleFromPath(location.pathname);
  const config = getRoleConfig(role);
  
  // Get API service based on role
  const getAPIService = () => {
    const services = {
      admin: adminAPI,
      superadmin: superAdminAPI,
      coach: coachAPI,
      player: playerAPI,
      judge: null, // Judge uses custom axios call
    };
    return services[role];
  };
  
  /*
   * Already signed in and back on the login page — send them on rather than
   * showing a form they do not need.
   *
   * The destination is the level chooser, the same as a fresh sign-in, so the
   * two paths cannot drift. It is safe to land there repeatedly: the chooser
   * reads the stored level but does not act on it, so this cannot loop.
   */
  useEffect(() => {
    if (!user || userType !== role || loading) return;

    const targetPath = role === 'superadmin'
      ? '/superadmin/dashboard'
      : `/${role}/select-level`;

    // Avoid redirect loops when this component is rendered on the destination route.
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  }, [user, userType, role, navigate, loading, location.pathname]);
  
  // Handle form submission
  const onSubmit = async (data) => {
    // Clear any previous login errors
    setLoginError(null);
    
    // Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      const errorMsg = `Too many login attempts. Please wait ${waitTime} seconds.`;
      setLoginError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    // Validate input based on role
    const schema = role === 'judge' ? judgeLoginSchema : loginSchema;
    const validation = schema.safeParse(data);
    if (!validation.success) {
      validation.error.errors.forEach((err) => {
        setError(err.path[0], { message: err.message });
      });
      return;
    }
    
    setLoading(true);
    try {
      let response;
      
      // Judge login uses different endpoint
      if (role === 'judge') {
        response = await judgeAPI.login(
          validation.data.email.toLowerCase(),
          validation.data.password
        );
        
        // MED-W6: the raw login response was logged here via console.log,
        // putting the judge's profile and token straight into any shared or
        // recorded dev session. Terser strips console.* from production
        // builds, so this was never a production leak — but it bypassed the
        // project's own logger and there is no reason to print credentials at
        // all. Log presence, not payload, and route it through the logger.
        const { token, judge, competition } = response.data.data;
        logger.log('Judge login response received', {
          hasToken: !!token,
          hasJudge: !!judge,
          hasCompetition: !!competition,
        });

        // Validate that we got the required data
        if (!token || !judge) {
          throw new Error('Invalid login response: missing token or judge data');
        }
        
        // Extract competition context from judge profile
        const competitionId = competition?._id;
        const competitionName = competition?.name;

        // Store user data
        secureStorage.setItem('judge_user', JSON.stringify(judge));
        
        // Store competition context
        if (competitionId) {
          secureStorage.setItem('judge_competition_id', competitionId);
          if (competition) {
            secureStorage.setItem('judge_current_competition', JSON.stringify(competition));
          }
          logger.log('Judge competition context stored:', competitionId);
        }
        
        login(judge, token, 'judge');

        sessionStorage.removeItem('judge_category_selected');
        reset();

        // The dashboard is the judge's home whether or not anyone has seated
        // them yet: it lists the panels they hold, and explains the empty case
        // rather than leaving them on a screen with nothing to do.
        toast.success(
          competitionName
            ? `Welcome ${judge.name}! Assigned to ${competitionName}`
            : `Welcome ${judge.name}!`
        );
        /*
         * To the level chooser like every other role, rather than straight to
         * the dashboard. Login still reports the meet the server picked, but a
         * judge seated at more than one had no way to reach the others from
         * here — the first seat simply won.
         */
        navigate('/judge/select-level');
        return;
      }
      
      // Other roles use API service
      const apiService = getAPIService();
      response = await apiService.login(validation.data);
      
      // Handle nested response structure: {success: true, data: {user, token}}
      const responseData = response.data.data || response.data;
      const { token } = responseData;
      
      const userDataKeyByRole = {
        admin: 'admin',
        superadmin: 'admin',
        coach: 'coach',
        player: 'player',
      };
      const expectedUserKey = userDataKeyByRole[role];
      const userData = responseData[expectedUserKey] || responseData.user || responseData.profile;
      
      if (!token || !userData) {
        throw new Error('Invalid login response');
      }
      
      // Store user data immediately for all roles
      secureStorage.setItem(`${role}_user`, JSON.stringify(userData));
      
      login(userData, token, role);
      toast.success(role === 'coach' ? 'Welcome back, Coach!' : 'Login successful!');
      reset();
      
      /*
       * Post-login navigation.
       *
       * Every competition-scoped role goes to the level chooser first, then to
       * a competition at that level, then to their dashboard. Admin used to
       * open its competition screen as component state here
       * (`showCompetitionSelection`), which gave it no URL and no way back;
       * coach went straight to competition selection with no level step; and
       * player branched on whether it had a squad. All three are now the same
       * two routes.
       *
       * Superadmin is the one exception: it is not scoped to assigned meets, so
       * there is nothing for it to narrow and it goes straight to its dashboard.
       */
      if (role === 'superadmin') {
        setTimeout(() => {
          navigate('/superadmin/dashboard');
        }, 100);
      } else {
        // Small delay so the auth state commits before the guard on the next
        // route reads it.
        setTimeout(() => {
          navigate(`/${role}/select-level`);
        }, 100);
      }
    } catch (error) {
      recordAttempt();
      logger.error(`${role} login error:`, error);
      
      // Handle account lockout errors
      if (error.response?.data?.message?.toLowerCase().includes('locked') || 
          error.response?.data?.message?.toLowerCase().includes('lockout')) {
        const lockoutDuration = 15 * 60 * 1000; // 15 minutes in milliseconds
        const endTime = new Date(Date.now() + lockoutDuration);
        setLockoutEndTime(endTime);
        const errorMsg = 'Account locked due to failed attempts. Try again in 15 minutes.';
        setLoginError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      
      // Handle rate limiting errors (429 status)
      if (error.response?.status === 429) {
        const retryAfter = error.response?.data?.retryAfter || 900; // Default 15 minutes in seconds
        const endTime = new Date(Date.now() + retryAfter * 1000);
        setRateLimitEndTime(endTime);
        const minutes = Math.ceil(retryAfter / 60);
        const errorMsg = `Too many login attempts. Please wait ${minutes} minute${minutes > 1 ? 's' : ''}.`;
        setLoginError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      
      // Handle invalid credentials or other login errors
      const errorMsg =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Incorrect credentials. Please try again with correct credentials.';
      setLoginError(errorMsg);
      toast.error(errorMsg);
      
      // DO NOT navigate away - stay on login page
    } finally {
      setLoading(false);
    }
  };
  
  const BackgroundComponent = config.background;
  const OrnamentComponent = config.ornament;
  const IconComponent = config.icon;
  
  return (
    <div className="min-h-dvh flex relative overflow-hidden"
      style={{ 
        background: theme.colors.background, 
        fontFamily: "'Inter', system-ui, sans-serif" 
      }}>
      
      {/* Left decorative panel (desktop) */}
      <div className="hidden lg:flex flex-col items-center justify-center w-[45%] relative border-r"
        style={{ 
          background: theme.colors.card, 
          borderColor: theme.colors.border 
        }}>
        <BackgroundComponent color={theme.colors.primary} />
        
        <div className="relative z-10 text-center px-12">
          <motion.div className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}>
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain opacity-80" />
          </motion.div>
          
          <div className="mb-10">
            <OrnamentComponent color={theme.colors.primary} />
          </div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: FG.accent }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3">
              <GradientText colors={[theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark]}>
                {config.title}<br />{config.subtitle}
              </GradientText>
            </h1>
            <p className="text-fg-muted text-sm leading-relaxed max-w-xs mx-auto">
              {config.description}
            </p>
          </motion.div>
          
          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {config.features.map(({ icon: FeatureIcon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${alpha(theme.colors.primary, 0x12)}`, border: `1px solid ${alpha(theme.colors.primary, 0x25)}` }}>
                  <FeatureIcon className="w-4 h-4" style={{ color: FG.accent }} aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: FG.accent }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${alpha(theme.colors.primary, 0x40)}, transparent)` }} />
      </div>
      
      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${alpha(theme.colors.primary, 0x10)}, transparent 65%)` }} />
        </div>
        
        <motion.div className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}>
          <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-75" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" 
              style={{ color: FG.accent }}>Mallakhamb</p>
            <p className="text-fg-muted text-[10px]">{config.title} Portal</p>
          </div>
        </motion.div>
        
        <motion.div className="w-full max-w-sm"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}>
          
          <motion.div className="mb-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="lg:hidden mb-5 flex justify-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ 
                  background: `${alpha(theme.colors.primary, 0x15)}`, 
                  border: `1px solid ${alpha(theme.colors.primary, 0x35)}` 
                }}>
                <IconComponent className="w-8 h-8" style={{ color: FG.accent }} aria-hidden="true" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, ${alpha(theme.colors.primary, 0x40)}, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: FG.accent }}>{config.accessLabel}</span>
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, transparent, ${alpha(theme.colors.primary, 0x40)})` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">{config.formTitle}</h2>
            <p className="text-fg-muted text-sm mt-1">{config.formSubtitle}</p>
          </motion.div>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              
              {/* Login Error Message */}
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-lg p-4 border"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <svg className="w-5 h-5" style={{ color: FG.danger }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold mb-1" style={{ color: FG.danger }}>
                          Login Failed
                        </h3>
                        <p className="text-sm" style={{ color: 'rgb(var(--danger-fg) / 0.9)' }}>
                          {loginError}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Account Lockout Message */}
              {lockoutEndTime && (
                <AccountLockoutMessage 
                  lockoutEndTime={lockoutEndTime} 
                  primaryColor={theme.colors.primary}
                />
              )}
              
              {/* Rate Limit Message */}
              {rateLimitEndTime && !lockoutEndTime && (
                <AccountLockoutMessage 
                  lockoutEndTime={rateLimitEndTime} 
                  primaryColor={theme.colors.primary}
                />
              )}
              
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: FG.accent }} 
                  htmlFor={`${role}-${config.usesEmail ? 'email' : 'username'}`}>
                  {config.usesEmail ? 'Email' : 'Username'} <span style={{ color: FG.danger }}>*</span>
                </label>
                <ThemedInput 
                  id={`${role}-${config.usesEmail ? 'email' : 'username'}`}
                  icon={config.usesEmail ? Mail : User}
                  type={config.usesEmail ? 'email' : 'text'}
                  placeholder={config.usesEmail ? `${role}@example.com` : 'Enter your username'}
                  error={errors[config.usesEmail ? 'email' : 'username']}
                  autoComplete={config.usesEmail ? 'email' : 'username'}
                  {...register(config.usesEmail ? 'email' : 'username', {
                    required: `${config.usesEmail ? 'Email' : 'Username'} is required`,
                    ...(config.usesEmail && {
                      pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' }
                    })
                  })}
                />
                <AnimatePresence>
                  {errors[config.usesEmail ? 'email' : 'username'] && (
                    <motion.p className="text-xs mt-1.5" style={{ color: FG.danger }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors[config.usesEmail ? 'email' : 'username'].message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: FG.accent }} htmlFor={`${role}-password`}>
                  Password <span style={{ color: FG.danger }}>*</span>
                </label>
                <ThemedInput
                  id={`${role}-password`}
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  error={errors.password}
                  autoComplete="current-password"
                  rightElement={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] tap-safe flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-fg-muted" />
                        : <Eye className="w-4 h-4 text-fg-muted" />}
                    </button>
                  }
                  {...register('password', { required: 'Password is required' })}
                />
                <AnimatePresence>
                  {errors.password && (
                    <motion.p className="text-xs mt-1.5" style={{ color: FG.danger }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.password.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              
              <ThemedButton
                type="submit"
                disabled={loading || lockoutEndTime !== null || rateLimitEndTime !== null}
                loading={loading}
                className="w-full mt-2"
              >
                {loading ? 'Signing in...' : config.buttonText}
                {!loading && <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />}
              </ThemedButton>
            </motion.div>
          </form>
          
          <motion.div className="mt-7 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: `${alpha(theme.colors.primary, 0x12)}` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            {config.forgotPasswordLink && (
              <Link to={config.forgotPasswordLink}
                className="text-xs transition-colors hover:underline underline-offset-4 inline-flex items-center tap-safe justify-center"
                style={{ color: FG.accent }}>
                Forgot password?
              </Link>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Link to="/" className="text-xs text-fg-muted hover:text-fg transition-colors inline-flex items-center tap-safe justify-center">
                ← Home
              </Link>
              {config.registerLink && (
                <>
                  <span className="text-fg-subtle text-xs">·</span>
                  <Link to={config.registerLink}
                    className="text-xs transition-colors hover:underline underline-offset-4 inline-flex items-center tap-safe justify-center"
                    style={{ color: FG.accent }}>
                    Register
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
      
      <motion.div className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{ background: `linear-gradient(to bottom, transparent, ${alpha(theme.colors.primary, 0x30)}, transparent)` }}
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: EASE }} />
    </div>
  );
};

/**
 * UnifiedLogin - Main component with ThemeProvider wrapper
 */
const UnifiedLogin = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <UnifiedLoginInner />
    </ThemeProvider>
  );
};

export default UnifiedLogin;
