import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/** A spinner with an accessible name (decorative ones live inside Button). */
export const Spinner = ({ label = 'Loading', className = '' }) => (
  <span role="status" className={cx('inline-flex items-center gap-2', className)}>
    <span className="ui-spinner" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </span>
);
Spinner.propTypes = { label: PropTypes.string, className: PropTypes.string };

/**
 * A placeholder block; a slow pulse that stops for reduced motion. Full width
 * and 1em tall by default; size it with layout classes (`w-3/5 h-5`).
 */
export const Skeleton = ({ className = '' }) => (
  <span className={cx('ui-skeleton', className)} aria-hidden="true" />
);
Skeleton.propTypes = { className: PropTypes.string };

/** Nothing to show yet: a tag, one sentence, at most one action. */
export const EmptyState = ({ tag = 'Nothing here yet', children, action = null, className = '' }) => (
  <div className={cx('ui-state', className)}>
    <p className="ui-state__tag type-tag">{tag}</p>
    <p className="ui-state__text type-body">{children}</p>
    {action}
  </div>
);
EmptyState.propTypes = { tag: PropTypes.string, children: PropTypes.node, action: PropTypes.node, className: PropTypes.string };

/** Something failed: the same shape, a danger rule, announced to screen readers. */
export const ErrorState = ({ tag = 'Something went wrong', children, action = null, className = '' }) => (
  <div role="alert" className={cx('ui-state ui-state--error', className)}>
    <p className="ui-state__tag type-tag">{tag}</p>
    <p className="ui-state__text type-body">{children}</p>
    {action}
  </div>
);
ErrorState.propTypes = { tag: PropTypes.string, children: PropTypes.node, action: PropTypes.node, className: PropTypes.string };
