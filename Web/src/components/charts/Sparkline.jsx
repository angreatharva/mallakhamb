import PropTypes from 'prop-types';
import { viz } from './chartTheme';

/** A tiny trend line with an end dot. Decorative — the numbers beside it carry the meaning. */
const Sparkline = ({ values, slot = 1, width = 96, height = 28 }) => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const x = (i) => 3 + (i * (width - 6)) / (finite.length - 1);
  const y = (v) => height - 4 - ((v - lo) / (hi - lo || 1)) * (height - 8);
  const d = finite.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = finite.length - 1;
  return (
    <svg width={width} height={height} aria-hidden="true" focusable="false" className="viz">
      <path className="viz-fade" d={d} fill="none" stroke={viz(slot)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(finite[last])} r={3.5} fill={viz(slot)} stroke="rgb(var(--surface))" strokeWidth={1.5} />
    </svg>
  );
};

Sparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  slot: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number,
};

export default Sparkline;
