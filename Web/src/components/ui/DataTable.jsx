import PropTypes from 'prop-types';
import '@/styles/look-fonts';
import { cx } from './cx';

/**
 * DataTable: a real <table>, every column kept. Below `md` it becomes
 * labelled cards (`.stacked-table`, each cell carries its header as
 * `data-label`). `activeKey` marks one row as current (3px accent rule,
 * `aria-current`). Numeric columns line up with tabular figures.
 *
 *   <DataTable caption="Running order" columns={[{ key: 'name', header: 'Athlete' },
 *     { key: 'total', header: 'Total', numeric: true }]} rows={rows} getRowKey={(r) => r.id} />
 */
const DataTable = ({ columns, rows, getRowKey, activeKey = null, caption = null, empty = null, className = '' }) => (
  <div className={cx('ui-table-wrap', className)}>
    <table className="ui-table stacked-table">
      {caption && <caption className="type-tag">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className={cx('type-tag', c.numeric && 'ui-num')}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty && (
          <tr><td colSpan={columns.length}>{empty}</td></tr>
        )}
        {rows.map((row) => {
          const key = getRowKey(row);
          return (
            <tr key={key} aria-current={key === activeKey ? 'true' : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={typeof c.header === 'string' ? c.header : ''} className={cx(c.numeric && 'ui-num')}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

DataTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired, header: PropTypes.node.isRequired, numeric: PropTypes.bool, render: PropTypes.func,
  })).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  getRowKey: PropTypes.func.isRequired,
  activeKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  caption: PropTypes.node,
  empty: PropTypes.node,
  className: PropTypes.string,
};

export default DataTable;
