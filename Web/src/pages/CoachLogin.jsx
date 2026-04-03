import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowRight, UserCheck, Eye, EyeOff, Lock, Mail, Users, Trophy, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { coachAPI } from '../services/api';
import { useAuth } from '../App';
import BHALogo from '../assets/BHA.png';
import { useRateLimit } from '../hooks/useRateLimit';
import { loginSchema } from '../utils/validation';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#030805',
  panel:       '#040A06',
  green:       '#22C55E',
  greenDark:   '#16A34A',
  greenLight:  '#4ADE80',
  red:         '#EF4444',
  border:      'rgba(34,197,94,0.15)',
  borderBright:'rgba(34,197,94,0.38)',
};

const EASE = [0.22, 1, 0.36, 1];

// ─── Reduced-motion ───────────────────────────────────────────────────────────
const useReducedMotion = () => {
  const [r, setR] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = (e) => setR(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return r;
};

// ─── Hexagonal mesh background ────────────────────────────────────────────────
const HexMesh = () => {
  const reduced = useReducedMotion();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* SVG hex pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="coach-hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
            <polygon points="28,2 52,14 52,34 28,46 4,34 4,14"
              fill="none" stroke={C.green} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#coach-hex)" />
      </svg>

      {/* Green radial glow */}
      <div className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 50%, ${C.green}0E 0%, transparent 65%)` }} />

      {/* Corner glows */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.green}18, transparent 70%)`, filter: 'blur(60px)' }} />
      <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.greenDark}15, transparent 70%)`, filter: 'blur(50px)' }} />

      {/* Noise grain */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }} />

      {/* Animated scan line */}
      {!reduced && (
        <motion.div className="absolute top-0 bottom-0 w-px opacity-[0.08]"
          style={{ background: `linear-gradient(to bottom, transparent, ${C.green}, transparent)` }}
          animate={{ left: ['0%', '100%'] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear', repeatDelay: 5 }} />
      )}

      {/* Floating particles */}
      {!reduced && Array.from({ length: 10 }, (_, i) => (
        <motion.div key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 3 + 1,
            height: Math.random() * 3 + 1,
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            background: C.green,
          }}
          animate={{ y: [0, -45, 0], opacity: [0.1, 0.45, 0.1] }}
          transition={{ duration: 5 + Math.random() * 5, delay: Math.random() * 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

// ─── Coach icon ornament ──────────────────────────────────────────────────────
const CoachOrnament = () => {
  const reduced = useReducedMotion();
  return (
    <motion.div className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
      {!reduced && (
        <motion.div className="absolute w-36 h-36 rounded-full border"
          style={{ borderColor: `${C.green}22`, borderStyle: 'dashed' }}
          animate={{ rotate: -360 }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} />
      )}
      <motion.div className="absolute w-24 h-24 rounded-full border"
        style={{ borderColor: `${C.green}30` }}
        animate={reduced ? {} : { scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${C.green}20, ${C.greenDark}15)`,
          border: `1px solid ${C.green}40`,
          boxShadow: `0 0 40px ${C.green}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}>
        <UserCheck className="w-10 h-10" style={{ color: C.green }} aria-hidden="true" />
      </div>
    </motion.div>
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
const GreenInput = ({ icon: Icon, error, right, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      {Icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <Icon className="w-4 h-4 transition-colors duration-200"
            style={{ color: error ? C.red : focused ? C.green : 'rgba(255,255,255,0.22)' }} aria-hidden="true" />
        </div>
      )}
      <input
        className="w-full text-sm text-white outline-none transition-all duration-200 min-h-[50px] rounded-xl"
        style={{
          background: focused ? `${C.green}08` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${error ? `${C.red}70` : focused ? `${C.green}55` : 'rgba(255,255,255,0.09)'}`,
          boxShadow: focused ? `0 0 0 3px ${error ? C.red : C.green}14` : 'none',
          paddingLeft: Icon ? '2.75rem' : '1rem',
          paddingRight: right ? '3rem' : '1rem',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          caretColor: C.green,
        }}
        placeholder={props.placeholder}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        {...props}
      />
      {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
};

