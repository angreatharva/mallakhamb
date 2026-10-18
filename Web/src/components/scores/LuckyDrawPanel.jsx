import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowDown, ArrowUp, Shuffle } from 'lucide-react';
import { Button, Heading, IconButton, Notice, Panel, StatusTag } from '@/components/ui';

/**
 * LuckyDrawPanel — where an admin records a physical lucky draw.
 *
 * The last tie-break step (COP 1.12.4 on a 4/5-judge panel; "same time" on a
 * 3-judge panel) is a draw held at the venue. The server flags every group the
 * rules could not separate (`tieBreakInfo.awaitingLuckyDraw`) and names it by
 * `tieGroupKey`; this panel lists those groups, lets the admin put the athletes
 * in the order the draw produced, and sends it. A group already drawn shows its
 * recorded order and can be changed or cleared.
 *
 * Nothing here ranks anyone: the server applies the order, and only while the
 * rules still leave exactly these athletes level.
 */

const ordinal = (n) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};

/** Groups awaiting a draw, and groups already drawn, from the ranked rows. */
export const luckyDrawGroups = (rows = []) => {
  const groups = new Map();
  for (const row of rows) {
    const info = row.tieBreakInfo;
    if (!info?.tieGroupKey) continue;
    if (!info.awaitingLuckyDraw && info.method !== 'lucky_draw') continue;
    if (!groups.has(info.tieGroupKey)) {
      groups.set(info.tieGroupKey, { key: info.tieGroupKey, recorded: info.method === 'lucky_draw', rows: [] });
    }
    groups.get(info.tieGroupKey).rows.push(row);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    rank: Math.min(...group.rows.map((row) => row.rank ?? Infinity)),
    score: group.rows[0]?.finalScore,
    // Recorded groups arrive in drawn order; awaiting ones in board order.
    rows: [...group.rows].sort((a, b) =>
      (a.tieBreakInfo.luckyDrawPosition ?? 0) - (b.tieBreakInfo.luckyDrawPosition ?? 0)),
  })).sort((a, b) => a.rank - b.rank);
};

const DrawGroup = ({ group, onRecord, onClear }) => {
  const [order, setOrder] = useState(group.rows);
  const [editing, setEditing] = useState(!group.recorded);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(group.rows);
    setEditing(!group.recorded);
  }, [group]);

  const move = (index, delta) => {
    const next = [...order];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    setOrder(next);
  };

  const run = async (action) => {
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
    }
  };

  const place = Number.isFinite(group.rank) ? ordinal(group.rank) : '';
  const title = `Level for ${place} on ${Number(group.score || 0).toFixed(2)}`;

  return (
    <Panel variant="raised" className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Heading level={4} step="display-s" asIs>{title}</Heading>
        {group.recorded
          ? <StatusTag status="success">Lucky draw recorded</StatusTag>
          : <StatusTag status="warning">Lucky draw needed</StatusTag>}
      </div>

      <ol className="grid gap-2" aria-label={`${title}: order drawn`}>
        {order.map((row, index) => (
          <li key={row.uid || row.playerId} className="flex items-center gap-3">
            <span className="type-num-m w-12 text-fg-muted">{ordinal((group.rank || 1) + index)}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-ink">{row.playerName}</span>
              <span className="block type-body-s text-fg-muted">{row.teamName}</span>
            </span>
            {editing && (
              <span className="flex gap-1">
                <IconButton label={`Move ${row.playerName} up`} icon={ArrowUp} size="sm"
                  disabled={index === 0 || saving} onClick={() => move(index, -1)} />
                <IconButton label={`Move ${row.playerName} down`} icon={ArrowDown} size="sm"
                  disabled={index === order.length - 1 || saving} onClick={() => move(index, 1)} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="flex gap-2 flex-wrap">
        {editing ? (
          <>
            <Button size="sm" icon={Shuffle} loading={saving}
              onClick={() => run(() => onRecord(order.map((row) => String(row.playerId))))}>
              Save draw result
            </Button>
            {group.recorded && (
              <Button size="sm" variant="ghost" disabled={saving}
                onClick={() => { setOrder(group.rows); setEditing(false); }}>
                Cancel
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="sm" variant="line" onClick={() => setEditing(true)}>Change order</Button>
            <Button size="sm" variant="ghost" loading={saving} onClick={() => run(() => onClear(group.key))}>
              Clear draw
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
};

DrawGroup.propTypes = {
  group: PropTypes.shape({
    key: PropTypes.string.isRequired,
    recorded: PropTypes.bool,
    rank: PropTypes.number,
    score: PropTypes.number,
    rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
  onRecord: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

const LuckyDrawPanel = ({ rows, onRecord, onClear }) => {
  const groups = useMemo(() => luckyDrawGroups(rows), [rows]);
  if (groups.length === 0) return null;

  const awaiting = groups.filter((group) => !group.recorded).length;

  return (
    <section className="grid gap-3 mb-6" aria-label="Lucky draw">
      <Notice tone={awaiting ? 'warning' : 'info'} title="Lucky draw">
        {awaiting
          ? `${awaiting} ${awaiting === 1 ? 'tie' : 'ties'} could not be broken by the rules. Hold the lucky draw at the venue, then put the athletes in the order drawn and save.`
          : 'Every tie the rules could not break has its lucky draw recorded.'}
      </Notice>
      {groups.map((group) => (
        <DrawGroup
          key={group.key}
          group={group}
          onRecord={(order) => onRecord(group, order)}
          onClear={() => onClear(group)}
        />
      ))}
    </section>
  );
};

LuckyDrawPanel.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRecord: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};

export default LuckyDrawPanel;
