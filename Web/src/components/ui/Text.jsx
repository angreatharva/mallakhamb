import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/**
 * Panel: plain (surface + hairline), band (a raised step, no line), feature
 * (plain + the 3px accent rule; `rule="danger"` for destructive context).
 */
export const Panel = ({ as: Component = 'section', variant = 'plain', rule = 'accent', flush = false, className = '', children, ...rest }) => (
  <Component
    className={cx('ui-panel', variant !== 'plain' && `ui-panel--${variant}`, variant === 'feature' && rule === 'danger' && 'ui-panel--rule-danger', flush && 'ui-panel--flush', className)}
    {...rest}
  >
    {children}
  </Component>
);
Panel.propTypes = {
  as: PropTypes.elementType, variant: PropTypes.oneOf(['plain', 'band', 'feature']),
  rule: PropTypes.oneOf(['accent', 'danger']), flush: PropTypes.bool, className: PropTypes.string, children: PropTypes.node,
};

/**
 * Heading: a level (the outline) and a step (the look), chosen separately.
 * Display steps are uppercase — only on text the site writes, never COP
 * wording or names. `sting` is for stage screens only (§5.7).
 */
export const Heading = ({ level = 2, step = 'display-m', sting = false, className = '', children, ...rest }) => {
  const Tag = `h${level}`;
  return (
    <Tag className={cx('ui-heading', `type-${step}`, className)} {...rest}>
      {sting ? (
        <span className="ui-sting">
          {children}
          <span className="ui-sting__bar" aria-hidden="true" />
        </span>
      ) : children}
    </Tag>
  );
};
Heading.propTypes = {
  level: PropTypes.oneOf([1, 2, 3, 4, 5, 6]),
  step: PropTypes.oneOf(['display-xl', 'display-l', 'display-m', 'display-s', 'body', 'body-s']),
  sting: PropTypes.bool, className: PropTypes.string, children: PropTypes.node,
};

/** Tag: square, always text. `ident` shows a role; `solid` fills it. */
export const Tag = ({ tone = 'neutral', solid = false, className = '', children, ...rest }) => (
  <span className={cx('ui-tag type-tag', tone !== 'neutral' && `ui-tag--${tone}`, solid && 'ui-tag--solid', className)} {...rest}>
    {children}
  </span>
);
Tag.propTypes = { tone: PropTypes.oneOf(['neutral', 'accent', 'ident']), solid: PropTypes.bool, className: PropTypes.string, children: PropTypes.node };

/** StatusTag: success | warning | danger | info, as a tinted square tag with text. */
export const StatusTag = ({ status = 'info', className = '', children, ...rest }) => (
  <span className={cx('ui-tag ui-status type-tag', `ui-status--${status}`, className)} {...rest}>{children}</span>
);
StatusTag.propTypes = { status: PropTypes.oneOf(['success', 'warning', 'danger', 'info']), className: PropTypes.string, children: PropTypes.node };

/** Stat: a tag label, the number that is the point, a unit in the accent. */
export const Stat = ({ label, value, unit = null, hint = null, size = 'm', className = '' }) => (
  <div className={cx('ui-stat', className)}>
    <p className="ui-stat__label type-tag" style={{ margin: 0 }}>{label}</p>
    <p className={cx('ui-stat__value', `type-num-${size}`)} style={{ margin: 0 }}>
      {value}
      {unit && <span className="ui-unit">{unit}</span>}
    </p>
    {hint && <p className="ui-stat__hint type-caption">{hint}</p>}
  </div>
);
Stat.propTypes = {
  label: PropTypes.node.isRequired, value: PropTypes.node.isRequired, unit: PropTypes.node,
  hint: PropTypes.node, size: PropTypes.oneOf(['m', 'l']), className: PropTypes.string,
};

/** SpecList: label left, value right, hairline rows. */
export const SpecList = ({ items, className = '' }) => (
  <dl className={cx('ui-spec', className)}>
    {items.map(({ label, value, unit }, i) => (
      <div className="ui-spec__row" key={typeof label === 'string' ? label : i}>
        <dt className="ui-spec__label type-tag">{label}</dt>
        <dd className="ui-spec__value type-num-m">
          {value}
          {unit && <span className="ui-unit">{unit}</span>}
        </dd>
      </div>
    ))}
  </dl>
);
SpecList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.node, value: PropTypes.node, unit: PropTypes.node })).isRequired,
  className: PropTypes.string,
};

/**
 * TextLink: a link in running text — underlined, in the accent, a 44px target
 * on touch. `as={Link}` for a route.
 */
export const TextLink = ({ as: Component = 'a', className = '', children, ...rest }) => (
  <Component className={cx('ui-link', className)} {...rest}>{children}</Component>
);
TextLink.propTypes = { as: PropTypes.elementType, className: PropTypes.string, children: PropTypes.node };
