import { useState } from 'react';
import PropTypes from 'prop-types';
import useElementWidth from './useElementWidth';
import ChartTooltip from './ChartTooltip';
import { fmt, viz } from './chartTheme';

const ROW_H = 30;
const BAR_H = 18;

/**
 * Horizontal stacked bars — one row per performance (or athlete), segments in
 * a fixed order, and a ghost track out to `max`: the points that were on the
 * table and not won. Segments are separated by a 2px surface gap; the total is
 * printed at the end of each bar.
 */
const StackedBars = ({ rows, max = 10, ariaLabel, labelWidth = null, formatValue = fmt, reference = null }) => {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState(null);
  // On a phone the labels sit above their bars instead of beside them.
  const compact = width < 480;
  const rowH = compact ? ROW_H + 16 : ROW_H;
  const left = compact ? 0 : (labelWidth ?? Math.min(170, Math.max(96, Math.round(width * 0.3))));
  const right = 52;
  const innerW = Math.max(60, width - left - right);
  const scale = (v) => (Math.max(0, v) / max) * innerW;
  const height = rows.length * rowH + (reference ? 22 : 6);
  const maxChars = compact ? Math.floor(width / 7) : Math.floor((left - 12) / 6.5);

  const onKeyDown = (e) => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a == null ? 0 : Math.min(rows.length - 1, a + 1))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a == null ? 0 : Math.max(0, a - 1))); }
    if (e.key === 'Escape') setActive(null);
  };

  const activeRow = active == null ? null : rows[active];
  return (
    <div className="viz" ref={ref}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${ariaLabel}. Use the up and down arrow keys to read each bar.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        {rows.map((row, i) => {
          const y = i * rowH + (reference ? 18 : 2) + (compact ? 16 : 0);
          let acc = 0;
          const total = row.total ?? row.segments.reduce((s, seg) => s + (seg.value || 0), 0);
          return (
            <g key={row.id} onMouseEnter={() => setActive(i)} onMouseMove={() => setActive(i)}>
              <text
                className={`viz-text ${active === i ? 'viz-text--strong' : ''}`}
                x={compact ? 0 : left - 10}
                y={compact ? y - 5 : y + BAR_H / 2 + 4}
                textAnchor={compact ? 'start' : 'end'}
              >
                {row.label.length > maxChars ? `${row.label.slice(0, maxChars - 1)}…` : row.label}
              </text>
              <rect x={left} y={y} width={innerW} height={BAR_H} rx={2} fill="rgb(var(--viz-mid))" />
              {row.segments.map((seg, j) => {
                const w = scale(seg.value || 0);
                const x0 = left + scale(acc);
                acc += seg.value || 0;
                const gap = j > 0 ? 2 : 0;
                return w - gap > 0.5 ? (
                  <rect
                    key={seg.key}
                    className="viz-grow"
                    style={{ animationDelay: `${i * 40}ms` }}
                    x={x0 + gap}
                    y={y}
                    width={w - gap}
                    height={BAR_H}
                    rx={j === row.segments.length - 1 ? 2 : 0}
                    fill={viz(seg.slot)}
                  />
                ) : null;
              })}
              <text className="viz-text viz-text--strong" x={left + scale(total) + 6} y={y + BAR_H / 2 + 4}>
                {row.valueLabel ?? formatValue(total)}
              </text>
              <rect className="viz-hit" x={0} y={y - (rowH - BAR_H) / 2 - (compact ? 6 : 0)} width={width} height={rowH} />
            </g>
          );
        })}
        {reference && (
          <g>
            <line
              x1={left + scale(reference.value)}
              x2={left + scale(reference.value)}
              y1={12}
              y2={height}
              stroke="var(--fg)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text className="viz-text viz-text--muted" x={left + scale(reference.value)} y={10} textAnchor="middle">
              {reference.label}
            </text>
          </g>
        )}
      </svg>
      {activeRow && (
        <ChartTooltip
          x={Math.min(width - 10, left + scale(activeRow.total ?? 0))}
          y={active * rowH}
          width={width}
          title={activeRow.title || activeRow.label}
          rows={[
            ...activeRow.segments.map((seg) => ({ label: seg.label, value: seg.max ? `${formatValue(seg.value)} of ${formatValue(seg.max)}` : formatValue(seg.value), color: viz(seg.slot) })),
            ...(activeRow.extra || []),
          ]}
          footer={activeRow.footer}
        />
      )}
    </div>
  );
};

StackedBars.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    title: PropTypes.node,
    total: PropTypes.number,
    valueLabel: PropTypes.string,
    segments: PropTypes.arrayOf(PropTypes.shape({
      key: PropTypes.string.isRequired, label: PropTypes.string.isRequired, value: PropTypes.number, slot: PropTypes.number.isRequired, max: PropTypes.number,
    })).isRequired,
    extra: PropTypes.array,
    footer: PropTypes.node,
  })).isRequired,
  max: PropTypes.number,
  ariaLabel: PropTypes.string.isRequired,
  labelWidth: PropTypes.number,
  formatValue: PropTypes.func,
  reference: PropTypes.shape({ value: PropTypes.number.isRequired, label: PropTypes.string.isRequired }),
};

export default StackedBars;
