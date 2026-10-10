import { useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { publicAPI } from '@/services/index.js';
import { averageSlipBreakdown, describeSlipAverage } from '@/utils/scoring/copRules';
import { EmptyState, ErrorState, Heading, Panel, Tag, TextLink } from '@/components/ui';
import { RankBadge, SkeletonRow } from '@/components/scores/PlayerRankingBoard';

// ─── Design constants ─────────────────────────────────────────────────────────
const COMP_TYPE_LABELS = {
  competition_1: 'Competition I',
  competition_2: 'Competition II',
  competition_3: 'Competition III',
};

const COMP_TYPE_SUBLABELS = {
  competition_1: 'Team Championship & Qualifier',
  competition_2: 'All Round Individual Final',
  competition_3: 'Apparatus Championship',
};

// ─── Score part (the results board's anatomy) ─────────────────────────────────
const ScorePart = ({ label, value, tone }) => (
  <div className="sb-part" data-tone={tone}>
    <span className="sb-part__value">{typeof value === 'number' ? value.toFixed(2) : (value ?? '—')}</span>
    <span className="sb-part__label type-tag">{label}</span>
  </div>
);

// ─── Score breakdown parser ───────────────────────────────────────────────────
// The panel rule decides which slips count (all three on a 3-judge panel; the
// middle two evaluation slips on a 4/5-judge one) — see averageSlipBreakdown.
const parseBreakdown = (player) => {
  const fromSlips = averageSlipBreakdown(player.judgeSlips, player.panelSize);
  if (fromSlips) return fromSlips;
  const sb = player.scoreBreakdown || {};
  return {
    difficulty:  Number(sb.difficulty?.total) || 0,
    combination: Number(sb.combination?.total) || 0,
    execution:   Number(sb.execution) || 0,
    bonus:       Number(sb.originality) || 0,
  };
};

// ─── Player Score Row ─────────────────────────────────────────────────────────
const PlayerScoreRow = ({ player, rank, highlightPlayerId, apparatus }) => {
  const [expanded, setExpanded] = useState(false);
  const isHighlighted = highlightPlayerId && String(player.playerId) === String(highlightPlayerId);
  const breakdown = parseBreakdown(player);

  return (
    <article
      className="sb-card ui-fade-in"
      data-place={rank >= 1 && rank <= 3 ? rank : undefined}
      data-podium={isHighlighted || undefined}
    >
      <button
        type="button"
        className="sb-team__toggle"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <RankBadge rank={rank} compact />
        <div className="flex-1 min-w-0 grid gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="sb-card__name truncate">{player.playerName}</p>
            {isHighlighted && <Tag tone="accent">You</Tag>}
            {!player.isFinalized && <Tag>Pending</Tag>}
          </div>
          <p className="sb-card__meta">
            {player.teamName || ''}
            {apparatus ? ` · ${apparatus}` : ''}
          </p>
        </div>
        <div className="sb-card__total">
          <p className="sb-card__score type-num-m">
            {player.isFinalized ? Number(player.finalScore || 0).toFixed(2) : '—'}
          </p>
          <p className="sb-card__score-label type-tag">Score</p>
        </div>
        <ChevronDown className="sb-team__chevron" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="sb-card__breakdown ui-fade-in">
          <p className="sb-card__breakdown-title type-tag">Score Breakdown (Average)</p>
          <div className="sb-parts">
            <ScorePart label="Difficulty" value={breakdown.difficulty} tone="blue" />
            <ScorePart label="Combination" value={breakdown.combination} tone="purple" />
            <ScorePart label="Execution" value={breakdown.execution} tone="accent" />
            <ScorePart label="Originality" value={breakdown.bonus} tone="green" />
          </div>
          {breakdown.used > 0 && <p className="sb-card__note">{describeSlipAverage(breakdown)}</p>}
        </div>
      )}
    </article>
  );
};

// ─── Apparatus Section ────────────────────────────────────────────────────────
const ApparatusSection = ({ apparatus, players, highlightPlayerId, selfOnly = false }) => {
  const sorted = [...players].sort((a, b) => Number(b.finalScore || 0) - Number(a.finalScore || 0));

  const rankedPlayers = sorted.map((player, idx) => ({ ...player, rank: idx + 1 }));

  const displayPlayers = selfOnly && highlightPlayerId
    ? rankedPlayers.filter(p => String(p.playerId) === String(highlightPlayerId))
    : rankedPlayers;

  if (displayPlayers.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="sb-app__name">{apparatus}</span>
        <span className="type-caption text-fg-muted">
          {selfOnly
            ? `Rank #${displayPlayers[0]?.rank} out of ${sorted.length} competitors`
            : `${sorted.filter(p => p.isFinalized).length} / ${sorted.length} finalized`}
        </span>
      </div>
      <div className="space-y-2">
        {displayPlayers.map((player, idx) => (
          <PlayerScoreRow
            key={`${player.playerId}-${idx}`}
            player={player}
            rank={player.rank}
            apparatus={null}
            highlightPlayerId={highlightPlayerId}
          />
        ))}
      </div>
    </div>
  );
};

