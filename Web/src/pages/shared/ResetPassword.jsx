import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Lock, Shield, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useInView, AnimatePresence } from 'framer-motion';
import { authAPI } from '../../services/api';
import BHALogo from '../../assets/BHA.png';

const COLORS = {
  saffron: '#FF6B00',
  saffronLight: '#FF8C38',
  saffronDark: '#CC5500',
  gold: '#F5A623',
  dark: '#0A0A0A',
  darkBorder: 'rgba(255,107,0,0.15)',
  darkBorderSubtle: 'rgba(255,255,255,0.06)',
};

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

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

const StyledInput = ({ error, verified, ...props }) => (
  <input
    className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all duration-200 min-h-[48px] placeholder:text-white/25"
    style={{
      background: verified ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${error ? '#EF4444' : verified ? 'rgba(34,197,94,0.4)' : COLORS.darkBorderSubtle}`,
      caretColor: COLORS.saffron,
    }}
    onFocus={e => {
      if (!verified) {
        e.target.style.borderColor = error ? '#EF4444' : COLORS.saffron;
        e.target.style.boxShadow = `0 0 0 3px ${error ? '#EF444420' : `${COLORS.saffron}20`}`;
      }
    }}
    onBlur={e => {
      if (!verified) {
        e.target.style.borderColor = error ? '#EF4444' : COLORS.darkBorderSubtle;
        e.target.style.boxShadow = 'none';
      }
    }}
    {...props}
  />
);

const PasswordInput = ({ error, showPassword, onToggle, ...props }) => (
  <div className="relative">
    <input
      type={showPassword ? 'text' : 'password'}
      className="w-full px-4 py-3 pr-12 rounded-xl text-white text-sm outline-none transition-all duration-200 min-h-[48px] placeholder:text-white/25"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${error ? '#EF4444' : COLORS.darkBorderSubtle}`,
        caretColor: COLORS.saffron,
      }}
      onFocus={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.saffron; e.target.style.boxShadow = `0 0 0 3px ${error ? '#EF444420' : `${COLORS.saffron}20`}`; }}
      onBlur={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.darkBorderSubtle; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-white/35 hover:text-white/70 transition-colors duration-200 min-h-[36px] min-w-[36px] flex items-center justify-center"
      aria-label={showPassword ? 'Hide password' : 'Show password'}
    >
      {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
    </button>
  </div>
);

const ResetPassword = () => {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useParams();
  const isOTPMethod = !token;
  const emailFromState = location.state?.email || '';
  const [resetToken, setResetToken] = useState('');
  const reduced = useReducedMotion();
  const cardRef = useRef(null);
  const cardInView = useInView(cardRef, { once: true });

  useEffect(() => {
    if (token) {
      setResetToken(token);
      window.history.replaceState(null, '', '/reset-password');
    }
  }, [token]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { email: emailFromState },
  });
  const password = watch('password');

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setTimeout(() => {
      setLockoutSeconds(p => {
        const n = p - 1;
        if (n <= 0) { setIsLockedOut(false); setAttemptsRemaining(3); }
        return n;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [lockoutSeconds]);

  const formatTime = s => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleVerifyOTP = async () => {
    const email = watch('email');
    const otp = watch('otp');
    if (!email || !otp) { toast.error('Please enter email and OTP'); return; }
    if (otp.length !== 6) { toast.error('OTP must be 6 digits'); return; }
    setVerifying(true); setError('');
    try {
      await authAPI.verifyOTP(email, otp);
      setOtpVerified(true);
      setAttemptsRemaining(3);
      toast.success('OTP verified! Set your new password.');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid OTP';
      const left = err.response?.data?.attemptsRemaining;
      const locked = err.response?.data?.lockedOut;
      const secs = err.response?.data?.remainingSeconds;
      toast.error(msg); setError(msg);
      if (locked) { setIsLockedOut(true); setLockoutSeconds(secs || 900); setAttemptsRemaining(0); }
      else if (left !== undefined) setAttemptsRemaining(left);
    } finally {
      setVerifying(false);
    }
  };

  const onSubmit = async (data) => {
    if (isLockedOut) { toast.error(`Locked. Try again in ${formatTime(lockoutSeconds)}`); return; }
    setLoading(true); setError('');
    try {
      if (isOTPMethod) {
        await authAPI.resetPasswordWithOTP(data.email, data.otp, data.password);
      } else {
        if (!resetToken) { setError('Invalid reset link. Please request a new one.'); setLoading(false); return; }
        await authAPI.resetPassword(resetToken, data.password);
      }
      setSuccess(true);
      toast.success('Password reset successfully!');
      if (resetToken) setResetToken('');
      setTimeout(() => navigate('/player/login'), 2000);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reset password. Please try again.';
      const left = err.response?.data?.attemptsRemaining;
      const locked = err.response?.data?.lockedOut;
      const secs = err.response?.data?.remainingSeconds;
      setError(msg); toast.error(msg);
      if (isOTPMethod) {
        if (locked) { setIsLockedOut(true); setLockoutSeconds(secs || 900); setAttemptsRemaining(0); }
        else if (left !== undefined) setAttemptsRemaining(left);
      }
    } finally {
      setLoading(false);
    }
  };

  // Step indicator for OTP flow
  const step = !isOTPMethod ? 2 : otpVerified ? 2 : 1;

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <AmbientOrb x={20} y={15} size={380} color={COLORS.saffron} delay={0} duration={8} blur={120} />
      <AmbientOrb x={80} y={75} size={280} color={COLORS.gold} delay={1.5} duration={10} blur={100} />

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
          <div className="text-center mb-6">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 mx-auto"
              style={{ background: `${COLORS.saffron}18`, border: `1px solid ${COLORS.darkBorder}` }}
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}>
              <Lock className="w-7 h-7" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </motion.div>
            <h1 className="text-2xl font-black text-white mb-2">
              Reset <GradientText>Password</GradientText>
            </h1>
            <p className="text-white/45 text-sm">
              {isOTPMethod ? 'Verify your OTP then set a new password' : 'Enter your new password below'}
            </p>
          </div>

          {/* Step indicator (OTP flow only) */}
          {isOTPMethod && (
            <div className="flex items-center gap-2 mb-6">
              {[1, 2].map(s => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all duration-300"
                    style={{
                      background: step >= s ? COLORS.saffron : 'rgba(255,255,255,0.08)',
                      color: step >= s ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}>
                    {step > s ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : s}
                  </div>
                  <span className="text-xs font-medium transition-colors duration-300"
                    style={{ color: step >= s ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }}>
                    {s === 1 ? 'Verify OTP' : 'New Password'}
                  </span>
                  {s < 2 && <div className="flex-1 h-px" style={{ background: step > s ? COLORS.saffron : COLORS.darkBorderSubtle }} />}
                </div>
              ))}
            </div>
          )}

          {/* Lockout banner */}
          <AnimatePresence>
            {isLockedOut && (
              <motion.div className="mb-5 p-4 rounded-xl border flex items-start gap-3"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                role="alert">
                <Shield className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Account Temporarily Locked</p>
                  <p className="text-xs text-red-400/70 mt-0.5">Too many failed attempts. Try again in {formatTime(lockoutSeconds)}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attempts warning */}
          <AnimatePresence>
            {isOTPMethod && !isLockedOut && attemptsRemaining < 3 && !otpVerified && (
              <motion.div className="mb-5 p-3 rounded-xl border flex items-center gap-2"
                style={{ background: 'rgba(245,166,35,0.08)', borderColor: 'rgba(245,166,35,0.25)' }}
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                role="status" aria-live="polite">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.gold }} aria-hidden="true" />
                <p className="text-xs font-medium" style={{ color: COLORS.gold }}>
                  {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* OTP verified banner */}
          <AnimatePresence>
            {otpVerified && (
              <motion.div className="mb-5 p-3 rounded-xl border flex items-center gap-2"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                role="status" aria-live="polite">
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-xs font-semibold text-green-400">OTP verified — set your new password below</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {isOTPMethod && (
              <>
                {/* Email */}
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-semibold text-white/70 mb-2">
                    Email Address <span style={{ color: COLORS.saffron }} aria-hidden="true">*</span>
                  </label>
                  <StyledInput
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' },
                    })}
                    id="email" type="email" autoComplete="email"
                    placeholder="you@example.com"
                    disabled={loading || isLockedOut || otpVerified}
                    error={!!errors.email} verified={otpVerified}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {errors.email.message}
                    </motion.p>
                  )}
                </div>

                {/* OTP */}
                <div className="mb-4">
                  <label htmlFor="otp" className="block text-sm font-semibold text-white/70 mb-2">
                    OTP Code <span style={{ color: COLORS.saffron }} aria-hidden="true">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <StyledInput
                        {...register('otp', {
                          required: 'OTP is required',
                          pattern: { value: /^\d{6}$/, message: 'OTP must be 6 digits' },
                        })}
                        id="otp" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                        placeholder="6-digit code"
                        disabled={loading || isLockedOut || otpVerified}
                        error={!!errors.otp} verified={otpVerified}
                        aria-invalid={!!errors.otp}
                      />
                      {otpVerified && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleVerifyOTP}
                      disabled={loading || verifying || isLockedOut || otpVerified}
                      className="px-4 rounded-xl text-sm font-bold min-h-[48px] whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      style={{
                        background: otpVerified ? 'rgba(34,197,94,0.15)' : `${COLORS.saffron}18`,
                        border: `1px solid ${otpVerified ? 'rgba(34,197,94,0.3)' : COLORS.darkBorder}`,
                        color: otpVerified ? '#4ade80' : COLORS.saffronLight,
                      }}
                      whileHover={!otpVerified && !verifying ? { scale: 1.03 } : {}}
                      whileTap={!otpVerified && !verifying ? { scale: 0.97 } : {}}>
                      {verifying ? (
                        <motion.div className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current mx-auto"
                          animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                      ) : otpVerified ? '✓ Verified' : 'Verify'}
                    </motion.button>
                  </div>
                  {errors.otp && (
                    <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: '#EF4444' }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {errors.otp.message}
                    </motion.p>
                  )}
                  {!otpVerified && !errors.otp && (
                    <p className="mt-1.5 text-xs text-white/30">Check your email for the 6-digit code</p>
                  )}
                </div>
              </>
            )}

            {/* New password — only shown after OTP verified (or token method) */}
            <AnimatePresence>
              {(!isOTPMethod || otpVerified) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>
                  <div className="mb-4">
                    <label htmlFor="password" className="block text-sm font-semibold text-white/70 mb-2">
                      New Password <span style={{ color: COLORS.saffron }} aria-hidden="true">*</span>
                    </label>
                    <PasswordInput
                      {...register('password', {
                        required: 'Password is required',
                        minLength: { value: 8, message: 'Password must be at least 8 characters' },
                      })}
                      id="password" autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      disabled={loading || isLockedOut}
                      error={!!errors.password}
                      showPassword={showPassword}
                      onToggle={() => setShowPassword(p => !p)}
                      aria-invalid={!!errors.password}
                    />
                    {errors.password && (
                      <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: '#EF4444' }}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        {errors.password.message}
                      </motion.p>
                    )}
                  </div>

                  <div className="mb-6">
                    <label htmlFor="confirmPassword" className="block text-sm font-semibold text-white/70 mb-2">
                      Confirm Password <span style={{ color: COLORS.saffron }} aria-hidden="true">*</span>
                    </label>
                    <PasswordInput
                      {...register('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: v => v === password || 'Passwords do not match',
                      })}
                      id="confirmPassword" autoComplete="new-password"
                      placeholder="Repeat your password"
                      disabled={loading || isLockedOut}
                      error={!!errors.confirmPassword}
                      showPassword={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword(p => !p)}
                      aria-invalid={!!errors.confirmPassword}
                    />
                    {errors.confirmPassword && (
                      <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: '#EF4444' }}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        {errors.confirmPassword.message}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            {(!isOTPMethod || otpVerified) && (
              <motion.button
                type="submit"
                disabled={loading || isLockedOut || success}
                className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white min-h-[48px] px-6 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
                whileHover={!loading && !isLockedOut && !success ? { scale: 1.02 } : {}}
                whileTap={!loading && !isLockedOut && !success ? { scale: 0.97 } : {}}>
                {loading ? (
                  <>
                    <motion.div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    Resetting Password…
                  </>
                ) : success ? (
                  <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Password Reset — Redirecting…</>
                ) : (
                  <><Lock className="w-4 h-4" aria-hidden="true" /> Reset Password</>
                )}
              </motion.button>
            )}
          </form>

          {/* Success */}
          <AnimatePresence>
            {success && (
              <motion.div className="mt-5 p-4 rounded-xl border"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                role="status" aria-live="polite">
                <p className="text-sm font-semibold text-green-400">Password reset successfully!</p>
                <Link to="/player/login" className="text-xs text-green-400/70 hover:text-green-400 transition-colors mt-1 inline-block min-h-[36px] flex items-center">
                  Go to Login →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && !isLockedOut && !success && (
              <motion.div className="mt-5 p-4 rounded-xl border"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                role="alert" aria-live="assertive">
                <p className="text-sm text-red-400">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t flex flex-col items-center gap-3" style={{ borderColor: COLORS.darkBorderSubtle }}>
            {isOTPMethod ? (
              <p className="text-sm text-white/35">
                Didn't receive OTP?{' '}
                <Link to="/forgot-password" className="font-semibold transition-colors duration-200 hover:opacity-80"
                  style={{ color: COLORS.saffronLight }}>
                  Request New OTP
                </Link>
              </p>
            ) : (
              <p className="text-sm text-white/35">
                Remember your password?{' '}
                <Link to="/player/login" className="font-semibold transition-colors duration-200 hover:opacity-80"
                  style={{ color: COLORS.saffronLight }}>
                  Back to Login
                </Link>
              </p>
            )}
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

export default ResetPassword;
