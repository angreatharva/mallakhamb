import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { Button, EmptyState, Field, Input, Notice, Panel, Select, Spinner, StatusTag } from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

const ID = 'sa-scores';
const ROLE_LABEL = { CHIEF: 'Chief', SR_JUDGE: 'Sr. Judge', J1: 'Judge 1', J2: 'Judge 2', J3: 'Judge 3', J4: 'Judge 4', J5: 'Judge 5' };
const SEAT_LABEL = { seniorJudge: 'Sr. Judge', judge1: 'Judge 1', judge2: 'Judge 2', judge3: 'Judge 3', judge4: 'Judge 4' };
const SECTIONS = [['d', 'difficultyScore', 'D'], ['c', 'combinationScore', 'C'], ['e', 'executionScore', 'E']];
const group = (g) => String(g || '').replace(/^(Under|Above)(\d+)$/, '$1 $2');
const fmt = (n, dp = 2) => (n === null || n === undefined ? '—' : Number(n).toFixed(dp));
/** Keep a mark field to digits and one point (number-only TEXT input, never type="number"). */
const decimal = (v) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

/** One row's editor: slip sections (or totals), time and deductions. */
const RowEditor = ({ row, onSaved, onCancel }) => {
  const [slips, setSlips] = useState(() => Object.fromEntries((row.slips || []).map((s) => [s.role, { d: String(s.d ?? 0), c: String(s.c ?? 0), e: String(s.e ?? 0), b: String(s.b ?? 0) }])));
  const [totals, setTotals] = useState(() => Object.fromEntries(Object.keys(SEAT_LABEL).map((f) => [f, String(row.judgeScores?.[f] ?? 0)])));
  const [deduction, setDeduction] = useState(String(row.deduction ?? 0));
  const [otherDeduction, setOtherDeduction] = useState(String(row.otherDeduction ?? 0));
  const [time, setTime] = useState(row.time === null || row.time === undefined ? '' : String(row.time));
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  const slipRoles = (row.slips || []).map((s) => s.role).filter((r) => r !== 'CHIEF');
  const seatsWithSlip = new Set(slipRoles.map((r) => ({ SR_JUDGE: 'seniorJudge', J1: 'judge1', J2: 'judge2', J3: 'judge3', J4: 'judge4' }[r])));

  const body = useMemo(() => {
    const out = {};
    const slipEdits = slipRoles.map((role) => {
      const was = row.slips.find((s) => s.role === role);
      const now = slips[role];
      const edit = { judgeRole: role };
      for (const [k, key] of SECTIONS) if (Number(now[k]) !== Number(was[k] ?? 0)) edit[key] = Number(now[k]);
      if (Number(now.b) !== Number(was.b ?? 0)) edit.bonusScore = Number(now.b);
      return edit;
    }).filter((e) => Object.keys(e).length > 1);
    if (slipEdits.length) out.slips = slipEdits;
    const totalEdits = Object.fromEntries(Object.entries(totals)
      .filter(([f, v]) => !seatsWithSlip.has(f) && Number(v) !== Number(row.judgeScores?.[f] ?? 0))
      .map(([f, v]) => [f, Number(v)]));
    if (Object.keys(totalEdits).length) out.judgeScores = totalEdits;
    if (Number(deduction) !== Number(row.deduction ?? 0)) out.deduction = Number(deduction);
    if (Number(otherDeduction) !== Number(row.otherDeduction ?? 0)) out.otherDeduction = Number(otherDeduction);
    const t = time === '' ? null : Number(time);
    if (t !== (row.time ?? null)) out.time = t;
    return out;
  }, [slips, totals, deduction, otherDeduction, time]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (reason) => {
    try {
      const res = await superAdminAPI.fix.correctScore(row.scoreId, row.rowId, { ...body, reason });
      setResult(res.data?.data);
      setConfirming(false);
      toast.success(`Final score now ${fmt(res.data?.data?.row?.finalScore, 3)}`);
      onSaved();
    } catch (error) {
      toast.error(errorOf(error, 'Could not correct the score'));
    }
  };

  const set = (role, k) => (e) => setSlips({ ...slips, [role]: { ...slips[role], [k]: decimal(e.target.value) } });

  return (
    <Panel className="grid gap-4 p-5" data-testid="score-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body-s">
          <strong>{row.playerName}</strong> · {row.team?.name} · {row.gender} {group(row.ageGroup)} · {row.competitionType} · {row.apparatus}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>← Back to scores</Button>
      </div>
      <p className="type-caption text-fg-muted m-0">
        Edit what the panel wrote. The final score is recalculated by the same rules as competition day
        ({row.panelSize ? `${row.panelSize}-judge panel` : 'panel size from the marks'}). Now: average {fmt(row.averageMarks, 3)}{row.baseScoreApplied ? ' (base score applied)' : ''}, final <strong>{fmt(row.finalScore, 3)}</strong>.
      </p>

      {slipRoles.length > 0 && (
        <div className="grid gap-2">
          <p className="ui-field__label type-tag m-0">Judge slips</p>
          <div className="grid gap-2">
            {slipRoles.map((role) => {
              const s = slips[role];
              const total = (Number(s.d) || 0) + (Number(s.c) || 0) + (Number(s.e) || 0) + (Number(s.b) || 0);
              return (
                <div key={role} className="grid grid-cols-[minmax(0,6rem)_repeat(4,minmax(0,1fr))_minmax(0,4rem)] gap-2 items-end">
                  <span className="type-body-s pb-2">{ROLE_LABEL[role] || role}</span>
                  {SECTIONS.map(([k, , label]) => (
                    <Field key={k} id={`${ID}-${role}-${k}`} label={label}>
                      <Input numeric inputMode="decimal" value={s[k]} onChange={set(role, k)} />
                    </Field>
                  ))}
                  <Field id={`${ID}-${role}-b`} label="Bonus">
                    <Select value={String(Number(s.b) === 0.2 ? '0.2' : '0')} onChange={(e) => setSlips({ ...slips, [role]: { ...s, b: e.target.value } })}>
                      <option value="0">0</option>
                      <option value="0.2">0.20</option>
                    </Select>
                  </Field>
                  <span className="type-body-s pb-2 text-right"><strong>{total.toFixed(2)}</strong></span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(SEAT_LABEL).some((f) => !seatsWithSlip.has(f) && Number(row.judgeScores?.[f]) > 0) && (
        <div className="grid gap-2">
          <p className="ui-field__label type-tag m-0">Judge totals (no slip on record)</p>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
            {Object.entries(SEAT_LABEL).filter(([f]) => !seatsWithSlip.has(f)).map(([f, label]) => (
              <Field key={f} id={`${ID}-total-${f}`} label={label}>
                <Input numeric inputMode="decimal" value={totals[f]} onChange={(e) => setTotals({ ...totals, [f]: decimal(e.target.value) })} />
              </Field>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 grid-cols-3">
        <Field id={`${ID}-ded`} label="Deduction"><Input numeric inputMode="decimal" value={deduction} onChange={(e) => setDeduction(decimal(e.target.value))} /></Field>
        <Field id={`${ID}-other`} label="Other deduction"><Input numeric inputMode="decimal" value={otherDeduction} onChange={(e) => setOtherDeduction(decimal(e.target.value))} /></Field>
        <Field id={`${ID}-time`} label="Time (s)"><Input numeric inputMode="decimal" value={time} onChange={(e) => setTime(decimal(e.target.value))} /></Field>
      </div>

      <Button className="justify-self-start" disabled={Object.keys(body).length === 0} onClick={() => setConfirming(true)}>Correct score</Button>

      {result?.finals?.held?.length > 0 && (
        <Notice tone="warning" title="Some finals did not change">
          {result.finals.held.length} final(s) for this category are already finalized or started, so their qualifier lists were kept. Reopen them in Finals if the correction should change who qualifies.
        </Notice>
      )}

      <ReasonDialog open={confirming} title={`Correct ${row.playerName}'s ${row.apparatus} score?`} confirmText="Correct score" onClose={() => setConfirming(false)} onConfirm={save}>
        <p className="type-body-s m-0">The final score and rankings are recalculated{row.competitionType === 'Competition I' ? ', and the finals this category feeds are re-run' : ''}.</p>
      </ReasonDialog>
    </Panel>
  );
};

/** Fix → Scores: correct any athlete's score, finished meets included. */
const ScoresSection = () => {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [gender, setGender] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    superAdminAPI.getAllCompetitions()
      .then((res) => {
        const list = res.data?.data?.competitions ?? res.data?.data ?? [];
        setCompetitions(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompetitions([]));
  }, []);

  const load = async (e) => {
    e?.preventDefault();
    if (!competitionId) return;
    setRows(null);
    try {
      const res = await superAdminAPI.fix.listScores({ competitionId, ...(gender ? { gender } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
      setRows(res.data?.data || []);
    } catch (error) {
      setRows([]);
      toast.error(errorOf(error, 'Could not load scores'));
    }
  };
  useEffect(() => { if (competitionId) load(); }, [competitionId, gender]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) return <RowEditor row={editing} onSaved={load} onCancel={() => { setEditing(null); load(); }} />;
  return (
    <div className="grid gap-4">
      <form className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,8rem)_1fr_auto] sm:items-end" onSubmit={load}>
        <Field id={`${ID}-comp`} label="Competition">
          <Select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            <option value="" disabled>Choose a competition</option>
            {competitions.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.year})</option>)}
          </Select>
        </Field>
        <Field id={`${ID}-gender`} label="Gender">
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Both</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </Select>
        </Field>
        <Field id={`${ID}-q`} label="Athlete name"><Input value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Button type="submit" icon={Search} variant="line" disabled={!competitionId}>Search</Button>
      </form>
      {!competitionId ? <EmptyState tag="Choose a competition">Its scored performances are listed here.</EmptyState>
        : rows === null ? <div className="py-8 flex justify-center"><Spinner label="Loading scores" /></div>
          : rows.length === 0 ? <EmptyState tag="No scores">Nothing scored matches.</EmptyState> : (
            <ul className="m-0 p-0 list-none grid gap-1" data-testid="score-rows">
              {rows.map((r) => (
                <li key={r.rowId}>
                  <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 p-2 rounded-lg border border-line hover:border-fg-muted type-body-s" onClick={() => setEditing(r)}>
                    <strong>{r.playerName}</strong>
                    <span className="text-fg-muted">{r.team?.name} · {r.gender} {group(r.ageGroup)} · {r.competitionType} · {r.apparatus}</span>
                    <span className="ml-auto"><strong>{fmt(r.finalScore, 3)}</strong></span>
                    {r.isLocked && <StatusTag status="info">Published</StatusTag>}
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
};

export default ScoresSection;
