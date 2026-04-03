import { Link } from 'react-router-dom';
import { Users, UserCheck, Trophy, Calendar, Camera, Menu, X, MapPin, Phone, Mail, Star, Award, Shield, ChevronDown, Zap, Quote, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useReducedMotion as _useReducedMotion } from '../hooks/useResponsive';
import { motion, useScroll, useTransform, useInView, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import MainHomeImg from '../assets/main-home.jpg';
import TextRevealBg from '../assets/Mallakhamb.png';
import BHALogo from '../assets/BHA.png';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Import from unified design system
import { COLORS as DESIGN_COLORS, EASE_OUT as DESIGN_EASE_OUT, EASE_SPRING as DESIGN_EASE_SPRING } from '../styles/tokens';

// Re-export for backward compatibility
export const COLORS = DESIGN_COLORS;
const EASE_OUT = DESIGN_EASE_OUT;
const EASE_SPRING = DESIGN_EASE_SPRING;

// ─── Reduced-motion hook (re-exported from hooks/useResponsive for back-compat) ─
export const useReducedMotion = _useReducedMotion;

// ─── Animated counter hook ───────────────────────────────────────────────────
const useCounter = (target, duration = 1800, inView = true) => {
  const [count, setCount] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!inView || reduced) { setCount(target); return; }
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, inView, reduced]);
  return count;
};

