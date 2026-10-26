import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Table2, LineChart as ChartIcon } from 'lucide-react';
import { Button, DataTable, Heading, Panel } from '@/components/ui';
import Legend from './Legend';

/**
 * Every chart sits in one of these: a title, a one-sentence takeaway that says
 * in plain words what the chart shows, the legend, and a "Show table" switch —
 * the same numbers as a real table, for screen readers, print and anyone who
 * would rather read than look.
 */
const ChartCard = ({ title, takeaway = null, legend = null, table = null, actions = null, children, className = '' }) => {
  const [asTable, setAsTable] = useState(false);
  const headingId = useId();
  return (
    <Panel className={`min-w-0 ${className}`} aria-labelledby={headingId}>
      <div className="viz-card__head">
        <div className="min-w-0">
          <Heading level={3} step="display-s" id={headingId} className="viz-card__title">{title}</Heading>
          {takeaway && <p className="viz-card__takeaway">{takeaway}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {table && (
            <Button
              variant="ghost"
              size="sm"
              icon={asTable ? ChartIcon : Table2}
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
            >
              {asTable ? 'Show chart' : 'Show table'}
            </Button>
          )}
        </div>
      </div>
      {legend && !asTable && <Legend items={legend} className="mb-3" />}
      {asTable && table ? <DataTable {...table} /> : children}
    </Panel>
  );
};

ChartCard.propTypes = {
  title: PropTypes.node.isRequired,
  takeaway: PropTypes.node,
  legend: PropTypes.array,
  table: PropTypes.shape({
    columns: PropTypes.array.isRequired,
    rows: PropTypes.array.isRequired,
    getRowKey: PropTypes.func.isRequired,
    caption: PropTypes.node,
  }),
  actions: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default ChartCard;
