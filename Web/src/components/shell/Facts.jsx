import PropTypes from 'prop-types';
import { Panel } from '@/components/ui';
import { cx } from '@/components/ui/cx';

/**
 * The signed-in dashboards' two read-only building blocks, shared so the
 * player and judge homes read alike.
 */

/** One fact at the top of a dashboard: a tag label over a value (or a control). */
export const Fact = ({ label, value = null, children = null }) => (
  <Panel className="grid gap-2 content-start">
    <p className="type-tag text-fg-muted m-0">{label}</p>
    {children || <p className="m-0 text-fg font-bold text-lg leading-tight truncate">{value || '—'}</p>}
  </Panel>
);
Fact.propTypes = { label: PropTypes.node.isRequired, value: PropTypes.node, children: PropTypes.node };

/** A label/value line in a detail panel; stacks on phones, and long values wrap. */
export const InfoRow = ({ label, value = null, last = false }) => (
  <div className={cx('flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1', !last && 'border-b border-line')}>
    <span className="text-fg-muted type-body-s">{label}</span>
    <span className="text-fg type-body-s font-semibold sm:text-right break-all">{value || '—'}</span>
  </div>
);
InfoRow.propTypes = { label: PropTypes.node.isRequired, value: PropTypes.node, last: PropTypes.bool };