// ─── PerformancePanel ─────────────────────────────────────────────────────────
/**
 * Props:
 *  - competitionId       string  — ID of current competition
 *  - competitionTypes    string[] — e.g. ["competition_1", "competition_2"]
 *  - apparatusConfig     object  — { competition_1: ["Pole Mallakhamb", ...], ... }
 *  - teamId              string  — filters results to one team (coach view), required
 *  - highlightPlayerId   string? — player ID to highlight (player's own view)
 *  - selfOnly            boolean — if true, shows only highlightPlayerId's scores
 *  - gender              string? — optional gender filter passed to API
 *  - ageGroup            string? — optional ageGroup filter passed to API
 *  - title               string  — section heading
 *  - emptyLabel          string  — empty state message
 */
const PerformancePanel = ({
  competitionId,
  competitionTypes = [],
  apparatusConfig = {},
  teamId,
  highlightPlayerId,
  selfOnly = false,
  gender,
  ageGroup,
  title = 'Performance',
  emptyLabel = 'No finalized scores yet for this competition.',
}) => {
  const [activeTab, setActiveTab] = useState(null);
  const [scoresByApparatus, setScoresByApparatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Set initial active tab when competitionTypes change
  useEffect(() => {
    if (competitionTypes.length > 0) {
      setActiveTab(prev => (prev && competitionTypes.includes(prev) ? prev : competitionTypes[0]));
    }
  }, [competitionTypes]);

  const fetchScoresForTab = useCallback(async (compType) => {
    if (!competitionId || !teamId || !compType) return;
    const apparatuses = (apparatusConfig[compType] || []);
    if (apparatuses.length === 0) {
      setScoresByApparatus({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch for each apparatus in parallel
      const results = await Promise.allSettled(
        apparatuses.map(app =>
          publicAPI.getScores({
            competitionId,
            teamId,
            competitionType: compType,
            apparatus: app,
            ...(gender ? { gender } : {}),
            ...(ageGroup ? { ageGroup } : {}),
          }).then(res => ({ apparatus: app, data: res.data?.data || res.data?.scores || [] }))
        )
      );

      const merged = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { apparatus, data } = result.value;
          const players = [];
          for (const entry of data) {
            for (const ps of (entry.playerScores || [])) {
              players.push({ ...ps, teamName: ps.teamName || entry.teamName });
            }
          }
          if (players.length > 0) {
            merged[apparatus] = players;
          }
        }
      }
      setScoresByApparatus(merged);
    } catch (err) {
      setError('Failed to load scores.');
    } finally {
      setLoading(false);
    }
  }, [competitionId, teamId, apparatusConfig, gender, ageGroup]);

  useEffect(() => {
    if (activeTab) {
      fetchScoresForTab(activeTab);
    }
  }, [activeTab, fetchScoresForTab]);

  // Also re-fetch when competitionId or teamId changes
  useEffect(() => {
    if (activeTab && competitionId && teamId) {
      fetchScoresForTab(activeTab);
    }
  }, [competitionId, teamId]);

  if (!competitionId || competitionTypes.length === 0) return null;

  const hasScores = Object.entries(scoresByApparatus).some(([apparatus, players]) => {
    if (selfOnly && highlightPlayerId) {
      return players.some(p => String(p.playerId) === String(highlightPlayerId));
    }
    return players.length > 0;
  });

  return (
    <Panel flush className="overflow-hidden ui-fade-in">
      {/* Header */}
      <div className="px-[clamp(16px,2.4vw,28px)] pt-6 pb-4 border-b border-line">
        <div className="grid gap-1 mb-4">
          <Heading level={2} step="display-s">{title}</Heading>
          <p className="type-caption text-fg-muted m-0">Live scores · updates as judges submit</p>
        </div>

        {/* Competition types: a pressed-button strip, as before */}
        <div className="flex gap-2 flex-wrap">
          {competitionTypes.map(ct => {
            const isActive = activeTab === ct;
            return (
              <button
                key={ct}
                type="button"
                onClick={() => setActiveTab(ct)}
                aria-pressed={isActive}
                className="perf-tab"
              >
                <span className="perf-tab__label">{COMP_TYPE_LABELS[ct] || ct}</span>
                <span className="perf-tab__sub hidden sm:block">{COMP_TYPE_SUBLABELS[ct] || ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="p-[clamp(16px,2.4vw,28px)]">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : error ? (
          <ErrorState
            tag="Could not load"
            action={<TextLink as="button" type="button" onClick={() => fetchScoresForTab(activeTab)}>Try again</TextLink>}
          >
            {error}
          </ErrorState>
        ) : !hasScores ? (
          <EmptyState tag={emptyLabel}>
            Scores appear here once judges finalize results.
          </EmptyState>
        ) : (
          <div key={activeTab} className="ui-fade-in">
            {Object.entries(scoresByApparatus).map(([apparatus, players]) => (
              <ApparatusSection
                key={apparatus}
                apparatus={apparatus}
                players={players}
                highlightPlayerId={highlightPlayerId}
                selfOnly={selfOnly}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
};

export default PerformancePanel;
