import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, LogOut, Power, Save, Search } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { levelLabel } from '@/utils/competition/levels';
import {
  Button, EmptyState, Field, Heading, Input, Notice, Panel, Select, Spinner, StatusTag, Tag,
} from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

const ID = 'sa-accounts';
const TYPE_LABEL = { player: 'Player', coach: 'Coach', judge: 'Judge', admin: 'Admin' };
const group = (g) => String(g || '').replace(/^(Under|Above)(\d+)$/, '$1 $2');
const dateValue = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

/** The form's starting values for one account. */
const formOf = (a) => ({
  firstName: a.firstName || '', lastName: a.lastName || '', name: a.name || '',
  email: a.email || '', phone: a.phone || '',
  dateOfBirth: dateValue(a.dateOfBirth), gender: a.gender || '', emailType: a.emailType || 'self',
  guardianName: a.guardian?.name || '', guardianEmail: a.guardian?.email || '', guardianPhone: a.guardian?.phone || '',
});

/** Only the fields that changed, shaped as the server expects. */
function changesOf(type, account, form) {
  const start = formOf(account);
  const out = {};
  const keys = type === 'admin' ? ['name', 'email']
    : type === 'player' ? ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender', 'emailType']
      : ['firstName', 'lastName', 'email', 'phone'];
  for (const k of keys) if (form[k] !== start[k]) out[k] = form[k];
  if (type === 'player' && ['guardianName', 'guardianEmail', 'guardianPhone'].some((k) => form[k] !== start[k])) {
    out.guardian = { name: form.guardianName || null, email: form.guardianEmail || null, phone: form.guardianPhone || null };
  }
  return out;
}

