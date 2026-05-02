import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  ArrowRight, Eye, EyeOff, Lock, Mail, User, Shield, UserCheck, Scale, Crown,
  BarChart2, Settings, Users, Star, Zap, Trophy, Layers, Flame, Dumbbell, Gavel, BookOpen
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import BHALogo from '../../assets/BHA.png';
import { useRateLimit } from '../../hooks/useRateLimit';
import { loginSchema, judgeLoginSchema } from '../../utils/validation';
import { secureStorage } from '../../utils/secureStorage';
import { logger } from '../../utils/logger';
import axios from 'axios';
import apiConfig from '../../utils/apiConfig';
import AccountLockoutMessage from '../../components/AccountLockoutMessage';

// Import design system components
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton } from '../../components/design-system/forms';
import { 
  HexGrid, 
  HexMesh, 
  RadialBurst, 
  DiagonalBurst, 
  Constellation 
} from '../../components/design-system/backgrounds';
import { 
  ShieldOrnament, 
  CoachOrnament, 
  GradientText 
} from '../../components/design-system/ornaments';
import { useReducedMotion } from '../../components/design-system/animations';

// Import API services
import { adminAPI, superAdminAPI, coachAPI, playerAPI } from '../../services/api';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionSelectionScreen from '../../components/CompetitionSelectionScreen';

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
  const configs = {
    admin: {
      title: 'Admin',
      subtitle: 'Portal',
      description: 'Manage competitions, teams, judges, and scoring operations.',
      accessLabel: 'Admin Access',
      formTitle: 'Sign In',
      formSubtitle: 'Manage competitions and operations',
      buttonText: 'Access Dashboard',
      ornament: ShieldOrnament,
      background: HexGrid,
      icon: Shield,
      features: [
        { icon: BarChart2, label: 'Scores' },
        { icon: Users, label: 'Teams' },
        { icon: Settings, label: 'Manage' },
      ],
      usesEmail: true,
      registerLink: null,
      forgotPasswordLink: '/forgot-password',
    },
    superadmin: {
      title: 'Supreme',
      subtitle: 'Command',
      description: 'Full sovereign access to all competitions, administrators, and platform systems.',
      accessLabel: 'Restricted Access',
      formTitle: 'Sign In',
      formSubtitle: 'Super Administrator credentials required',
      buttonText: 'Enter Command Center',
      ornament: ({ color }) => (
        <motion.div className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
          <motion.div className="absolute w-24 h-24 rounded-full border"
            style={{ borderColor: `${color}30` }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}15)`,
              border: `1px solid ${color}40`,
              boxShadow: `0 0 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
            <Crown className="w-10 h-10" style={{ color }} aria-hidden="true" />
          </div>
        </motion.div>
      ),
      background: RadialBurst,
      icon: Crown,
      features: [
        { icon: Star, label: 'All Access' },
        { icon: Zap, label: 'Real-time' },
        { icon: Crown, label: 'Sovereign' },
      ],
      usesEmail: true,
      registerLink: null,
      forgotPasswordLink: '/forgot-password',
    },
    coach: {
      title: 'Coach',
      subtitle: 'Portal',
      description: 'Manage your team, handle registrations, and guide your athletes to victory.',
      accessLabel: 'Coach Access',
      formTitle: 'Sign In',
      formSubtitle: 'Enter your coach credentials',
      buttonText: 'Sign In',
      ornament: CoachOrnament,
      background: HexMesh,
      icon: UserCheck,
      features: [
        { icon: Users, label: 'Manage' },
        { icon: Trophy, label: 'Compete' },
        { icon: Layers, label: 'Organize' },
      ],
      usesEmail: true,
      registerLink: '/coach/register',
      forgotPasswordLink: '/forgot-password',
    },
    player: {
      title: 'Athlete',
      subtitle: 'Portal',
      description: 'Register, join your team, and compete in the ancient art of Mallakhamb.',
      accessLabel: 'Player Access',
      formTitle: 'Sign In',
      formSubtitle: 'Enter your athlete credentials',
      buttonText: 'Sign In',
      ornament: ({ color }) => (
        <motion.div className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
          <motion.div className="absolute w-24 h-24 rounded-full border"
            style={{ borderColor: `${color}30` }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}15)`,
              border: `1px solid ${color}40`,
              boxShadow: `0 0 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
            <User className="w-10 h-10" style={{ color }} aria-hidden="true" />
          </div>
        </motion.div>
      ),
      background: DiagonalBurst,
      icon: User,
      features: [
        { icon: Flame, label: 'Compete' },
        { icon: Dumbbell, label: 'Train' },
        { icon: Star, label: 'Excel' },
      ],
      usesEmail: true,
      registerLink: '/player/register',
      forgotPasswordLink: '/forgot-password',
    },
    judge: {
      title: 'Judge',
      subtitle: 'Portal',
      description: 'Score performances with precision. Your judgment shapes the competition.',
      accessLabel: 'Judge Access',
      formTitle: 'Sign In',
      formSubtitle: 'Credentials provided by the administrator',
      buttonText: 'Sign In',
      ornament: ({ color }) => (
        <motion.div className="relative flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
          <motion.div className="absolute w-24 h-24 rounded-full border"
            style={{ borderColor: `${color}30` }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
          <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}15)`,
              border: `1px solid ${color}40`,
              boxShadow: `0 0 40px ${color}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
            <Scale className="w-10 h-10" style={{ color }} aria-hidden="true" />
          </div>
        </motion.div>
      ),
      background: Constellation,
      icon: Scale,
      features: [
        { icon: Scale, label: 'Score' },
        { icon: Gavel, label: 'Judge' },
        { icon: BookOpen, label: 'Review' },
      ],
      usesEmail: false,
      registerLink: null,
      forgotPasswordLink: null,
    },
  };
  
  return configs[role] || configs.admin;
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
  const [showCompetitionSelection, setShowCompetitionSelection] = useState(false);
  const [lockoutEndTime, setLockoutEndTime] = useState(null);
  const [rateLimitEndTime, setRateLimitEndTime] = useState(null);
  
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
  
  // Redirect if already logged in (but not during active login process)
  useEffect(() => {
    if (user && userType === role && !showCompetitionSelection && !loading) {
      // For coaches and players, always let them choose competition - don't auto-redirect
      if (role === 'coach' || role === 'player') {
        return;
      }
      
      // For other roles, use standard redirect logic
      const redirectPaths = {
        admin: '/admin/dashboard',
        superadmin: '/superadmin/dashboard',
        judge: '/judge/scoring',
      };
      const targetPath = redirectPaths[role] || '/';

      // Avoid redirect loops when this component is rendered on the destination route.
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    }
  }, [user, userType, role, navigate, showCompetitionSelection, loading, location.pathname]);
  
  // Handle form submission
  const onSubmit = async (data) => {
    // Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      toast.error(`Too many login attempts. Please wait ${waitTime} seconds.`);
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
        response = await axios.post(
          `${apiConfig.getBaseUrl()}/judge/login`,
          { 
            username: validation.data.username.toLowerCase(), 
            password: validation.data.password 
          },
          { headers: apiConfig.getHeaders() }
        );
        
        console.log('Judge login response:', response.data);
        const { token, judge, competition } = response.data.data;
        console.log('Destructured data:', { token: !!token, judge: !!judge, competition: !!competition });
        
        // Validate that we got the required data
        if (!token || !judge) {
          throw new Error('Invalid login response: missing token or judge data');
        }
        
        // Extract competition context from judge profile
        const competitionId = competition?._id;
        const competitionName = competition?.name;
        
        // Store token and user data
        secureStorage.setItem('judge_token', token);
        secureStorage.setItem('judge_user', JSON.stringify(judge));
        
        // Store competition context
        if (competitionId) {
          secureStorage.setItem('judge_competition_id', competitionId);
          logger.log('Judge competition context stored:', competitionId);
        }
        
        login(judge, token, 'judge');
        
        // Display success message with competition details
        if (competitionName) {
          toast.success(`Welcome ${judge.name}! Assigned to ${competitionName}`);
        } else {
          toast.success(`Welcome ${judge.name}!`);
        }
        
        reset();
        navigate('/judge/scoring');
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
      
      // Store token and user data immediately for all roles
      secureStorage.setItem(`${role}_token`, token);
      secureStorage.setItem(`${role}_user`, JSON.stringify(userData));
      
      login(userData, token, role);
      toast.success(role === 'coach' ? 'Welcome back, Coach!' : 'Login successful!');
      reset();
      
      // Handle post-login navigation
      if (role === 'admin' || role === 'superadmin') {
        setShowCompetitionSelection(true);
      } else if (role === 'coach') {
        // Coach always goes to competition selection after login
        navigate('/coach/select-competition');
      } else if (role === 'player') {
        // Player always goes to competition selection after login (same as coach)
        setTimeout(() => {
          navigate('/player/select-competition');
        }, 100);
      } else {
        // Add small delay for state to update before navigation
        setTimeout(() => {
          navigate(`/${role}/dashboard`);
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
        toast.error('Account locked due to failed attempts. Try again in 15 minutes.');
        return;
      }
      
      // Handle rate limiting errors (429 status)
      if (error.response?.status === 429) {
        const retryAfter = error.response?.data?.retryAfter || 900; // Default 15 minutes in seconds
        const endTime = new Date(Date.now() + retryAfter * 1000);
        setRateLimitEndTime(endTime);
        const minutes = Math.ceil(retryAfter / 60);
        toast.error(`Too many login attempts. Please wait ${minutes} minute${minutes > 1 ? 's' : ''}.`);
        return;
      }
      
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  // Show competition selection for admin and superadmin
  if (showCompetitionSelection && (role === 'admin' || role === 'superadmin')) {
    return (
      <CompetitionProvider userType={role}>
        <CompetitionSelectionScreen userType={role} onCompetitionSelected={() => {}} />
      </CompetitionProvider>
    );
  }
  
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
              style={{ color: `${theme.colors.primary}80` }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3">
              <GradientText colors={[theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark]}>
                {config.title}<br />{config.subtitle}
              </GradientText>
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              {config.description}
            </p>
          </motion.div>
          
          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {config.features.map(({ icon: FeatureIcon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${theme.colors.primary}12`, border: `1px solid ${theme.colors.primary}25` }}>
                  <FeatureIcon className="w-4 h-4" style={{ color: theme.colors.primary }} aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: `${theme.colors.primary}60` }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.primary}40, transparent)` }} />
      </div>
      
      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${theme.colors.primary}10, transparent 65%)` }} />
        </div>
        
        <motion.div className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}>
          <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-75" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" 
              style={{ color: theme.colors.primary }}>Mallakhamb</p>
            <p className="text-white/30 text-[10px]">{config.title} Portal</p>
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
                  background: `${theme.colors.primary}15`, 
                  border: `1px solid ${theme.colors.primary}35` 
                }}>
                <IconComponent className="w-8 h-8" style={{ color: theme.colors.primary }} aria-hidden="true" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, ${theme.colors.primary}40, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${theme.colors.primary}70` }}>{config.accessLabel}</span>
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.primary}40)` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">{config.formTitle}</h2>
            <p className="text-white/35 text-sm mt-1">{config.formSubtitle}</p>
          </motion.div>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              
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
                  style={{ color: `${theme.colors.primary}90` }} 
                  htmlFor={`${role}-${config.usesEmail ? 'email' : 'username'}`}>
                  {config.usesEmail ? 'Email' : 'Username'} <span style={{ color: '#EF4444' }}>*</span>
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
                    <motion.p className="text-xs mt-1.5" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors[config.usesEmail ? 'email' : 'username'].message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }} htmlFor={`${role}-password`}>
                  Password <span style={{ color: '#EF4444' }}>*</span>
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
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-white/25" />
                        : <Eye className="w-4 h-4 text-white/25" />}
                    </button>
                  }
                  {...register('password', { required: 'Password is required' })}
                />
                <AnimatePresence>
                  {errors.password && (
                    <motion.p className="text-xs mt-1.5" style={{ color: '#EF4444' }}
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
            style={{ borderColor: `${theme.colors.primary}12` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            {config.forgotPasswordLink && (
              <Link to={config.forgotPasswordLink}
                className="text-xs transition-colors hover:underline underline-offset-4"
                style={{ color: `${theme.colors.primary}70` }}>
                Forgot password?
              </Link>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
                ← Home
              </Link>
              {config.registerLink && (
                <>
                  <span className="text-white/15 text-xs">·</span>
                  <Link to={config.registerLink}
                    className="text-xs transition-colors hover:underline underline-offset-4"
                    style={{ color: `${theme.colors.primary}70` }}>
                    Register
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
      
      <motion.div className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{ background: `linear-gradient(to bottom, transparent, ${theme.colors.primary}30, transparent)` }}
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