// ─── CoachLogin ───────────────────────────────────────────────────────────────
const CoachLogin = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const reduced = useReducedMotion();
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  const { checkRateLimit, recordAttempt, reset } = useRateLimit(5, 60000);

  useEffect(() => {
    if (user && userType === 'coach') {
      coachAPI.getStatus()
        .then(response => {
          const { step } = response.data;
          navigate(step === 'create-team' ? '/coach/create-team' : '/coach/select-competition');
        })
        .catch(() => navigate('/coach/select-competition'));
    }
  }, [user, userType, navigate]);

  const onSubmit = async (data) => {
    // Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      toast.error(`Too many login attempts. Please wait ${waitTime} seconds.`);
      return;
    }

    // Validate input
    const validation = loginSchema.safeParse(data);
    if (!validation.success) {
      validation.error.errors.forEach((err) => {
        setError(err.path[0], { message: err.message });
      });
      return;
    }

    setLoading(true);
    try {
      const response = await coachAPI.login(validation.data);
      const { token, coach } = response.data;
      login(coach, token, 'coach');
      toast.success('Welcome back, Coach!');
      reset(); // Reset rate limit on success
      try {
        const statusResponse = await coachAPI.getStatus();
        const { step } = statusResponse.data;
        navigate(step === 'create-team' ? '/coach/create-team' : '/coach/select-competition');
      } catch {
        navigate('/coach/select-competition');
      }
    } catch (error) {
      recordAttempt(); // Record failed attempt
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex relative overflow-hidden"
      style={{ background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Left decorative panel (desktop) ── */}
      <div className="hidden lg:flex flex-col items-center justify-center w-[45%] relative border-r"
        style={{ background: C.panel, borderColor: C.border }}>
        <HexMesh />

        <div className="relative z-10 text-center px-12">
          <motion.div className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}>
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain opacity-80" />
          </motion.div>

          <div className="mb-10">
            <CoachOrnament />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: `${C.green}80` }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3"
              style={{
                background: `linear-gradient(135deg, ${C.green}, ${C.greenLight}, ${C.greenDark})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
              Coach<br />Portal
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              Manage your team, handle registrations, and guide your athletes to victory.
            </p>
          </motion.div>

          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {[
              { icon: Users, label: 'Manage' },
              { icon: Trophy, label: 'Compete' },
              { icon: Layers, label: 'Organize' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${C.green}12`, border: `1px solid ${C.green}25` }}>
                  <Icon className="w-4 h-4" style={{ color: C.green }} aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: `${C.green}60` }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${C.green}40, transparent)` }} />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${C.green}0E, transparent 65%)` }} />
        </div>

        <motion.div className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}>
          <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-75" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.green }}>Mallakhamb</p>
            <p className="text-white/30 text-[10px]">Coach Portal</p>
          </div>
        </motion.div>

        <motion.div className="w-full max-w-sm"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}>

          <motion.div className="mb-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="lg:hidden mb-5 flex justify-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${C.green}15`, border: `1px solid ${C.green}35` }}>
                <UserCheck className="w-8 h-8" style={{ color: C.green }} aria-hidden="true" />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${C.green}70` }}>Coach Access</span>
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.green}40)` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">Sign In</h2>
            <p className="text-white/35 text-sm mt-1">Enter your coach credentials</p>
          </motion.div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${C.green}90` }} htmlFor="co-email">
                  Email <span style={{ color: C.red }}>*</span>
                </label>
                <GreenInput id="co-email" icon={Mail} type="email" placeholder="coach@example.com"
                  error={errors.email} autoComplete="email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' },
                  })} />
                <AnimatePresence>
                  {errors.email && (
                    <motion.p className="text-xs mt-1.5" style={{ color: C.red }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.email.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${C.green}90` }} htmlFor="co-pw">
                  Password <span style={{ color: C.red }}>*</span>
                </label>
                <GreenInput id="co-pw" icon={Lock}
                  type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  error={errors.password} autoComplete="current-password"
                  right={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-white/25" />
                        : <Eye className="w-4 h-4 text-white/25" />}
                    </button>
                  }
                  {...register('password', { required: 'Password is required' })} />
                <AnimatePresence>
                  {errors.password && (
                    <motion.p className="text-xs mt-1.5" style={{ color: C.red }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.password.message}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <motion.button type="submit" disabled={loading}
                className="w-full rounded-xl font-black text-sm text-white min-h-[52px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 group"
                style={{
                  background: loading
                    ? `${C.green}15`
                    : `linear-gradient(135deg, ${C.green}, ${C.greenDark})`,
                  color: loading ? C.green : '#fff',
                  boxShadow: loading ? 'none' : `0 8px 28px ${C.green}30, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  letterSpacing: '0.04em',
                }}
                whileHover={!loading ? { scale: 1.02, filter: 'brightness(1.08)' } : {}}
                whileTap={!loading ? { scale: 0.97 } : {}}>
                {loading ? (
                  <>
                    <motion.div className="w-4 h-4 border-2 rounded-full"
                      style={{ borderColor: `${C.green}40`, borderTopColor: C.green }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    <span style={{ color: C.green }}>Signing in...</span>
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
                )}
              </motion.button>
            </motion.div>
          </form>

          <motion.div className="mt-7 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: 'rgba(34,197,94,0.12)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            <Link to="/forgot-password"
              className="text-xs transition-colors hover:underline underline-offset-4"
              style={{ color: `${C.green}70` }}>
              Forgot password?
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
                ← Home
              </Link>
              <span className="text-white/15 text-xs">·</span>
              <Link to="/coach/register"
                className="text-xs transition-colors hover:underline underline-offset-4"
                style={{ color: `${C.green}70` }}>
                Register
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <motion.div className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{ background: `linear-gradient(to bottom, transparent, ${C.green}30, transparent)` }}
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: EASE }} />
    </div>
  );
};

export default CoachLogin;