const AccountDetail = ({ type, id, onBack }) => {
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(null);
  const [regenerate, setRegenerate] = useState(false);
  const [fixAges, setFixAges] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [temp, setTemp] = useState(null);

  const load = () => superAdminAPI.fix.getAccount(type, id)
    .then((res) => { setAccount(res.data?.data); setForm(formOf(res.data?.data)); })
    .catch((error) => toast.error(errorOf(error, 'Could not load the account')));
  useEffect(() => { load(); }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!account || !form) return <div className="py-8 flex justify-center"><Spinner label="Loading the account" /></div>;
  const changes = changesOf(type, account, form);
  const dirty = Object.keys(changes).length > 0 || regenerate;
  const isOwner = type === 'admin' && account.role === 'superadmin';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (reason) => {
    try {
      if (dialog === 'save') {
        const res = await superAdminAPI.fix.updateAccount(type, id, {
          ...changes, reason,
          ...(regenerate ? { regenerateLoginId: true } : {}),
          ...(type === 'player' && (changes.dateOfBirth || changes.gender) && fixAges ? { fixAgeGroups: true } : {}),
        });
        const data = res.data?.data;
        setAccount(data); setForm(formOf(data)); setRegenerate(false);
        const moved = data?.moved?.length ? ` · ${data.moved.length} entr${data.moved.length === 1 ? 'y' : 'ies'} moved to a new age group` : '';
        toast.success(`Saved${moved}`);
      } else if (dialog === 'reset') {
        const res = await superAdminAPI.fix.resetPassword(type, id, reason);
        setTemp(res.data?.data);
      } else if (dialog === 'signout') {
        await superAdminAPI.fix.signOut(type, id, reason);
        toast.success('Signed out on every device');
      } else if (dialog === 'active') {
        const res = await superAdminAPI.fix.setActive(type, id, !account.isActive, reason);
        setAccount(res.data?.data);
        toast.success(account.isActive ? 'Deactivated' : 'Reactivated');
      }
      setDialog(null);
    } catch (error) {
      toast.error(errorOf(error, 'Could not save it'));
    }
  };

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>← Back to results</Button>
      <Panel className="grid gap-4 p-5" data-testid="account-detail">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <Heading level={3} step="display-s">{account.name}</Heading>
            <span className="flex flex-wrap gap-1 items-center">
              <Tag>{TYPE_LABEL[type]}</Tag>
              {account.loginId && <code className="type-caption">{account.loginId}</code>}
              <StatusTag status={account.isActive ? 'success' : 'danger'}>{account.isActive ? 'Active' : 'Deactivated'}</StatusTag>
              {isOwner && <Tag tone="accent">Owner</Tag>}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isOwner && <Button size="sm" variant="line" icon={KeyRound} onClick={() => setDialog('reset')}>Reset password</Button>}
            <Button size="sm" variant="line" icon={LogOut} onClick={() => setDialog('signout')}>Sign out everywhere</Button>
            {type !== 'coach' && !isOwner && (
              <Button size="sm" variant={account.isActive ? 'danger' : 'line'} icon={Power} onClick={() => setDialog('active')}>
                {account.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
            )}
          </div>
        </div>

        {temp && (
          <Notice tone="warning" title="Temporary password — shown once">
            <p className="m-0">Sign-in: <code>{temp.login || '—'}</code> · Password: <code data-testid="temp-password">{temp.temporaryPassword}</code></p>
            <p className="m-0 type-caption">Give it to the person; they change it from their profile. They were signed out everywhere.</p>
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {type === 'admin' ? (
            <Field id={`${ID}-name`} label="Name"><Input value={form.name} onChange={set('name')} /></Field>
          ) : (
            <>
              <Field id={`${ID}-first`} label="First name"><Input value={form.firstName} onChange={set('firstName')} /></Field>
              <Field id={`${ID}-last`} label="Last name"><Input value={form.lastName} onChange={set('lastName')} /></Field>
            </>
          )}
          {type === 'player' && (
            <Field id={`${ID}-emailType`} label="Email belongs to">
              <Select value={form.emailType} onChange={set('emailType')}>
                <option value="self">The player</option>
                <option value="guardian">A parent or guardian</option>
                <option value="none">No email</option>
              </Select>
            </Field>
          )}
          {!(type === 'player' && form.emailType === 'none') && (
            <Field id={`${ID}-email`} label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
          )}
          {type !== 'admin' && (
            <Field id={`${ID}-phone`} label="Phone"><Input value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
          )}
          {type === 'player' && (
            <>
              <Field id={`${ID}-dob`} label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
              <Field id={`${ID}-gender`} label="Gender">
                <Select value={form.gender} onChange={set('gender')}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </Select>
              </Field>
              <Field id={`${ID}-gname`} label="Guardian name"><Input value={form.guardianName} onChange={set('guardianName')} /></Field>
              <Field id={`${ID}-gemail`} label="Guardian email"><Input type="email" value={form.guardianEmail} onChange={set('guardianEmail')} /></Field>
              <Field id={`${ID}-gphone`} label="Guardian phone"><Input value={form.guardianPhone} onChange={set('guardianPhone')} inputMode="tel" /></Field>
            </>
          )}
        </div>

        {type === 'player' && (
          <div className="grid gap-2">
            <label className="flex items-center gap-2 type-body-s">
              <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} />
              Issue a new Player ID from the name and date of birth
            </label>
            {(changes.dateOfBirth || changes.gender) && (
              <label className="flex items-center gap-2 type-body-s">
                <input type="checkbox" checked={fixAges} onChange={(e) => setFixAges(e.target.checked)} />
                Move squad entries the new date or gender no longer allows into the lowest age group they may enter
              </label>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button icon={Save} disabled={!dirty} onClick={() => setDialog('save')}>Save changes</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => { setForm(formOf(account)); setRegenerate(false); }}>Reset form</Button>
        </div>

        {type === 'player' && account.entries && (
          <div className="grid gap-2">
            <p className="ui-field__label type-tag m-0">Squad entries</p>
            {account.entries.length === 0 ? <p className="type-body-s text-fg-muted m-0">Not entered in any competition.</p> : (
              <ul className="m-0 p-0 list-none grid gap-1">
                {account.entries.map((e) => (
                  <li key={`${e.competition._id}-${e.team}`} className="type-body-s">
                    <strong>{e.competition.name}</strong>{e.competition.level ? ` (${levelLabel(e.competition.level)})` : ''} · {e.gender} {group(e.ageGroup)}
                    {e.scored && <span className="text-fg-muted"> · scored</span>}
                    {!e.ageOk && (
                      <span className="ui-field__error type-caption"> · age {e.age} is not allowed in {group(e.ageGroup)}{e.suggestion ? ` (lowest open: ${group(e.suggestion)})` : ''}{e.scored ? ' — already scored, correct it in Scores' : ''}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <ReasonDialog
        open={!!dialog}
        tone={dialog === 'active' && account.isActive ? 'danger' : 'default'}
        title={{
          save: `Save changes to ${account.name}?`,
          reset: `Reset ${account.name}'s password?`,
          signout: `Sign ${account.name} out everywhere?`,
          active: account.isActive ? `Deactivate ${account.name}?` : `Reactivate ${account.name}?`,
        }[dialog] || ''}
        confirmText={{ save: 'Save', reset: 'Reset password', signout: 'Sign out', active: account.isActive ? 'Deactivate' : 'Reactivate' }[dialog]}
        onClose={() => setDialog(null)}
        onConfirm={run}
      >
        {dialog === 'save' && (
          <ul className="m-0 pl-4">
            {Object.entries(changes).map(([k, v]) => <li key={k} className="type-caption">{k}: <strong>{typeof v === 'object' ? JSON.stringify(v) : (v || '—')}</strong></li>)}
            {regenerate && <li className="type-caption">new Player ID</li>}
          </ul>
        )}
        {dialog === 'reset' && <p className="type-body-s m-0">A temporary password is shown to you once. They are signed out on every device.</p>}
        {dialog === 'active' && account.isActive && <p className="type-body-s m-0">They cannot sign in until reactivated, and are signed out now.</p>}
      </ReasonDialog>
    </div>
  );
};

/** Fix → Accounts: find any player, coach, judge or admin and correct them. */
const AccountsSection = () => {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await superAdminAPI.fix.searchAccounts({ q: q.trim(), ...(type ? { type } : {}) });
      setResults(res.data?.data || []);
      setPicked(null);
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    } finally {
      setBusy(false);
    }
  };

  if (picked) return <AccountDetail type={picked.type} id={picked._id} onBack={() => setPicked(null)} />;
  return (
    <div className="grid gap-4">
      <form className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_auto] sm:items-end" onSubmit={search}>
        <Field id={`${ID}-type`} label="Who">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Anyone</option>
            {[['player', 'Players'], ['coach', 'Coaches'], ['judge', 'Judges'], ['admin', 'Admins']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field id={`${ID}-q`} label="Name, email or Player ID">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. riya mane" />
        </Field>
        <Button type="submit" icon={Search} loading={busy} disabled={q.trim().length < 2}>Search</Button>
      </form>
      {results && results.length === 0 && <EmptyState tag="No accounts found">Try part of the name or the email.</EmptyState>}
      {results && results.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2" data-testid="account-results">
          {results.map((a) => (
            <li key={`${a.type}-${a._id}`}>
              <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 p-3 rounded-lg border border-line hover:border-fg-muted" onClick={() => setPicked(a)}>
                <Tag>{TYPE_LABEL[a.type]}</Tag>
                <strong className="type-body-s">{a.name}</strong>
                <code className="type-caption">{a.loginId || a.email || '—'}</code>
                {!a.isActive && <StatusTag status="danger">Deactivated</StatusTag>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AccountsSection;