// ─── Shared: GlassCard ────────────────────────────────────────────────────────
export const GlassCard = ({ children, className = '', style = {}, ...props }) => (
  <div
    className={`rounded-2xl border ${className}`}
    style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(16px)',
      borderColor: COLORS.darkBorderSubtle,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

// ─── Shared: FadeIn ───────────────────────────────────────────────────────────
export const FadeIn = ({ children, delay = 0, direction = 'up', className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();

  const variants = {
    hidden: reduced ? { opacity: 0 } : {
      opacity: 0,
      y: direction === 'up' ? 36 : direction === 'down' ? -36 : 0,
      x: direction === 'left' ? 36 : direction === 'right' ? -36 : 0,
    },
    visible: { opacity: 1, y: 0, x: 0 },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={variants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ duration: 0.65, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
};

// ─── Shared: GradientText ─────────────────────────────────────────────────────
export const GradientText = ({ children, className = '' }) => (
  <span
    className={className}
    style={{
      background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.gold}, ${COLORS.saffronLight})`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }}
  >
    {children}
  </span>
);

// ─── Shared: SaffronButton ────────────────────────────────────────────────────
export const SaffronButton = ({ children, to, className = '', variant = 'solid', ...props }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm transition-all duration-200 min-h-[44px] px-6 cursor-pointer';
  const solid = `text-white hover:brightness-110 active:scale-95`;
  const outline = `border hover:bg-white/5 active:scale-95`;

  if (to) {
    return (
      <Link
        to={to}
        className={`${base} ${variant === 'solid' ? solid : outline} ${className}`}
        style={variant === 'solid'
          ? { background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }
          : { borderColor: `${COLORS.saffron}60`, color: COLORS.saffronLight }}
        {...props}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      className={`${base} ${variant === 'solid' ? solid : outline} ${className}`}
      style={variant === 'solid'
        ? { background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }
        : { borderColor: `${COLORS.saffron}60`, color: COLORS.saffronLight }}
      {...props}
    >
      {children}
    </button>
  );
};

// ─── Role data ────────────────────────────────────────────────────────────────
export const roles = [
  { icon: Users, title: 'Player', loginTo: '/player/login', registerTo: '/player/register', color: COLORS.saffron, desc: 'Register, join a team, and compete.' },
  { icon: UserCheck, title: 'Team Coach', loginTo: '/coach/login', registerTo: '/coach/register', color: '#22C55E', desc: 'Manage your team and handle payments.' },
  { icon: Shield, title: 'Judge', loginTo: '/judge/login', registerTo: null, color: '#A855F7', desc: 'Score performances and manage results.' },
  { icon: Award, title: 'Admin', loginTo: '/admin/login', registerTo: null, color: '#EF4444', desc: 'Oversee competition operations.' },
];

// ─── 3D Floating Orb ─────────────────────────────────────────────────────────
const FloatingOrb = ({ x, y, size, color, delay, duration, blur = 80 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`,
        width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}88, ${color}22, transparent 70%)`,
        filter: `blur(${blur}px)`,
        transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -40, 0], x: [0, 15, 0], scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Particle Field ───────────────────────────────────────────────────────────
const ParticleField = () => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2.5 + 0.5,
    duration: Math.random() * 10 + 6,
    delay: Math.random() * 5,
    drift: Math.random() * 30 + 20,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 3 }} aria-hidden="true">
      {particles.map(p => (
        <motion.div key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`, top: `${p.y}%`,
            width: p.size, height: p.size,
            background: `radial-gradient(circle, ${COLORS.gold}, ${COLORS.saffron})`,
            opacity: 0.4,
          }}
          animate={{ y: [0, -p.drift, 0], x: [0, p.drift * 0.3, 0], opacity: [0.15, 0.65, 0.15] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

// ─── Animated Grid Lines ──────────────────────────────────────────────────────
const GridLines = () => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
      {/* Perspective grid floor */}
      <div
        className="absolute bottom-0 left-0 right-0 h-72 opacity-[0.07]"
        style={{
          backgroundImage: `
            linear-gradient(${COLORS.saffron}80 1px, transparent 1px),
            linear-gradient(90deg, ${COLORS.saffron}80 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: 'perspective(400px) rotateX(60deg)',
          transformOrigin: 'bottom center',
        }}
      />
      {/* Vertical scan line */}
      <motion.div
        className="absolute top-0 bottom-0 w-px opacity-20"
        style={{ background: `linear-gradient(to bottom, transparent, ${COLORS.saffron}, transparent)` }}
        animate={{ left: ['0%', '100%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear', repeatDelay: 4 }}
      />
      {/* Horizontal scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px opacity-10"
        style={{ background: `linear-gradient(to right, transparent, ${COLORS.gold}, transparent)` }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear', repeatDelay: 6, delay: 3 }}
      />
    </div>
  );
};

// ─── Mouse-tracking 3D tilt card ─────────────────────────────────────────────
export const TiltCard = ({ children, className = '', style = {} }) => {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 30 });
  const reduced = useReducedMotion();

  const handleMouseMove = (e) => {
    if (reduced) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ ...style, rotateX, rotateY, transformStyle: 'preserve-3d', perspective: '800px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
    >
      {children}
    </motion.div>
  );
};

// ─── Magnetic cursor orb ─────────────────────────────────────────────────────
const MagneticCursor = () => {
  const reduced = useReducedMotion();
  const cursorX = useMotionValue(-400);
  const cursorY = useMotionValue(-400);
  const trailX = useMotionValue(-400);
  const trailY = useMotionValue(-400);
  const trailSpringX = useSpring(trailX, { stiffness: 50, damping: 14 });
  const trailSpringY = useSpring(trailY, { stiffness: 50, damping: 14 });

  useEffect(() => {
    if (reduced) return;
    const move = (e) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      trailX.set(e.clientX);
      trailY.set(e.clientY);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [reduced, cursorX, cursorY, trailX, trailY]);

  if (reduced) return null;
  return (
    <motion.div
      className="fixed pointer-events-none z-[9998] rounded-full mix-blend-screen"
      style={{
        width: 480, height: 480,
        x: trailSpringX, y: trailSpringY,
        translateX: '-50%', translateY: '-50%',
        background: `radial-gradient(circle, ${COLORS.saffron}0E 0%, transparent 70%)`,
      }}
    />
  );
};

// ─── 3D depth layer for hero ──────────────────────────────────────────────────
const DepthLayer = ({ scrollYProgress }) => {
  const reduced = useReducedMotion();
  const y1 = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '-12%']);
  const y2 = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '-6%']);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <motion.div className="absolute inset-0 pointer-events-none z-[4]" style={{ opacity }} aria-hidden="true">
      {/* Floating geometric shapes */}
      <motion.div className="absolute" style={{ left: '8%', top: '25%', y: y1 }}>
        <motion.div
          className="w-16 h-16 border rounded-2xl opacity-10"
          style={{ borderColor: COLORS.saffron }}
          animate={reduced ? {} : { rotate: [0, 90, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
      <motion.div className="absolute" style={{ right: '10%', top: '35%', y: y2 }}>
        <motion.div
          className="w-10 h-10 border rounded-full opacity-10"
          style={{ borderColor: COLORS.gold }}
          animate={reduced ? {} : { rotate: [0, -180, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </motion.div>
      <motion.div className="absolute" style={{ left: '15%', bottom: '30%', y: y1 }}>
        <motion.div
          className="w-6 h-6 opacity-15"
          style={{
            background: `linear-gradient(45deg, ${COLORS.saffron}, transparent)`,
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          }}
          animate={reduced ? {} : { rotate: [0, 360], scale: [1, 1.3, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  );
};

// ─── Navbar ───────────────────────────────────────────────────────────────────
const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/about', label: 'About' },
    { to: '/gallery', label: 'Gallery' },
    { to: '/contact', label: 'Contact' },
  ];

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? `1px solid ${COLORS.darkBorder}` : 'none',
        transition: 'background 0.3s, backdrop-filter 0.3s, border-bottom 0.3s',
      }}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16 md:h-20">
        <Link to="/" className="flex items-center gap-3 group" aria-label="Bhausaheb Ranade Mallakhamb Home">
          <motion.img src={BHALogo} alt="BHA Logo" className="h-10 md:h-14 w-auto object-contain"
            whileHover={{ scale: 1.05 }} transition={EASE_SPRING} />
          <div className="hidden sm:block">
            <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: COLORS.saffron }}>Bhausaheb Ranade</p>
            <p className="text-white text-sm font-bold leading-tight">Mallakhamb Competition</p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to}
              className="relative text-sm font-semibold tracking-wide text-white/80 hover:text-white transition-colors duration-200 group py-2">
              {link.label}
              <span className="absolute bottom-0 left-0 w-0 h-0.5 group-hover:w-full transition-all duration-300 rounded-full"
                style={{ background: COLORS.saffron }} />
            </Link>
          ))}
          <SaffronButton to="/scores">Live Scores</SaffronButton>
        </nav>

        <button onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 rounded-lg text-white min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/10 transition-colors"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={isMenuOpen}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={isMenuOpen ? 'x' : 'menu'}
              initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </motion.div>
          </AnimatePresence>
        </button>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div className="md:hidden absolute top-full left-0 right-0 border-t"
            style={{ background: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="px-4 py-6 flex flex-col gap-2">
              {navLinks.map((link, i) => (
                <motion.div key={link.to} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <Link to={link.to} onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 font-medium transition-all min-h-[44px] flex items-center">
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                <Link to="/scores" onClick={() => setIsMenuOpen(false)}
                  className="block mt-2 px-4 py-3 rounded-xl text-white font-bold text-center min-h-[44px] flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
                  Live Scores
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

//  Hero Section 
const HeroSection = () => {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });

  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '30%']);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 1.1]);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', reduced ? '0%' : '-20%']);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-dvh overflow-hidden flex items-center justify-center" aria-label="Hero">
      {/* Parallax BG */}
      <motion.div className="absolute inset-0 z-0" style={{ y: bgY, scale: bgScale }}>
        <img src={MainHomeImg} alt="" aria-hidden="true"
          className="w-full h-full object-cover object-center" loading="eager" />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.15) 40%, rgba(10,10,10,0.95) 100%)' }} />
        <div className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at center, transparent 20%, rgba(10,10,10,0.65) 100%)` }} />
      </motion.div>

      {/* 3D ambient orbs */}
      <FloatingOrb x={8} y={18} size={500} color={COLORS.saffron} delay={0} duration={7} blur={120} />
      <FloatingOrb x={88} y={55} size={380} color={COLORS.gold} delay={2} duration={9} blur={100} />
      <FloatingOrb x={50} y={85} size={300} color={COLORS.saffronDark} delay={1} duration={6} blur={90} />
      <FloatingOrb x={25} y={65} size={200} color={COLORS.saffronLight} delay={3} duration={11} blur={80} />

      {/* Grid lines */}
      <GridLines />

      {/* Particle field */}
      <ParticleField />

      {/* Depth layer */}
      <DepthLayer scrollYProgress={scrollYProgress} />

      {/* Content */}
      <motion.div className="relative z-20 text-center px-4 max-w-5xl mx-auto w-full"
        style={{ y: contentY, opacity }}>

        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-6 border"
          style={{ background: `${COLORS.saffron}18`, borderColor: `${COLORS.saffron}45`, color: COLORS.saffronLight }}
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}>
          <Star className="w-3 h-3" fill="currentColor" aria-hidden="true" />
          Est. 1984  Traditional Indian Sports
          <Star className="w-3 h-3" fill="currentColor" aria-hidden="true" />
        </motion.div>

        {/* 3D Title  per-word stagger with depth */}
        <h1 className="font-black leading-none tracking-tight mb-4" style={{ perspective: '800px' }}>
          {[
            { text: 'Bhausaheb', gradient: false, delay: 0.4 },
            { text: 'Navodit', gradient: true, delay: 0.52 },
            { text: 'Ranade', gradient: true, delay: 0.64 },
          ].map(({ text, gradient, delay }) => (
            <motion.span
              key={text}
              className="block text-5xl sm:text-7xl md:text-8xl lg:text-[7rem] drop-shadow-2xl"
              style={gradient ? {
                background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.gold}, ${COLORS.saffronLight})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                filter: `drop-shadow(0 0 50px ${COLORS.saffron}60)`,
              } : { color: '#fff', textShadow: `0 0 100px ${COLORS.saffron}35` }}
              initial={{ opacity: 0, y: 80, rotateX: -25 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.8, delay, ease: EASE_OUT }}
            >
              {text}
            </motion.span>
          ))}
        </h1>

        <motion.p className="text-white/70 text-lg sm:text-xl md:text-2xl font-light tracking-widest uppercase mb-3"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}>
          Mallakhamb Competition
        </motion.p>

        <motion.p className="text-white/45 text-sm sm:text-base max-w-xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.8 }}>
          The ultimate platform for traditional Indian gymnastics  where strength meets grace on the pole.
        </motion.p>

        {/* Role cards with 3D tilt */}
        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.0 }}>
          <p className="text-white/35 text-xs tracking-widest uppercase mb-4">Choose your role to get started</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
            {roles.map((role, i) => {
              const Icon = role.icon;
              return (
                <motion.div key={role.title}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.1 + i * 0.08 }}>
                  <TiltCard>
                    <div className="p-4 rounded-2xl border flex flex-col gap-3 text-left h-full"
                      style={{
                        background: `${role.color}10`,
                        borderColor: `${role.color}28`,
                        backdropFilter: 'blur(12px)',
                        boxShadow: `0 8px 32px ${role.color}10`,
                      }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: `${role.color}18` }}>
                        <Icon className="w-4 h-4" style={{ color: role.color }} aria-hidden="true" />
                      </div>
                      <p className="text-white font-bold text-sm leading-tight">{role.title}</p>
                      <div className="flex gap-2 mt-auto">
                        <Link to={role.loginTo}
                          className="flex-1 py-2 rounded-lg text-xs font-bold text-center min-h-[36px] flex items-center justify-center transition-all duration-200 hover:brightness-110 active:scale-95"
                          style={{ background: role.color, color: '#fff' }}>
                          Login
                        </Link>
                        {role.registerTo && (
                          <Link to={role.registerTo}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold text-center border min-h-[36px] flex items-center justify-center hover:bg-white/10 transition-all duration-200 active:scale-95"
                            style={{ borderColor: `${role.color}45`, color: role.color }}>
                            Register
                          </Link>
                        )}
                      </div>
                    </div>
                  </TiltCard>
                </motion.div>
              );
            })}
          </div>
          <div className="mt-5">
            <Link to="/superadmin/login"
              className="text-white/20 hover:text-white/45 text-xs transition-colors duration-200 underline underline-offset-4">
              Super Admin Access
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      {!reduced && (
        <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
          style={{ opacity }}>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            <ChevronDown className="w-5 h-5 text-white/30" aria-hidden="true" />
          </motion.div>
        </motion.div>
      )}
    </section>
  );
};

