import PropTypes from 'prop-types';
import { viz } from './chartTheme';

/** Swatch + ink label. `line` items show the dash pattern their series is drawn with. */
const Legend = ({ items, className = '' }) => (
  <ul className={`viz-legend ${className}`} aria-label="Legend">
    {items.map((item) => {
      const color = item.color || viz(item.slot);
      let dashClass = '';
      if (item.dash) dashClass = item.dash.startsWith('2') ? 'viz-swatch--dotted' : 'viz-swatch--dashed';
      return (
        <li key={item.label}>
          {item.line && <span className={`viz-swatch viz-swatch--line ${dashClass}`} style={{ borderTopColor: color }} aria-hidden="true" />}
          {!item.line && item.outlined && <span className="viz-swatch" style={{ boxShadow: 'inset 0 0 0 2px var(--fg)' }} aria-hidden="true" />}
          {!item.line && item.hatched && <span className="viz-swatch" style={{ background: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--fg-muted) 3px 4px)' }} aria-hidden="true" />}
          {!item.line && !item.outlined && !item.hatched && !item.bare && <span className="viz-swatch" style={{ background: color }} aria-hidden="true" />}
          {item.label}
        </li>
      );
    })}
  </ul>
);

Legend.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    slot: PropTypes.number,
    color: PropTypes.string,
    line: PropTypes.bool,
    dash: PropTypes.string,
    hatched: PropTypes.bool,
    outlined: PropTypes.bool,
    bare: PropTypes.bool,
  })).isRequired,
  className: PropTypes.string,
};

export default Legend;
