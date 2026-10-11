/**
 * The admin screens' shared building blocks (plan Phase 8), drawn by the look
 * primitives (design-language PLAN §6, W3).
 *
 * Six admin and super-admin pages call these. The names and props stay, so the
 * pages did not have to change to take the new look: DarkCard is a panel,
 * FadeIn the short CSS fade, EmptyState and LoadingState the flat states,
 * DarkSearch a field with a search mark, DarkBtn the Button primitive.
 */
import PropTypes from 'prop-types';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';

/** A surface: the panel's plain step (surface + hairline). `style` still reaches it. */
export const DarkCard = ({ children, className = '', style = {} }) => (
  <div className={cx('ui-panel ui-panel--flush', className)} style={style}>
    {children}
  </div>
);

/** The short entrance fade, in CSS (no framer); off for reduced motion. */
export const FadeIn = ({ children, delay = 0, className = '' }) => (
  <div className={cx('ui-fade-in', className)} style={delay ? { animationDelay: `${Math.round(delay * 1000)}ms` } : undefined}>
    {children}
  </div>
);

/** Nothing to show: a tag-like title, a sentence, at most one action. */
export const EmptyState = ({ icon: Icon, title, desc, action }) => (
  <div className="ui-state ui-state--center">
    {Icon && <Icon className="w-8 h-8 text-fg-muted" aria-hidden="true" />}
    <p className="ui-state__tag type-tag">{title}</p>
    {desc && <p className="ui-state__text type-body-s">{desc}</p>}
    {action && <div>{action}</div>}
  </div>
);

export const LoadingState = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center py-12 gap-3">
    <span className="ui-spinner text-accent-fg" aria-hidden="true" />
    <span className="text-fg-muted type-body-s">{label}</span>
  </div>
);

export const DarkSearch = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-fg-muted z-10" aria-hidden="true" />
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
      className={cx('ui-input pl-10', value ? 'pr-11' : 'pr-4')}
    />
    {value && (
      <button type="button" onClick={() => onChange('')} className="ui-popover__clear" aria-label="Clear search">
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    )}
  </div>
);

/*
 * The old variants onto the Button primitive: the saffron primary is the one
 * solid; "success" (a confirming save) is solid too; secondary (it was
 * "purple") is a line; danger is danger; ghost is a line. Small buttons keep the
 * 44px touch floor (the primitive's sm grows to it on touch).
 */
const VARIANT = { primary: 'solid', success: 'solid', secondary: 'line', danger: 'danger', ghost: 'line' };

export const DarkBtn = ({ children, onClick, disabled, variant = 'primary', size = 'md', type = 'button', className = '' }) => (
  <Button type={type} onClick={onClick} disabled={disabled} variant={VARIANT[variant] || 'solid'}
    size={size === 'sm' ? 'sm' : 'md'} className={className}>
    {children}
  </Button>
);

DarkCard.propTypes = { children: PropTypes.node, className: PropTypes.string, style: PropTypes.object };
FadeIn.propTypes = { children: PropTypes.node, delay: PropTypes.number, className: PropTypes.string };
EmptyState.propTypes = { icon: PropTypes.elementType, title: PropTypes.node, desc: PropTypes.node, action: PropTypes.node };
LoadingState.propTypes = { label: PropTypes.node };
DarkSearch.propTypes = { value: PropTypes.string, onChange: PropTypes.func.isRequired, placeholder: PropTypes.string };
DarkBtn.propTypes = {
  children: PropTypes.node, onClick: PropTypes.func, disabled: PropTypes.bool,
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md']), type: PropTypes.string, className: PropTypes.string,
};
