import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, UserCheck, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { coachAPI } from '../services/api';
import { useAuth } from '../App';
import { COLORS, useReducedMotion } from './Home';

const CoachRegister = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (user && userType === 'coach') navigate('/coach/create-team');
  }, [user, userType, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const response = await coachAPI.register(data);
      const { token, coach } = response.data;
      login(coach, token, 'coach');
      toast.success('Registration successful! Please create your team.');
      navigate('/coach/create-team');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { id: 'name', label: 'Full Name', type: 'text', placeholder: 'Enter your full name', autoComplete: 'name',
      rules: { required: 'Name is required' } },
    { id: 'email', label: 'Email Address', type: 'email', placeholder: 'Enter your email', autoComplete: 'email',
      rules: { required: 'Email is required', pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' } } },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {!reduced && (
        <>
          <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: `#22C55E08`, filter: 'blur(100px)', transform: 'translate(50%,-50%)' }} />
          <div className="absolute bottom-1/3 left-1/4 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: `${COLORS.saffron}08`, filter: 'blur(80px)', transform: 'translate(-50%,50%)' }} />
        </>
      )}

      <motion.div className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}>

        <div className="rounded-3xl border p-8"
          style={{
            background: COLORS.darkCard,
            borderColor: COLORS.darkBorderSubtle,
            boxShadow: `0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px ${COLORS.darkBorderSubtle}`,
          }}>

          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: `#22C55E18`, border: `1px solid #22C55E28` }}>
              <UserCheck className="w-8 h-8" style={{ color: '#22C55E' }} aria-hidden="true" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white mb-2">Coach Registration</h1>
            <p className="text-white/45 text-sm">Create your coach account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {fields.map(({ id, label, type, placeholder, autoComplete, rules }) => (
              <div key={id}>
                <label htmlFor={`coach-reg-${id}`} className="block text-xs font-semibold tracking-wide uppercase mb-2"
                  style={{ color: COLORS.saffronLight }}>
                  {label} <span aria-hidden="true" style={{ color: COLORS.saffron }}>*</span>
                </label>
                <input
                  id={`coach-reg-${id}`}
                  type={type}
                  autoComplete={autoComplete}
                  placeholder={placeholder}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/25 outline-none transition-all duration-200 min-h-[44px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${errors[id] ? '#EF4444' : COLORS.darkBorderSubtle}`,
                  }}
                  onFocus={e => e.target.style.borderColor = '#22C55E'}
                  onBlur={e => e.target.style.borderColor = errors[id] ? '#EF4444' : COLORS.darkBorderSubtle}
                  {...register(id, rules)}
                />
                {errors[id] && <p className="mt-1.5 text-xs text-red-400" role="alert">{errors[id].message}</p>}
              </div>
            ))}

            {/* Password */}
            <div>
              <label htmlFor="coach-reg-password" className="block text-xs font-semibold tracking-wide uppercase mb-2"
                style={{ color: COLORS.saffronLight }}>
                Password <span aria-hidden="true" style={{ color: COLORS.saffron }}>*</span>
              </label>
              <div className="relative">
                <input
                  id="coach-reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 pr-12 rounded-xl text-white placeholder-white/25 outline-none transition-all duration-200 min-h-[44px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${errors.password ? '#EF4444' : COLORS.darkBorderSubtle}`,
                  }}
                  onFocus={e => e.target.style.borderColor = '#22C55E'}
                  onBlur={e => e.target.style.borderColor = errors.password ? '#EF4444' : COLORS.darkBorderSubtle}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'Password must be at least 6 characters' }
                  })}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/70 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-400" role="alert">{errors.password.message}</p>}
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white min-h-[44px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}
              whileHover={loading ? {} : { scale: 1.01 }}
              whileTap={loading ? {} : { scale: 0.98 }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Account...
                </span>
              ) : 'Create Account'}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-white/40 text-sm">
              Already have an account?{' '}
              <Link to="/coach/login" className="font-semibold transition-colors duration-200 hover:opacity-80"
                style={{ color: '#22C55E' }}>
                Login here
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-white/35 hover:text-white/65 text-sm transition-colors duration-200">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default CoachRegister;