//  Animated Stat ─
const AnimatedStat = ({ num, suffix, label, delay }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const count = useCounter(num, 1600, inView);
  return (
    <FadeIn delay={delay} className="text-center">
      <div ref={ref}>
        <p className="text-3xl md:text-4xl font-black">
          <GradientText>{count}{suffix}</GradientText>
        </p>
        <p className="text-white/45 text-xs tracking-widest uppercase mt-1">{label}</p>
      </div>
    </FadeIn>
  );
};

//  Stats Bar 
const StatsBar = () => (
  <section className="relative z-10 py-10 border-y"
    style={{ background: COLORS.dark, borderColor: COLORS.darkBorder }}
    aria-label="Competition statistics">
    <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
      <AnimatedStat num={40} suffix="+" label="Years of Legacy" delay={0} />
      <AnimatedStat num={500} suffix="+" label="Athletes Competed" delay={0.08} />
      <AnimatedStat num={50} suffix="+" label="National Champions" delay={0.16} />
      <AnimatedStat num={1984} suffix="" label="Founded" delay={0.24} />
    </div>
  </section>
);

//  About Section 
const AboutSection = () => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imageX = useTransform(scrollYProgress, [0, 1], ['-4%', '4%']);
  const reduced = useReducedMotion();

  return (
    <section ref={ref} className="relative overflow-hidden py-24 md:py-32"
      style={{ background: COLORS.dark }} aria-label="About Mallakhamb">
      <div className="absolute top-1/2 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: `${COLORS.saffron}07`, filter: 'blur(80px)', transform: 'translate(-50%,-50%)' }} />

      <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <FadeIn direction="right" className="relative order-2 lg:order-1">
          <motion.div className="relative rounded-3xl overflow-hidden"
            style={{
              x: reduced ? 0 : imageX,
              boxShadow: `0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px ${COLORS.darkBorder}`,
            }}>
            <img src={TextRevealBg} alt="Mallakhamb athlete performing on pole"
              className="w-full aspect-[3/4] object-cover object-center" loading="lazy" />
            <div className="absolute inset-0"
              style={{ background: `linear-gradient(to top, ${COLORS.dark}80, transparent 60%)` }} />
            <motion.div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl border"
              style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: 0.4 }}>
              <p className="text-white font-bold text-sm">Traditional Indian Sport</p>
              <p className="text-white/45 text-xs mt-1">Originating from the Indian subcontinent</p>
            </motion.div>
          </motion.div>
          <div className="absolute -top-4 -left-4 w-24 h-24 rounded-2xl border-t-2 border-l-2 pointer-events-none"
            style={{ borderColor: COLORS.saffron }} />
          <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-2xl border-b-2 border-r-2 pointer-events-none"
            style={{ borderColor: COLORS.saffron }} />
        </FadeIn>

        <FadeIn direction="left" delay={0.2} className="order-1 lg:order-2 space-y-8">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: COLORS.saffron }}>The Ancient Art</p>
            <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
              Where Strength<br />
              <GradientText>Meets Grace</GradientText>
            </h2>
          </div>
          <p className="text-white/55 text-lg leading-relaxed">
            Mallakhamb is a traditional sport originating from the Indian subcontinent, in which a gymnast performs aerial yoga or gymnastic postures and wrestling grips in concert with a vertical stationary or hanging wooden pole, cane, or rope.
          </p>
          <p className="text-white/40 leading-relaxed">
            The Bhausaheb Ranade Navodit Mallakhamb Competition has been a cornerstone of this tradition since 1984, producing national champions and preserving this ancient art form for future generations.
          </p>
          <div className="flex flex-wrap gap-3">
            {['Pole Mallakhamb', 'Rope Mallakhamb', 'Hanging Mallakhamb'].map((tag) => (
              <span key={tag} className="px-4 py-2 rounded-full text-xs font-semibold border"
                style={{ borderColor: COLORS.darkBorder, color: COLORS.saffronLight, background: `${COLORS.saffron}0E` }}>
                {tag}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

//  Legacy Timeline 
const timelineEvents = [
  { year: '1984', title: 'Founded', desc: 'Bhausaheb Ranade Navodit Mallakhamb Competition established in Mumbai.' },
  { year: '1990s', title: 'National Recognition', desc: 'Competition gains national prominence, attracting athletes from across India.' },
  { year: '2000s', title: 'Champions Emerge', desc: 'Over 50 national champions produced, cementing the event\'s legacy.' },
  { year: '2020s', title: 'Digital Era', desc: 'Platform modernized with live scoring, digital registration, and real-time results.' },
];

const LegacyTimeline = () => (
  <section className="py-24 md:py-32 relative overflow-hidden" style={{ background: COLORS.darkElevated }}
    aria-label="Competition history timeline">
    <div className="absolute inset-0 pointer-events-none"
      style={{ background: `radial-gradient(ellipse at 80% 50%, ${COLORS.saffron}06, transparent 60%)` }} />
    <div className="max-w-5xl mx-auto px-4 md:px-8">
      <FadeIn className="text-center mb-16">
        <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: COLORS.saffron }}>40+ Years</p>
        <h2 className="text-4xl md:text-5xl font-black text-white">A Living <GradientText>Legacy</GradientText></h2>
      </FadeIn>
      <div className="relative">
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px -translate-x-1/2 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, transparent, ${COLORS.saffron}50, transparent)` }} />
        <div className="space-y-12">
          {timelineEvents.map((ev, i) => (
            <FadeIn key={ev.year} delay={i * 0.1} direction={i % 2 === 0 ? 'right' : 'left'}>
              <div className={`flex items-start gap-6 md:gap-0 ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                <div className={`flex-1 pl-12 md:pl-0 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                  <div className="inline-block p-5 rounded-2xl border"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: COLORS.darkBorder }}>
                    <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: COLORS.saffron }}>{ev.year}</p>
                    <p className="text-white font-bold text-lg mb-1">{ev.title}</p>
                    <p className="text-white/45 text-sm leading-relaxed">{ev.desc}</p>
                  </div>
                </div>
                <div className="absolute left-4 md:left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 mt-6"
                  style={{ background: COLORS.saffron, borderColor: COLORS.darkElevated }} />
                <div className="hidden md:block flex-1" />
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  </section>
);

//  Quote Strip 
const QuoteStrip = () => (
  <section className="py-16 relative overflow-hidden border-y"
    style={{ background: COLORS.dark, borderColor: COLORS.darkBorder }}
    aria-label="Inspirational quote">
    <div className="absolute inset-0 pointer-events-none"
      style={{ background: `radial-gradient(ellipse at 50% 50%, ${COLORS.saffron}06, transparent 70%)` }} />
    <FadeIn className="max-w-4xl mx-auto px-4 text-center relative z-10">
      <Quote className="w-8 h-8 mx-auto mb-6 opacity-30" style={{ color: COLORS.saffron }} aria-hidden="true" />
      <blockquote>
        <p className="text-2xl md:text-3xl font-black text-white leading-snug mb-6">
          "Mallakhamb is not just a sport  it is a <GradientText>living meditation</GradientText> of strength, balance, and the ancient spirit of India."
        </p>
        <footer className="text-white/35 text-sm font-medium tracking-wide"> Bhausaheb Ranade, Founder</footer>
      </blockquote>
    </FadeIn>
  </section>
);

//  Features Section 
const features = [
  { icon: Trophy, title: 'Live Scoring', description: 'Real-time score updates as performances happen on the mat. Every point, every moment  live.', href: '/scores', hero: true, accent: COLORS.saffron },
  { icon: Users, title: 'Team Management', description: 'Coaches manage rosters, assign roles, and track performance.', href: '/coach/login', accent: '#22C55E' },
  { icon: Camera, title: 'Event Gallery', description: 'Capture and relive the best moments from every competition.', href: '/gallery', accent: '#A855F7' },
  { icon: Calendar, title: 'Schedule & Rules', description: 'Stay updated with the latest event schedule and competition rules.', href: '/schedule', accent: '#3B82F6' },
  { icon: Zap, title: 'Instant Results', description: 'Rankings update in real-time as judges submit scores.', href: '/scores', accent: COLORS.gold },
];

const FeatureCard = ({ feature, index }) => {
  const Icon = feature.icon;
  return (
    <FadeIn delay={index * 0.07} className={feature.hero ? 'sm:col-span-2 lg:col-span-2 sm:row-span-2' : ''}>
      <Link to={feature.href} className="group block h-full">
        <motion.div
          className="h-full min-h-[160px] p-6 rounded-2xl border relative overflow-hidden flex flex-col gap-4"
          style={{
            background: feature.hero ? `linear-gradient(135deg, ${feature.accent}12, ${COLORS.darkCard})` : COLORS.darkCard,
            borderColor: feature.hero ? `${feature.accent}30` : COLORS.darkBorderSubtle,
            minHeight: feature.hero ? 280 : 160,
          }}
          whileHover={{ borderColor: `${feature.accent}50`, boxShadow: `0 0 50px ${feature.accent}15`, y: -4 }}
          transition={{ duration: 0.25 }}>
          <motion.div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at 20% 20%, ${feature.accent}10, transparent 60%)` }} />
          <div className={`rounded-xl flex items-center justify-center relative z-10 ${feature.hero ? 'w-14 h-14' : 'w-10 h-10'}`}
            style={{ background: `${feature.accent}18` }}>
            <Icon className={feature.hero ? 'w-7 h-7' : 'w-5 h-5'} style={{ color: feature.accent }} aria-hidden="true" />
          </div>
          <div className="relative z-10 flex-1">
            <h3 className={`text-white font-bold ${feature.hero ? 'text-2xl' : 'text-lg'}`}>{feature.title}</h3>
            <p className={`text-white/45 mt-1 leading-relaxed ${feature.hero ? 'text-base' : 'text-sm'}`}>{feature.description}</p>
          </div>
          <div className="mt-auto flex items-center gap-2 text-xs font-semibold relative z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ color: feature.accent }}>
            Explore <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
        </motion.div>
      </Link>
    </FadeIn>
  );
};

