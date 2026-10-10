import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/**
 * Notice: an inline message about the form or screen it sits in — a failed
 * sign-in, a lockout countdown, "code sent". A raised surface with the 3px
 * status rule on the left, like a toast that stays put. Always text: the tone
 * colours the rule and the title, never carries the meaning alone.
 *
 * It takes no role of its own: pass `role="alert"` for a failure the user must
 * hear now, `role="status"` for a polite update.
 */
export const Notice = ({ tone = 'info', title = null, className = '', children, ...rest }) => (
  <div className={cx('ui-notice', `ui-notice--${tone}`, className)} {...rest}>
    {title && <p className="ui-notice__title type-tag">{title}</p>}
    {children && <div className="ui-notice__text type-body-s">{children}</div>}
  </div>
);
Notice.propTypes = {
  tone: PropTypes.oneOf(['info', 'success', 'warning', 'danger']),
  title: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default Notice;
