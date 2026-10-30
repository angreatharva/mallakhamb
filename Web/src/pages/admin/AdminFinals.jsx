import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { CheckCheck, Lock, RefreshCw, RotateCcw, UserMinus, Undo2 } from 'lucide-react';
import { adminAPI } from '@/services/user/admin.api';
import { superAdminAPI } from '@/services/user/super-admin.api';
import { ageGroupMapping } from '@/hooks/useAgeGroups';
import {
  Button, ConfirmDialog, EmptyState, Heading, Notice, Panel, Segmented, Spinner, StatusTag, Tag,
} from '@/components/ui';

const STATUS = {
  waiting: { tone: 'info', text: 'Waiting for Competition I' },
  waiting_draw: { tone: 'warning', text: 'Tie: draw needed' },
  set: { tone: 'warning', text: 'Ready to finalize' },
  finalized: { tone: 'success', text: 'Finalized' },
  started: { tone: 'success', text: 'Final started' },
};
const ageLabel = (g) => ageGroupMapping[g]?.label || g || '';
const errorOf = (error, fallback) => error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

/** A Competition II tie the rules could not break: the admin taps the players in the drawn order. */
const AllRoundDraw = ({ final, ageGroup, onDraw }) => {
  const tied = final.tied.filter((t) => t.ageGroup === ageGroup);
  const [order, setOrder] = useState([]);
  const toggle = (id) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <div className="grid gap-2 p-3 rounded-lg border border-line">
      <p className="type-body-s m-0">{ageLabel(ageGroup)}: tap the tied players in the order the lucky draw produced (first place first).</p>
      <div className="flex flex-wrap gap-2">
        {tied.map((t) => (
          <Button key={t.player} size="sm" variant={order.includes(t.player) ? 'solid' : 'line'} onClick={() => toggle(t.player)}>
            {order.includes(t.player) ? `${order.indexOf(t.player) + 1}. ` : ''}{t.playerName} · {t.team?.name}
          </Button>
        ))}
      </div>
      <Button size="sm" className="justify-self-start" disabled={order.length !== tied.length} onClick={() => onDraw(ageGroup, order)}>
        Record the draw
      </Button>
    </div>
  );
};
AllRoundDraw.propTypes = { final: PropTypes.object.isRequired, ageGroup: PropTypes.string.isRequired, onDraw: PropTypes.func.isRequired };

