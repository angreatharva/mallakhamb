import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Crown, Eye, EyeOff, Lock, Mail, ArrowRight, Star, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { superAdminAPI } from '../services/api';
import { useAuth } from '../App';
import BHALogo from '../assets/BHA.png';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#050505',
  panel:       '#0C0A00',
  card:        '#0A0A0A',
  gold:        '#F5A623',
  saffron:     '#FF6B00',
  saffronDark: '#CC5500',
  amber:       '#FBBF24',
  red:         '#EF4444',
  border:      'rgba(245,166,35,0.18)',
  borderBright:'rgba(245,166,35,0.40)',
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

// ─── Radial burst background ──────────────────────────────────────────────────
const RadialBurst = () => {
  const reduced = useReducedMotion();
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Concentric rings */}
      {[200, 360, 520, 680].map((r, i) => (
        <motion.div key={r}
          className="absolute rounded-full border"
          style={{
            width: r, height: r,
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            borderColor: `${C.gold}${['18', '10', '08', '05'][i]}`,
          }}
          animate={reduced ? {} : { scale: [1, 1.04, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }}
        />
      ))}

      {/* Gold radial glow center */}
      <div className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 50%, ${C.gold}12 0%, transparent 65%)` }} />

      {/* Top-left corner glow */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.saffron}20, transparent 70%)`, filter: 'blur(50px)' }} />

      {/* Bottom-right glow */}
      <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.gold}15, transparent 70%)`, filter: 'blur(50px)' }} />

      {/* Noise grain overlay */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }} />

      {/* Floating gold particles */}
      {!reduced && Array.from({ length: 10 }, (_, i) => (
        <motion.div key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 3 + 1,
            height: Math.random() * 3 + 1,
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            background: C.gold,
          }}
          animate={{ y: [0, -40, 0], opacity: [0.1, 0.5, 0.1] }}
          transition={{ duration: 5 + Math.random() * 5, delay: Math.random() * 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

// ─── Spinning crown ornament ──────────────────────────────────────────────────
const CrownOrnament = () => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}
    >
      {/* Outer rotating ring */}
      {!reduced && (
        <motion.div
          className="absolute w-36 h-36 rounded-full border"
          style={{ borderColor: `${C.gold}25`, borderStyle: 'dashed' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {/* Middle ring */}
      <motion.div
        className="absolute w-24 h-24 rounded-full border"
        style={{ borderColor: `${C.gold}35` }}
        animate={reduced ? {} : { scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Icon container */}
      <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${C.gold}20, ${C.saffron}15)`,
          border: `1px solid ${C.gold}40`,
          boxShadow: `0 0 40px ${C.gold}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}>
        <Crown className="w-10 h-10" style={{ color: C.gold }} aria-hidden="true" />
      </div>
    </motion.div>
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
const GoldInput = ({ icon: Icon, error, right, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      {Icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <Icon className="w-4 h-4 transition-colors duration-200"
            style={{ color: error ? C.red : focused ? C.gold : 'rgba(255,255,255,0.22)' }} aria-hidden="true" />
        </div>
      )}
      <input
        className="w-full text-sm text-white outline-none transition-all duration-200 min-h-[50px] rounded-xl"
        style={{
          background: focused ? `${C.gold}08` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${error ? `${C.red}70` : focused ? `${C.gold}55` : 'rgba(255,255,255,0.09)'}`,
          boxShadow: focused ? `0 0 0 3px ${error ? C.red : C.gold}14` : 'none',
          paddingLeft: Icon ? '2.75rem' : '1rem',
          paddingRight: right ? '3rem' : '1rem',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          caretColor: C.gold,
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

