import PropTypes from 'prop-types';
import { Check, ChevronRight } from 'lucide-react';
import '@/styles/look-fonts';
import { cx } from './cx';

/**
 * RunningOrder (design-language PLAN §7 "Selection"): a choice read like a
 * running order — numbered rows, the name in the display face, hairlines, a
 * chevron, the raised surface on hover, the 3px rule on the chosen row.
 *
 *   <RunningOrder label="Levels">
 *     {levels.map((l, i) => (
 *       <RunningOrderItem key={l} index={i + 1} title={label(l)} meta={blurb(l)}
 *         selected={l === picked} onClick={() => pick(l)} />
 *     ))}
 *   </RunningOrder>
 *
 * Each row is a button with `aria-pressed`. The number is decoration
 * (aria-hidden), so the row's name starts with its title. Titles keep their
 * own case: they are often stored values (competition names).
 */
export const RunningOrder = ({ label, className = '', children }) => (
  <ol className={cx('ui-order', className)} aria-label={label}>
    {children}
  </ol>
);
RunningOrder.propTypes = { label: PropTypes.string.isRequired, className: PropTypes.string, children: PropTypes.node };

export const RunningOrderItem = ({
  index, title, titleAs: Title = 'span', meta = null, aside = null, selected = false, muted = false, disabled = false,
  onClick, className = '',
}) => (
  <li className={cx('ui-order__item', className)}>
    <button
      type="button"
      className={cx('ui-order__row', muted && !selected && 'ui-order__row--muted')}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ui-order__num type-num-m" aria-hidden="true">{String(index).padStart(2, '0')}</span>
      <span className="ui-order__body">
        <Title className="ui-order__title type-display-s">{title}</Title>
        {/* A space between the parts of the row's name ("District Meets…", not "DistrictMeets…"). */}
        {' '}
        {meta && <span className="ui-order__meta type-body-s">{meta}</span>}
      </span>
      {' '}
      {aside && <span className="ui-order__aside">{aside}</span>}
      {selected
        ? <Check className="ui-order__mark" aria-hidden="true" />
        : <ChevronRight className="ui-order__mark" aria-hidden="true" />}
    </button>
  </li>
);
RunningOrderItem.propTypes = {
  index: PropTypes.number.isRequired,
  title: PropTypes.node.isRequired,
  /** The title's element. A heading where flows read it as one (the competition chooser's h3). */
  titleAs: PropTypes.elementType,
  meta: PropTypes.node,
  aside: PropTypes.node,
  selected: PropTypes.bool,
  muted: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
};
