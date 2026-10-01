import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { useReducedMotion } from '../../hooks/useResponsive';
import { DESIGN_TOKENS, EASE_OUT, FG, alpha } from '../../styles/tokens';

const COLORS = DESIGN_TOKENS.colors.brand;

export const GlassCard = ({ children, className = '', style = {}, ...props }) => (
  <div
    className={`rounded-2xl border ${className}`}
    style={{
      background: 'rgb(var(--ink) / 0.04)',
      backdropFilter: 'blur(16px)',
      borderColor: DESIGN_TOKENS.colors.borders.subtle,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

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

// Brand tokens, not the hexes: identical in dark, readable on a light page
// (saffron and gold measure 2.9 and 2.0:1 on white; the light tokens ~5:1).
export const GradientText = ({ children, className = '' }) => (
  <span
    className={className}
    style={{
      background: 'linear-gradient(135deg, rgb(var(--brand-fg)), rgb(var(--brand-gold-fg)), rgb(var(--brand-fg-soft)))',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    }}
  >
    {children}
  </span>
);

export const SaffronButton = ({ children, to, className = '', variant = 'solid', ...props }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-bold text-sm transition-all duration-200 min-h-[44px] px-6 cursor-pointer';
  const solid = `hover:brightness-110 active:scale-95`;
  const outline = `border hover:bg-white/5 active:scale-95`;
  /*
   * A near-black label on the saffron fill: white on #FF6B00 is 2.86:1 (plan D6,
   * the same fix as ThemedButton). The fill is bright in both appearances, so
   * the label is a fixed colour, not a token.
   */
  const solidStyle = {
    background: `linear-gradient(135deg, ${COLORS.saffron}, ${DESIGN_TOKENS.colors.brand.saffronDark})`,
    color: '#0A0A0A',
  };
  const outlineStyle = { borderColor: `${alpha(COLORS.saffron, 0x60)}`, color: FG.brandSoft };

  if (to) {
    return (
      <Link
        to={to}
        className={`${base} ${variant === 'solid' ? solid : outline} ${className}`}
        style={variant === 'solid' ? solidStyle : outlineStyle}
        {...props}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      className={`${base} ${variant === 'solid' ? solid : outline} ${className}`}
      style={variant === 'solid' ? solidStyle : outlineStyle}
      {...props}
    >
      {children}
    </button>
  );
};