const FinalCard = ({ final, onWithdraw, onReinstate, onDraw, onFinalize, onReopen }) => {
  const status = STATUS[final.status] || STATUS.waiting;
  const isII = final.competitionType === 'competition_2';
  const started = final.status === 'started';
  const ready = final.status === 'set' && !(final.blockers || []).length;
  const drawGroups = isII ? [...new Set(final.tied.map((t) => t.ageGroup))] : [];
  return (
    <Panel className="grid gap-3 p-4" data-testid="final-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={3} step="body">{final.label}</Heading>
        <StatusTag status={status.tone}>{status.text}</StatusTag>
      </div>

      {final.staleSince && <Notice tone="warning" title="Competition I changed after this final started">{final.staleNote}</Notice>}
      {final.waitingFor.length > 0 && (
        <ul className="m-0 pl-5 grid gap-0.5 type-caption text-fg-muted">
          {final.waitingFor.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      {final.qualifiers.length === 0 ? (
        <p className="type-body-s text-fg-muted m-0">No qualifiers yet.</p>
      ) : (
        <ol className="m-0 p-0 list-none grid gap-1.5">
          {final.qualifiers.map((q) => (
            <li key={q.player} className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body-s min-w-0">
                <strong>{q.playerName}</strong>{' '}
                <Tag>{q.team?.name || 'Team'}</Tag>
                {isII && <span className="text-fg-muted"> · {ageLabel(q.ageGroup)}</span>}
                <span className="text-fg-muted"> · {isII ? 'total' : 'Comp I'} {Number(q.score ?? 0).toFixed(2)}</span>
                {q.replacement && <span className="text-fg-muted"> · replacement</span>}
              </span>
              {!started && (
                <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => onWithdraw(final, q)}>Withdraw</Button>
              )}
            </li>
          ))}
        </ol>
      )}

      {final.skipped.filter((s) => s.reason === 'team_cap').length > 0 && (
        <p className="type-caption text-fg-muted m-0">
          Passed over (2 per team already in): {final.skipped.filter((s) => s.reason === 'team_cap').map((s) => `${s.playerName} (${s.team?.name})`).join(', ')}
        </p>
      )}
      {final.withdrawn.length > 0 && !started && (
        <div className="flex flex-wrap items-center gap-2 type-caption text-fg-muted">
          Withdrawn:
          {final.withdrawn.map((w) => {
            const who = final.skipped.find((s) => s.player === w.player);
            return (
              <Button key={w.player} size="sm" variant="ghost" icon={Undo2} onClick={() => onReinstate(final, w.player)}>
                {who?.playerName || 'Player'}: reinstate
              </Button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {ready && <Button size="sm" icon={Lock} onClick={() => onFinalize(final)}>Finalize</Button>}
        {final.status === 'set' && !ready && (final.blockers || []).length > 0 && (
          <p className="type-caption text-fg-muted m-0">Not ready: {final.blockers.join(' · ')}</p>
        )}
        {final.status === 'finalized' && onReopen && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onReopen(final)}>Reopen</Button>
        )}
      </div>
      {final.status === 'waiting_draw' && !isII && (
        <p className="type-caption m-0">Record the lucky draw on the Competition I standing (Scores tab); this final updates by itself.</p>
      )}
      {drawGroups.map((ag) => <AllRoundDraw key={ag} final={final} ageGroup={ag} onDraw={(group, order) => onDraw(final, group, order)} />)}
    </Panel>
  );
};
FinalCard.propTypes = {
  final: PropTypes.object.isRequired, onWithdraw: PropTypes.func.isRequired, onReinstate: PropTypes.func.isRequired, onDraw: PropTypes.func.isRequired,
  onFinalize: PropTypes.func.isRequired, onReopen: PropTypes.func,
};

/** What "Finalize all" is about to enter, shown before it does. */
const FinalizeSummary = ({ finals }) => {
  const ready = finals.filter((f) => f.status === 'set' && !(f.blockers || []).length);
  const notReady = finals.filter((f) => !['finalized', 'started'].includes(f.status) && !ready.includes(f));
  return (
    <div className="grid gap-3 max-h-[60vh] overflow-y-auto" data-testid="finalize-summary">
      {ready.length === 0 && <p className="type-body-s m-0">No final is ready to finalize.</p>}
      {ready.map((f) => (
        <div key={f._id} className="grid gap-1">
          <p className="type-body-s font-semibold m-0">{f.label}</p>
          <p className="type-caption m-0">{f.qualifiers.map((q) => `${q.playerName} (${q.team?.name || 'team'})`).join(', ')}</p>
          {f.skipped.filter((s) => s.reason === 'team_cap').length > 0 && (
            <p className="type-caption text-fg-muted m-0">Passed over: {f.skipped.filter((s) => s.reason === 'team_cap').map((s) => s.playerName).join(', ')}</p>
          )}
        </div>
      ))}
      {notReady.length > 0 && (
        <div className="grid gap-1 pt-2 border-t border-line">
          <p className="type-tag m-0">Not ready (left as they are)</p>
          {notReady.map((f) => (
            <p key={f._id} className="type-caption text-fg-muted m-0">{f.label}: {(f.blockers || f.waitingFor || []).join(' · ') || 'waiting'}</p>
          ))}
        </div>
      )}
    </div>
  );
};
FinalizeSummary.propTypes = { finals: PropTypes.array.isRequired };

/**
 * Admin / Super Admin → Finals: who moved from Competition I into Competition
 * II (All Round, all ages) and III (Apparatus, per age group), automatically
 * as Competition I is locked (docs/qualification-plan.md).
 */
const AdminFinals = ({ isSuperAdmin = false, competitionId = null, meetPicker = null }) => {
  const api = (isSuperAdmin ? superAdminAPI : adminAPI).finals;
  const [finals, setFinals] = useState(null);
  const [type, setType] = useState('competition_3');
  const [gender, setGender] = useState('Male');
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [finalizing, setFinalizing] = useState(null);

  const load = useCallback(async () => {
    if (!competitionId) { setFinals([]); return; }
    try {
      setFinals((await api.list(competitionId)).data?.data?.finals || []);
    } catch (error) {
      setFinals([]);
      toast.error(errorOf(error, 'Could not load the finals'));
    }
  }, [api, competitionId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, success) => {
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (error) {
      toast.error(errorOf(error, 'That did not work'));
    }
  };

  const recompute = async () => {
    setBusy(true);
    await act(() => api.recompute(competitionId), 'Finals recomputed');
    setBusy(false);
  };

  const types = useMemo(() => [...new Set((finals || []).map((f) => f.competitionType))], [finals]);
  // A meet running only one of the two finals opens on it.
  useEffect(() => { if (types.length && !types.includes(type)) setType(types[0]); }, [types, type]);
  const shown = useMemo(() => (finals || []).filter((f) => f.competitionType === type && f.gender === gender), [finals, type, gender]);

  // Super Admin: the meet is chosen here, on the tab (no meet is in context).
  const picker = meetPicker ? <div className="max-w-md">{meetPicker}</div> : null;
  if (!competitionId) {
    return (
      <div className="grid gap-4">
        {picker}
        <EmptyState tag="Choose a competition">Pick a competition to see its finals.</EmptyState>
      </div>
    );
  }
  if (finals === null) return <div className="py-12 flex justify-center"><Spinner label="Loading finals" /></div>;

  return (
    <div className="grid gap-4">
      {picker}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Heading level={2} step="display-m">Finals</Heading>
          <p className="type-body-s text-fg-muted m-0">
            Filled automatically when Competition I is locked. Competition III: top 10 per apparatus and age group, at most 2 per team. Competition II: the top 2 of each age group, all ages together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="line" icon={RefreshCw} loading={busy} onClick={recompute}>Recompute</Button>
          <Button icon={CheckCheck} disabled={!finals.some((f) => f.status === 'set' && !(f.blockers || []).length)} onClick={() => setConfirmAll(true)}>
            Finalize all ready finals
          </Button>
        </div>
      </div>
      <p className="type-caption text-fg-muted m-0">
        Finalists are entered — for the judges, the lots, the coaches and the public — only when a final is finalized.
      </p>

      {finals.length === 0 ? (
        <EmptyState tag="No finals">This competition runs no Competition II or III, or Competition I has not started.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Segmented label="Competition" value={type} onChange={setType}
              options={[{ value: 'competition_2', label: 'II · All Round' }, { value: 'competition_3', label: 'III · Apparatus' }].filter((o) => types.includes(o.value))} />
            <Segmented label="Gender" value={gender} onChange={setGender}
              options={[{ value: 'Male', label: 'Boys' }, { value: 'Female', label: 'Girls' }]} />
          </div>
          {shown.length === 0
            ? <p className="type-body-s text-fg-muted m-0">No {gender === 'Male' ? 'boys' : 'girls'} finals here.</p>
            : <div className="grid gap-3 lg:grid-cols-2">{shown.map((f) => (
              <FinalCard key={f._id} final={f}
                onFinalize={(final) => setFinalizing(final)}
                onReopen={isSuperAdmin ? (final) => act(() => api.reopen(final._id, competitionId), 'Final reopened') : null}
                onWithdraw={(final, q) => setWithdrawing({ final, q })}
                onReinstate={(final, playerId) => act(() => api.reinstate(final._id, { playerId, competitionId }), 'Reinstated')}
                onDraw={(final, ageGroup, order) => act(() => api.draw(final._id, { ageGroup, order, competitionId }), 'Draw recorded')} />
            ))}</div>}
        </>
      )}

      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} confirmText="Finalize all ready"
        title="Finalize these finals?"
        onConfirm={async () => {
          setConfirmAll(false);
          try {
            const res = await api.finalizeAll(competitionId);
            const { finalized = [], notReady = [] } = res.data?.data || {};
            toast.success(`${finalized.length} final(s) finalized${notReady.length ? ` · ${notReady.length} not ready` : ''}`);
            await load();
          } catch (error) {
            toast.error(errorOf(error, 'Could not finalize'));
          }
        }}>
        <FinalizeSummary finals={finals} />
      </ConfirmDialog>

      <ConfirmDialog open={Boolean(finalizing)} onClose={() => setFinalizing(null)} confirmText="Finalize"
        title={`Finalize ${finalizing?.label || ''}?`}
        onConfirm={async () => {
          const final = finalizing;
          setFinalizing(null);
          await act(() => api.finalize(final._id, competitionId), 'Finalized: finalists entered');
        }}>
        {finalizing && <FinalizeSummary finals={[finalizing]} />}
      </ConfirmDialog>

      <ConfirmDialog open={Boolean(withdrawing)} onClose={() => setWithdrawing(null)} tone="danger" confirmText="Withdraw"
        title={`Withdraw ${withdrawing?.q.playerName || ''}?`}
        onConfirm={async () => {
          const { final, q } = withdrawing;
          setWithdrawing(null);
          await act(() => api.withdraw(final._id, { playerId: q.player, competitionId }), 'Withdrawn: the next in rank fills the place');
        }}>
        The next player in the Competition I ranking takes the place{withdrawing?.final?.competitionType === 'competition_3' ? ' (still at most 2 per team)' : ''}. Their coach is emailed.
      </ConfirmDialog>
    </div>
  );
};

AdminFinals.propTypes = { isSuperAdmin: PropTypes.bool, competitionId: PropTypes.string, meetPicker: PropTypes.node };

export default AdminFinals;
