import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { 
  ArrowRight, Eye, EyeOff, Lock, Mail, User, Shield, 
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { PoleMark } from '@/components/brand/Brand';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';

// Import design system components
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton } from '../../components/design-system/forms';
import { HexGrid } from '../../components/design-system/backgrounds';
import { ShieldOrnament, GradientText } from '../../components/design-system/ornaments';
import { useReducedMotion } from '../../components/design-system/animations';

// Import API service
import { adminAPI } from '@/services/api';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionSelectionScreen from '@/components/competition/CompetitionSelectionScreen';
import { FG, alpha } from '@/styles/tokens';
import { PasswordRequirements, PasswordStrengthIndicator } from '@/components/auth/PasswordStrength';

const EASE = [0.22, 1, 0.36, 1];

/**
 * Password strength indicator component
 */

/**
 * Password requirements checklist component
 */

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
            <PoleMark className="h-12 w-auto opacity-80" />
          </motion.div>
          
          <div className="mb-10">
            <ShieldOrnament color={theme.colors.primary} />
          </div>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: FG.accent }}>
              Mallakhamb India
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3">
              <GradientText colors={[theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark]}>
                Admin<br />Registration
              </GradientText>
            </h1>
            <p className="text-fg-muted text-sm leading-relaxed max-w-xs mx-auto">
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
          <PoleMark className="h-10 w-auto opacity-75" />
          <div className="w-px h-8 bg-ink/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" 
              style={{ color: FG.accent }}>Mallakhamb India</p>
            <p className="text-fg-muted text-[10px]">Admin Portal</p>
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
                <Shield className="w-8 h-8" style={{ color: FG.accent }} aria-hidden="true" />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, ${alpha(theme.colors.primary, 0x40)}, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: FG.accent }}>Create Account</span>
              <div className="h-px flex-1" 
                style={{ background: `linear-gradient(90deg, transparent, ${alpha(theme.colors.primary, 0x40)})` }} />
            </div>
            <h2 className="text-3xl font-black text-ink mt-3">Register</h2>
            <p className="text-fg-muted text-sm mt-1">Create your admin account</p>
          </motion.div>
          
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              
              {/* Name field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: FG.accent }} 
                  htmlFor="admin-name">
                  Full Name <span style={{ color: FG.danger }}>*</span>
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
                    <motion.p className="text-xs mt-1.5" style={{ color: FG.danger }}
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
                  style={{ color: FG.accent }} 
                  htmlFor="admin-email">
                  Email <span style={{ color: FG.danger }}>*</span>
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
                    <motion.p className="text-xs mt-1.5" style={{ color: FG.danger }}
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
                  style={{ color: FG.accent }} 
                  htmlFor="admin-password">
                  Password <span style={{ color: FG.danger }}>*</span>
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
                      className="p-1 rounded hover:bg-ink/10 transition-colors min-h-[32px] min-w-[32px] tap-safe flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-fg-muted" />
                        : <Eye className="w-4 h-4 text-fg-muted" />}
                    </button>
                  }
                  {...register('password', { 
                    required: 'Password is required',
                    minLength: { value: 12, message: 'Password must be at least 12 characters' }
                  })}
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
                <PasswordStrengthIndicator password={password} minLength={12} strongLength={16} />
                <PasswordRequirements password={password} minLength={12} />
              </div>
              
              {/* Confirm Password field */}
              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: FG.accent }} 
                  htmlFor="admin-confirm-password">
                  Confirm Password <span style={{ color: FG.danger }}>*</span>
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
                      className="p-1 rounded hover:bg-ink/10 transition-colors min-h-[32px] min-w-[32px] tap-safe flex items-center justify-center"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                      {showConfirmPassword
                        ? <EyeOff className="w-4 h-4 text-fg-muted" />
                        : <Eye className="w-4 h-4 text-fg-muted" />}
                    </button>
                  }
                  {...register('confirmPassword', { 
                    required: 'Please confirm your password',
                    validate: (value) => value === password || 'Passwords do not match'
                  })}
                />
                <AnimatePresence>
                  {errors.confirmPassword && (
                    <motion.p className="text-xs mt-1.5" style={{ color: FG.danger }}
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
            style={{ borderColor: `${alpha(theme.colors.primary, 0x12)}` }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-fg-muted hover:text-fg transition-colors inline-flex items-center tap-safe justify-center">
                ← Home
              </Link>
              <span className="text-fg-subtle text-xs">·</span>
              <span className="text-xs text-fg-muted">Already have an account?</span>
              <Link to="/admin/login"
                className="text-xs transition-colors hover:underline underline-offset-4 inline-flex items-center tap-safe justify-center"
                style={{ color: FG.accent }}>
                Sign In
              </Link>
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
