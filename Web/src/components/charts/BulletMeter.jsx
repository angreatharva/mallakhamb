import PropTypes from 'prop-types';
import { fmt, viz } from './chartTheme';

/**
 * One section's mark against its ceiling, with the category average and the
 * category best as ticks — "where did I lose to the winner?" in one bar. HTML,
 * so the numbers are real text that reflows on a phone.
 */
const BulletMeter = ({ label, value, max, average = null, best = null, slot, note = null }) => {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const gapToBest = best != null && value != null ? best - value : null;
  return (
    <div className="viz-bullet">
      <div className="viz-bullet__head">
        <span className="type-body flex items-center gap-2">
          <span className="viz-swatch" style={{ background: viz(slot) }} aria-hidden="true" />
          {label}
        </span>
        <span className="type-body" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <strong>{fmt(value)}</strong>
          <span className="text-fg-muted"> / {fmt(max)}</span>
        </span>
      </div>
      <div
        className="viz-bullet__track"
        role="img"
        aria-label={`${label}: ${fmt(value)} of ${fmt(max)}${average != null ? `, category average ${fmt(average)}` : ''}${best != null ? `, category best ${fmt(best)}` : ''}`}
      >
        <div className="viz-bullet__fill viz-grow" style={{ width: pct(value || 0), background: viz(slot) }} />
        {average != null && <span className="viz-bullet__tick" style={{ left: `calc(${pct(average)} - 1px)` }} title={`Average ${fmt(average)}`} />}
        {best != null && <span className="viz-bullet__tick viz-bullet__tick--best" style={{ left: `calc(${pct(best)} - 1px)` }} title={`Best ${fmt(best)}`} />}
      </div>
      <div className="viz-bullet__notes">
        {average != null && <span>│ Category average {fmt(average)}</span>}
        {best != null && <span>┆ Best in category {fmt(best)}</span>}
        {gapToBest != null && gapToBest > 0.004 && <span>{fmt(gapToBest)} behind the best</span>}
        {gapToBest != null && gapToBest <= 0.004 && <span>Best in the category</span>}
        {note && <span>{note}</span>}
      </div>
    </div>
  );
};

BulletMeter.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  max: PropTypes.number.isRequired,
  average: PropTypes.number,
  best: PropTypes.number,
  slot: PropTypes.number.isRequired,
  note: PropTypes.node,
};

export default BulletMeter;
