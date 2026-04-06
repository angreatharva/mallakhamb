import { useState, useEffect, useRef } from 'react';
import { Filter, Search, X, ArrowLeft, Trophy, Medal, ChevronDown, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import { publicAPI } from '../../services/api';
import Dropdown from '../../components/Dropdown';
import { logger } from '../../utils/logger';
import { COLORS, useReducedMotion, GradientText, FadeIn, GlassCard, SaffronButton } from './Home';

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
const RankBadge = ({ rank }) => {
  const colors = {
    1: { bg: 'rgba(245,166,35,0.2)', border: 'rgba(245,166,35,0.5)', text: '#F5A623', icon: '🥇' },
    2: { bg: 'rgba(192,192,192,0.15)', border: 'rgba(192,192,192,0.4)', text: '#C0C0C0', icon: '🥈' },
    3: { bg: 'rgba(205,127,50,0.15)', border: 'rgba(205,127,50,0.4)', text: '#CD7F32', icon: '🥉' },
  };
  const c = colors[rank];
  if (c) {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center border text-sm font-black flex-shrink-0"
        style={{ background: c.bg, borderColor: c.border, color: c.text }}>
        {rank}
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
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
    <div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="flex-1 space-y-2">
      <div className="h-3 rounded-full w-1/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-2 rounded-full w-1/4" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
    <div className="h-8 w-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
  </div>
);

// ─── Player score card ────────────────────────────────────────────────────────
const PlayerScoreCard = ({ player, rank, isTied, index }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl border overflow-hidden"
      style={{
        background: rank <= 3
          ? `linear-gradient(135deg, ${rank === 1 ? 'rgba(245,166,35,0.08)' : rank === 2 ? 'rgba(192,192,192,0.06)' : 'rgba(205,127,50,0.06)'}, rgba(255,255,255,0.02))`
          : 'rgba(255,255,255,0.02)',
        borderColor: rank === 1 ? 'rgba(245,166,35,0.3)' : rank === 2 ? 'rgba(192,192,192,0.2)' : rank === 3 ? 'rgba(205,127,50,0.2)' : 'rgba(255,255,255,0.06)',
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: index * 0.04, ease: EASE_OUT }}>

      {/* Main row */}
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
          {player.time && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Time: {player.time}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-black" style={{ color: COLORS.saffron }}>{player.finalScore.toFixed(2)}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Final</p>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="px-4 pb-4 flex flex-wrap gap-2">
        <ScorePill label="Senior" value={player.judgeScores.seniorJudge} accent={COLORS.saffron} />
        <ScorePill label="J1" value={player.judgeScores.judge1} accent="#A855F7" />
        <ScorePill label="J2" value={player.judgeScores.judge2} accent="#3B82F6" />
        <ScorePill label="J3" value={player.judgeScores.judge3} accent="#22C55E" />
        <ScorePill label="J4" value={player.judgeScores.judge4} accent="#F59E0B" />
        <ScorePill label="Avg" value={player.averageMarks.toFixed(2)} accent={COLORS.saffronLight} />
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

// ─── Score group card ─────────────────────────────────────────────────────────
const ScoreGroupCard = ({ scoreEntry, index }) => {
  const [expanded, setExpanded] = useState(true);

  const sorted = [...scoreEntry.playerScores].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (a.baseScoreApplied && b.baseScoreApplied && a.baseScore !== b.baseScore) return b.baseScore - a.baseScore;
    return b.executionAverage - a.executionAverage;
  });

  return (
    <FadeIn delay={index * 0.08}>
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: COLORS.darkBorder }}>
        {/* Header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-5 py-4 border-b text-left min-h-[60px]"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
          aria-expanded={expanded}>
          <div>
            <p className="text-white font-bold">{scoreEntry.teamName}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {scoreEntry.gender} · {scoreEntry.ageGroup} · {new Date(scoreEntry.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 rounded-full font-bold"
              style={{ background: `${COLORS.saffron}15`, color: COLORS.saffronLight, border: `1px solid ${COLORS.saffron}30` }}>
              {sorted.length} players
            </span>
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} aria-hidden="true" />
            </motion.div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}>
              <div className="p-4 space-y-2">
                {sorted.map((player, i, arr) => {
                  const isTied = i > 0 &&
                    arr[i - 1].finalScore === player.finalScore &&
                    arr[i - 1].executionAverage === player.executionAverage;
                  return (
                    <PlayerScoreCard key={player.playerId} player={player} rank={i + 1} isTied={isTied} index={i} />
                  );
                })}
              </div>

              {/* Footer metadata */}
              {(scoreEntry.timeKeeper || scoreEntry.scorer || scoreEntry.remarks) && (
                <div className="px-5 pb-4 pt-2 border-t flex flex-wrap gap-4 text-xs"
                  style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {scoreEntry.timeKeeper && (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span className="font-bold text-white/60">Timekeeper:</span> {scoreEntry.timeKeeper}
                    </span>
                  )}
                  {scoreEntry.scorer && (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span className="font-bold text-white/60">Scorer:</span> {scoreEntry.scorer}
                    </span>
                  )}
                  {scoreEntry.remarks && (
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span className="font-bold text-white/60">Remarks:</span> {scoreEntry.remarks}
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  );
};

// ─── Dark dropdown wrapper ────────────────────────────────────────────────────
const FilterLabel = ({ children }) => (
  <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: COLORS.saffron }}>
    {children}
  </label>
);

// ─── Main component ───────────────────────────────────────────────────────────
const PublicScores = () => {
  const [teams, setTeams] = useState([]);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
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

  const getAvailableAgeGroups = () => {
    if (!selectedGender) return [];
    return selectedGender.value === 'Male' ? boysAgeGroups : girlsAgeGroups;
  };

  useEffect(() => { if (selectedGender) setSelectedAgeGroup(null); }, [selectedGender]);
  useEffect(() => { if (selectedTeam) { setSelectedGender(null); setSelectedAgeGroup(null); } }, [selectedTeam]);

  useEffect(() => { fetchTeams(); }, []);

  useEffect(() => {
    if (selectedTeam && selectedGender && selectedAgeGroup) fetchScores();
    else setScores([]);
  }, [selectedTeam, selectedGender, selectedAgeGroup]);

  const fetchTeams = async () => {
    try {
      const response = await publicAPI.getTeams();
      setTeams(response.data.teams || []);
    } catch (error) {
      toast.error('Failed to load teams');
      logger.error('Error fetching teams:', error);
    }
  };

  const fetchScores = async () => {
    if (!selectedTeam || !selectedGender || !selectedAgeGroup) return;
    setLoading(true);
    try {
      const response = await publicAPI.getScores({
        teamId: selectedTeam.value,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
      });
      setScores(response.data.scores || []);
      if (!response.data.scores?.length) toast.info('No scores found for this category');
    } catch (error) {
      toast.error('Failed to load scores');
      logger.error('Error fetching scores:', error);
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedTeam(null);
    setSelectedGender(null);
    setSelectedAgeGroup(null);
    setScores([]);
    setSearchTerm('');
  };

  const getFilteredScores = () => {
    if (!scores.length) return [];
    return scores.map(entry => ({
      ...entry,
      playerScores: entry.playerScores.filter(p =>
        !searchTerm || p.playerName?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    })).filter(entry => entry.playerScores.length > 0);
  };

  const allFiltersSet = selectedTeam && selectedGender && selectedAgeGroup;
  const filtered = getFilteredScores();

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
              Select filters to view competition results
            </p>
          </div>
        </FadeIn>

        {/* Filters card */}
        <FadeIn delay={0.1}>
          <div className="rounded-2xl border p-5 md:p-6"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: COLORS.darkBorder }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <FilterLabel>Team</FilterLabel>
                <Dropdown
                  options={teams.map(t => ({ value: t._id, label: t.name }))}
                  value={selectedTeam}
                  onChange={setSelectedTeam}
                  placeholder="Choose a team..."
                  className="w-full"
                />
              </div>
              <div>
                <FilterLabel>Gender</FilterLabel>
                <Dropdown
                  options={genders}
                  value={selectedGender}
                  onChange={setSelectedGender}
                  placeholder="Choose gender..."
                  className="w-full"
                  disabled={!selectedTeam}
                />
              </div>
              <div>
                <FilterLabel>Age Group</FilterLabel>
                <Dropdown
                  options={getAvailableAgeGroups()}
                  value={selectedAgeGroup}
                  onChange={setSelectedAgeGroup}
                  placeholder="Choose age group..."
                  className="w-full"
                  disabled={!selectedGender}
                />
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
                All three filters must be selected to view results
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
                  {selectedTeam.label} · {selectedGender.label} · {selectedAgeGroup.label}
                </div>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                    style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-8 py-2 rounded-xl border text-sm outline-none transition-all duration-200 min-h-[40px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: searchTerm ? `${COLORS.saffron}50` : 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      width: '200px',
                    }}
                    aria-label="Search players by name"
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

              {/* Score groups */}
              {filtered.map((entry, i) => (
                <ScoreGroupCard key={entry._id} scoreEntry={entry} index={i} />
              ))}

              {filtered.length === 0 && searchTerm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                  <Search className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
                  <p className="text-white font-bold mb-1">No players found</p>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    No results for "{searchTerm}"
                  </p>
                  <button onClick={() => setSearchTerm('')}
                    className="mt-4 text-sm font-bold transition-colors duration-200"
                    style={{ color: COLORS.saffron }}>
                    Clear search
                  </button>
                </motion.div>
              )}
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
