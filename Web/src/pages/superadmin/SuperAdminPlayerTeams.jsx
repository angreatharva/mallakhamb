import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { levelLabel, COMPETITION_LEVELS } from '@/utils/competition/levels';
import {
  Button, ConfirmDialog, EmptyState, Field, Heading, Input, Notice, Panel, Select, Spinner, StatusTag, Tabs, TabPanel, Tag, Textarea,
} from '@/components/ui';

const ID = 'player-teams';
const TABS = [
  { id: 'find', label: 'Find a player' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'history', label: 'History' },
];

const errorOf = (error, fallback) => error?.response?.data?.error?.message || error?.response?.data?.message || fallback;
const when = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const HOW = {
  'join-team': 'player chose',
  'squad-entry': 'entered by the team',
  'register-player': 'registered by the coach',
  'walk-in-desk': 'walk-in desk',
  'superadmin-add-player': 'Super Admin added',
  'superadmin-correction': 'Super Admin corrected',
  'conflict-resolved': 'conflict resolved',
  'migration-014': 'from earlier entries',
};
const ACTION = {
  PLAYER_TEAM_SET: 'Team set',
  PLAYER_TEAM_CORRECTED: 'Corrected',
  PLAYER_TEAM_ENTRIES_REMOVED: 'Removed from squads',
  PLAYER_TEAM_CONFLICT_RESOLVED: 'Conflict resolved',
  WALK_IN_PLAYER_LINKED: 'Desk reused Player ID',
  WALK_IN_DIFFERENT_CHILD: 'Desk: a different child',
};

