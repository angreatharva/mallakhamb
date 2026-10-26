import PropTypes from 'prop-types';

/**
 * A grid of cells, rows × columns, built from HTML so every cell's text is
 * real text and the whole thing reflows. The page decides each cell's fill and
 * words (`cell(row, col)` returns `{ background, label, ink, title, empty,
 * outlined, onClick }`); this only lays them out. Empty cells are hatched,
 * never coloured, so "no data" is never mistaken for "no difference".
 */
const Heatmap = ({ rows, columns, cell, rowHeader = 'Row', minColumn = 64, rowLabelWidth = 150, caption }) => (
  <div className="viz-heat-wrap">
    <div
      className="viz-heat"
      role="table"
      aria-label={caption}
      style={{ gridTemplateColumns: `minmax(${Math.min(96, rowLabelWidth)}px, ${rowLabelWidth}px) repeat(${columns.length}, minmax(${minColumn}px, 1fr))`, minWidth: rowLabelWidth + columns.length * minColumn }}
    >
      <div role="row" style={{ display: 'contents' }}>
        <div role="columnheader" className="viz-heat__head" style={{ textAlign: 'left' }}>{rowHeader}</div>
        {columns.map((c) => (
          <div role="columnheader" key={c.id} className="viz-heat__head" title={c.title || c.label}>{c.label}</div>
        ))}
      </div>
      {rows.map((r) => (
        <div role="row" key={r.id} style={{ display: 'contents' }}>
          <div role="rowheader" className="viz-heat__row" title={r.title || r.label}>{r.label}</div>
          {columns.map((c) => {
            const v = cell(r, c);
            const className = `viz-heat__cell ${v.empty ? 'viz-heat__cell--empty' : ''} ${v.outlined ? 'viz-heat__cell--home' : ''}`;
            const style = v.empty ? undefined : { background: v.background, color: v.ink || 'var(--fg)' };
            return v.onClick ? (
              <button type="button" role="cell" key={c.id} className={className} style={style} title={v.title} aria-label={v.title} onClick={v.onClick}>
                {v.label}
              </button>
            ) : (
              <div role="cell" key={c.id} className={className} style={style} title={v.title} aria-label={v.title}>
                {v.label}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </div>
);

Heatmap.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.node.isRequired, title: PropTypes.string })).isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.node.isRequired, title: PropTypes.string })).isRequired,
  cell: PropTypes.func.isRequired,
  rowHeader: PropTypes.node,
  minColumn: PropTypes.number,
  rowLabelWidth: PropTypes.number,
  caption: PropTypes.string.isRequired,
};

export default Heatmap;
