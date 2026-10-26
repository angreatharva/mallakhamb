import PropTypes from 'prop-types';
import Sparkline from './Sparkline';

/**
 * A headline number: label, the figure, one line of context, and an optional
 * sparkline. `tone` colours only the context line (up = success, down =
 * danger), and always alongside words, never instead of them.
 */
const StatTile = ({ label, value, hint = null, tone = null, icon: Icon = null, spark = null }) => (
  <div className="ui-panel ui-panel--band flex flex-col gap-1 min-w-0 px-4 py-3.5">
    <p className="type-tag text-fg-secondary m-0 flex items-center gap-1.5">
      {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      {label}
    </p>
    <div className="flex items-end justify-between gap-2">
      <p className="type-num-m m-0" style={{ lineHeight: 1 }}>{value}</p>
      {spark && <Sparkline values={spark.values} slot={spark.slot || 1} />}
    </div>
    {hint && (
      <p
        className="type-body-s m-0"
        style={{ color: tone === 'up' ? 'rgb(var(--success-fg))' : tone === 'down' ? 'rgb(var(--danger-fg))' : 'var(--fg-muted)' }}
      >
        {hint}
      </p>
    )}
  </div>
);

StatTile.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node.isRequired,
  hint: PropTypes.node,
  tone: PropTypes.oneOf(['up', 'down', null]),
  icon: PropTypes.elementType,
  spark: PropTypes.shape({ values: PropTypes.arrayOf(PropTypes.number).isRequired, slot: PropTypes.number }),
};

export default StatTile;
