import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { publicAPI } from '@/services/index.js';
import { COLORS, DATA_COLORS, alpha } from '@/styles/tokens';
import { FadeIn } from '@/components/design-system';
import { useReducedMotion } from '@/hooks/useResponsive';
import { averageSlipBreakdown, describeSlipAverage } from '@/utils/scoring/copRules';

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

const RANK_COLORS = {
  1: { bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', text: DATA_COLORS.gold, glow: 'rgba(245,166,35,0.2)' },
  2: { bg: 'rgba(192,192,192,0.10)', border: 'rgba(192,192,192,0.35)', text: DATA_COLORS.silver, glow: 'rgba(192,192,192,0.1)' },
  3: { bg: 'rgba(205,127,50,0.12)', border: 'rgba(205,127,50,0.35)', text: DATA_COLORS.bronze, glow: 'rgba(205,127,50,0.1)' },
};

// ─── Rank Badge ───────────────────────────────────────────────────────────────
const RankBadge = ({ rank }) => {
  const c = RANK_COLORS[rank];
  if (c) {
    return (
      <div className="w-9 h-9 rounded-full flex items-center justify-center border text-sm font-black flex-shrink-0"
        style={{ background: c.bg, borderColor: c.border, color: c.text }}>
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: 'rgb(var(--ink) / 0.05)', color: 'var(--fg-muted)' }}>
      {rank}
    </div>
  );
};

// ─── Score Pill ───────────────────────────────────────────────────────────────
const ScorePill = ({ label, value, accent }) => (
  <div className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl"
    style={{ background: `${alpha(accent, 0x12)}`, border: `1px solid ${alpha(accent, 0x25)}` }}>
    <span className="text-xs font-bold tabular-nums" style={{ color: accent }}>
      {typeof value === 'number' ? value.toFixed(2) : (value ?? '—')}
    </span>
    <span className="text-[10px] leading-tight" style={{ color: 'var(--fg-muted)' }}>{label}</span>
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

// ─── Skeleton row ─────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="flex items-center gap-4 p-4 rounded-2xl border animate-pulse"
    style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.05)' }}>
    <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--ink) / 0.06)' }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 rounded-full w-1/3" style={{ background: 'rgb(var(--ink) / 0.06)' }} />
      <div className="h-2 rounded-full w-1/4" style={{ background: 'rgb(var(--ink) / 0.04)' }} />
    </div>
    <div className="h-8 w-16 rounded-xl" style={{ background: 'rgb(var(--ink) / 0.06)' }} />
  </div>
);

