import { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Users } from 'lucide-react';
import { RankBadge } from './PlayerRankingBoard';

/**
 * The Team Championship standing: one card per team, best first.
 *
 * Everything on it comes from `GET /api/public/team-championship` — the rank,
 * the total, and which scores counted. Nothing is summed or re-ranked here; the
 * rule (best 3 of a 4-player team, best 5 of a 6-player team, per apparatus)
 * lives in Server/src/utils/scoring/team-championship.util.js.
 */

const fmt = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '0.000');

const shortApparatus = (name) => String(name || '').replace(' Mallakhamb', '');

const ScoreLine = ({ performance, dropped = false }) => (
  <li className={`sb-line ${dropped ? 'sb-line--dropped' : ''}`}>
    <span className="min-w-0 truncate">{performance.playerName || 'Unknown athlete'}</span>
    <span className="sb-line__score">{fmt(performance.finalScore)}</span>
  </li>
);
ScoreLine.propTypes = { performance: PropTypes.object.isRequired, dropped: PropTypes.bool };

const TeamCard = ({ team }) => {
  const [open, setOpen] = useState(team.rank <= 3);
  const panelId = `team-breakdown-${team.teamId}`;

  return (
    <article className="sb-card" data-place={team.rank >= 1 && team.rank <= 3 ? team.rank : undefined}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-controls={panelId}
        className="sb-team__toggle">
        <RankBadge rank={team.rank} compact />
        <div className="flex-1 min-w-0 grid gap-1">
          <p className="sb-card__name">{team.teamName || 'Unknown Team'}</p>
          <p className="sb-card__meta">
            {team.teamSize}-player team · best {team.countedPerApparatus} per apparatus
          </p>
        </div>
        <div className="sb-card__total">
          <p className="sb-card__score type-num-m">{fmt(team.totalScore)}</p>
          <p className="sb-card__score-label type-tag">Team total</p>
        </div>
        <ChevronDown className="sb-team__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="sb-team__body ui-fade-in">
          {(team.apparatus || []).map((app) => (
            <div key={app.apparatus} className="sb-app">
              <div className="sb-app__head">
                <span className="sb-app__name">{shortApparatus(app.apparatus)}</span>
                <span className="sb-app__sub">{fmt(app.subtotal)}</span>
              </div>
              <ul className="sb-app__list">
                {app.counted.map((p, i) => <ScoreLine key={`c-${p.playerId || i}`} performance={p} />)}
                {app.dropped.map((p, i) => <ScoreLine key={`d-${p.playerId || i}`} performance={p} dropped />)}
              </ul>
              {app.dropped.length > 0 && (
                <p className="sb-app__note">Struck-through scores do not count</p>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
};
TeamCard.propTypes = { team: PropTypes.object.isRequired };

const TeamChampionshipBoard = ({ teams = [] }) => {
  if (!teams.length) return null;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 px-1 m-0 type-tag text-fg-muted">
        <Users className="w-3.5 h-3.5" aria-hidden="true" />
        {teams.length} {teams.length === 1 ? 'team' : 'teams'} ranked
      </p>
      {teams.map((team) => <TeamCard key={team.teamId} team={team} />)}
    </div>
  );
};
TeamChampionshipBoard.propTypes = { teams: PropTypes.array };

export default TeamChampionshipBoard;
