import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Undo2 } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import {
  Button, Dialog, EmptyState, Field, Heading, Input, Select, Spinner, StatusTag, Tag, Textarea,
} from '@/components/ui';

const ID = 'sa-history';

export const errorOf = (error, fallback) => error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

const ENTITIES = [
  ['', 'Everything'],
  ['player', 'Players'],
  ['coach', 'Coaches'],
  ['judge', 'Judges'],
  ['admin', 'Admins'],
  ['team', 'Teams'],
  ['competition', 'Competitions'],
  ['entry', 'Competition entries'],
  ['score', 'Scores'],
  ['payment', 'Payments'],
];

/** Plain words for the action codes on record. Unknown codes show as they are. */
const ACTION = {
  ADMIN_UPDATED: 'Admin edited',
  ADMIN_DELETED: 'Admin deleted',
  COACH_ACTIVATED: 'Coach activated',
  COMPETITION_UPDATED: 'Competition edited',
  COMPETITION_DELETED: 'Competition deleted',
  COMPETITION_RESTORED: 'Competition restored',
  PLAYER_UPDATED: 'Player edited',
  COACH_UPDATED: 'Coach edited',
  JUDGE_UPDATED: 'Judge edited',
  PASSWORD_RESET_BY_OWNER: 'Password reset',
  SIGNED_OUT_EVERYWHERE: 'Signed out everywhere',
  ACCOUNT_DEACTIVATED: 'Deactivated',
  ACCOUNT_REACTIVATED: 'Reactivated',
  TEAM_UPDATED: 'Team edited',
  TEAM_DELETED: 'Team deleted',
  TEAM_RESTORED: 'Team restored',
  TEAM_COACH_CHANGED: 'Coach changed',
  TEAM_COCOACH_REMOVED: 'Co-coach removed',
  PLAYER_TRANSFERRED: 'Player moved',
  SCORE_CORRECTED: 'Score corrected',
  ENTRY_PLAYER_ADDED: 'Added to squad',
  ENTRY_PLAYER_REMOVED: 'Removed from squad',
  ENTRY_PLAYER_UPDATED: 'Squad entry edited',
  PAYMENT_RECORDED: 'Manual payment',
  REFUND_RECORDED: 'Refund recorded',
  PLAYER_TEAM_SET: 'Team set',
  PLAYER_TEAM_CORRECTED: 'Player team corrected',
  PLAYER_TEAM_ENTRIES_REMOVED: 'Removed from squads',
  PLAYER_TEAM_CONFLICT_RESOLVED: 'Conflict resolved',
};

/** Any other code on record, in plain words: SCORE_UPDATED → "Score updated". */
const actionLabel = (code) => ACTION[code] || String(code || '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const show = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return String(value);
};

/** "field: old → new" lines for one entry. */
const Changes = ({ changes }) => {
  if (!changes?.length) return null;
  return (
    <ul className="m-0 pl-4 grid gap-0.5">
      {changes.map((c) => (
        <li key={c.field} className="type-caption">
          <span className="text-fg-muted">{c.field}:</span>{' '}
          {c.secret ? 'changed' : <>{show(c.from)} → <strong>{show(c.to)}</strong></>}
        </li>
      ))}
    </ul>
  );
};

/** A dialog that asks for a reason before running `onConfirm(reason)`. */
export const ReasonDialog = ({ open, title, confirmText = 'Save', tone = 'default', children, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(''); }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={title} tone={tone}
      actions={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={reason.trim().length < 5} onClick={go} variant={tone === 'danger' ? 'danger' : 'solid'}>{confirmText}</Button>
        </>
      )}>
      <div className="grid gap-3">
        {children}
        <Field id={`${ID}-reason-${String(title).length}`} label="Reason (kept in History)" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
};

/**
 * Super Admin → History: every change on record, newest first. Corrections
 * made by the owner carry a reason and before/after values; plain field edits
 * can be undone (the undo is itself recorded).
 */
const SuperAdminHistory = () => {
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [undoing, setUndoing] = useState(null);

  const load = useCallback(() => {
    setData(null);
    superAdminAPI.fix.history({ page, ...(entity ? { entity } : {}), ...(query ? { q: query } : {}) })
      .then((res) => setData(res.data?.data))
      .catch((error) => { setData({ rows: [], total: 0, pages: 1 }); toast.error(errorOf(error, 'Could not load History')); });
  }, [entity, query, page]);
  useEffect(load, [load]);

  const undo = async (reason) => {
    try {
      await superAdminAPI.fix.undo(undoing._id, reason);
      toast.success('Change undone');
      setUndoing(null);
      load();
    } catch (error) {
      toast.error(errorOf(error, 'Could not undo it'));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Heading level={2} step="display-m">History</Heading>
        <p className="type-body-s text-fg-muted m-0">Every change on record: who, when, why, and what it was before.</p>
      </div>
      <form className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-end"
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <Field id={`${ID}-entity`} label="Show">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            {ENTITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field id={`${ID}-q`} label="Search name or reason">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. riya, typo" />
        </Field>
        <Button type="submit" icon={Search} variant="line">Search</Button>
      </form>

      {data === null ? <div className="py-8 flex justify-center"><Spinner label="Loading History" /></div>
        : data.rows.length === 0 ? <EmptyState tag="Nothing on record">No changes match.</EmptyState> : (
          <>
            <ul className="m-0 p-0 list-none grid" data-testid="history-rows">
              {data.rows.map((r) => (
                <li key={r._id} className="grid gap-1 py-3 border-b border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-body-s">
                      <StatusTag status={!r.undoneAt && r.reason ? 'warning' : 'info'}>{actionLabel(r.action)}</StatusTag>{' '}
                      {r.label && <strong>{r.label}</strong>}
                      {r.entity && <Tag className="ml-1">{r.entity}</Tag>}
                      {r.undoneAt && <span className="type-caption text-fg-muted"> · undone</span>}
                    </span>
                    {r.undoable && (
                      <Button size="sm" variant="line" icon={Undo2} onClick={() => setUndoing(r)}>Undo</Button>
                    )}
                  </div>
                  <span className="type-caption text-fg-muted">
                    {new Date(r.at).toLocaleString()} · {r.actorName || r.actorType}{r.reason ? ` · “${r.reason}”` : ''}
                  </span>
                  <Changes changes={r.changes} />
                </li>
              ))}
            </ul>
            {data.pages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
                <span className="type-caption text-fg-muted">Page {data.page} of {data.pages}</span>
                <Button size="sm" variant="ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older</Button>
              </div>
            )}
          </>
        )}

      <ReasonDialog open={!!undoing} title="Undo this change?" confirmText="Undo" onClose={() => setUndoing(null)} onConfirm={undo}>
        {undoing && (
          <>
            <p className="type-body-s m-0">{actionLabel(undoing.action)}{undoing.label ? ` — ${undoing.label}` : ''}. These values go back:</p>
            <Changes changes={(undoing.changes || []).map((c) => ({ ...c, from: c.to, to: c.from }))} />
          </>
        )}
      </ReasonDialog>
    </div>
  );
};

export default SuperAdminHistory;
