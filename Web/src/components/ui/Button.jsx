import { forwardRef } from 'react';
import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/**
 * Button (design-language PLAN §6). One saffron `solid` per view; everything
 * else `line` or `ghost`; `danger` only behind a danger dialog.
 *
 *   <Button onClick={save}>Save</Button>
 *   <Button variant="line" icon={Plus}>Add athlete</Button>
 *   <Button as={Link} to="/scores" variant="ghost">Scores</Button>
 *
 * `loading` keeps the label's width, disables the button and marks it busy.
 */
const Button = forwardRef(function Button(
  { as: Component = 'button', variant = 'solid', size = 'md', block = false, loading = false,
    icon: Icon = null, iconRight: IconRight = null, disabled = false, className = '', children, type, ...rest },
  ref,
) {
  const isButton = Component === 'button';
  const inactive = disabled || loading;
  return (
    <Component
      ref={ref}
      type={isButton ? type || 'button' : type}
      disabled={isButton ? inactive : undefined}
      aria-disabled={!isButton && inactive ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      className={cx('ui-btn', `ui-btn--${variant}`, size !== 'md' && `ui-btn--${size}`, block && 'ui-btn--block', className)}
      {...rest}
    >
      <span className="ui-btn__label" style={{ display: 'contents' }}>
        {Icon && <Icon aria-hidden="true" />}
        {children}
        {IconRight && <IconRight aria-hidden="true" />}
      </span>
      {loading && <span className="ui-spinner" aria-hidden="true" />}
    </Component>
  );
});

Button.propTypes = {
  as: PropTypes.elementType,
  variant: PropTypes.oneOf(['solid', 'line', 'ghost', 'danger']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  block: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.elementType,
  iconRight: PropTypes.elementType,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
  type: PropTypes.string,
};

export default Button;

/**
 * IconButton: a square button with only an icon. `label` is required — it is
 * the accessible name (a ✕ without one was a real defect, see the plan).
 */
export const IconButton = forwardRef(function IconButton(
  { label, icon: Icon, variant = 'line', className = '', ...rest },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} aria-label={label} title={label} className={cx('ui-icon-btn', className)} {...rest}>
      <Icon aria-hidden="true" />
    </Button>
  );
});

IconButton.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  variant: PropTypes.oneOf(['solid', 'line', 'ghost', 'danger']),
  className: PropTypes.string,
};
