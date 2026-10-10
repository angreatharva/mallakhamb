import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { cx } from '@/components/ui/cx';

/** The brand name, in one place (design-language PLAN D9). */
export const BRAND_NAME = 'Mallakhamb India';

/**
 * The pole mark: the brand's symbol, lifted from the landing page. Decorative
 * by default; pass `title` when it stands alone and must be named.
 * Size it with layout classes (`h-12 w-auto`); its colour is the brand saffron.
 */
export const PoleMark = ({ title = null, className = '' }) => (
  <svg
    viewBox="0 0 20 60"
    className={cx('brand-mark', className)}
    role={title ? 'img' : undefined}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : 'true'}
    focusable="false"
  >
    <path d="M10 0c2.8 0 4.5 2.2 4.5 5 0 2.6-1.5 4.6-2.5 5v3h1.5L16 60H4l2.5-47H8v-3C7 9.6 5.5 7.6 5.5 5 5.5 2.2 7.2 0 10 0z" />
  </svg>
);
PoleMark.propTypes = { title: PropTypes.string, className: PropTypes.string };

/**
 * The wordmark: the mark and "Mallakhamb India". A link home unless `to` is
 * null. `compact` keeps only the mark (still named) for the narrowest phones.
 */
export const Wordmark = ({ to = '/', compact = false, className = '' }) => {
  const content = (
    <>
      <PoleMark />
      {compact ? <span className="sr-only">{BRAND_NAME}</span> : <span>{BRAND_NAME}</span>}
    </>
  );
  return to
    ? <Link to={to} className={cx('brand-wordmark', className)}>{content}</Link>
    : <span className={cx('brand-wordmark', className)}>{content}</span>;
};
Wordmark.propTypes = { to: PropTypes.string, compact: PropTypes.bool, className: PropTypes.string };
