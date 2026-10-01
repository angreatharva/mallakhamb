import { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DATA_COLORS, FG, alpha } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
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
  <li className="flex items-center justify-between gap-3 text-xs py-1"
    style={{ color: dropped ? 'rgb(var(--ink) / 0.3)' : 'rgb(var(--ink) / 0.75)' }}>
    <span className={`min-w-0 truncate ${dropped ? 'line-through' : ''}`}>{performance.playerName || 'Unknown athlete'}</span>
    <span className={`font-mono flex-shrink-0 ${dropped ? 'line-through' : ''}`}>{fmt(performance.finalScore)}</span>
  </li>
);

const TeamCard = ({ team }) => {
  const [open, setOpen] = useState(team.rank <= 3);
  const reduced = useReducedMotion();
  const rankAccent = team.rank === 1 ? DATA_COLORS.gold : team.rank === 2 ? DATA_COLORS.silver : team.rank === 3 ? DATA_COLORS.bronze : null;
  const panelId = `team-breakdown-${team.teamId}`;

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{
        background: rankAccent ? `${alpha(rankAccent, 0x0A)}` : 'rgb(var(--ink) / 0.02)',
        borderColor: rankAccent ? `${alpha(rankAccent, 0x40)}` : 'rgb(var(--ink) / 0.07)',
      }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-controls={panelId}
        className="w-full flex items-center gap-4 p-4 text-left min-h-[44px] hover:bg-ink/[0.02] transition-colors">
        <RankBadge rank={team.rank} />
        <div className="flex-1 min-w-0">
          <p className="text-ink font-bold truncate">{team.teamName || 'Unknown Team'}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
            {team.teamSize}-player team · best {team.countedPerApparatus} per apparatus
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-black" style={{ color: rankAccent || FG.brand }}>{fmt(team.totalScore)}</p>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Team total</p>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'rgb(var(--ink) / 0.4)' }} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            className="overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-4 pb-4">
              {(team.apparatus || []).map((app) => (
                <div key={app.apparatus} className="rounded-xl border p-3"
                  style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: FG.brandSoft }}>
                      {shortApparatus(app.apparatus)}
                    </span>
                    <span className="text-xs font-bold font-mono text-ink">{fmt(app.subtotal)}</span>
                  </div>
                  <ul>
                    {app.counted.map((p, i) => <ScoreLine key={`c-${p.playerId || i}`} performance={p} />)}
                    {app.dropped.map((p, i) => <ScoreLine key={`d-${p.playerId || i}`} performance={p} dropped />)}
                  </ul>
                  {app.dropped.length > 0 && (
                    <p className="text-[10px] mt-1" style={{ color: 'var(--fg-muted)' }}>
                      Struck-through scores do not count
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TeamChampionshipBoard = ({ teams = [] }) => {
  if (!teams.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users className="w-3.5 h-3.5" style={{ color: 'rgb(var(--ink) / 0.35)' }} aria-hidden="true" />
        <span className="text-xs font-bold" style={{ color: 'var(--fg-muted)' }}>
          {teams.length} {teams.length === 1 ? 'team' : 'teams'} ranked
        </span>
      </div>
      {teams.map((team) => <TeamCard key={team.teamId} team={team} />)}
    </div>
  );
};

export default TeamChampionshipBoard;
