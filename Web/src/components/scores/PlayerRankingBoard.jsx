import PropTypes from 'prop-types';
import { Users } from 'lucide-react';
import { StatusTag, Tag } from '@/components/ui';
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

/**
 * The placing, in the display face. 1–3 take the medal colours (data tokens,
 * text-safe in both appearances); the rest are quiet. `compact` is the
 * smaller size the team board uses.
 */
export const RankBadge = ({ rank, compact = false }) => (
  <span
    className={`sb-rank ${compact ? 'type-num-m' : 'type-num-l'}`}
    data-place={rank >= 1 && rank <= 3 ? rank : undefined}
    aria-label={`Place ${rank}`}
  >
    {rank}
  </span>
);
RankBadge.propTypes = { rank: PropTypes.number.isRequired, compact: PropTypes.bool };

/** One part of the breakdown: the value, then its label (a tag), on a 3px data-colour rule. */
const ScorePart = ({ label, value, tone }) => (
  <div className="sb-part" data-tone={tone}>
    <span className="sb-part__value">{value}</span>
    <span className="sb-part__label type-tag">{label}</span>
  </div>
);
ScorePart.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, tone: PropTypes.string.isRequired };

/** A placeholder card while the board loads. */
export const SkeletonRow = () => (
  <div className="sb-card sb-card--skeleton" aria-hidden="true">
    <div className="sb-card__head">
      <span className="ui-skeleton w-9 h-9" />
      <div className="flex-1 grid gap-2">
        <span className="ui-skeleton w-1/3 h-3" />
        <span className="ui-skeleton w-1/4 h-2" />
      </div>
      <span className="ui-skeleton w-16 h-8" />
    </div>
  </div>
);

const toFixed = (value, digits = 2) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : (0).toFixed(digits));

/**
 * Single container: rank + name + team/coach + the full score breakdown.
 * Used for both the podium (rank 1-3, highlighted) and the list below it.
 */
const PlayerCard = ({ player, rank, podium = false, className = '' }) => {
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
    <article
      className={`sb-card ui-fade-in ${className}`}
      data-place={rank >= 1 && rank <= 3 ? rank : undefined}
      data-podium={podium || undefined}
    >
      {/* Header row: rank, name, team/coach, final score */}
      <div className="sb-card__head">
        <RankBadge rank={rank} />
        <div className="sb-card__who">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="sb-card__name">{player.playerName}</p>
            {tieBreak?.unresolved && <StatusTag status="warning">Tied</StatusTag>}
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
            {/* The team, marked — the board mixes every team, so it must read at a glance.
                Its own case: a stored name is never set in capitals (plan §8.10). */}
            {player.teamName && (
              <span className="sb-card__team">
                <Users className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                {player.teamName}
              </span>
            )}
            {player.coach && <span className="sb-card__meta">Coach: {player.coach}</span>}
          </div>
          {player.time && <p className="sb-card__meta">Time: {player.time}</p>}
          {/* Why this athlete placed where they did, when a tie decided it */}
          {tieLabel && <p className="sb-card__tie">{tieLabel}</p>}
        </div>
        <div className="sb-card__total">
          <p className="sb-card__score type-num-l">{toFixed(player.finalScore)}</p>
          <p className="sb-card__score-label type-tag">Final</p>
        </div>
      </div>

      {/* Score breakdown — inside the SAME card */}
      <div className="sb-card__breakdown">
        <p className="sb-card__breakdown-title type-tag">Score Breakdown (Average)</p>
        <div className="sb-parts">
          <ScorePart label="Difficulty" value={toFixed(avgBreakdown.difficulty)} tone="difficulty" />
          <ScorePart label="Combination" value={toFixed(avgBreakdown.combination)} tone="combination" />
          <ScorePart label="Execution" value={toFixed(avgBreakdown.execution)} tone="execution" />
          <ScorePart label="Originality" value={toFixed(avgBreakdown.bonus)} tone="originality" />
          {player.deduction > 0 && <ScorePart label="Deduct" value={`-${player.deduction}`} tone="deduct" />}
          {player.otherDeduction > 0 && <ScorePart label="Other" value={`-${player.otherDeduction}`} tone="deduct" />}
          {player.baseScoreApplied && <Tag className="sb-card__base self-center">Base Score</Tag>}
        </div>
        {fromSlips && <p className="sb-card__note">{describeSlipAverage(fromSlips)}</p>}
      </div>
    </article>
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
    <div className="sb-board space-y-6">
      {/*
        Podium: 2nd (left) - 1st (center, elevated) - 3rd (right). Three cards side by side need ~500px, so a
        phone stacks them in placing order instead. The markup is in placing order too (screen readers and the
        keyboard meet 1st first); `sm:order-*` draws the podium.
      */}
      {topPlayers.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-center sm:gap-4">
          {/* First place - center, no top margin so it sits highest */}
          <div className="sm:order-2 sm:flex-1 sm:max-w-xs">
            {first && (
              <PlayerCard player={first} rank={placeOf(first, 0)} podium />
            )}
          </div>

          <div className="sm:order-1 sm:flex-1 sm:max-w-xs sm:mt-10">
            {second && <PlayerCard player={second} rank={placeOf(second, 1)} podium />}
          </div>

          <div className="sm:order-3 sm:flex-1 sm:max-w-xs sm:mt-10">
            {third && <PlayerCard player={third} rank={placeOf(third, 2)} podium />}
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlayerRankingBoard;
