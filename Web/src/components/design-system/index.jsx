import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { useReducedMotion } from '../../hooks/useResponsive';
import { DESIGN_TOKENS, EASE_OUT } from '../../styles/tokens';

const COLORS = DESIGN_TOKENS.colors.brand;

export const GlassCard = ({ children, className = '', style = {}, ...props }) => (
  <div
    className={`rounded-2xl border ${className}`}
    style={{
      background: 'rgba(255,255,255,0.04)',
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
          ? { background: `linear-gradient(135deg, ${COLORS.saffron}, ${DESIGN_TOKENS.colors.brand.saffronDark})` }
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
        ? { background: `linear-gradient(135deg, ${COLORS.saffron}, ${DESIGN_TOKENS.colors.brand.saffronDark})` }
        : { borderColor: `${COLORS.saffron}60`, color: COLORS.saffronLight }}
      {...props}
    >
      {children}
    </button>
  );
};
