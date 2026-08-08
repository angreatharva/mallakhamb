import { useState, useEffect, useRef } from 'react';
import { Filter, Search, X, ArrowLeft, Trophy, Medal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { publicAPI } from '@/services/api';
import Dropdown from '@/components/auth/Dropdown';
import { logger } from '@/infrastructure/logger';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { GradientText, FadeIn } from '@/components/design-system';

// ─── Design tokens ────────────────────────────────────────────────────────────
const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

// ─── Ambient orb ─────────────────────────────────────────────────────────────
const Orb = ({ x, y, size, color, delay, duration, blur = 80 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`, width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}33, ${color}0A, transparent 70%)`,
        filter: `blur(${blur}px)`, transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -30, 0], scale: [1, 1.1, 1], opacity: [0.3, 0.55, 0.3] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Rank badge ───────────────────────────────────────────────────────────────
const RankBadge = ({ rank, size = 'w-9 h-9', textSize = 'text-sm' }) => {
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

// ─── Score pill ───────────────────────────────────────────────────────────────
const ScorePill = ({ label, value, accent = COLORS.saffron }) => (
  <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl"
    style={{ background: `${accent}0E`, border: `1px solid ${accent}20` }}>
    <span className="text-xs font-bold" style={{ color: accent }}>{value}</span>
    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
  </div>
);

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const SkeletonRow = () => (
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

// ─── Unified Player Card ──────────────────────────────────────────────────────
// Single container: rank + name + team/coach + full score breakdown, all in one card.
// Used for both podium (rank 1-3, highlighted) and the rest of the list.
const PlayerCard = ({ player, rank, isTied, index, podium = false, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const reduced = useReducedMotion();

  const rankAccent = rank === 1 ? '#F5A623' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : null;

  const is3JudgePanel = player.panelSize === 3 || (!player.judgeScores?.judge3 && !player.judgeScores?.judge4);

  const getAverageBreakdown = (p) => {
    const slips = p.judgeSlips || [];
    if (slips.length > 0) {
      const len = slips.length;
      const diff = slips.reduce((acc, s) => acc + (Number(s.difficultyScore) || 0), 0) / len;
      const comb = slips.reduce((acc, s) => acc + (Number(s.combinationScore) || 0), 0) / len;
      const exec = slips.reduce((acc, s) => acc + (Number(s.executionScore) || 0), 0) / len;
      const bonus = slips.reduce((acc, s) => acc + (Number(s.bonusScore) || 0), 0) / len;
      return { difficulty: diff, combination: comb, execution: exec, bonus: bonus };
    }
    const sb = p.scoreBreakdown || {};
    return {
      difficulty: Number(sb.difficulty?.total) || 0,
      combination: Number(sb.combination?.total) || 0,
      execution: Number(sb.execution) || 0,
      bonus: Number(sb.originality) || 0,
    };
  };

  const avgBreakdown = is3JudgePanel ? getAverageBreakdown(player) : null;

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
            {isTied && (
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
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-black" style={{ color: COLORS.saffron }}>{player.finalScore.toFixed(2)}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Final</p>
        </div>
      </div>

      {/* Score breakdown — inside the SAME card */}
      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {is3JudgePanel ? (
          <>
            <ScorePill label="Diff" value={avgBreakdown.difficulty.toFixed(2)} accent="#A855F7" />
            <ScorePill label="Comb" value={avgBreakdown.combination.toFixed(2)} accent="#3B82F6" />
            <ScorePill label="Exec" value={avgBreakdown.execution.toFixed(2)} accent="#22C55E" />
            <ScorePill label="Bonus" value={avgBreakdown.bonus.toFixed(2)} accent="#F59E0B" />
          </>
        ) : (
          <>
            {player.judgeScores?.seniorJudge !== undefined && <ScorePill label="Senior" value={player.judgeScores.seniorJudge} accent={COLORS.saffron} />}
            {player.judgeScores?.judge1 !== undefined && <ScorePill label="J1" value={player.judgeScores.judge1} accent="#A855F7" />}
            {player.judgeScores?.judge2 !== undefined && <ScorePill label="J2" value={player.judgeScores.judge2} accent="#3B82F6" />}
            {player.judgeScores?.judge3 > 0 && <ScorePill label="J3" value={player.judgeScores.judge3} accent="#22C55E" />}
            {player.judgeScores?.judge4 > 0 && <ScorePill label="J4" value={player.judgeScores.judge4} accent="#F59E0B" />}
            <ScorePill label="Avg" value={player.averageMarks ? player.averageMarks.toFixed(2) : '0.00'} accent={COLORS.saffronLight} />
          </>
        )}
        {player.deduction > 0 && <ScorePill label="Deduct" value={`-${player.deduction}`} accent="#EF4444" />}
        {player.otherDeduction > 0 && <ScorePill label="Other" value={`-${player.otherDeduction}`} accent="#EF4444" />}
        {player.baseScoreApplied && (
          <span className="text-xs px-2 py-1 rounded-xl font-bold self-center"
            style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC', border: '1px solid rgba(168,85,247,0.25)' }}>
            Base Score
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ─── Individual Ranking Board ─────────────────────────────────────────────────
// Pools ALL players across every filtered score entry into one global ranking.
// Top 3 render in a true podium arrangement (2nd left, 1st elevated center,
// 3rd right) using the SAME single-container PlayerCard, just placed
// differently and given a taller top margin for 1st so it visually sits
// higher. Rank 4+ render as the normal stacked list below.
const RankingBoard = ({ players }) => {
  const sorted = [...players].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (a.baseScoreApplied && b.baseScoreApplied && a.baseScore !== b.baseScore) return b.baseScore - a.baseScore;
    return b.executionAverage - a.executionAverage;
  });

  const getIsTied = (i) => {
    if (i === 0) return false;
    const prev = sorted[i - 1];
    const curr = sorted[i];
    return prev.finalScore === curr.finalScore && prev.executionAverage === curr.executionAverage;
  };

  const topPlayers = sorted.slice(0, 3);
  const remainingPlayers = sorted.slice(3);

  const first = topPlayers[0];
  const second = topPlayers[1];
  const third = topPlayers[2];

  return (
    <div className="space-y-6">
      {/* Podium: 2nd (left) - 1st (center, elevated) - 3rd (right) */}
      {topPlayers.length > 0 && (
        <div className="flex items-start justify-center gap-3 sm:gap-4">
          {/* Second place - left */}
          <div className="flex-1 max-w-xs mt-8 sm:mt-10">
            {second ? (
              <PlayerCard
                player={second}
                rank={2}
                isTied={getIsTied(1)}
                index={1}
                podium
              />
            ) : null}
          </div>

          {/* First place - center, no top margin so it sits highest */}
          <div className="flex-1 max-w-xs">
            {first && (
              <PlayerCard
                player={first}
                rank={1}
                isTied={false}
                index={0}
                podium
                className="scale-105 sm:scale-110 origin-top"
              />
            )}
          </div>

          {/* Third place - right */}
          <div className="flex-1 max-w-xs mt-8 sm:mt-10">
            {third ? (
              <PlayerCard
                player={third}
                rank={3}
                isTied={getIsTied(2)}
                index={2}
                podium
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Remaining players - normal list */}
      {remainingPlayers.length > 0 && (
        <div className="space-y-3">
          {remainingPlayers.map((player, i) => {
            const actualIndex = i + 3;
            return (
              <PlayerCard
                key={player.uid || player.playerId}
                player={player}
                rank={actualIndex + 1}
                isTied={getIsTied(actualIndex)}
                index={actualIndex}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Filter labels ────────────────────────────────────────────────────────────
const FilterLabel = ({ children, primary = false }) => (
  <label
    className="block text-xs font-bold tracking-widest uppercase mb-2"
    style={{ color: primary ? COLORS.saffron : 'rgba(255,255,255,0.45)' }}>
    {children}
  </label>
);

// ─── Main component ───────────────────────────────────────────────────────────
const PublicScores = () => {
  const [competitions, setCompetitions] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(null);
  const [selectedApparatus, setSelectedApparatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const genders = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ];

  const boysAgeGroups = [
    { value: 'Under10', label: 'Under 10' },
    { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' },
    { value: 'Under18', label: 'Under 18' },
    { value: 'Above18', label: 'Above 18' },
  ];

  const girlsAgeGroups = [
    { value: 'Under10', label: 'Under 10' },
    { value: 'Under12', label: 'Under 12' },
    { value: 'Under14', label: 'Under 14' },
    { value: 'Under16', label: 'Under 16' },
    { value: 'Above16', label: 'Above 16' },
  ];

  const competitionTypeLabels = {
    'competition_1': 'Competition I - Team Championship & Qualifier',
    'competition_2': 'Competition II - All Round Individual Final',
    'competition_3': 'Competition III - Apparatus Championship'
  };

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  const getAvailableCompetitionTypes = () => {
    if (!selectedCompetition) return [];
    return (selectedCompetition.competitionTypes || []).map(type => ({
      value: type,
      label: competitionTypeLabels[type] || type
    }));
  };

  const getAvailableApparatus = () => {
    if (!selectedCompetition || !selectedCompetitionType) return [];
    const apparatusConfig = selectedCompetition.apparatusConfig || {};
    const apparatusList = apparatusConfig[selectedCompetitionType.value] || [];
    return apparatusList.map(app => ({
      value: app,
      label: app
    }));
  };

  // Cascade resets
  useEffect(() => {
    if (selectedCompetition) {
      setSelectedGender(null);
      setSelectedAgeGroup(null);
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedCompetition]);

  useEffect(() => {
    if (selectedGender) {
      setSelectedAgeGroup(null);
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedGender]);

  useEffect(() => {
    if (selectedAgeGroup) {
      setSelectedCompetitionType(null);
      setSelectedApparatus(null);
    }
  }, [selectedAgeGroup]);

  useEffect(() => {
    if (selectedCompetitionType) {
      setSelectedApparatus(null);
    }
  }, [selectedCompetitionType]);

  useEffect(() => { fetchCompetitions(); }, []);

  useEffect(() => {
    if (selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus) {
      fetchScores();
    } else {
      setScores([]);
    }
  }, [selectedCompetition, selectedGender, selectedAgeGroup, selectedCompetitionType, selectedApparatus]);

  const fetchCompetitions = async () => {
    setLoadingCompetitions(true);
    try {
      const response = await publicAPI.getCompetitions();
      const comps = response.data.data || response.data.competitions || [];
      setCompetitions(comps.map(c => ({
        value: c._id,
        label: `${c.name} (${c.year}) — ${c.place}`,
        competitionTypes: c.competitionTypes || [],
        apparatusConfig: c.apparatusConfig || {},
      })));
      if (!comps.length) {
        logger.warn('No public competitions returned from API');
      }
    } catch (error) {
      toast.error('Failed to load competitions');
      logger.error('Error fetching competitions:', error);
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const fetchScores = async () => {
    if (!selectedCompetition || !selectedGender || !selectedAgeGroup || !selectedCompetitionType || !selectedApparatus) return;
    setLoading(true);
    try {
      const response = await publicAPI.getScores({
        competitionId: selectedCompetition.value,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionType: selectedCompetitionType.value,
        apparatus: selectedApparatus.value,
      });
      const data = response.data.data || response.data.scores || [];
      setScores(data);
      if (!data.length) {
        logger.warn('No public scores for category', {
          competitionId: selectedCompetition.value,
          gender: selectedGender.value,
          ageGroup: selectedAgeGroup.value,
        });
      }
    } catch (error) {
      toast.error('Failed to load scores');
      logger.error('Error fetching scores:', error);
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedCompetition(null);
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setSelectedCompetitionType(null);
    setSelectedApparatus(null);
    setScores([]);
    setSearchTerm('');
  };

  // Flatten every player from every score entry into one global list,
  // attaching that entry's team name onto each player. Coach comes from
  // the player object itself (player.coach), per-player.
  const getAllPlayers = () => {
    if (!scores.length) return [];
    const players = [];
    for (const entry of scores) {
      for (const player of entry.playerScores) {
        players.push({
          ...player,
          teamName: player.teamName || entry.teamName,
          // Players now come from every team, so the row key must include the
          // score document to stay unique across teams.
          uid: `${entry._id}-${player.playerId}`,
        });
      }
    }
    return players;
  };

  const getFilteredPlayers = () => {
    const all = getAllPlayers();
    if (!searchTerm) return all;
    const term = searchTerm.toLowerCase();
    return all.filter(p =>
      p.playerName?.toLowerCase().includes(term) ||
      p.teamName?.toLowerCase().includes(term) ||
      p.coach?.toLowerCase().includes(term)
    );
  };

  const allFiltersSet = selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus;
  const filteredPlayers = getFilteredPlayers();
  const teamCount = new Set(filteredPlayers.map(p => p.teamName).filter(Boolean)).size;

  return (
    <div className="min-h-dvh relative" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Ambient orbs */}
      <Orb x={10} y={15} size={500} color={COLORS.saffron} delay={0} duration={9} blur={120} />
      <Orb x={90} y={50} size={350} color="#A855F7" delay={2} duration={11} blur={100} />
      <Orb x={50} y={90} size={300} color={COLORS.saffronDark} delay={1} duration={8} blur={90} />

      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/"
              className="flex items-center gap-2 text-sm font-semibold transition-colors duration-200 min-h-[44px] px-2 rounded-xl hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              aria-label="Back to Home">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
              <h1 className="text-white font-black text-sm sm:text-base">Competition Scores</h1>
            </div>
          </div>
          {allFiltersSet && (
            <button onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6" id="main-content">
        {/* Page title */}
        <FadeIn>
          <div className="text-center py-4">
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: COLORS.saffron }}>Live Results</p>
            <h2 className="text-3xl md:text-4xl font-black text-white">
              View <GradientText>Scores</GradientText>
            </h2>
            <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Select a category to see players from all teams ranked together
            </p>
          </div>
        </FadeIn>

        {/* Filters card */}
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-5 md:p-6"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: COLORS.darkBorder }}>
            <div className="space-y-4">
              <div>
                <FilterLabel primary>Competition *</FilterLabel>
                <Dropdown
                  options={competitions}
                  value={selectedCompetition}
                  onChange={setSelectedCompetition}
                  placeholder={loadingCompetitions ? 'Loading competitions...' : 'Select competition...'}
                  className="w-full"
                  loading={loadingCompetitions}
                  disabled={loadingCompetitions}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <FilterLabel>Gender *</FilterLabel>
                  <Dropdown
                    options={genders}
                    value={selectedGender}
                    onChange={setSelectedGender}
                    placeholder="Select gender..."
                    className="w-full"
                    disabled={!selectedCompetition}
                  />
                </div>
                <div>
                  <FilterLabel>Age Group *</FilterLabel>
                  <Dropdown
                    options={getAvailableAgeGroups()}
                    value={selectedAgeGroup}
                    onChange={setSelectedAgeGroup}
                    placeholder="Select age group..."
                    className="w-full"
                    disabled={!selectedGender}
                  />
                </div>
                <div>
                  <FilterLabel>Competition Type *</FilterLabel>
                  <Dropdown
                    options={getAvailableCompetitionTypes()}
                    value={selectedCompetitionType}
                    onChange={setSelectedCompetitionType}
                    placeholder="Select type..."
                    className="w-full"
                    disabled={!selectedAgeGroup}
                  />
                </div>
                <div>
                  <FilterLabel>Apparatus *</FilterLabel>
                  <Dropdown
                    options={getAvailableApparatus()}
                    value={selectedApparatus}
                    onChange={setSelectedApparatus}
                    placeholder="Select apparatus..."
                    className="w-full"
                    disabled={!selectedCompetitionType}
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-white/5"
                  style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Content area */}
        <AnimatePresence mode="wait">
          {!allFiltersSet ? (
            <motion.div key="empty-state"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: `${COLORS.saffron}10`, border: `1px solid ${COLORS.saffron}20` }}>
                <Filter className="w-8 h-8" style={{ color: COLORS.saffron }} aria-hidden="true" />
              </div>
              <p className="text-white font-bold text-lg mb-2">Select Filters to View Scores</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Pick a competition, gender, age group, competition type and apparatus —
                players from all teams are ranked together
              </p>
            </motion.div>
          ) : loading ? (
            <motion.div key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-3">
              {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
            </motion.div>
          ) : scores.length > 0 ? (
            <motion.div key="results"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4">
              {/* Active filter badge */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold"
                  style={{ background: `${COLORS.saffron}10`, borderColor: `${COLORS.saffron}30`, color: COLORS.saffronLight }}>
                  <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                  {selectedCompetition.label} · {selectedGender.label} · {selectedAgeGroup.label} · {selectedCompetitionType.label} · {selectedApparatus.label}
                </div>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search players, team, coach..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-8 py-2 rounded-xl border text-sm outline-none transition-all duration-200 min-h-[40px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: searchTerm ? `${COLORS.saffron}50` : 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      width: '220px',
                    }}
                    aria-label="Search players by name, team, or coach"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 transition-colors"
                      aria-label="Clear search">
                      <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {/* Player + team count badge */}
              <div className="flex items-center gap-2 px-1">
                <Users className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.35)' }} aria-hidden="true" />
                <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'} ranked
                  {teamCount > 0 && ` across ${teamCount} ${teamCount === 1 ? 'team' : 'teams'}`}
                </span>
              </div>

              {/* Individual ranking board — one global list across all teams */}
              {filteredPlayers.length > 0 ? (
                <RankingBoard players={filteredPlayers} />
              ) : searchTerm ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                  <Search className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
                  <p className="text-white font-bold mb-1">No players found</p>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    No results for &quot;{searchTerm}&quot;
                  </p>
                  <button onClick={() => setSearchTerm('')}
                    className="mt-4 text-sm font-bold transition-colors duration-200"
                    style={{ color: COLORS.saffron }}>
                    Clear search
                  </button>
                </motion.div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div key="no-scores"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Medal className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
              </div>
              <p className="text-white font-bold text-lg mb-2">No Scores Available</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Scores will appear here after judges complete their scoring.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default PublicScores;