import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { levelLabel } from '@/utils/competition/levels';
import { Button, EmptyState, Field, Input, Panel, Select, Spinner, StatusTag, Tag } from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

const ID = 'sa-entries';
const TYPE_LABEL = { competition_1: 'Competition I', competition_2: 'Competition II', competition_3: 'Competition III' };
const APPARATUS = ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'];
const group = (g) => String(g || '').replace(/^(Under|Above)(\d+)$/, '$1 $2');
const decimal = (v) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** Gender, age group and apparatus per competition type, for adding or editing a squad place. */
const EntryForm = ({ competition, value, onChange }) => {
  const groups = (competition.ageGroups || []).filter((g) => g.gender === value.gender).map((g) => g.ageGroup);
  // Competition II / III places are filled by the finals engine; only Competition I is chosen here.
  const types = (competition.competitionTypes || []).filter((t) => t === 'competition_1');
  // apparatusByGender is keyed by competition type, then gender.
  const allowedFor = (type) => {
    const list = competition.apparatusByGender?.[type]?.[value.gender];
    return Array.isArray(list) && list.length ? list : APPARATUS;
  };
  const toggle = (type, name) => {
    const list = value.apparatus?.[type] || [];
    const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
    onChange({ ...value, apparatus: { ...value.apparatus, [type]: next } });
  };
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 grid-cols-2">
        <Field id={`${ID}-gender`} label="Gender">
          <Select value={value.gender} onChange={(e) => onChange({ ...value, gender: e.target.value, ageGroup: '' })}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </Select>
        </Field>
        <Field id={`${ID}-age`} label="Age group">
          <Select value={value.ageGroup} onChange={(e) => onChange({ ...value, ageGroup: e.target.value })}>
            <option value="" disabled>Choose</option>
            {groups.map((g) => <option key={g} value={g}>{group(g)}</option>)}
          </Select>
        </Field>
      </div>
      {types.map((type) => (
        <fieldset key={type} className="m-0 p-0 border-0 grid gap-1">
          <legend className="ui-field__label type-tag mb-1">{TYPE_LABEL[type]} apparatus</legend>
          <div className="flex flex-wrap gap-3">
            {allowedFor(type).map((name) => (
              <label key={name} className="flex items-center gap-2 type-body-s">
                <input type="checkbox" checked={(value.apparatus?.[type] || []).includes(name)} onChange={() => toggle(type, name)} />
                {name.replace(' Mallakhamb', '')}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <label className="flex items-center gap-2 type-body-s">
        <input type="checkbox" checked={!!value.overrideAge} onChange={(e) => onChange({ ...value, overrideAge: e.target.checked })} />
        Allow outside the COP age rule
      </label>
      <label className="flex items-center gap-2 type-body-s">
        <input type="checkbox" checked={!!value.overrideLimit} onChange={(e) => onChange({ ...value, overrideLimit: e.target.checked })} />
        Allow a full squad
      </label>
    </div>
  );
};

const EntryDetail = ({ competitionId, teamId, onBack }) => {
  const [entry, setEntry] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(null);
  const [target, setTarget] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [status, setStatus] = useState({});
  const [moneyForm, setMoneyForm] = useState({ kind: 'payment', amount: '', method: 'cash', note: '' });

  const load = () => superAdminAPI.fix.getEntry(competitionId, teamId)
    .then((res) => { setEntry(res.data?.data); setStatus({ isSubmitted: res.data?.data?.isSubmitted, paymentStatus: res.data?.data?.paymentStatus || 'pending' }); })
    .catch((error) => toast.error(errorOf(error, 'Could not load the entry')));
  useEffect(() => { load(); }, [competitionId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return <div className="py-8 flex justify-center"><Spinner label="Loading the entry" /></div>;

  const findPlayer = async () => {
    if (q.trim().length < 2) return;
    try {
      const res = await superAdminAPI.fix.searchAccounts({ q: q.trim(), type: 'player' });
      setFound(res.data?.data || []);
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    }
  };

  const run = async (reason) => {
    try {
      let res;
      if (dialog === 'add') res = await superAdminAPI.fix.addEntryPlayer(competitionId, teamId, { playerId: target._id, ...form, reason });
      if (dialog === 'edit') res = await superAdminAPI.fix.updateEntryPlayer(competitionId, teamId, target.player, { ...form, reason });
      if (dialog === 'remove') res = await superAdminAPI.fix.removeEntryPlayer(competitionId, teamId, target.player, reason);
      if (dialog === 'status') res = await superAdminAPI.fix.setEntryStatus(competitionId, teamId, { ...status, reason });
      if (dialog === 'money') res = await superAdminAPI.fix.recordMoney(competitionId, teamId, { ...moneyForm, amount: Number(moneyForm.amount), reason });
      setEntry(res.data?.data);
      toast.success('Saved');
      setDialog(null);
      if (dialog === 'add') { setTarget(null); setFound(null); setQ(''); }
      if (dialog === 'money') setMoneyForm({ kind: 'payment', amount: '', method: 'cash', note: '' });
    } catch (error) {
      toast.error(errorOf(error, 'Could not save it'));
    }
  };

  const openAdd = (player) => {
    setTarget(player);
    setForm({ gender: player.gender || 'Female', ageGroup: '', apparatus: {}, overrideAge: false, overrideLimit: false });
    setDialog('add');
  };
  const openEdit = (p) => {
    setTarget(p);
    setForm({ gender: p.gender, ageGroup: p.ageGroup, apparatus: p.apparatus || {}, overrideAge: false, overrideLimit: false });
    setDialog('edit');
  };

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>← Back to teams</Button>
      <Panel className="grid gap-4 p-5" data-testid="entry-detail">
        <div className="grid gap-1">
          <p className="type-body-s m-0"><strong>{entry.team.name}</strong> · {entry.competition.name}</p>
          <span className="flex flex-wrap gap-1">
            <StatusTag status={entry.isSubmitted ? 'success' : 'warning'}>{entry.isSubmitted ? 'Submitted' : 'Not submitted'}</StatusTag>
            <StatusTag status={entry.paymentStatus === 'completed' ? 'success' : 'warning'}>Payment {entry.paymentStatus || '—'}</StatusTag>
          </span>
        </div>

        <div className="grid gap-2">
          <p className="ui-field__label type-tag m-0">Squad</p>
          {entry.players.length === 0 ? <p className="type-body-s text-fg-muted m-0">No athletes entered.</p> : (
            <ul className="m-0 p-0 list-none grid gap-1">
              {entry.players.map((p) => (
                <li key={p.player} className="flex flex-wrap items-center gap-2 type-body-s py-1 border-b border-line">
                  <strong>{p.name}</strong>
                  <span className="text-fg-muted">{p.gender} {group(p.ageGroup)} · {(p.apparatus?.competition_1 || []).map((a) => a.replace(' Mallakhamb', '')).join(', ') || 'no apparatus'}</span>
                  {!p.ageOk && <Tag>outside age rule</Tag>}
                  {p.scored && <Tag>scored</Tag>}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(p)}>Edit</Button>
                    {!p.scored && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => { setTarget(p); setDialog('remove'); }}>Remove</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-2 p-3 rounded-lg border border-line">
          <p className="ui-field__label type-tag m-0">Add an athlete</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field id={`${ID}-q`} label="Player name, email or Player ID">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findPlayer(); } }} />
            </Field>
            <Button variant="line" icon={Search} onClick={findPlayer} disabled={q.trim().length < 2}>Find</Button>
          </div>
          {found && found.length === 0 && <p className="type-caption text-fg-muted m-0">No player found.</p>}
          {found && found.map((p) => (
            <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 type-body-s">
              <span><strong>{p.name}</strong> <code className="type-caption">{p.loginId || p.email}</code></span>
              <Button size="sm" variant="line" icon={Plus} onClick={() => openAdd(p)}>Add</Button>
            </div>
          ))}
        </div>

        <div className="grid gap-2 p-3 rounded-lg border border-line">
          <p className="ui-field__label type-tag m-0">Registration status</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id={`${ID}-sub`} label="Submitted">
              <Select value={status.isSubmitted ? 'yes' : 'no'} onChange={(e) => setStatus({ ...status, isSubmitted: e.target.value === 'yes' })}>
                <option value="yes">Submitted</option>
                <option value="no">Not submitted</option>
              </Select>
            </Field>
            <Field id={`${ID}-pay`} label="Payment">
              <Select value={status.paymentStatus} onChange={(e) => setStatus({ ...status, paymentStatus: e.target.value })}>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </Select>
            </Field>
            <Button variant="line" disabled={status.isSubmitted === entry.isSubmitted && status.paymentStatus === (entry.paymentStatus || 'pending')} onClick={() => setDialog('status')}>Save status</Button>
          </div>
        </div>

        <div className="grid gap-2 p-3 rounded-lg border border-line">
          <p className="ui-field__label type-tag m-0">Record money paid or refunded outside the app</p>
          <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
            <Field id={`${ID}-kind`} label="Kind">
              <Select value={moneyForm.kind} onChange={(e) => setMoneyForm({ ...moneyForm, kind: e.target.value })}>
                <option value="payment">Payment received</option>
                <option value="refund">Refund given</option>
              </Select>
            </Field>
            <Field id={`${ID}-amount`} label="Amount (₹)"><Input numeric inputMode="decimal" value={moneyForm.amount} onChange={(e) => setMoneyForm({ ...moneyForm, amount: decimal(e.target.value) })} /></Field>
            <Field id={`${ID}-method`} label="Method">
              <Select value={moneyForm.method} onChange={(e) => setMoneyForm({ ...moneyForm, method: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="bank transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
              </Select>
            </Field>
            <Button variant="line" disabled={!(Number(moneyForm.amount) > 0)} onClick={() => setDialog('money')}>Record</Button>
          </div>
          <Field id={`${ID}-note`} label="Note (optional)"><Input value={moneyForm.note} onChange={(e) => setMoneyForm({ ...moneyForm, note: e.target.value })} maxLength={300} /></Field>
          {entry.transactions.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-1">
              {entry.transactions.map((t) => (
                <li key={t._id} className="type-caption">
                  {new Date(t.at).toLocaleDateString()} · <strong>{money(t.amount)}</strong> · {t.description || t.type} · {t.paymentStatus}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <ReasonDialog
        open={!!dialog}
        tone={dialog === 'remove' ? 'danger' : 'default'}
        title={{
          add: `Add ${target?.name || ''} to ${entry.team.name}?`,
          edit: `Change ${target?.name || ''}'s squad place?`,
          remove: `Remove ${target?.name || ''} from the squad?`,
          status: 'Change the registration status?',
          money: moneyForm.kind === 'refund' ? `Record a refund of ${money(moneyForm.amount)}?` : `Record a payment of ${money(moneyForm.amount)}?`,
        }[dialog] || ''}
        confirmText={{ add: 'Add', edit: 'Save', remove: 'Remove', status: 'Save', money: 'Record' }[dialog]}
        onClose={() => setDialog(null)}
        onConfirm={run}
      >
        {(dialog === 'add' || dialog === 'edit') && form && <EntryForm competition={entry.competition} value={form} onChange={setForm} />}
        {dialog === 'money' && <p className="type-body-s m-0">A ledger line only. Nothing is charged or refunded through Razorpay.</p>}
      </ReasonDialog>
    </div>
  );
};

/** Fix → Entries & payments: a team's squad in a competition, its status, and money. */
const EntriesSection = () => {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState('');
  const [teams, setTeams] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    superAdminAPI.getAllCompetitions()
      .then((res) => {
        const list = res.data?.data?.competitions ?? res.data?.data ?? [];
        setCompetitions(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompetitions([]));
  }, []);
  useEffect(() => {
    if (!competitionId) return;
    setTeams(null);
    superAdminAPI.fix.entryTeams(competitionId)
      .then((res) => setTeams(res.data?.data || []))
      .catch((error) => { setTeams([]); toast.error(errorOf(error, 'Could not load the teams')); });
  }, [competitionId, picked]);

  if (picked) return <EntryDetail competitionId={competitionId} teamId={picked} onBack={() => setPicked(null)} />;
  return (
    <div className="grid gap-4">
      <Field id={`${ID}-comp`} label="Competition" className="max-w-lg">
        <Select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
          <option value="" disabled>Choose a competition</option>
          {competitions.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.year}) — {c.place}{c.level ? ` · ${levelLabel(c.level)}` : ''}</option>)}
        </Select>
      </Field>
      {!competitionId ? <EmptyState tag="Choose a competition">Its entered teams are listed here.</EmptyState>
        : teams === null ? <div className="py-8 flex justify-center"><Spinner label="Loading teams" /></div>
          : teams.length === 0 ? <EmptyState tag="No teams entered">No team has an entry here yet.</EmptyState> : (
            <ul className="m-0 p-0 list-none grid gap-2">
              {teams.map((t) => (
                <li key={t._id}>
                  <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 p-3 rounded-lg border border-line hover:border-fg-muted type-body-s" onClick={() => setPicked(t._id)}>
                    <strong>{t.name}</strong>
                    <span className="text-fg-muted">{t.players} athlete{t.players === 1 ? '' : 's'}</span>
                    <StatusTag status={t.isSubmitted ? 'success' : 'warning'}>{t.isSubmitted ? 'Submitted' : 'Not submitted'}</StatusTag>
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
};

export default EntriesSection;