// ─── Super Admin Login ────────────────────────────────────────────────────────
const SuperAdminLogin = () => {
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, userType } = useAuth();
  const reduced = useReducedMotion();
  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    if (user && userType === 'superadmin') navigate('/superadmin/dashboard');
  }, [user, userType, navigate]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await superAdminAPI.login(data);
      const { token, admin } = res.data;
      login(admin, token, 'superadmin');
      toast.success('Welcome, Super Admin');
      navigate('/superadmin/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
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
        <RadialBurst />

        <div className="relative z-10 text-center px-12">
          {/* Logo */}
          <motion.div className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}>
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain opacity-80" />
          </motion.div>

          {/* Crown ornament */}
          <div className="mb-10">
            <CrownOrnament />
          </div>

          {/* Title block */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: `${C.gold}80` }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3"
              style={{
                background: `linear-gradient(135deg, ${C.gold}, ${C.amber}, ${C.saffron})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
              Supreme<br />Command
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              Full sovereign access to all competitions, administrators, and platform systems.
            </p>
          </motion.div>

          {/* Stats row */}
          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {[
              { icon: Star, label: 'All Access' },
              { icon: Zap, label: 'Real-time' },
              { icon: Crown, label: 'Sovereign' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}25` }}>
                  <Icon className="w-4 h-4" style={{ color: C.gold }} aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: `${C.gold}60` }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom gold line */}
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${C.gold}40, transparent)` }} />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        {/* Mobile: radial bg */}
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${C.gold}10, transparent 65%)` }} />
        </div>

        {/* Mobile logo */}
        <motion.div className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}>
          <img src={BHALogo} alt="BHA Logo" className="h-10 w-auto object-contain opacity-75" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.gold }}>Mallakhamb</p>
            <p className="text-white/30 text-[10px]">Super Admin</p>
          </div>
        </motion.div>

        <motion.div className="w-full max-w-sm"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}>

          {/* Header */}
          <motion.div className="mb-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            {/* Mobile crown */}
            <div className="lg:hidden mb-5 flex justify-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${C.gold}15`, border: `1px solid ${C.gold}35` }}>
                <Crown className="w-8 h-8" style={{ color: C.gold }} aria-hidden="true" />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${C.gold}40, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${C.gold}70` }}>
                Restricted Access
              </span>
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.gold}40)` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">Sign In</h2>
            <p className="text-white/35 text-sm mt-1">Super Administrator credentials required</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${C.gold}90` }} htmlFor="sa-email">
                  Email <span style={{ color: C.red }}>*</span>
                </label>
                <GoldInput id="sa-email" icon={Mail} type="email" placeholder="superadmin@example.com"
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
                  style={{ color: `${C.gold}90` }} htmlFor="sa-pw">
                  Password <span style={{ color: C.red }}>*</span>
                </label>
                <GoldInput id="sa-pw" icon={Lock}
                  type={showPw ? 'text' : 'password'} placeholder="••••••••"
                  error={errors.password} autoComplete="current-password"
                  right={
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPw ? 'Hide password' : 'Show password'}>
                      {showPw ? <EyeOff className="w-4 h-4 text-white/25" /> : <Eye className="w-4 h-4 text-white/25" />}
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

              {/* Submit */}
              <motion.button type="submit" disabled={loading}
                className="w-full rounded-xl font-black text-sm min-h-[52px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 group"
                style={{
                  background: loading
                    ? `${C.gold}15`
                    : `linear-gradient(135deg, ${C.gold}, ${C.saffron})`,
                  color: loading ? C.gold : '#000',
                  boxShadow: loading ? 'none' : `0 8px 28px ${C.gold}30, inset 0 1px 0 rgba(255,255,255,0.2)`,
                  letterSpacing: '0.04em',
                }}
                whileHover={!loading ? { scale: 1.02, filter: 'brightness(1.08)' } : {}}
                whileTap={!loading ? { scale: 0.97 } : {}}>
                {loading ? (
                  <>
                    <motion.div className="w-4 h-4 border-2 rounded-full"
                      style={{ borderColor: `${C.gold}40`, borderTopColor: C.gold }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    <span style={{ color: C.gold }}>Verifying...</span>
                  </>
                ) : (
                  <>
                    Enter Command Center
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </>
                )}
              </motion.button>
            </motion.div>
          </form>

          {/* Footer */}
          <motion.div className="mt-7 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: 'rgba(245,166,35,0.12)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            <Link to="/forgot-password"
              className="text-xs transition-colors hover:underline underline-offset-4"
              style={{ color: `${C.gold}70` }}>
              Forgot password?
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
                ← Home
              </Link>
              <span className="text-white/15 text-xs">·</span>
              <Link to="/admin/login"
                className="text-xs text-white/20 hover:text-white/45 transition-colors">
                Admin Login
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right gold edge */}
      <motion.div className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{ background: `linear-gradient(to bottom, transparent, ${C.gold}30, transparent)` }}
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: EASE }} />
    </div>
  );
};

export default SuperAdminLogin;