const FeaturesSection = () => (
  <section className="py-24 md:py-32" style={{ background: COLORS.dark }} aria-label="Platform features">
    <div className="max-w-6xl mx-auto px-4 md:px-8">
      <FadeIn className="text-center mb-16">
        <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: COLORS.saffron }}>Platform</p>
        <h2 className="text-4xl md:text-5xl font-black text-white">Everything You <GradientText>Need</GradientText></h2>
      </FadeIn>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {features.map((f, i) => <FeatureCard key={f.title} feature={f} index={i} />)}
      </div>
    </div>
  </section>
);

//  Footer 
const Footer = () => {
  const footerLinks = {
    'About': [
      { label: 'Our Story', to: '/about' },
      { label: 'Meet the Team', to: '/team' },
      { label: 'Coaches', to: '/coach' },
    ],
    'Legal': [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms & Conditions', to: '/terms' },
      { label: 'Refund Policy', to: '/refund' },
    ],
  };

  return (
    <footer style={{ background: '#050505' }} aria-label="Site footer">
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${COLORS.saffron}, transparent)` }} />
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <img src={BHALogo} alt="BHA Logo" className="h-12 w-auto object-contain" loading="lazy" />
            <div>
              <p className="text-white font-bold text-sm leading-tight">Bhausaheb Ranade Navodit</p>
              <p className="text-white font-bold text-sm leading-tight">Mallakhamb Competition</p>
            </div>
          </div>
          <p className="text-white/35 text-sm leading-relaxed max-w-sm">
            A Sports Event started in 1984, producing award-winning national players and preserving the tradition of Mallakhamb.
          </p>
          <div className="flex gap-3 pt-2">
            <a href="https://www.facebook.com/bhausahebranade/" target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-200 hover:scale-110"
              style={{ borderColor: COLORS.darkBorder, background: `${COLORS.saffron}0E` }}
              aria-label="Facebook">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: COLORS.saffronLight }} aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          </div>
        </div>

        {Object.entries(footerLinks).map(([section, links]) => (
          <div key={section}>
            <p className="text-white font-bold text-sm mb-4 tracking-wide">{section}</p>
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}
                    className="text-white/35 hover:text-white/70 text-sm transition-colors duration-200 flex items-center gap-2 group">
                    <span className="w-1 h-1 rounded-full group-hover:w-3 transition-all duration-200"
                      style={{ background: COLORS.saffron }} />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="space-y-4">
          <p className="text-white font-bold text-sm mb-4 tracking-wide">Contact</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
              <p className="text-white/35 text-sm leading-relaxed">Sane Guruji Vidya Mandir, Santacruz(E), Mumbai.</p>
            </div>
            <a href="tel:+919820688420"
              className="flex items-center gap-3 text-white/35 hover:text-white/65 text-sm transition-colors duration-200">
              <Phone className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
              +91 982 068 8420
            </a>
            <a href="mailto:mallakhambindia@gmail.com"
              className="flex items-center gap-3 text-white/35 hover:text-white/65 text-sm transition-colors duration-200 break-all">
              <Mail className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
              mallakhambindia@gmail.com
            </a>
          </div>
        </div>
      </div>

      <div className="border-t py-6 text-center" style={{ borderColor: COLORS.darkBorder }}>
        <p className="text-white/20 text-xs">
           2025 Bhausaheb Ranade Mallakhamb & Gymnastics Competition. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

//  Main Export 
const Home = () => (
  <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
    <MagneticCursor />
    <Navbar />
    <main id="main-content">
      <HeroSection />
      <StatsBar />
      <AboutSection />
      <LegacyTimeline />
      <QuoteStrip />
      <FeaturesSection />
    </main>
    <Footer />
  </div>
);

export default Home;
