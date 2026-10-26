import PropTypes from 'prop-types';
import { signed, vizToken } from './chartTheme';

/**
 * Diverging bars around a centre line — "gave more" to the right in the warm
 * pole, "gave less" to the left in the cool pole — with the 90 % confidence
 * interval as a whisker. A row without enough performances shows no bar at
 * all, only the words, so a guess is never drawn as a finding.
 */
const LeanRows = ({ rows, limit = 1, ariaLabel, lowLabel = 'Lower than usual', highLabel = 'Higher than usual' }) => {
  const pct = (v) => 50 + (Math.max(-limit, Math.min(limit, v)) / limit) * 50;
  return (
    <div role="list" aria-label={ariaLabel} className="grid gap-2">
      <div className="viz-lean text-fg-muted" aria-hidden="true" style={{ fontSize: 12 }}>
        <span />
        <span className="flex justify-between"><span>← {lowLabel}</span><span>{highLabel} →</span></span>
        <span />
      </div>
      {rows.map((r) => {
        const has = r.value != null && r.enough !== false;
        const tone = r.value > 0 ? 'up' : 'down';
        return (
          <div role="listitem" key={r.id} className="viz-lean" aria-label={r.aria}>
            <span className="viz-lean__name" title={r.label}>
              {r.label}
              {r.badge && <span className="type-tag text-fg-muted ml-2">{r.badge}</span>}
            </span>
            <svg width="100%" height="22" style={{ height: 22 }} aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 22">
              <rect x={0} y={9} width={100} height={4} fill="rgb(var(--viz-mid))" />
              <line x1={50} x2={50} y1={2} y2={20} stroke="var(--line-strong)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              {has && (
                <>
                  <rect
                    className="viz-fade"
                    x={Math.min(50, pct(r.value))}
                    y={6}
                    width={Math.abs(pct(r.value) - 50)}
                    height={10}
                    fill={vizToken(tone)}
                    opacity={r.flagged ? 1 : 0.55}
                  />
                  {r.ci && (
                    <line
                      x1={pct(r.ci[0])}
                      x2={pct(r.ci[1])}
                      y1={11}
                      y2={11}
                      stroke="var(--fg)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </>
              )}
            </svg>
            <span className="viz-lean__value">
              {has ? signed(r.value) : <span className="text-fg-muted">Too few</span>}
              {r.flagged && <span className="sr-only"> — flagged</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

LeanRows.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    value: PropTypes.number,
    ci: PropTypes.arrayOf(PropTypes.number),
    enough: PropTypes.bool,
    flagged: PropTypes.bool,
    badge: PropTypes.node,
    aria: PropTypes.string,
  })).isRequired,
  limit: PropTypes.number,
  ariaLabel: PropTypes.string.isRequired,
  lowLabel: PropTypes.string,
  highLabel: PropTypes.string,
};

export default LeanRows;
