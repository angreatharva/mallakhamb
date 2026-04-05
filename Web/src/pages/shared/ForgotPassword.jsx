import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Mail, Send, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useInView } from 'framer-motion';
import { authAPI } from '../../services/api';
import { validateEmailFormat } from '../../utils/validation';
import { logger } from '../../utils/logger';
import BHALogo from '../../assets/BHA.png';
import { COLORS, EASE_OUT } from '../../styles/tokens';
import { useReducedMotion as _useReducedMotion } from '../../hooks/useResponsive';

const useReducedMotion = () => {
  const [reduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return reduced;
};

const AmbientOrb = ({ x, y, size, color, delay, duration, blur = 80 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`, width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}55, ${color}15, transparent 70%)`,
        filter: `blur(${blur}px)`, transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -30, 0], scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

const GradientText = ({ children, className = '' }) => (
  <span className={className} style={{
    background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.gold}, ${COLORS.saffronLight})`,
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  }}>{children}</span>
);

const StyledInput = ({ error, ...props }) => (
  <input
    className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all duration-200 min-h-[48px] placeholder:text-white/25"
    style={{
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${error ? '#EF4444' : COLORS.darkBorderSubtle}`,
      caretColor: COLORS.saffron,
    }}
    onFocus={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.saffron; e.target.style.boxShadow = `0 0 0 3px ${error ? '#EF444420' : `${COLORS.saffron}20`}`; }}
    onBlur={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.darkBorderSubtle; e.target.style.boxShadow = 'none'; }}
    {...props}
  />
);


const ForgotPassword = () => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const cardRef = useRef(null);
  const cardInView = useInView(cardRef, { once: true });

  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true); setSent(false); setError('');
    toast.loading('Sending OTP…', { id: 'forgot-password' });
    try {
      logger.log('🔐 Sending forgot password request for:', data.email);
      const timeout = new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 120000));
      await Promise.race([authAPI.forgotPassword(data.email), timeout]);
      setSent(true);
      toast.success('OTP sent! Check your email.', { id: 'forgot-password' });
      setTimeout(() => navigate('/reset-password', { state: { email: data.email } }), 2000);
    } catch (err) {
      logger.error('❌ Forgot password error:', err);
      let msg = 'An error occurred. Please try again.';
      if (err.message === 'timeout') msg = 'Server is starting up. Please try again in a moment.';
      else if (err.response?.data?.message) msg = err.response.data.message;
      else if (err.message?.includes('Network Error')) msg = 'Network error. Check your connection.';
      setError(msg);
      toast.error(msg, { id: 'forgot-password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <AmbientOrb x={15} y={20} size={400} color={COLORS.saffron} delay={0} duration={7} blur={120} />
      <AmbientOrb x={85} y={70} size={300} color={COLORS.gold} delay={2} duration={9} blur={100} />

      {!reduced && (
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(${COLORS.saffron}80 1px, transparent 1px), linear-gradient(90deg, ${COLORS.saffron}80 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
            transform: 'perspective(400px) rotateX(60deg)',
            transformOrigin: 'bottom center',
          }}
        />
      )}

      {/* Logo */}
      <motion.div className="mb-8 flex items-center gap-3"
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}>
        <Link to="/" aria-label="Back to home">
          <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain" />
        </Link>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: COLORS.saffron }}>Bhausaheb Ranade</p>
          <p className="text-white text-sm font-bold leading-tight">Mallakhamb Competition</p>
        </div>
      </motion.div>

      {/* Card */}
      <motion.div ref={cardRef} className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={cardInView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.65, ease: EASE_OUT }}>
        <div className="rounded-3xl p-8 border" style={{
          background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)',
          borderColor: COLORS.darkBorder,
          boxShadow: `0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px ${COLORS.darkBorderSubtle}`,
        }}>
          {/* Icon + heading */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 mx-auto"
              style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.darkBorder}` }}
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}>
              <Mail className="w-7 h-7" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </motion.div>
            <h1 className="text-2xl font-black text-white mb-2">
              Forgot <GradientText>Password?</GradientText>
            </h1>
            <p className="text-white/45 text-sm leading-relaxed">
              Enter your email and we'll send you a one-time code to reset your password.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="mb-5">
              <label htmlFor="email" className="block text-sm font-semibold text-white/70 mb-2">
                Email Address <span style={{ color: COLORS.saffron }} aria-hidden="true">*</span>
              </label>
              <StyledInput
                {...register('email', {
                  required: 'Email is required',
                  validate: v => validateEmailFormat(v) || 'Please enter a valid email address',
                })}
                id="email" type="email" autoComplete="email"
                placeholder="you@example.com"
                disabled={loading || sent}
                error={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <motion.p id="email-error" role="alert" className="mt-2 text-xs font-medium"
                  style={{ color: '#EF4444' }}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}>
                  {errors.email.message}
                </motion.p>
              )}
            </div>

            <motion.button
              type="submit" disabled={loading || sent}
              className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white min-h-[48px] px-6 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
              whileHover={!loading && !sent ? { scale: 1.02 } : {}}
              whileTap={!loading && !sent ? { scale: 0.97 } : {}}>
              {loading ? (
                <>
                  <motion.div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  Sending OTP…
                </>
              ) : sent ? (
                <><Sparkles className="w-4 h-4" aria-hidden="true" /> OTP Sent — Redirecting…</>
              ) : (
                <><Send className="w-4 h-4" aria-hidden="true" /> Send OTP</>
              )}
            </motion.button>

            {loading && (
              <motion.div className="mt-4 p-3 rounded-xl border text-xs text-white/50 flex items-center gap-2"
                style={{ background: `${COLORS.saffron}0A`, borderColor: `${COLORS.saffron}20` }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.saffronLight }} aria-hidden="true" />
                This may take a moment if the server is starting up.
              </motion.div>
            )}
          </form>

          {sent && (
            <motion.div className="mt-5 p-4 rounded-xl border"
              style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }} role="status" aria-live="polite">
              <p className="text-sm font-semibold text-green-400">OTP sent to your email</p>
              <p className="text-xs text-green-400/70 mt-1">Redirecting to reset page…</p>
            </motion.div>
          )}

          {error && !sent && (
            <motion.div className="mt-5 p-4 rounded-xl border"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }} role="alert" aria-live="assertive">
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t flex flex-col items-center gap-3" style={{ borderColor: COLORS.darkBorderSubtle }}>
            <p className="text-sm text-white/35">
              Remember your password?{' '}
              <Link to="/player/login" className="font-semibold transition-colors duration-200 hover:opacity-80"
                style={{ color: COLORS.saffronLight }}>
                Back to Login
              </Link>
            </p>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors duration-200 min-h-[44px]">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to Home
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
