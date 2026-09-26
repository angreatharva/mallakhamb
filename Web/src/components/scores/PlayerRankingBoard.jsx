import { useRef } from 'react';
import { Users } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { sortByRank } from './scoreRows';
import { averageSlipBreakdown, describeSlipAverage } from '@/utils/scoring/copRules';

/**
 * The results board.
 *
 * Rendered identically by the public scores page and by the admin and
 * superadmin scores pages — the three differ in which rows they are allowed to
 * fetch, never in how a row looks or where it places.
 *
 * Placings come from the server (`rank`, `tieBreakInfo`). They are not
 * recomputed here: the panel-size tie-break rules live in
 * `Server/src/utils/scoring/tie-breaker.util.js`, and a second copy in the
 * browser is exactly the drift the README warns about for the COP rules.
 */

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

/** How a tie was settled, in words a results desk can read. */
const TIE_BREAK_LABELS = {
  faster_time: 'Placed on the faster time',
  senior_judge_score: 'Placed on the senior judge score',
  panel_average: 'Placed on the panel average',
  identical_time: 'Tied — identical time',
  identical_panel_average: 'Tied — identical panel average',
  time_unavailable: 'Tied — no time recorded',
  panel_scores_unavailable: 'Tied — panel scores unavailable',
};

export const RankBadge = ({ rank, size = 'w-9 h-9', textSize = 'text-sm' }) => {
  const colors = {
    1: { bg: 'rgba(245,166,35,0.2)', border: 'rgba(245,166,35,0.5)', text: '#F5A623' },
    2: { bg: 'rgba(192,192,192,0.15)', border: 'rgba(192,192,192,0.4)', text: '#C0C0C0' },
    3: { bg: 'rgba(205,127,50,0.15)', border: 'rgba(205,127,50,0.4)', text: '#CD7F32' },
  };
  const c = colors[rank];
  if (c) {
    return (
      <div className={`${size} rounded-full flex items-center justify-center border ${textSize} font-black flex-shrink-0`}
        style={{ background: c.bg, borderColor: c.border, color: c.text }}>
        {rank}
      </div>
    );
  }
  return (
    <div className={`${size} rounded-full flex items-center justify-center ${textSize} font-bold flex-shrink-0`}
      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
      {rank}
    </div>
  );
};

const ScorePill = ({ label, value, accent = COLORS.saffron }) => (
  <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl"
    style={{ background: `${accent}0E`, border: `1px solid ${accent}20` }}>
    <span className="text-xs font-bold" style={{ color: accent }}>{value}</span>
    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
  </div>
);

export const SkeletonRow = () => (
  <div className="flex items-center gap-4 p-4 rounded-2xl border animate-pulse"
    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
    <div className="w-9 h-9 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 rounded-full w-1/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-2 rounded-full w-1/4" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    <div className="h-8 w-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
  </div>
);

const toFixed = (value, digits = 2) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : (0).toFixed(digits));

/**
 * Single container: rank + name + team/coach + the full score breakdown.
 * Used for both the podium (rank 1-3, highlighted) and the list below it.
 */
