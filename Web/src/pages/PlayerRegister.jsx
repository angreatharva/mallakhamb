import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { playerAPI } from '../services/api';
import { useAuth } from '../App';
import { COLORS, GradientText, SaffronButton, useReducedMotion } from './Home';
import { ArrowLeft } from 'lucide-react';
import { secureStorage } from '../utils/secureStorage';

// ─── Shared dark input primitives (same as PlayerLogin) ───────────────────────
const DarkInput = ({ label, error, required, children }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-white/70">
      {label}{required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
    </label>
    {children}
    {error && <p className="text-red-400 text-xs mt-1" role="alert">{error}</p>}
  </div>
);

const inputClass = (hasError) =>
  `w-full px-4 py-3 rounded-xl text-white text-sm placeholder-white/25 outline-none transition-all duration-200 min-h-[44px] ${
    hasError
      ? 'border border-red-500/60 bg-red-500/5 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
      : 'border border-white/10 bg-white/5 focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15'
  }`;

const selectClass = (hasError) =>
  `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 min-h-[44px] appearance-none ${
    hasError
      ? 'border border-red-500/60 bg-red-500/5 text-white focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
      : 'border border-white/10 bg-white/5 text-white focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15'
  }`;

// ─── PlayerRegister ───────────────────────────────────────────────────────────
const PlayerRegister = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (user && userType === 'player') {
      navigate(user.team ? '/player/dashboard' : '/player/select-team');
    }
  }, [user, userType, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await playerAPI.register(data);
      const { token, player } = response.data;
      
      // Store token using secure storage directly to ensure it's available immediately
      secureStorage.setItem('player_token', token);
      secureStorage.setItem('player_user', JSON.stringify(player));
      
      // Then call login to update state
      login(player, token, 'player');
      
      toast.success('Registration successful!');
      
      // Small delay to ensure storage is complete before navigation
      setTimeout(() => {
        navigate('/player/select-team');
      }, 100);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* BG glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${COLORS.saffron}10, transparent 55%)` }} />
      {!reduced && (
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(${COLORS.saffron}50 1px, transparent 1px), linear-gradient(90deg, ${COLORS.saffron}50 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
      )}

      <motion.div className="w-full max-w-lg relative z-10"
        initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}>

        <Link to="/"
          className="inline-flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-8 transition-colors duration-200 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          Back to Home
        </Link>

        <div className="rounded-3xl border p-8"
          style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle, boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.saffron}30` }}>
              <UserPlus className="w-8 h-8" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-black text-white">Player Registration</h1>
            <p className="text-white/45 text-sm mt-1">Create your player account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DarkInput label="First Name" error={errors.firstName?.message} required>
                <input
                  {...register('firstName', { required: 'First name is required' })}
                  type="text" autoComplete="given-name"
                  placeholder="First name"
                  className={inputClass(!!errors.firstName)}
                />
              </DarkInput>
              <DarkInput label="Last Name" error={errors.lastName?.message} required>
                <input
                  {...register('lastName', { required: 'Last name is required' })}
                  type="text" autoComplete="family-name"
                  placeholder="Last name"
                  className={inputClass(!!errors.lastName)}
                />
              </DarkInput>
            </div>

            <DarkInput label="Email Address" error={errors.email?.message} required>
              <input
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' },
                })}
                type="email" autoComplete="email"
                placeholder="you@example.com"
                className={inputClass(!!errors.email)}
              />
            </DarkInput>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DarkInput label="Date of Birth" error={errors.dateOfBirth?.message} required>
                <input
                  {...register('dateOfBirth', { required: 'Date of birth is required' })}
                  type="date" autoComplete="bday"
                  className={inputClass(!!errors.dateOfBirth)}
                />
              </DarkInput>
              <DarkInput label="Gender" error={errors.gender?.message} required>
                <div className="relative">
                  <select
                    {...register('gender', { required: 'Gender is required' })}
                    className={selectClass(!!errors.gender)}>
                    <option value="" style={{ background: COLORS.darkCard }}>Select Gender</option>
                    <option value="Male" style={{ background: COLORS.darkCard }}>Male</option>
                    <option value="Female" style={{ background: COLORS.darkCard }}>Female</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </DarkInput>
            </div>

            <DarkInput label="Password" error={errors.password?.message} required>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min. 6 characters"
                  className={`${inputClass(!!errors.password)} pr-12`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </DarkInput>

            <SaffronButton type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Account...
                </span>
              ) : 'Create Account'}
            </SaffronButton>
          </form>

          <p className="text-center text-white/40 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/player/login"
              className="font-semibold transition-colors duration-200 hover:underline"
              style={{ color: COLORS.saffronLight }}>
              Login here
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default PlayerRegister;
