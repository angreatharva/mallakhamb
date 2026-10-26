import { useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import useElementWidth from './useElementWidth';
import ChartTooltip from './ChartTooltip';
import { fmt, niceDomain, ticks, viz } from './chartTheme';

const BASE_MARGIN = { top: 18, right: 72, bottom: 40, left: 40 };

/** A five-point star centred on (cx, cy). */
const starPath = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)},${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
};

/** Spread end labels so none overlaps: at least `gap` px apart, order kept. */
const spreadLabels = (labels, gap, lo, hi) => {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap;
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - hi : 0;
  if (overflow > 0) sorted.forEach((l) => { l.y = Math.max(lo, l.y - overflow); });
  return sorted;
};

/**
 * Multi-series line chart over an ordered category axis (meets in date order).
 *
 * Lines are 2px with a dash pattern per series and a direct label at their
 * last point; markers ring in the surface colour so they read over the line.
 * A crosshair and tooltip follow the pointer, and the arrow keys walk the
 * same columns from the keyboard.
 */
const LineChart = ({
  series, xLabels, height = 260, yDomain = null, yStep = 0.5, formatY = fmt,
  markers = [], ariaLabel, tooltipTitle = null,
}) => {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState(null);
  const clipId = `viz-wipe-${useId().replace(/:/g, '')}`;
  const n = xLabels.length;
  // Room on the right for the direct labels: about 7px a character, within bounds.
  const longest = Math.max(0, ...series.map((s) => s.label.length));
  const MARGIN = { ...BASE_MARGIN, right: Math.min(150, Math.max(48, longest * 7 + 18)) };
  const innerW = Math.max(60, width - MARGIN.left - MARGIN.right);
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const domain = useMemo(() => yDomain || niceDomain(
    series.flatMap((s) => s.points.map((p) => p.y)), { step: yStep, pad: yStep / 4 }
  ), [series, yDomain, yStep]);
  const x = (i) => MARGIN.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v) => MARGIN.top + innerH - ((v - domain[0]) / (domain[1] - domain[0] || 1)) * innerH;

  const yTicks = ticks(domain, yStep);
  // Thin the meet names to what fits, counting back from the latest meet so
  // the newest is always named; truncate to the room each one has.
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 96))));
  const slot = n <= 1 ? innerW : (innerW / (n - 1)) * labelEvery;
  const maxChars = Math.max(6, Math.min(16, Math.floor(slot / 7)));

  const paths = series.map((s) => {
    const byX = new Map(s.points.map((p) => [p.x, p]));
    let d = '';
    let pen = false;
    for (let i = 0; i < n; i += 1) {
      const p = byX.get(i);
      if (p == null || !Number.isFinite(p.y)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`;
      pen = true;
    }
    return { ...s, d, byX };
  });

  const endLabels = spreadLabels(
    paths.map((s) => {
      const last = [...s.points].filter((p) => Number.isFinite(p.y)).sort((a, b) => a.x - b.x).pop();
      return last ? { id: s.id, label: s.label, x: x(last.x), y: y(last.y) } : null;
    }).filter(Boolean),
    15, MARGIN.top, MARGIN.top + innerH
  );

  const onKeyDown = (e) => {
    if (!n) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => (a == null ? 0 : Math.min(n - 1, a + 1))); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => (a == null ? n - 1 : Math.max(0, a - 1))); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    if (e.key === 'Escape') setActive(null);
  };

  const tipRows = active == null ? [] : paths
    .map((s) => ({ s, p: s.byX.get(active) }))
    .filter(({ p }) => p && Number.isFinite(p.y))
    .map(({ s, p }) => ({ label: s.label, value: formatY(p.y), color: viz(s.slot), extra: p.tip }));
  const tipY = active == null || tipRows.length === 0 ? 0
    : Math.min(...paths.map((s) => s.byX.get(active)).filter((p) => p && Number.isFinite(p.y)).map((p) => y(p.y)));

  return (
    <div className="viz" ref={ref}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to step through the points.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line className="viz-grid" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(t)} y2={y(t)} />
            <text className="viz-text viz-text--muted" x={MARGIN.left - 8} y={y(t) + 4} textAnchor="end">{formatY(t, 1)}</text>
          </g>
        ))}
        <line className="viz-axis" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH} />
        {xLabels.map((label, i) => ((n - 1 - i) % labelEvery === 0) && (
          <text
            key={`${label}-${i}`}
            className="viz-text viz-text--muted"
            x={x(i)}
            y={height - MARGIN.bottom + 18}
            textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
          >
            {label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label}
          </text>
        ))}

        {active != null && (
          <line className="viz-crosshair" x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + innerH} />
        )}

        {/* Lines wipe in left to right: a clip rectangle grows across the plot
            (a stroke-dash draw-in is unreliable once lines carry their own dash). */}
        <defs>
          <clipPath id={clipId}>
            <rect className="viz-grow" x={MARGIN.left - 12} y={0} width={innerW + 24} height={height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {paths.map((s) => (
            <path
              key={s.id}
              d={s.d}
              fill="none"
              stroke={viz(s.slot)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dash || undefined}
            />
          ))}
        </g>

        {paths.map((s) => s.points.filter((p) => Number.isFinite(p.y)).map((p) => (
          <circle
            key={`${s.id}-${p.x}`}
            className="viz-fade"
            cx={x(p.x)}
            cy={y(p.y)}
            r={active === p.x ? 6 : 4.5}
            fill={viz(s.slot)}
            stroke="rgb(var(--surface))"
            strokeWidth={2}
          />
        )))}

        {markers.map((m) => {
          const s = paths.find((p) => p.id === m.seriesId);
          const p = s?.byX.get(m.x);
          if (!p) return null;
          const cx = x(m.x);
          const cy = y(p.y);
          return (
            <g key={`${m.seriesId}-${m.x}-${m.kind}`} className="viz-fade">
              {m.kind === 'star' && (
                <path d={starPath(cx, cy, 9)} fill="rgb(var(--medal-gold))" stroke="rgb(var(--surface))" strokeWidth={1.5} />
              )}
              {m.label && (
                <text className="viz-text viz-text--strong" x={cx} y={cy - 14} textAnchor="middle">{m.label}</text>
              )}
            </g>
          );
        })}

        {endLabels.map((l) => (
          <text key={l.id} className="viz-text viz-text--strong" x={l.x + 10} y={l.y + 4}>{l.label}</text>
        ))}

        {Array.from({ length: n }, (_, i) => {
          const colW = n <= 1 ? innerW : innerW / (n - 1);
          const left = n <= 1 ? MARGIN.left : Math.max(MARGIN.left, x(i) - colW / 2);
          const right = n <= 1 ? MARGIN.left + innerW : Math.min(MARGIN.left + innerW, x(i) + colW / 2);
          return (
            <rect
              key={i}
              className="viz-hit"
              x={left}
              y={MARGIN.top}
              width={Math.max(1, right - left)}
              height={innerH}
              onMouseEnter={() => setActive(i)}
              onMouseMove={() => setActive(i)}
            />
          );
        })}
      </svg>
      {active != null && tipRows.length > 0 && (
        <ChartTooltip
          x={x(active)}
          y={tipY}
          width={width}
          title={tooltipTitle ? tooltipTitle(active) : xLabels[active]}
          rows={tipRows.map(({ extra, ...row }) => (extra ? { ...row, value: `${row.value} · ${extra}` } : row))}
        />
      )}
    </div>
  );
};

LineChart.propTypes = {
  series: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    slot: PropTypes.number.isRequired,
    dash: PropTypes.string,
    points: PropTypes.arrayOf(PropTypes.shape({ x: PropTypes.number.isRequired, y: PropTypes.number, tip: PropTypes.string })).isRequired,
  })).isRequired,
  xLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
  height: PropTypes.number,
  yDomain: PropTypes.arrayOf(PropTypes.number),
  yStep: PropTypes.number,
  formatY: PropTypes.func,
  markers: PropTypes.arrayOf(PropTypes.shape({
    seriesId: PropTypes.string.isRequired, x: PropTypes.number.isRequired, kind: PropTypes.oneOf(['star']), label: PropTypes.string,
  })),
  ariaLabel: PropTypes.string.isRequired,
  tooltipTitle: PropTypes.func,
};

export default LineChart;
