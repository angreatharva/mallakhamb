import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  ArrowRight, Eye, EyeOff, Lock, Mail, User, Shield, 
  CheckCircle2, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import BHALogo from '../../assets/BHA.png';
import { secureStorage } from '../../utils/secureStorage';
import { logger } from '../../utils/logger';

// Import design system components
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton } from '../../components/design-system/forms';
import { HexGrid } from '../../components/design-system/backgrounds';
import { ShieldOrnament, GradientText } from '../../components/design-system/ornaments';
import { useReducedMotion } from '../../components/design-system/animations';

// Import API service
import { adminAPI } from '../../services/api';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionSelectionScreen from '../../components/CompetitionSelectionScreen';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Password strength indicator component
 */
const PasswordStrengthIndicator = ({ password }) => {
  const getStrength = (pwd) => {
    if (!pwd) return { level: 0, label: '', color: '' };
    
    let strength = 0;
    if (pwd.length >= 12) strength++;
    if (pwd.length >= 16) strength++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[^a-zA-Z0-9]/.test(pwd)) strength++;
    
    const levels = [
      { level: 0, label: '', color: '' },
      { level: 1, label: 'Weak', color: '#EF4444' },
      { level: 2, label: 'Fair', color: '#F59E0B' },
      { level: 3, label: 'Good', color: '#10B981' },
      { level: 4, label: 'Strong', color: '#10B981' },
      { level: 5, label: 'Very Strong', color: '#059669' },
    ];
    
    return levels[strength];
  };
  
  const strength = getStrength(password);
  
  if (!password) return null;
  
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: level <= strength.level ? strength.color : 'rgba(255,255,255,0.1)',
            }}
          />
        ))}
      </div>
      {strength.label && (
        <p className="text-xs mt-1" style={{ color: strength.color }}>
          Password strength: {strength.label}
        </p>
      )}
    </div>
  );
};

/**
 * Password requirements checklist component
 */
