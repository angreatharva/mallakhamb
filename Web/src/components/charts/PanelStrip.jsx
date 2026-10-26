import PropTypes from 'prop-types';
import useElementWidth from './useElementWidth';
import { fmt, niceDomain, viz } from './chartTheme';

/**
 * Every judge's total for one performance on one line. The marks the published
 * score counted are filled; the ones the panel rule dropped (highest, lowest,
 * the Senior Judge on a five-judge panel) are hollow. Seats only — a player is
 * never told which person sat where.
 */
const PanelStrip = ({ panel, finalScore = null }) => {
  const [ref, width] = useElementWidth();
  const values = panel.map((j) => j.total);
  const domain = niceDomain([...values, finalScore].filter((v) => v != null), { step: 0.5, pad: 0.15 });
  const pad = 16;
  const x = (v) => pad + ((v - domain[0]) / (domain[1] - domain[0] || 1)) * (width - pad * 2);
  // Same totals sit side by side rather than on top of each other.
  const seen = new Map();
  const placed = panel.map((j) => {
    const key = j.total.toFixed(2);
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    return { ...j, dy: n * 14 };
  });
  const height = 46 + Math.max(0, ...placed.map((p) => p.dy));
  return (
    <div className="viz" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`Judges' totals: ${panel.map((j) => `${j.seat} ${fmt(j.total)}${j.counted ? ' (counted)' : ' (dropped)'}`).join(', ')}`}>
        <line className="viz-axis" x1={pad} x2={width - pad} y1={20} y2={20} />
        <text className="viz-text viz-text--muted" x={pad} y={height - 2}>{fmt(domain[0], 1)}</text>
        <text className="viz-text viz-text--muted" x={width - pad} y={height - 2} textAnchor="end">{fmt(domain[1], 1)}</text>
        {finalScore != null && (
          <g>
            <line x1={x(finalScore)} x2={x(finalScore)} y1={6} y2={34} stroke="var(--fg)" strokeWidth={1.5} strokeDasharray="3 2" />
            <text className="viz-text viz-text--strong" x={x(finalScore)} y={4} textAnchor="middle">Final {fmt(finalScore)}</text>
          </g>
        )}
        {placed.map((j) => (
          <g key={j.seat} className="viz-fade">
            <circle
              cx={x(j.total)}
              cy={20 + j.dy}
              r={6}
              fill={j.counted ? viz(1) : 'rgb(var(--surface))'}
              stroke={viz(1)}
              strokeWidth={2}
            >
              <title>{`${j.seat}: ${fmt(j.total)} — ${j.counted ? 'counted' : 'dropped by the panel rule'}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
};

PanelStrip.propTypes = {
  panel: PropTypes.arrayOf(PropTypes.shape({ seat: PropTypes.string.isRequired, total: PropTypes.number.isRequired, counted: PropTypes.bool })).isRequired,
  finalScore: PropTypes.number,
};

export default PanelStrip;
