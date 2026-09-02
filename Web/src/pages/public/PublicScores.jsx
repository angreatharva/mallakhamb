import { useState, useEffect } from 'react';
import { Filter, Search, X, ArrowLeft, Trophy, Medal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { publicAPI } from '@/services/api';
import { logger } from '@/infrastructure/logger';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { GradientText, FadeIn } from '@/components/design-system';
import { getFilteredAgeGroups } from '@/hooks/useAgeGroups';
import PlayerRankingBoard, { SkeletonRow } from '@/components/scores/PlayerRankingBoard';
import ScoreCategoryFilters from '@/components/scores/ScoreCategoryFilters';
import { rowsFromPublicScores, filterRows } from '@/components/scores/scoreRows';

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

const COMPETITION_TYPE_LABELS = {
  competition_1: 'Competition I - Team Championship & Qualifier',
  competition_2: 'Competition II - All Round Individual Final',
  competition_3: 'Competition III - Apparatus Championship',
};

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

  // Boys and girls do not share the top two brackets; the shared helper owns
  // that rule and narrows it further to whatever this competition runs.
  const getAvailableAgeGroups = () => (
    selectedGender ? getFilteredAgeGroups(selectedCompetition, selectedGender.value) : []
  );

  const getAvailableCompetitionTypes = () => {
    if (!selectedCompetition) return [];
    return (selectedCompetition.competitionTypes || []).map((type) => ({
      value: type,
      label: COMPETITION_TYPE_LABELS[type] || type,
    }));
  };

  const getAvailableApparatus = () => {
    if (!selectedCompetition || !selectedCompetitionType) return [];
    const apparatusConfig = selectedCompetition.apparatusConfig || {};
    const apparatusList = apparatusConfig[selectedCompetitionType.value] || [];
    return apparatusList.map((app) => ({ value: app, label: app }));
  };

  // Cascade resets — changing a filter invalidates everything below it
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

  // Apparatus is the last selection, so it is the one that triggers the read.
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
      setCompetitions(comps.map((c) => ({
        value: c._id,
        label: `${c.name} (${c.year}) — ${c.place}`,
        competitionTypes: c.competitionTypes || [],
        apparatusConfig: c.apparatusConfig || {},
        // Absent from the public payload today, so the age-group filter falls
        // back to the gender's full list. Carried through so that it narrows
        // on its own if the endpoint ever starts sending it.
        ageGroups: c.ageGroups || [],
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

  const allFiltersSet = selectedCompetition && selectedGender && selectedAgeGroup && selectedCompetitionType && selectedApparatus;
  const filteredPlayers = filterRows(rowsFromPublicScores(scores), searchTerm);
  const teamCount = new Set(filteredPlayers.map((p) => p.teamName).filter(Boolean)).size;

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
            <ScoreCategoryFilters
              competitionOptions={competitions}
              selectedCompetition={selectedCompetition}
              onCompetitionChange={setSelectedCompetition}
              loadingCompetitions={loadingCompetitions}
              selectedGender={selectedGender}
              onGenderChange={setSelectedGender}
              ageGroupOptions={getAvailableAgeGroups()}
              selectedAgeGroup={selectedAgeGroup}
              onAgeGroupChange={setSelectedAgeGroup}
              competitionTypeOptions={getAvailableCompetitionTypes()}
              selectedCompetitionType={selectedCompetitionType}
              onCompetitionTypeChange={setSelectedCompetitionType}
              apparatusOptions={getAvailableApparatus()}
              selectedApparatus={selectedApparatus}
              onApparatusChange={setSelectedApparatus}
              onClearFilters={handleClearFilters}
            />
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
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                <PlayerRankingBoard players={filteredPlayers} />
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