const PlayerCard = ({ player, rank, index, podium = false, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const reduced = useReducedMotion();

  const rankAccent = rank === 1 ? '#F5A623' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : null;

  /*
   * The same breakdown at every panel size, averaged over the slips the panel
   * rule counts: all three on a 3-judge panel, the middle two evaluation slips
   * on a 4/5-judge one (see averageSlipBreakdown). Rows without stored slips
   * fall back to the row's own breakdown.
   */
  const fromSlips = averageSlipBreakdown(player.judgeSlips, player.panelSize);
  const sb = player.scoreBreakdown || {};
  const avgBreakdown = fromSlips || {
    difficulty: Number(sb.difficulty?.total) || 0,
    combination: Number(sb.combination?.total) || 0,
    execution: Number(sb.execution) || 0,
    bonus: Number(sb.originality) || 0,
  };
  const tieBreak = player.tieBreakInfo;
  const tieLabel = tieBreak ? TIE_BREAK_LABELS[tieBreak.method] : null;

  return (
    <motion.div
      ref={ref}
      className={`rounded-2xl border overflow-hidden ${className}`}
      style={{
        background: rank <= 3
          ? `linear-gradient(135deg, ${rank === 1 ? 'rgba(245,166,35,0.1)' : rank === 2 ? 'rgba(192,192,192,0.08)' : 'rgba(205,127,50,0.08)'}, rgba(255,255,255,0.02))`
          : 'rgba(255,255,255,0.02)',
        borderColor: rank === 1 ? 'rgba(245,166,35,0.35)' : rank === 2 ? 'rgba(192,192,192,0.25)' : rank === 3 ? 'rgba(205,127,50,0.25)' : 'rgba(255,255,255,0.06)',
        boxShadow: podium ? `0 8px 28px ${rankAccent}22` : 'none',
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.04, ease: EASE_OUT }}>

      {/* Header row: rank, name, team/coach, final score */}
      <div className="flex items-center gap-4 p-4">
        <RankBadge rank={rank} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-bold text-sm leading-tight">{player.playerName}</p>
            {tieBreak?.unresolved && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'rgba(245,166,35,0.15)', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' }}>
                Tied
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {/* Team is shown as a chip — the board mixes every team, so it must read at a glance */}
            {player.teamName && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                <Users className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {player.teamName}
              </span>
            )}
            {player.coach && (
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Coach: {player.coach}</span>
            )}
          </div>
          {player.time && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Time: {player.time}</p>
          )}
          {/* Why this athlete placed where they did, when a tie decided it */}
          {tieLabel && (
            <p className="text-xs mt-0.5" style={{ color: '#F5A623' }}>{tieLabel}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-black" style={{ color: COLORS.saffron }}>{toFixed(player.finalScore)}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Final</p>
        </div>
      </div>

      {/* Score breakdown — inside the SAME card */}
      <div className="px-4 pb-4 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2"
          style={{ color: 'rgba(255,255,255,0.35)' }}>Score Breakdown (Average)</p>
        <div className="flex flex-wrap gap-2">
          <ScorePill label="Difficulty" value={toFixed(avgBreakdown.difficulty)} accent="#3B82F6" />
          <ScorePill label="Combination" value={toFixed(avgBreakdown.combination)} accent="#A855F7" />
          <ScorePill label="Execution" value={toFixed(avgBreakdown.execution)} accent={COLORS.saffron} />
          <ScorePill label="Originality" value={toFixed(avgBreakdown.bonus)} accent="#22C55E" />
          {player.deduction > 0 && <ScorePill label="Deduct" value={`-${player.deduction}`} accent="#EF4444" />}
          {player.otherDeduction > 0 && <ScorePill label="Other" value={`-${player.otherDeduction}`} accent="#EF4444" />}
          {player.baseScoreApplied && (
            <span className="text-xs px-2 py-1 rounded-xl font-bold self-center"
              style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.25)' }}>
              Base Score
            </span>
          )}
        </div>
        {fromSlips && (
          <p className="text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {describeSlipAverage(fromSlips)}
          </p>
        )}
      </div>
    </motion.div>
  );
};

/**
 * Pools every athlete in the category into one standing. The top three render
 * as a podium (2nd left, 1st elevated centre, 3rd right) using the SAME card as
 * the list below, just placed differently.
 *
 * @param {Array<Object>} players - rows carrying a server-assigned `rank`
 */
const PlayerRankingBoard = ({ players }) => {
  const sorted = sortByRank(players);

  // The displayed number is the competition placing, so it survives searching
  // and never renumbers itself. Two athletes the tie-break could not separate
  // legitimately show the same number.
  const placeOf = (player, index) => (Number.isFinite(player.rank) ? player.rank : index + 1);

  const topPlayers = sorted.slice(0, 3);
  const remainingPlayers = sorted.slice(3);

  const [first, second, third] = topPlayers;

  return (
    <div className="space-y-6">
      {/* Podium: 2nd (left) - 1st (center, elevated) - 3rd (right) */}
      {topPlayers.length > 0 && (
        <div className="flex items-start justify-center gap-3 sm:gap-4">
          <div className="flex-1 max-w-xs mt-8 sm:mt-10">
            {second && <PlayerCard player={second} rank={placeOf(second, 1)} index={1} podium />}
          </div>

          {/* First place - center, no top margin so it sits highest */}
          <div className="flex-1 max-w-xs">
            {first && (
              <PlayerCard player={first} rank={placeOf(first, 0)} index={0} podium
                className="scale-105 sm:scale-110 origin-top" />
            )}
          </div>

          <div className="flex-1 max-w-xs mt-8 sm:mt-10">
            {third && <PlayerCard player={third} rank={placeOf(third, 2)} index={2} podium />}
          </div>
        </div>
      )}

      {remainingPlayers.length > 0 && (
        <div className="space-y-3">
          {remainingPlayers.map((player, i) => {
            const index = i + 3;
            return (
              <PlayerCard
                key={player.uid || `${player.playerId}-${index}`}
                player={player}
                rank={placeOf(player, index)}
                index={index}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlayerRankingBoard;