/** One level's team, with the correction form under it. */
const LevelRow = ({ player, row, teams, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    setSaving(true);
    setBlocked(null);
    try {
      const res = await superAdminAPI.playerTeams.correct(player._id, { level: row.level, teamId, reason });
      toast.success(`${row.label} team corrected`);
      setEditing(false);
      setReason('');
      onChanged(res.data?.data);
    } catch (error) {
      const details = error?.response?.data?.error?.details;
      if (details?.reason === 'ENTERED_FOR_OLD_TEAM') setBlocked(details.competitions || []);
      else toast.error(errorOf(error, 'Could not correct the team'));
    } finally {
      setSaving(false);
    }
  };

  const removeEntries = async () => {
    try {
      const res = await superAdminAPI.playerTeams.removeEntries(player._id, { level: row.level });
      const removed = res.data?.data?.removed || [];
      const paid = removed.filter((r) => r.paid).length;
      toast.success(`Removed from ${removed.length} squad(s)${paid ? ` — ${paid} already paid; settle the fee separately` : ''}`);
      setBlocked(null);
      onChanged(res.data?.data?.player);
    } catch (error) {
      toast.error(errorOf(error, 'Could not remove them from those squads'));
    }
  };

  return (
    <li className="grid gap-2 py-3 border-b border-line last:border-b-0" data-testid={`level-${row.level}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5 min-w-0">
          <span className="type-tag text-fg-muted">{row.label}</span>
          <span className="type-body-s">
            {row.team ? <strong>{row.team.name}</strong> : <span className="text-fg-muted">No team yet</span>}
            {row.team && <span className="text-fg-muted"> · {HOW[row.via] || row.setByType || 'set'} · {when(row.setAt)}</span>}
          </span>
        </div>
        {!editing && (
          <Button size="sm" variant="line" onClick={() => { setEditing(true); setTeamId(''); }}>
            {row.team ? 'Correct' : 'Set team'}
          </Button>
        )}
      </div>
      {editing && (
        <div className="grid gap-3 p-3 rounded-lg border border-line">
          <Field id={`${ID}-${row.level}-team`} label={`${row.label} team`} required>
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="" disabled>Choose a team</option>
              {teams.filter((t) => String(t._id) !== String(row.team?._id)).map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field id={`${ID}-${row.level}-reason`} label="Reason (kept in the history)" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          {blocked && (
            <Notice tone="warning" title="Still entered for the current team">
              {player.name} is in {blocked.length} open {row.label} squad(s) for {row.team?.name}: {blocked.map((c) => c.name).join(', ')}.
              <div className="mt-2">
                <Button size="sm" variant="line" onClick={() => setRemoving(true)}>Remove from those squads</Button>
              </div>
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={saving} disabled={!teamId || reason.trim().length < 5} onClick={save}>Save correction</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBlocked(null); }}>Cancel</Button>
          </div>
        </div>
      )}
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={async () => { setRemoving(false); await removeEntries(); }}
        title="Remove from those squads?" confirmText="Remove" tone="danger">
        {player.name} is taken out of {row.team?.name}&apos;s squads in every open {row.label} competition. Fees already paid are not refunded here.
      </ConfirmDialog>
    </li>
  );
};

const PlayerDetail = ({ playerId, teams }) => {
  const [player, setPlayer] = useState(null);
  useEffect(() => {
    setPlayer(null);
    superAdminAPI.playerTeams.detail(playerId)
      .then((res) => setPlayer(res.data?.data))
      .catch((error) => toast.error(errorOf(error, 'Could not load the player')));
  }, [playerId]);

  if (!player) return <div className="py-8 flex justify-center"><Spinner label="Loading the player" /></div>;
  return (
    <Panel className="grid gap-4 p-5" data-testid="player-teams-detail">
      <div className="grid gap-1">
        <Heading level={3} step="display-s">{player.name}</Heading>
        <p className="type-caption text-fg-muted m-0">
          {player.loginId || player.email} · {player.gender} · born {when(player.dateOfBirth)}
          {player.oldTeam ? ` · first team ${player.oldTeam.name}` : ''}
        </p>
      </div>
      {player.conflicts.length > 0 && (
        <Notice tone="warning" title="Found on two teams">
          {player.conflicts.map((c) => `${levelLabel(c.level)}: ${c.teams.map((t) => t.name).join(' and ')}`).join('; ')}. Settle it in Conflicts, or set the team below.
        </Notice>
      )}
      <ul className="m-0 p-0 list-none">
        {player.levels.map((row) => (
          <LevelRow key={row.level} player={player} row={row} teams={teams} onChanged={(next) => next && setPlayer(next)} />
        ))}
      </ul>
      <div className="grid gap-2">
        <p className="ui-field__label type-tag m-0">Squad entries</p>
        {player.entries.length === 0 ? <p className="type-body-s text-fg-muted m-0">Not entered in any competition.</p> : (
          <ul className="m-0 p-0 list-none grid gap-2">
            {player.entries.map((e) => (
              <li key={`${e.competition._id}-${e.team._id}`} className="grid gap-0.5">
                <span className="type-body-s">
                  <strong>{e.competition.name}</strong> · {levelLabel(e.competition.level)} · {e.team.name} · {e.gender} {e.ageGroup}
                  {e.competition.locked ? ' · finished' : ''}{e.isSubmitted ? ' · submitted' : ''}
                </span>
                {!e.heldAtLevel && <span className="type-caption text-fg-muted">Not this level&apos;s team for the player</span>}
                {e.ageIssue && <span className="ui-field__error type-caption">{e.ageIssue}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
};

const FindPlayer = ({ teams }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await superAdminAPI.playerTeams.search(q.trim());
      setResults(res.data?.data?.players || []);
      setPicked(null);
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={search}>
        <Field id={`${ID}-q`} label="Name, Player ID or email">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. aarav patil" />
        </Field>
        <Button type="submit" icon={Search} loading={busy} disabled={q.trim().length < 2}>Search</Button>
      </form>
      {results && results.length === 0 && <EmptyState tag="No players found">Try part of the name or the Player ID.</EmptyState>}
      {results && results.length > 0 && !picked && (
        <ul className="m-0 p-0 list-none grid gap-2">
          {results.map((p) => (
            <li key={p._id}>
              <button type="button" className="w-full text-left grid gap-1 p-3 rounded-lg border border-line hover:border-fg-muted" onClick={() => setPicked(p._id)}>
                <span className="type-body-s"><strong>{p.name}</strong> · <code>{p.loginId || p.email}</code></span>
                <span className="flex flex-wrap gap-1">
                  {p.levels.filter((l) => l.team).map((l) => <Tag key={l.level}>{l.label}: {l.team.name}</Tag>)}
                  {p.levels.every((l) => !l.team) && <span className="type-caption text-fg-muted">No team at any level yet</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <>
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setPicked(null)}>← Back to results</Button>
          <PlayerDetail playerId={picked} teams={teams} />
        </>
      )}
    </div>
  );
};

const Conflicts = () => {
  const [list, setList] = useState(null);
  const load = useCallback(() => {
    superAdminAPI.playerTeams.conflicts()
      .then((res) => setList(res.data?.data?.conflicts || []))
      .catch((error) => { setList([]); toast.error(errorOf(error, 'Could not load conflicts')); });
  }, []);
  useEffect(load, [load]);

  const keep = async (conflict, team) => {
    try {
      await superAdminAPI.playerTeams.resolveConflict(conflict._id, { teamId: team._id });
      toast.success(`${conflict.player.name}: ${team.name} for ${conflict.label}`);
      load();
    } catch (error) {
      toast.error(errorOf(error, 'Could not resolve it'));
    }
  };

  if (list === null) return <div className="py-8 flex justify-center"><Spinner label="Loading conflicts" /></div>;
  if (list.length === 0) return <EmptyState tag="No conflicts">Every player has at most one team at each level.</EmptyState>;
  return (
    <ul className="m-0 p-0 list-none grid gap-3">
      {list.map((c) => (
        <li key={c._id}>
          <Panel className="grid gap-2 p-4">
            <span className="type-body-s"><strong>{c.player.name}</strong> · <code>{c.player.loginId}</code> · {c.label}</span>
            <span className="type-caption text-fg-muted">Entered at {c.label} level by: {c.teams.map((t) => `${t.name} (${t.competitions})`).join(', ')}</span>
            <div className="flex flex-wrap gap-2">
              {c.teams.map((t) => <Button key={t._id} size="sm" variant="line" onClick={() => keep(c, t)}>Keep with {t.name}</Button>)}
            </div>
          </Panel>
        </li>
      ))}
    </ul>
  );
};

const History = () => {
  const [level, setLevel] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    superAdminAPI.playerTeams.history({ ...(level ? { level } : {}) })
      .then((res) => setData(res.data?.data))
      .catch((error) => { setData({ rows: [], total: 0 }); toast.error(errorOf(error, 'Could not load the history')); });
  }, [level]);

  return (
    <div className="grid gap-3">
      <Field id={`${ID}-level`} label="Level" className="max-w-xs">
        <Select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {COMPETITION_LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
        </Select>
      </Field>
      {data === null ? <div className="py-8 flex justify-center"><Spinner label="Loading the history" /></div>
        : data.rows.length === 0 ? <EmptyState tag="Nothing yet">No team changes on record.</EmptyState> : (
          <ul className="m-0 p-0 list-none grid gap-2">
            {data.rows.map((r) => (
              <li key={r._id} className="grid gap-0.5 py-2 border-b border-line">
                <span className="type-body-s">
                  <StatusTag status={r.action === 'PLAYER_TEAM_CORRECTED' ? 'warning' : 'info'}>{ACTION[r.action] || r.action}</StatusTag>{' '}
                  <strong>{r.player?.name || 'Player'}</strong>{r.level ? ` · ${levelLabel(r.level)}` : ''}
                  {r.from || r.to ? ` · ${r.from || '—'} → ${r.to || '—'}` : r.team ? ` · ${r.team}` : ''}
                </span>
                <span className="type-caption text-fg-muted">
                  {new Date(r.at).toLocaleString()} · by {r.by.type}{r.reason ? ` · “${r.reason}”` : ''}{r.namesake ? ` · namesake of ${r.namesake}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
};

/**
 * Super Admin → Player teams: a player's team at each competition level is
 * final; this is the one place it is corrected, with a reason, and where the
 * history of every change is read (docs/team-per-level-plan.md step 3).
 */
const SuperAdminPlayerTeams = () => {
  const [tab, setTab] = useState('find');
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    superAdminAPI.getAllTeams()
      .then((res) => {
        const list = res.data?.data?.teams ?? res.data?.data ?? [];
        setTeams((Array.isArray(list) ? list : []).filter((t) => t?._id && t?.name).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => setTeams([]));
  }, []);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Heading level={2} step="display-m">Player teams</Heading>
        <p className="type-body-s text-fg-muted m-0">A player&apos;s team is final at each level. Correct a mistake here — always with a reason.</p>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Player teams" idBase={ID} />
      <TabPanel idBase={ID} tabId={tab}>
        {tab === 'find' && <FindPlayer teams={teams} />}
        {tab === 'conflicts' && <Conflicts />}
        {tab === 'history' && <History />}
      </TabPanel>
    </div>
  );
};

export default SuperAdminPlayerTeams;
