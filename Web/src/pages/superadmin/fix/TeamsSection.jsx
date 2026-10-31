import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, RotateCcw, Search, Trash2, UserCog, UserMinus } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { levelLabel } from '@/utils/competition/levels';
import {
  Button, EmptyState, Field, Heading, Input, Panel, Spinner, StatusTag, Tag,
} from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

const ID = 'sa-teams';

/** Pick a coach by name or email (Accounts search, coaches only). */
export const CoachPicker = ({ value, onChange, exclude = [] }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const find = async () => {
    if (q.trim().length < 2) return;
    try {
      const res = await superAdminAPI.fix.searchAccounts({ q: q.trim(), type: 'coach' });
      setList((res.data?.data || []).filter((c) => !exclude.includes(String(c._id))));
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    }
  };
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field id={`${ID}-coach-q`} label="Find the new coach">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } }} placeholder="name or email" />
        </Field>
        <Button type="button" variant="line" icon={Search} onClick={find} disabled={q.trim().length < 2}>Find</Button>
      </div>
      {list && list.length === 0 && <p className="type-caption text-fg-muted m-0">No coach found.</p>}
      {list && list.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-1">
          {list.map((c) => (
            <li key={c._id}>
              <label className="flex items-center gap-2 type-body-s p-2 rounded-lg border border-line">
                <input type="radio" name={`${ID}-coach`} checked={value?._id === c._id} onChange={() => onChange(c)} />
                <strong>{c.name}</strong> <span className="text-fg-muted">{c.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const TeamDetail = ({ teamId, onBack }) => {
  const [team, setTeam] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [newCoach, setNewCoach] = useState(null);
  const [oldCoach, setOldCoach] = useState('cocoach');
  const [coCoach, setCoCoach] = useState(null);

  const load = () => superAdminAPI.fix.getTeam(teamId)
    .then((res) => { setTeam(res.data?.data); setName(res.data?.data?.name || ''); })
    .catch((error) => toast.error(errorOf(error, 'Could not load the team')));
  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!team) return <div className="py-8 flex justify-center"><Spinner label="Loading the team" /></div>;

  const run = async (reason) => {
    try {
      let res;
      if (dialog === 'rename') res = await superAdminAPI.fix.renameTeam(teamId, name.trim(), reason);
      if (dialog === 'delete') res = await superAdminAPI.fix.deleteTeam(teamId, reason);
      if (dialog === 'restore') res = await superAdminAPI.fix.restoreTeam(teamId, reason);
      if (dialog === 'coach') res = await superAdminAPI.fix.changeCoach(teamId, { coachId: newCoach._id, oldCoach, reason });
      if (dialog === 'cocoach') res = await superAdminAPI.fix.removeCoCoach(teamId, coCoach._id, reason);
      setTeam(res.data?.data);
      setName(res.data?.data?.name || '');
      toast.success({ rename: 'Renamed', delete: 'Team deleted', restore: 'Team restored', coach: 'Coach changed', cocoach: 'Co-coach removed' }[dialog]);
      setDialog(null);
      setNewCoach(null);
    } catch (error) {
      toast.error(errorOf(error, 'Could not save it'));
    }
  };

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>← Back to teams</Button>
      <Panel className="grid gap-4 p-5" data-testid="team-detail">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <Heading level={3} step="display-s">{team.name}</Heading>
            <span className="flex flex-wrap gap-1 items-center">
              <StatusTag status={team.isActive ? 'success' : 'danger'}>{team.isActive ? 'Active' : 'Deleted'}</StatusTag>
              <span className="type-caption text-fg-muted">Coach: <strong>{team.coach?.name || '—'}</strong></span>
            </span>
          </div>
          {team.isActive
            ? <Button size="sm" variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>Delete team</Button>
            : <Button size="sm" variant="line" icon={RotateCcw} onClick={() => setDialog('restore')}>Restore team</Button>}
        </div>

        {team.isActive && (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field id={`${ID}-name`} label="Team name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Button variant="line" icon={Pencil} disabled={name.trim() === team.name || name.trim().length < 2} onClick={() => setDialog('rename')}>Rename</Button>
            </div>

            <div className="grid gap-3 p-3 rounded-lg border border-line">
              <p className="ui-field__label type-tag m-0">Change the coach</p>
              <p className="type-caption text-fg-muted m-0">The new coach takes over the team and every competition entry, payment and score it has.</p>
              <CoachPicker value={newCoach} onChange={setNewCoach} exclude={[String(team.coach?._id)]} />
              {newCoach && (
                <fieldset className="grid gap-1 m-0 p-0 border-0">
                  <legend className="type-body-s mb-1">What happens to {team.coach?.name || 'the current coach'}?</legend>
                  <label className="flex items-center gap-2 type-body-s"><input type="radio" checked={oldCoach === 'cocoach'} onChange={() => setOldCoach('cocoach')} /> Stays as co-coach (the new coach can remove them later)</label>
                  <label className="flex items-center gap-2 type-body-s"><input type="radio" checked={oldCoach === 'remove'} onChange={() => setOldCoach('remove')} /> Removed from the team</label>
                </fieldset>
              )}
              <Button className="justify-self-start" icon={UserCog} disabled={!newCoach} onClick={() => setDialog('coach')}>Change coach</Button>
            </div>

            <div className="grid gap-2">
              <p className="ui-field__label type-tag m-0">Co-coaches</p>
              {team.coCoaches.length === 0 ? <p className="type-body-s text-fg-muted m-0">None.</p> : (
                <ul className="m-0 p-0 list-none grid gap-1">
                  {team.coCoaches.map((c) => (
                    <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 type-body-s">
                      <span><strong>{c.name}</strong> <span className="text-fg-muted">{c.email}</span></span>
                      <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => { setCoCoach(c); setDialog('cocoach'); }}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="grid gap-2">
          <p className="ui-field__label type-tag m-0">Competitions entered</p>
          {team.competitions.length === 0 ? <p className="type-body-s text-fg-muted m-0">None yet.</p> : (
            <ul className="m-0 p-0 list-none grid gap-1">
              {team.competitions.map((c) => (
                <li key={c._id} className="type-body-s">
                  <strong>{c.name}</strong> · {levelLabel(c.level)} · {c.players} athlete{c.players === 1 ? '' : 's'}
                  {c.isSubmitted ? ' · submitted' : ' · not submitted'}{c.finished ? ' · finished' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <ReasonDialog
        open={!!dialog}
        tone={dialog === 'delete' ? 'danger' : 'default'}
        title={{
          rename: `Rename to “${name.trim()}”?`,
          delete: `Delete ${team.name}?`,
          restore: `Restore ${team.name}?`,
          coach: `Make ${newCoach?.name || ''} the coach of ${team.name}?`,
          cocoach: `Remove ${coCoach?.name || ''} as co-coach?`,
        }[dialog] || ''}
        confirmText={{ rename: 'Rename', delete: 'Delete', restore: 'Restore', coach: 'Change coach', cocoach: 'Remove' }[dialog]}
        onClose={() => setDialog(null)}
        onConfirm={run}
      >
        {dialog === 'delete' && <p className="type-body-s m-0">The coach can no longer use it. Its entries and scores stay; restore it any time.</p>}
        {dialog === 'coach' && (
          <p className="type-body-s m-0">
            {team.coach?.name || 'The current coach'} {oldCoach === 'cocoach' ? 'stays as co-coach.' : 'is removed from the team.'}
          </p>
        )}
      </ReasonDialog>
    </div>
  );
};

/** Fix → Teams: rename, delete, restore, change coach, co-coaches. */
const TeamsSection = () => {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    try {
      const res = await superAdminAPI.fix.searchTeams(q.trim());
      setList(res.data?.data || []);
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    }
  };
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (picked) return <TeamDetail teamId={picked} onBack={() => { setPicked(null); search(); }} />;
  return (
    <div className="grid gap-4">
      <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={search}>
        <Field id={`${ID}-q`} label="Team or coach name">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. alpha club" />
        </Field>
        <Button type="submit" icon={Search}>Search</Button>
      </form>
      {list === null ? <div className="py-8 flex justify-center"><Spinner label="Loading teams" /></div>
        : list.length === 0 ? <EmptyState tag="No teams found">Try part of the team or coach name.</EmptyState> : (
          <ul className="m-0 p-0 list-none grid gap-2" data-testid="team-results">
            {list.map((t) => (
              <li key={t._id}>
                <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 p-3 rounded-lg border border-line hover:border-fg-muted" onClick={() => setPicked(t._id)}>
                  <strong className="type-body-s">{t.name}</strong>
                  <span className="type-caption text-fg-muted">{t.coach?.name || 'no coach'}</span>
                  {t.coCoaches > 0 && <Tag>+{t.coCoaches} co-coach{t.coCoaches > 1 ? 'es' : ''}</Tag>}
                  {!t.isActive && <StatusTag status="danger">Deleted</StatusTag>}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

export default TeamsSection;
