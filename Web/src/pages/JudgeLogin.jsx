import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Scale, Lock, User, AlertCircle, Eye, EyeOff, ArrowRight, Gavel, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '../utils/apiConfig';
import { secureStorage } from '../utils/secureStorage';
import { logger } from '../utils/logger';
import { useRateLimit } from '../hooks/useRateLimit';
import { judgeLoginSchema } from '../utils/validation';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#04030A',
  panel:       '#060510',
  purple:      '#A855F7',
  purpleLight: '#C084FC',
  purpleDark:  '#7C3AED',
  indigo:      '#6366F1',
  red:         '#EF4444',
  border:      'rgba(168,85,247,0.15)',
  borderBright:'rgba(168,85,247,0.38)',
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

// ─── Constellation background ─────────────────────────────────────────────────
const Constellation = () => {
  const reduced = useReducedMotion();
  const nodes = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    y: 5 + Math.random() * 90,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* SVG constellation */}
      {!reduced && (
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          {nodes.slice(0, -1).map((n, i) => (
            <line key={i}
              x1={`${n.x}%`} y1={`${n.y}%`}
              x2={`${nodes[i + 1].x}%`} y2={`${nodes[i + 1].y}%`}
              stroke={C.purple} strokeWidth="0.5" />
          ))}
          {nodes.map((n) => (
            <circle key={n.id} cx={`${n.x}%`} cy={`${n.y}%`} r="2" fill={C.purple} />
          ))}
        </svg>
      )}

      {/* Purple radial glow */}
      <div className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 50%, ${C.purple}0C 0%, transparent 65%)` }} />

      {/* Corner glows */}
      <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.purple}1A, transparent 70%)`, filter: 'blur(60px)' }} />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full"
        style={{ background: `radial-gradient(circle, ${C.indigo}15, transparent 70%)`, filter: 'blur(50px)' }} />

      {/* Noise grain */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }} />

      {/* Floating particles */}
      {!reduced && Array.from({ length: 10 }, (_, i) => (
        <motion.div key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 3 + 1,
            height: Math.random() * 3 + 1,
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            background: C.purple,
          }}
          animate={{ y: [0, -40, 0], opacity: [0.1, 0.45, 0.1] }}
          transition={{ duration: 5 + Math.random() * 5, delay: Math.random() * 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

// ─── Judge icon ornament ──────────────────────────────────────────────────────
const JudgeOrnament = () => {
  const reduced = useReducedMotion();
  return (
    <motion.div className="relative flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.3, type: 'spring', stiffness: 200, damping: 18 }}>
      {!reduced && (
        <motion.div className="absolute w-36 h-36 rounded-full border"
          style={{ borderColor: `${C.purple}22`, borderStyle: 'dashed' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 26, repeat: Infinity, ease: 'linear' }} />
      )}
      <motion.div className="absolute w-24 h-24 rounded-full border"
        style={{ borderColor: `${C.purple}30` }}
        animate={reduced ? {} : { scale: [1, 1.06, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
      <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${C.purple}20, ${C.indigo}15)`,
          border: `1px solid ${C.purple}40`,
          boxShadow: `0 0 40px ${C.purple}20, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}>
        <Scale className="w-10 h-10" style={{ color: C.purple }} aria-hidden="true" />
      </div>
    </motion.div>
  );
};

// ─── Input ────────────────────────────────────────────────────────────────────
const PurpleInput = ({ icon: Icon, error, right, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      {Icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <Icon className="w-4 h-4 transition-colors duration-200"
            style={{ color: error ? C.red : focused ? C.purpleLight : 'rgba(255,255,255,0.22)' }} aria-hidden="true" />
        </div>
      )}
      <input
        className="w-full text-sm text-white outline-none transition-all duration-200 min-h-[50px] rounded-xl"
        style={{
          background: focused ? `${C.purple}08` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${error ? `${C.red}70` : focused ? `${C.purple}55` : 'rgba(255,255,255,0.09)'}`,
          boxShadow: focused ? `0 0 0 3px ${error ? C.red : C.purple}14` : 'none',
          paddingLeft: Icon ? '2.75rem' : '1rem',
          paddingRight: right ? '3rem' : '1rem',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          caretColor: C.purpleLight,
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

// ─── JudgeLogin ───────────────────────────────────────────────────────────────
const JudgeLogin = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const { checkRateLimit, recordAttempt, reset } = useRateLimit(5, 60000);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error for this field
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: null });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check rate limit
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      toast.error(`Too many login attempts. Please wait ${waitTime} seconds.`);
      return;
    }

    // Validate input
    const validation = judgeLoginSchema.safeParse(formData);
    if (!validation.success) {
      const newErrors = {};
      validation.error.errors.forEach((err) => {
        newErrors[err.path[0]] = err.message;
      });
      setErrors(newErrors);
      toast.error('Please fix the errors in the form');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${apiConfig.getBaseUrl()}/judge/login`,
        { username: validation.data.username.toLowerCase(), password: validation.data.password },
        { headers: apiConfig.getHeaders() }
      );
      secureStorage.setItem('judge_token', response.data.token);
      secureStorage.setItem('judge_user', JSON.stringify(response.data.judge));
      toast.success(`Welcome ${response.data.judge.name}!`);
      reset(); // Reset rate limit on success
      navigate('/judge/scoring');
    } catch (error) {
      recordAttempt(); // Record failed attempt
      logger.error('Judge login error:', error);
      toast.error(error.response?.data?.message || 'Login failed. Please try again.');
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
        <Constellation />

        <div className="relative z-10 text-center px-12">
          <motion.div className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, ease: EASE }}>
            <div className="flex items-center gap-3">
              <Scale className="w-8 h-8" style={{ color: C.purple }} aria-hidden="true" />
              <div className="text-left">
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.purpleLight }}>Mallakhamb</p>
                <p className="text-white/40 text-[10px]">Competition Platform</p>
              </div>
            </div>
          </motion.div>

          <div className="mb-10">
            <JudgeOrnament />
          </div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, ease: EASE }}>
            <p className="text-[11px] font-bold tracking-[0.3em] uppercase mb-3"
              style={{ color: `${C.purple}80` }}>
              Bhausaheb Ranade Mallakhamb
            </p>
            <h1 className="text-4xl font-black leading-tight mb-3"
              style={{
                background: `linear-gradient(135deg, ${C.purple}, ${C.purpleLight}, ${C.indigo})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
              Judge<br />Portal
            </h1>
            <p className="text-white/30 text-sm leading-relaxed max-w-xs mx-auto">
              Score performances with precision. Your judgment shapes the competition.
            </p>
          </motion.div>

          <motion.div className="flex items-center justify-center gap-8 mt-10"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            {[
              { icon: Scale, label: 'Score' },
              { icon: Gavel, label: 'Judge' },
              { icon: BookOpen, label: 'Review' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${C.purple}12`, border: `1px solid ${C.purple}25` }}>
                  <Icon className="w-4 h-4" style={{ color: C.purple }} aria-hidden="true" />
                </div>
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: `${C.purple}60` }}>{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${C.purple}40, transparent)` }} />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-12">
        <div className="lg:hidden absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse at 50% 30%, ${C.purple}0C, transparent 65%)` }} />
        </div>

        <motion.div className="lg:hidden flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ease: EASE }}>
          <Scale className="w-8 h-8" style={{ color: C.purple }} aria-hidden="true" />
          <div className="w-px h-8 bg-white/10" />
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.purple }}>Mallakhamb</p>
            <p className="text-white/30 text-[10px]">Judge Portal</p>
          </div>
        </motion.div>

        <motion.div className="w-full max-w-sm"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}>

          <motion.div className="mb-8"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="lg:hidden mb-5 flex justify-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: `${C.purple}15`, border: `1px solid ${C.purple}35` }}>
                <Scale className="w-8 h-8" style={{ color: C.purple }} aria-hidden="true" />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${C.purple}40, transparent)` }} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase px-2"
                style={{ color: `${C.purple}70` }}>Judge Access</span>
              <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${C.purple}40)` }} />
            </div>
            <h2 className="text-3xl font-black text-white mt-3">Sign In</h2>
            <p className="text-white/35 text-sm mt-1">Credentials provided by the administrator</p>
          </motion.div>

          <form onSubmit={handleSubmit} noValidate>
            <motion.div className="space-y-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${C.purpleLight}90` }} htmlFor="j-username">
                  Username <span style={{ color: C.red }}>*</span>
                </label>
                <PurpleInput id="j-username" icon={User} type="text" placeholder="Enter your username"
                  name="username" value={formData.username} onChange={handleChange}
                  autoComplete="username" required error={errors.username} />
                <AnimatePresence>
                  {errors.username && (
                    <motion.p className="text-xs mt-1.5" style={{ color: C.red }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.username}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.15em] uppercase mb-2"
                  style={{ color: `${C.purpleLight}90` }} htmlFor="j-pw">
                  Password <span style={{ color: C.red }}>*</span>
                </label>
                <PurpleInput id="j-pw" icon={Lock}
                  type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  name="password" value={formData.password} onChange={handleChange}
                  autoComplete="current-password" required error={errors.password}
                  right={
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="p-1 rounded hover:bg-white/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}>
                      {showPassword
                        ? <EyeOff className="w-4 h-4 text-white/25" aria-hidden="true" />
                        : <Eye className="w-4 h-4 text-white/25" aria-hidden="true" />}
                    </button>
                  } />
                <AnimatePresence>
                  {errors.password && (
                    <motion.p className="text-xs mt-1.5" style={{ color: C.red }}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert">
                      {errors.password}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-3 p-4 rounded-xl border"
                style={{ background: `${C.purple}08`, borderColor: `${C.purple}25` }}>
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: C.purple }} aria-hidden="true" />
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
                  Your credentials are provided by the competition administrator.
                </p>
              </div>

              <motion.button type="submit" disabled={loading}
                className="w-full rounded-xl font-black text-sm text-white min-h-[52px] flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 group"
                style={{
                  background: loading
                    ? `${C.purple}15`
                    : `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})`,
                  color: loading ? C.purple : '#fff',
                  boxShadow: loading ? 'none' : `0 8px 28px ${C.purple}30, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  letterSpacing: '0.04em',
                }}
                whileHover={!loading ? { scale: 1.02, filter: 'brightness(1.08)' } : {}}
                whileTap={!loading ? { scale: 0.97 } : {}}>
                {loading ? (
                  <>
                    <motion.div className="w-4 h-4 border-2 rounded-full"
                      style={{ borderColor: `${C.purple}40`, borderTopColor: C.purple }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                    <span style={{ color: C.purple }}>Signing in...</span>
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

          <motion.div className="mt-7 pt-5 border-t text-center"
            style={{ borderColor: 'rgba(168,85,247,0.12)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
            <Link to="/" className="text-xs text-white/20 hover:text-white/45 transition-colors">
              ← Back to Home
            </Link>
          </motion.div>
        </motion.div>
      </div>

      <motion.div className="absolute right-0 top-0 bottom-0 w-[2px] hidden lg:block"
        style={{ background: `linear-gradient(to bottom, transparent, ${C.purple}30, transparent)` }}
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.4, ease: EASE }} />
    </div>
  );
};

export default JudgeLogin;
