import PropTypes from 'prop-types';

/**
 * A tooltip inside the chart box, clamped to it. Hover and keyboard focus both
 * drive it, so nothing on a chart is mouse-only.
 */
const ChartTooltip = ({ x, y, width, title = null, rows, footer = null }) => {
  const tipWidth = 230;
  const flip = x + 14 + tipWidth > width;
  const left = flip ? Math.max(0, x - 14 - tipWidth) : x + 14;
  const top = Math.max(0, y - 12);
  return (
    <div className="viz-tip" style={{ left, top }} role="status" aria-live="polite">
      {title && <p className="viz-tip__title">{title}</p>}
      {rows.map((row) => (
        <div className="viz-tip__row" key={row.label}>
          <span>
            {row.color && <span className="viz-swatch" style={{ background: row.color }} aria-hidden="true" />}
            {row.label}
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
      {footer && <p className="m-0 mt-1 text-fg-muted" style={{ fontSize: 12 }}>{footer}</p>}
    </div>
  );
};

ChartTooltip.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  width: PropTypes.number.isRequired,
  title: PropTypes.node,
  rows: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.node.isRequired, value: PropTypes.node, color: PropTypes.string })).isRequired,
  footer: PropTypes.node,
};

export default ChartTooltip;