// ─── Player Score Row ─────────────────────────────────────────────────────────
const PlayerScoreRow = ({ player, rank, highlightPlayerId, index, apparatus }) => {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  const isHighlighted = highlightPlayerId && String(player.playerId) === String(highlightPlayerId);
  const rc = RANK_COLORS[rank];
  const breakdown = parseBreakdown(player);

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="rounded-2xl border overflow-hidden"
      style={{
        background: isHighlighted
          ? `linear-gradient(135deg, ${alpha(COLORS.saffron, 0x12)}, rgb(var(--ink) / 0.02))`
          : rc
          ? `linear-gradient(135deg, ${rc.bg}, rgb(var(--ink) / 0.01))`
          : 'rgb(var(--ink) / 0.02)',
        borderColor: isHighlighted
          ? `${alpha(COLORS.saffron, 0x40)}`
          : rc
          ? rc.border
          : 'rgb(var(--ink) / 0.07)',
        boxShadow: rc ? `0 0 20px ${rc.glow}` : 'none',
      }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3.5 text-left"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <RankBadge rank={rank} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-bold text-sm truncate">{player.playerName}</p>
            {isHighlighted && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: `${alpha(COLORS.saffron, 0x20)}`, color: 'rgb(var(--brand-fg-soft))' }}>You</span>
            )}
            {!player.isFinalized && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgb(var(--ink) / 0.06)', color: 'var(--fg-muted)' }}>Pending</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
            {player.teamName || ''}
            {apparatus ? ` · ${apparatus}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-lg font-black tabular-nums"
              style={{ color: isHighlighted ? 'rgb(var(--brand-fg))' : rc ? rc.text : 'rgb(var(--ink))' }}>
              {player.isFinalized ? Number(player.finalScore || 0).toFixed(2) : '—'}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>score</p>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--ink) / 0.3)' }} />
            : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--ink) / 0.3)' }} />
          }
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'rgb(var(--ink) / 0.06)' }}>
              <p className="text-[10px] font-bold tracking-widest uppercase mt-3 mb-2"
                style={{ color: 'var(--fg-muted)' }}>Score Breakdown (Average)</p>
              <div className="flex flex-wrap gap-2">
                <ScorePill label="Difficulty" value={breakdown.difficulty} accent={DATA_COLORS.blue} />
                <ScorePill label="Combination" value={breakdown.combination} accent={DATA_COLORS.purple} />
                <ScorePill label="Execution" value={breakdown.execution} accent={'rgb(var(--brand-fg))'} />
                <ScorePill label="Originality" value={breakdown.bonus} accent={DATA_COLORS.green} />
              </div>
              {breakdown.used > 0 && (
                <p className="text-[10px] mt-2" style={{ color: 'var(--fg-muted)' }}>
                  {describeSlipAverage(breakdown)}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-full"
          style={{ background: 'rgb(var(--ink) / 0.06)', color: 'var(--fg-muted)', border: '1px solid rgb(var(--ink) / 0.1)' }}>
          {apparatus}
        </span>
        <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
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
            index={idx}
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
  const reduced = useReducedMotion();

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
    <FadeIn delay={0.05}>
      <div className="rounded-3xl border overflow-hidden"
        style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: COLORS.darkBorderSubtle }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `1px solid ${alpha(COLORS.saffron, 0x28)}` }}>
              <TrendingUp className="w-5 h-5" style={{ color: 'rgb(var(--brand-fg))' }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">{title}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>
                Live scores · updates as judges submit
              </p>
            </div>
          </div>

          {/* Tab strip */}
          <div className="flex gap-2 flex-wrap">
            {competitionTypes.map(ct => {
              const isActive = activeTab === ct;
              return (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setActiveTab(ct)}
                  className="flex flex-col items-start px-4 py-2.5 rounded-xl border transition-all duration-200 min-h-[44px]"
                  style={{
                    background: isActive ? `${alpha(COLORS.saffron, 0x15)}` : 'rgb(var(--ink) / 0.03)',
                    borderColor: isActive ? `${alpha(COLORS.saffron, 0x50)}` : 'rgb(var(--ink) / 0.08)',
                    color: isActive ? COLORS.saffronLight : 'rgb(var(--ink) / 0.5)',
                  }}
                >
                  <span className="text-sm font-bold leading-tight">
                    {COMP_TYPE_LABELS[ct] || ct}
                  </span>
                  <span className="text-[10px] leading-tight opacity-70 hidden sm:block">
                    {COMP_TYPE_SUBLABELS[ct] || ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
                </div>
              </motion.div>
            ) : error ? (
              <motion.div key="error"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="rounded-2xl border p-8 text-center"
                style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
                <p className="text-sm font-semibold" style={{ color: 'rgb(var(--danger-fg))' }}>{error}</p>
                <button type="button" onClick={() => fetchScoresForTab(activeTab)}
                  className="mt-3 text-xs underline" style={{ color: 'var(--fg-muted)' }}>
                  Try again
                </button>
              </motion.div>
            ) : !hasScores ? (
              <motion.div key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="rounded-2xl border p-10 text-center"
                style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                <Trophy className="w-12 h-12 mx-auto mb-3 text-white/15" aria-hidden="true" />
                <p className="text-fg-muted font-semibold text-sm">{emptyLabel}</p>
                <p className="text-fg-muted text-xs mt-1">
                  Scores appear here once judges finalize results.
                </p>
              </motion.div>
            ) : (
              <motion.div key={activeTab}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}>
                {Object.entries(scoresByApparatus).map(([apparatus, players]) => (
                  <ApparatusSection
                    key={apparatus}
                    apparatus={apparatus}
                    players={players}
                    highlightPlayerId={highlightPlayerId}
                    selfOnly={selfOnly}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </FadeIn>
  );
};

export default PerformancePanel;
