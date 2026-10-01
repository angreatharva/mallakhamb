/**
 * The admin screens' shared building blocks (plan Phase 8).
 *
 * Six admin and super-admin pages each declared their own copy of these —
 * DarkCard ×6, FadeIn ×5, a local useReducedMotion ×5, EmptyState and
 * LoadingState ×4 in two variants, DarkSearch ×2, DarkBtn ×3 — byte-identical
 * apart from two additive differences, now explicit props: EmptyState's
 * optional `action`, LoadingState's default label. Each body below is the
 * existing code, so the screens render exactly as before.
 */
import { useRef } from 'react';
import PropTypes from 'prop-types';
import { Search, X } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useResponsive';
import { ADMIN_COLORS, ADMIN_EASE_OUT, alpha } from '@/styles/tokens';

export const DarkCard = ({ children, className = '', style = {} }) => (
  <div className={`rounded-2xl border ${className}`}
    style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle, ...style }}>
    {children}
  </div>
);

export const FadeIn = ({ children, delay = 0, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: ADMIN_EASE_OUT }}>
      {children}
    </motion.div>
  );
};

export const EmptyState = ({ icon: Icon, title, desc, action }) => (
  <div className="text-center py-12">
    <Icon className="w-12 h-12 mx-auto mb-3 text-white/15" />
    <p className="text-white/60 font-semibold">{title}</p>
    {desc && <p className="text-fg-muted text-sm mt-1">{desc}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center py-12 gap-3">
    <div className="w-5 h-5 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: ADMIN_COLORS.saffron }} />
    <span className="text-fg-muted text-sm">{label}</span>
  </div>
);

export const DarkSearch = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'rgb(var(--ink) / 0.3)' }} />
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      className="w-full rounded-xl text-base mouse:text-sm text-white placeholder-white/30 min-h-[44px] transition-all duration-200"
      style={{ background: 'rgb(var(--ink) / 0.04)', border: `1px solid ${ADMIN_COLORS.darkBorderMid}`, paddingLeft: '2.5rem', paddingRight: value ? '2.5rem' : '1rem', paddingTop: '0.625rem', paddingBottom: '0.625rem' }}
      onFocus={(e) => { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; }}
      onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }}
    />
    {value && (
      <button onClick={() => onChange('')} className="absolute right-1 mouse:right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10 transition-colors tap-safe mouse:min-h-[28px] mouse:min-w-[28px] flex items-center justify-center" aria-label="Clear search">
        <X className="w-3.5 h-3.5 text-fg-muted" />
      </button>
    )}
  </div>
);

/*
 * Small buttons: 32px with a mouse, the 44px touch floor otherwise (tap-safe; an inline minHeight would
 * beat it). Labels: near-black on saffron/green/red (D6), snow on purple (text-white is the ink alias),
 * ink on ghost. None of the callers sits inside a <form>, so the `button` default changes nothing.
 */
export const DarkBtn = ({ children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', className = '' }) => {
  const bg = {
    primary: `linear-gradient(135deg, ${ADMIN_COLORS.saffron}, ${ADMIN_COLORS.saffronDark})`,
    purple: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})`,
    success: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)`,
    danger: `linear-gradient(135deg, ${ADMIN_COLORS.red}, #DC2626)`,
    ghost: 'transparent',
  }[variant];
  const h = size === 'sm' ? 'tap-safe mouse:min-h-[32px]' : 'min-h-[44px]';
  const label = variant === 'ghost' ? 'text-white' : variant === 'purple' ? 'text-snow' : 'text-[#0A0A0A]';
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-xl font-bold text-sm ${label} ${h} flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{ background: bg, border: variant === 'ghost' ? `1px solid ${ADMIN_COLORS.darkBorderSubtle}` : 'none', padding: size === 'sm' ? '0 0.75rem' : '0 1.25rem' }}
      whileHover={!disabled ? { scale: 1.02, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}>
      {children}
    </motion.button>
  );
};

DarkCard.propTypes = { children: PropTypes.node, className: PropTypes.string, style: PropTypes.object };
FadeIn.propTypes = { children: PropTypes.node, delay: PropTypes.number, className: PropTypes.string };
EmptyState.propTypes = { icon: PropTypes.elementType.isRequired, title: PropTypes.node, desc: PropTypes.node, action: PropTypes.node };
LoadingState.propTypes = { label: PropTypes.node };
DarkSearch.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired, placeholder: PropTypes.string };
DarkBtn.propTypes = {
  children: PropTypes.node, onClick: PropTypes.func, disabled: PropTypes.bool,
  variant: PropTypes.oneOf(['primary', 'purple', 'success', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md']), type: PropTypes.string, className: PropTypes.string,
};
