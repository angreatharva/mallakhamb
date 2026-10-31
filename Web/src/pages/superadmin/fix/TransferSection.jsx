import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, Search } from 'lucide-react';
import { superAdminAPI } from '@/services/api';
import { COMPETITION_LEVELS, levelLabel } from '@/utils/competition/levels';
import { Button, Field, Input, Notice, Panel, Select, Spinner } from '@/components/ui';
import { ReasonDialog, errorOf } from '../SuperAdminHistory';

const ID = 'sa-transfer';

/**
 * Fix → Move a player: out of the old team's squads, into the new team's,
 * with the same age group and apparatus; their team at that level is
 * corrected and their scores follow them. One step, one reason.
 */
const TransferSection = () => {
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState(null);
  const [player, setPlayer] = useState(null);
  const [teams, setTeams] = useState([]);
  const [level, setLevel] = useState('district');
  const [toTeamId, setToTeamId] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [chosen, setChosen] = useState({});
  const [override, setOverride] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    superAdminAPI.fix.searchTeams('')
      .then((res) => setTeams((res.data?.data || []).filter((t) => t.isActive)))
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    setPreview(null);
    if (!player || !toTeamId || !level) return;
    setLoadingPreview(true);
    superAdminAPI.fix.previewTransfer({ playerId: player._id, toTeamId, level })
      .then((res) => {
        const data = res.data?.data;
        setPreview(data);
        setChosen(Object.fromEntries((data?.competitions || []).map((c) => [c._id, true])));
      })
      .catch((error) => toast.error(errorOf(error, 'Could not check this move')))
      .finally(() => setLoadingPreview(false));
  }, [player, toTeamId, level]);

  const findPlayer = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    try {
      const res = await superAdminAPI.fix.searchAccounts({ q: q.trim(), type: 'player' });
      setPlayers(res.data?.data || []);
    } catch (error) {
      toast.error(errorOf(error, 'Search failed'));
    }
  };

  const move = async (reason) => {
    try {
      const competitionIds = Object.entries(chosen).filter(([, on]) => on).map(([cid]) => cid);
      const res = await superAdminAPI.fix.transfer({ playerId: player._id, toTeamId, level, competitionIds, overrideLimit: override, reason });
      setDone(res.data?.data);
      setConfirming(false);
      toast.success('Player moved');
    } catch (error) {
      toast.error(errorOf(error, 'Could not move the player'));
    }
  };

  const reset = () => { setPlayer(null); setPlayers(null); setPreview(null); setToTeamId(''); setDone(null); setOverride(false); };
  const full = (preview?.competitions || []).filter((c) => chosen[c._id] && !c.targetHasRoom);

  if (done) {
    return (
      <Notice tone="success" title={`${done.player.name} moved to ${done.to}`}>
        <ul className="m-0 pl-4">
          {done.moved.map((m) => (
            <li key={m.competition} className="type-body-s">
              {m.name}{m.createdRegistration ? ' · entry created for the new team' : ''}{m.scoresMoved ? ` · ${m.scoresMoved} score row(s) moved` : ''}
            </li>
          ))}
          {done.moved.length === 0 && <li className="type-body-s">Team at this level corrected; no competition entries to move.</li>}
        </ul>
        <Button className="mt-2" size="sm" variant="line" onClick={reset}>Move another player</Button>
      </Notice>
    );
  }

  return (
    <div className="grid gap-4">
      {!player ? (
        <>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={findPlayer}>
            <Field id={`${ID}-q`} label="Player name, email or Player ID">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. riya mane" />
            </Field>
            <Button type="submit" icon={Search} disabled={q.trim().length < 2}>Find</Button>
          </form>
          {players && players.length === 0 && <p className="type-body-s text-fg-muted m-0">No player found.</p>}
          {players && players.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-2">
              {players.map((p) => (
                <li key={p._id}>
                  <button type="button" className="w-full text-left p-3 rounded-lg border border-line hover:border-fg-muted type-body-s" onClick={() => setPlayer(p)}>
                    <strong>{p.name}</strong> <code className="type-caption">{p.loginId || p.email}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Panel className="grid gap-4 p-5" data-testid="transfer-form">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-body-s">Moving <strong>{player.name}</strong> <code className="type-caption">{player.loginId || player.email}</code></span>
            <Button size="sm" variant="ghost" onClick={reset}>Choose another player</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${ID}-level`} label="Competition level">
              <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                {COMPETITION_LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
              </Select>
            </Field>
            <Field id={`${ID}-to`} label="Move to team">
              <Select value={toTeamId} onChange={(e) => setToTeamId(e.target.value)}>
                <option value="" disabled>Choose a team</option>
                {teams.map((t) => <option key={t._id} value={t._id}>{t.name} — {t.coach?.name || 'no coach'}</option>)}
              </Select>
            </Field>
          </div>

          {loadingPreview && <Spinner label="Checking the move" />}
          {preview && (
            <div className="grid gap-3">
              <p className="type-body-s m-0">
                {levelLabel(level)}: <strong>{preview.from?.name || 'no team yet'}</strong> <ArrowRight className="inline w-4 h-4" aria-hidden="true" /> <strong>{preview.to.name}</strong>
              </p>
              {preview.competitions.length === 0 ? (
                <p className="type-caption text-fg-muted m-0">No {levelLabel(level)} competition entries to move; only the team at this level changes.</p>
              ) : (
                <fieldset className="grid gap-1 m-0 p-0 border-0">
                  <legend className="ui-field__label type-tag mb-1">Entries that move</legend>
                  {preview.competitions.map((c) => (
                    <label key={c._id} className="flex flex-wrap items-center gap-2 type-body-s">
                      <input type="checkbox" checked={!!chosen[c._id]} onChange={(e) => setChosen({ ...chosen, [c._id]: e.target.checked })} />
                      <strong>{c.name}</strong> · {c.enteredFor.gender} {c.enteredFor.ageGroup}
                      {c.finished && <span className="text-fg-muted">· finished</span>}
                      {!c.targetEntered && <span className="text-fg-muted">· {preview.to.name} gets an entry here</span>}
                      {!c.targetHasRoom && <span className="ui-field__error type-caption">· squad full</span>}
                    </label>
                  ))}
                </fieldset>
              )}
              {full.length > 0 && (
                <label className="flex items-center gap-2 type-body-s">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  Allow a full squad ({full.map((c) => c.name).join(', ')})
                </label>
              )}
              <Button className="justify-self-start" disabled={full.length > 0 && !override} onClick={() => setConfirming(true)}>Move player</Button>
            </div>
          )}
        </Panel>
      )}

      <ReasonDialog open={confirming} title={`Move ${player?.name || ''} to ${preview?.to?.name || ''}?`} confirmText="Move" onClose={() => setConfirming(false)} onConfirm={move}>
        <p className="type-body-s m-0">Their scores in the chosen competitions move with them, and team rankings and finals are recalculated.</p>
      </ReasonDialog>
    </div>
  );
};

export default TransferSection;