const PasswordRequirements = ({ password }) => {
  const requirements = [
    { label: 'At least 12 characters', test: (pwd) => pwd.length >= 12 },
    { label: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
    { label: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
    { label: 'Contains number', test: (pwd) => /\d/.test(pwd) },
  ];
  
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-white/40 mb-2">Password requirements:</p>
      {requirements.map((req, index) => {
        const met = password && req.test(password);
        return (
          <div key={index} className="flex items-center gap-2">
            {met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-white/20" />
            )}
            <span className={`text-xs ${met ? 'text-white/60' : 'text-white/30'}`}>
              {req.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * AdminRegisterInner - Inner component that uses theme context
 */
const AdminRegisterInner = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const theme = useTheme();
  useReducedMotion();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCompetitionSelection, setShowCompetitionSelection] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, watch, setError } = useForm();
  
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  
  // Handle form submission
  const onSubmit = async (data) => {
    // Validate password length
    if (data.password.length < 12) {
      setError('password', { message: 'Password must be at least 12 characters long' });
      return;
    }
    
    // Validate password match
    if (data.password !== data.confirmPassword) {
      setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    
    setLoading(true);
    try {
      const response = await adminAPI.register({
        name: data.name,
        email: data.email,
        password: data.password,
      });
      
      const { token, admin } = response.data;
      
      if (!token || !admin) {
        throw new Error('Invalid registration response');
      }
      
      // Store token and admin profile
      secureStorage.setItem('admin_token', token);
      secureStorage.setItem('admin_user', JSON.stringify(admin));
      
      // Update auth context
      login(admin, token, 'admin');
      
      toast.success('Registration successful! Welcome to Mallakhamb Admin Portal.');
      
      // Show competition selection screen
      setShowCompetitionSelection(true);
    } catch (error) {
      logger.error('Admin registration error:', error);
      
      // Handle specific error cases
      if (error.response?.status === 429) {
        toast.error('Too many registration attempts. Please wait 15 minutes and try again.');
      } else if (error.response?.data?.message?.includes('email already exists') || 
                 error.response?.data?.message?.includes('Email already registered')) {
        toast.error('Email already registered. Please use a different email or login.');
      } else if (error.response?.data?.message?.includes('duplicate')) {
        toast.error('An account with this email already exists.');
      } else {
        toast.error(error.response?.data?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  // Show competition selection after successful registration
  if (showCompetitionSelection) {
    return (
      <CompetitionProvider userType="admin">
        <CompetitionSelectionScreen userType="admin" onCompetitionSelected={() => {}} />
      </CompetitionProvider>
    );
  }
  
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
        <HexGrid color={theme.colors.primary} />
        
        <div className="relative z-10 text-center px-12">
          <motion.div className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}>
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain opacity-80" />
          </motion.div>
          
          <div className="mb-10">
            <ShieldOrnament color={theme.colors.primary} />
          </div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: `${theme.colors.primary}80` }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3">
              <GradientText colors={[theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark]}>
                Admin<br />Registration
              </GradientText>
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              Create your admin account to manage competitions, teams, judges, and scoring operations.
            </p>
          </motion.div>
          
          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {[
              { icon: Shield, label: 'Secure' },
              { icon: CheckCircle2, label: 'Verified' },
              { icon: Lock, label: 'Protected' },
            ].map(({ icon: FeatureIcon, label }) => (
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
            <p className="text-white/30 text-[10px]">Admin Portal</p>
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
                <Shield className="w-8 h-8" style={{ color: theme.colors.primary }} aria-hidden="true" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, ${theme.colors.primary}40, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${theme.colors.primary}70` }}>Create Account</span>
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, transparent, ${theme.colors.primary}40)` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">Register</h2>
            <p className="text-white/35 text-sm mt-1">Create your admin account</p>
          </motion.div>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              
              {/* Name field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }} 
                  htmlFor="admin-name">
                  Full Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ThemedInput 
                  id="admin-name"
                  icon={User}
                  type="text"
                  placeholder="Enter your full name"
                  error={errors.name}
                  autoComplete="name"
                  {...register('name', {
                    required: 'Name is required',
                    minLength: { value: 2, message: 'Name must be at least 2 characters' }
                  })}
                />
                <AnimatePresence>
                  {errors.name && (
                    <motion.p className="text-xs mt-1.5" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.name.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Email field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }} 
                  htmlFor="admin-email">
                  Email <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ThemedInput 
                  id="admin-email"
                  icon={Mail}
                  type="email"
                  placeholder="admin@example.com"
                  error={errors.email}
                  autoComplete="email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { 
                      value: /^\S+@\S+$/i, 
                      message: 'Invalid email format' 
                    }
                  })}
                />
                <AnimatePresence>
                  {errors.email && (
                    <motion.p className="text-xs mt-1.5" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.email.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Password field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }} 
                  htmlFor="admin-password">
                  Password <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ThemedInput
                  id="admin-password"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  error={errors.password}
                  autoComplete="new-password"
                  rightElement={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-white/25" />
                        : <Eye className="w-4 h-4 text-white/25" />}
                    </button>
                  }
                  {...register('password', { 
                    required: 'Password is required',
                    minLength: { value: 12, message: 'Password must be at least 12 characters' }
                  })}
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
                <PasswordStrengthIndicator password={password} />
                <PasswordRequirements password={password} />
              </div>
              
              {/* Confirm Password field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${theme.colors.primary}90` }} 
                  htmlFor="admin-confirm-password">
                  Confirm Password <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <ThemedInput
                  id="admin-confirm-password"
                  icon={Lock}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  error={errors.confirmPassword}
                  autoComplete="new-password"
                  rightElement={
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                      {showConfirmPassword
                        ? <EyeOff className="w-4 h-4 text-white/25" />
                        : <Eye className="w-4 h-4 text-white/25" />}
                    </button>
                  }
                  {...register('confirmPassword', { 
                    required: 'Please confirm your password',
                    validate: (value) => value === password || 'Passwords do not match'
                  })}
                />
                <AnimatePresence>
                  {errors.confirmPassword && (
                    <motion.p className="text-xs mt-1.5" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.confirmPassword.message}
                    </motion.p>
                  )}
                  {!errors.confirmPassword && confirmPassword && password === confirmPassword && (
                    <motion.div className="flex items-center gap-1.5 mt-1.5"
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <p className="text-xs text-green-500">Passwords match</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <ThemedButton
                type="submit"
                disabled={loading}
                loading={loading}
                className="w-full mt-2"
              >
                {loading ? 'Creating Account...' : 'Create Admin Account'}
                {!loading && <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />}
              </ThemedButton>
            </motion.div>
          </form>
          
          <motion.div className="mt-7 pt-5 border-t flex items-center justify-center"
            style={{ borderColor: `${theme.colors.primary}12` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
                ← Home
              </Link>
              <span className="text-white/15 text-xs">·</span>
              <span className="text-xs text-white/40">Already have an account?</span>
              <Link to="/admin/login"
                className="text-xs transition-colors hover:underline underline-offset-4"
                style={{ color: `${theme.colors.primary}70` }}>
                Sign In
              </Link>
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
 * AdminRegister - Main component with ThemeProvider wrapper
 */
const AdminRegister = () => {
  return (
    <ThemeProvider role="admin">
      <AdminRegisterInner />
    </ThemeProvider>
  );
};

export default AdminRegister;
