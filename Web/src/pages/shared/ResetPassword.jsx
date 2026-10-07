import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { authAPI } from '@/services/api';
import { validatePasswordStrength } from '@/validators/form.validator';
import { portalFromSearch, accountTypeFor, loginPathFor, withPortal } from './resetPortal';
import BHALogo from '../../assets/BHA.png';
import { AmbientOrbs, ORB_INTENSITY } from '@/components/design-system/backgrounds';
import { COLORS, FG, alpha } from '@/styles/tokens';
import { GradientText } from '@/components/design-system';
import { useReducedMotion } from '@/hooks/useResponsive';

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

const StyledInput = ({ error, verified, ...props }) => (
  <input
    className="w-full px-4 py-3 rounded-xl text-ink text-base mouse:text-sm transition-all duration-200 min-h-[48px] placeholder:text-ink/25"
    style={{
      background: verified ? 'rgba(34,197,94,0.06)' : 'rgb(var(--ink) / 0.05)',
      border: `1px solid ${error ? '#EF4444' : verified ? 'rgba(34,197,94,0.4)' : COLORS.darkBorderSubtle}`,
      caretColor: COLORS.saffron,
    }}
    onFocus={e => {
      if (!verified) {
        e.target.style.borderColor = error ? '#EF4444' : COLORS.saffron;
        e.target.style.boxShadow = `0 0 0 3px ${error ? '#EF444420' : `${alpha(COLORS.saffron, 0x20)}`}`;
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
  <div className="relative flex items-center">
    <input
      type={showPassword ? 'text' : 'password'}
      className="w-full px-4 py-3 pr-12 rounded-xl text-ink text-base mouse:text-sm transition-all duration-200 min-h-[48px] placeholder:text-ink/25"
      style={{
        background: 'rgb(var(--ink) / 0.05)',
        border: `1px solid ${error ? '#EF4444' : COLORS.darkBorderSubtle}`,
        caretColor: COLORS.saffron,
      }}
      onFocus={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.saffron; e.target.style.boxShadow = `0 0 0 3px ${error ? '#EF444420' : `${alpha(COLORS.saffron, 0x20)}`}`; }}
      onBlur={e => { e.target.style.borderColor = error ? '#EF4444' : COLORS.darkBorderSubtle; e.target.style.boxShadow = 'none'; }}
      {...props}
    />
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-0 bottom-0 my-auto h-9 w-9 rounded-lg text-fg-muted hover:text-fg transition-colors duration-200 flex items-center justify-center"
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

  const navigate = useNavigate();
  const location = useLocation();
  const portal = portalFromSearch(location.search);
  const userType = accountTypeFor(portal);
  const emailFromState = location.state?.email || '';
  const reduced = useReducedMotion();
  const cardRef = useRef(null);
  const cardInView = useInView(cardRef, { once: true });

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { email: emailFromState },
  });
  const password = watch('password');

  // The server answers every failed code with one message and discards a code
  // after too many wrong guesses, so there is no attempt counter to show here.
  const handleVerifyOTP = async () => {
    const email = watch('email');
    const otp = watch('otp');
    if (!email || !otp) { toast.error('Please enter email and OTP'); return; }
    if (otp.length !== 6) { toast.error('OTP must be 6 digits'); return; }
    setVerifying(true); setError('');
    try {
      await authAPI.verifyOTP(email, otp, userType);
      setOtpVerified(true);
      toast.success('OTP verified! Set your new password.');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Invalid OTP';
      toast.error(msg); setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const onSubmit = async (data) => {
    setLoading(true); setError('');
    try {
      await authAPI.resetPasswordWithOTP(data.email, data.otp, data.password, userType);
      setSuccess(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate(loginPathFor(portal)), 2000);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to reset password. Please try again.';
      setError(msg); toast.error(msg);
      // A code rejected at this step (expired, or replaced by a newer one) must
      // be re-entered, so unlock the code field again. A weak-password
      // rejection keeps the verified code.
      if (err.response?.status === 400 && !/password/i.test(msg)) setOtpVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const step = otpVerified ? 2 : 1;

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <AmbientOrbs
        intensity={ORB_INTENSITY.warm}
        orbs={[
          { x: 20, y: 15, size: 380, color: COLORS.saffron, delay: 0, duration: 8, blur: 120 },
          { x: 80, y: 75, size: 280, color: COLORS.gold, delay: 1.5, duration: 10, blur: 100 },
        ]}
      />

      {!reduced && (
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(${alpha(COLORS.saffron, 0x80)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(COLORS.saffron, 0x80)} 1px, transparent 1px)`,
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
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: FG.brand }}>Bhausaheb Ranade</p>
          <p className="text-ink text-sm font-bold leading-tight">Mallakhamb Competition</p>
        </div>
      </motion.div>

      {/* Card */}
      <motion.div ref={cardRef} className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={cardInView ? { opacity: 1, y: 0, scale: 1 } : {}}
        transition={{ duration: 0.65, ease: EASE_OUT }}>
        <div className="rounded-3xl p-8 border" style={{
          background: 'rgb(var(--ink) / 0.03)', backdropFilter: 'blur(24px)',
          borderColor: COLORS.darkBorder,
          boxShadow: `0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px ${COLORS.darkBorderSubtle}`,
        }}>
          {/* Icon + heading */}
          <div className="text-center mb-6">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 mx-auto"
              style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `1px solid ${COLORS.darkBorder}` }}
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}>
              <Lock className="w-7 h-7" style={{ color: FG.brand }} aria-hidden="true" />
            </motion.div>
            <h1 className="text-2xl font-black text-ink mb-2">
              Reset <GradientText>Password</GradientText>
            </h1>
            <p className="text-fg-muted text-sm">
              Verify your OTP then set a new password
            </p>
          </div>

          {/* Step indicator */}
          {(
            <div className="flex items-center gap-2 mb-6">
              {[1, 2].map(s => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-all duration-300"
                    style={{
                      background: step >= s ? COLORS.saffron : 'rgb(var(--ink) / 0.08)',
                      color: step >= s ? '#0A0A0A' : 'var(--fg-muted)',
                    }}>
                    {step > s ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : s}
                  </div>
                  <span className="text-xs font-medium transition-colors duration-300"
                    style={{ color: step >= s ? 'rgb(var(--ink) / 0.7)' : 'var(--fg-muted)' }}>
                    {s === 1 ? 'Verify OTP' : 'New Password'}
                  </span>
                  {s < 2 && <div className="flex-1 h-px" style={{ background: step > s ? COLORS.saffron : COLORS.darkBorderSubtle }} />}
                </div>
              ))}
            </div>
          )}

          {/* OTP verified banner */}
          <AnimatePresence>
            {otpVerified && (
              <motion.div className="mb-5 p-3 rounded-xl border flex items-center gap-2"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                role="status" aria-live="polite">
                <CheckCircle2 className="w-4 h-4 text-green-700 dark:text-green-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">OTP verified — set your new password below</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {(
              <>
                {/* Email */}
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-semibold text-ink/70 mb-2">
                    Email Address <span style={{ color: FG.brand }} aria-hidden="true">*</span>
                  </label>
                  <StyledInput
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Please enter a valid email' },
                    })}
                    id="email" type="email" autoComplete="email"
                    placeholder="you@example.com"
                    disabled={loading || otpVerified}
                    error={!!errors.email} verified={otpVerified}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: FG.danger }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {errors.email.message}
                    </motion.p>
                  )}
                </div>

                {/* OTP */}
                <div className="mb-4">
                  <label htmlFor="otp" className="block text-sm font-semibold text-ink/70 mb-2">
                    OTP Code <span style={{ color: FG.brand }} aria-hidden="true">*</span>
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
                        disabled={loading || otpVerified}
                        error={!!errors.otp} verified={otpVerified}
                        aria-invalid={!!errors.otp}
                      />
                      {otpVerified && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle2 className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <motion.button
                      type="button"
                      onClick={handleVerifyOTP}
                      disabled={loading || verifying || otpVerified}
                      className="px-4 rounded-xl text-sm font-bold min-h-[48px] whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      style={{
                        background: otpVerified ? 'rgba(34,197,94,0.15)' : `${alpha(COLORS.saffron, 0x18)}`,
                        border: `1px solid ${otpVerified ? 'rgba(34,197,94,0.3)' : COLORS.darkBorder}`,
                        color: otpVerified ? FG.success : FG.brandSoft,
                      }}
                      whileHover={!otpVerified && !verifying ? { scale: 1.03 } : {}}
                      whileTap={!otpVerified && !verifying ? { scale: 0.97 } : {}}>
                      {verifying ? (
                        <div className="animate-spin w-4 h-4 rounded-full border-2 border-current/30 border-t-current mx-auto" />
                      ) : otpVerified ? '✓ Verified' : 'Verify'}
                    </motion.button>
                  </div>
                  {errors.otp && (
                    <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: FG.danger }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {errors.otp.message}
                    </motion.p>
                  )}
                  {!otpVerified && !errors.otp && (
                    <p className="mt-1.5 text-xs text-fg-muted">Check your email for the 6-digit code</p>
                  )}
                </div>
              </>
            )}

            {/* New password — only shown after OTP verified */}
            <AnimatePresence>
              {otpVerified && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>
                  <div className="mb-4">
                    <label htmlFor="password" className="block text-sm font-semibold text-ink/70 mb-2">
                      New Password <span style={{ color: FG.brand }} aria-hidden="true">*</span>
                    </label>
                    <PasswordInput
                      {...register('password', {
                        required: 'Password is required',
                        // The server's rule, checked before the round trip.
                        validate: v => validatePasswordStrength(v).errors[0] || true,
                      })}
                      id="password" autoComplete="new-password"
                      placeholder="8+ characters, A–Z, a–z and 0–9"
                      disabled={loading}
                      error={!!errors.password}
                      showPassword={showPassword}
                      onToggle={() => setShowPassword(p => !p)}
                      aria-invalid={!!errors.password}
                    />
                    {errors.password && (
                      <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: FG.danger }}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        {errors.password.message}
                      </motion.p>
                    )}
                  </div>

                  <div className="mb-6">
                    <label htmlFor="confirmPassword" className="block text-sm font-semibold text-ink/70 mb-2">
                      Confirm Password <span style={{ color: FG.brand }} aria-hidden="true">*</span>
                    </label>
                    <PasswordInput
                      {...register('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: v => v === password || 'Passwords do not match',
                      })}
                      id="confirmPassword" autoComplete="new-password"
                      placeholder="Repeat your password"
                      disabled={loading}
                      error={!!errors.confirmPassword}
                      showPassword={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword(p => !p)}
                      aria-invalid={!!errors.confirmPassword}
                    />
                    {errors.confirmPassword && (
                      <motion.p role="alert" className="mt-1.5 text-xs font-medium" style={{ color: FG.danger }}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                        {errors.confirmPassword.message}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            {otpVerified && (
              <motion.button
                type="submit"
                disabled={loading || success}
                className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm min-h-[48px] px-6 transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`, color: '#0A0A0A' }}
                whileHover={!loading && !success ? { scale: 1.02 } : {}}
                whileTap={!loading && !success ? { scale: 0.97 } : {}}>
                {loading ? (
                  <>
                    <div className="animate-spin w-4 h-4 rounded-full border-2 border-ink/30 border-t-ink" />
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
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">Password reset successfully!</p>
                <Link to={loginPathFor(portal)} className="text-xs text-green-700 dark:text-green-400/70 hover:text-green-700 dark:hover:text-green-400 transition-colors mt-1 inline-block min-h-[36px] flex items-center">
                  Go to Login →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && !success && (
              <motion.div className="mt-5 p-4 rounded-xl border"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                role="alert" aria-live="assertive">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t flex flex-col items-center gap-3" style={{ borderColor: COLORS.darkBorderSubtle }}>
            <p className="text-sm text-fg-muted">
              Didn&apos;t receive OTP?{' '}
              <Link to={withPortal('/forgot-password', portal)} className="font-semibold underline underline-offset-2 transition-colors duration-200 hover:opacity-80"
                style={{ color: FG.brandSoft }}>
                Request New OTP
              </Link>
            </p>
            <Link to={loginPathFor(portal)} className="text-sm font-semibold underline underline-offset-2 transition-colors duration-200 hover:opacity-80 min-h-[44px] inline-flex items-center"
              style={{ color: FG.brandSoft }}>
              Back to Login
            </Link>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors duration-200 min-h-[44px]">
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
