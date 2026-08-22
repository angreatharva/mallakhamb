import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, Users, Trophy, LogOut, CheckCircle, Search, ChevronRight, X, Filter, ListOrdered
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import { judgeLotsAPI } from '@/services/ordering/lots.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { resolveJudgeSeat } from './useJudgePanelData';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { FadeIn } from '@/components/design-system';
import { isApparatusAllowedForGender } from '@/utils/scoring/copRules';
import {
  indexPerformanceOrder,
  applyRunningOrder,
  eventMatchesCategory,
} from '@/utils/ordering/performanceOrder';

/** Judge roles that may set the panel's running order (server: SEQUENCE_JUDGE_TYPES). */
const SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer'];

// Design tokens for judge theme
const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
  amber: '#F59E0B',
};

const Orb = ({ x, y, size, color, delay, duration, blur = 80 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`, width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}44, ${color}11, transparent 70%)`,
        filter: `blur(${blur}px)`, transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -25, 0], scale: [1, 1.08, 1], opacity: [0.25, 0.5, 0.25] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

const SelectBtn = ({ selected, onClick, children, accent = J.purple }) => {
  const reduced = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      className="w-full p-3.5 rounded-xl border text-left transition-colors duration-200 min-h-[52px] flex items-center justify-between gap-3"
      style={{
        background: selected ? `${accent}14` : 'rgba(255,255,255,0.03)',
        borderColor: selected ? `${accent}50` : 'rgba(255,255,255,0.07)',
        color: selected ? '#fff' : 'rgba(255,255,255,0.6)',
      }}
      whileHover={reduced ? {} : { scale: 1.005 }}
      whileTap={reduced ? {} : { scale: 0.995 }}
      transition={{ duration: 0.15 }}>
      <span className="text-sm font-semibold">{children}</span>
      {selected && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: accent }} aria-hidden="true" />}
    </motion.button>
  );
};

const JudgeDashboard = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(() => sessionStorage.getItem('judge_selected_comp_type') || '');
  const [selectedGender, setSelectedGender] = useState(() => sessionStorage.getItem('judge_selected_gender') || '');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(() => sessionStorage.getItem('judge_selected_age_group') || '');
  const [selectedApparatus, setSelectedApparatus] = useState(() => sessionStorage.getItem('judge_selected_apparatus') || 'Pole Mallakhamb');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Lookup maps from the category's running order. Empty until it loads, at
  // which point every team without a stored position falls back to name order —
  // which is what this list used to be, so nothing regresses when no lots have
  // been drawn.
  const [orderIndex, setOrderIndex] = useState(() => ({ teams: new Map(), players: new Map() }));
  
  const [showModal, setShowModal] = useState(() => {
    return !sessionStorage.getItem('judge_category_selected');
  });

  // Available options based on judge assignment(s)
  const [availableGenders, setAvailableGenders] = useState([]);
  const [availableAgeGroups, setAvailableAgeGroups] = useState([]);

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I', sub: 'Team' },
    { value: 'competition_2', label: 'Competition II', sub: 'Individual' },
    { value: 'competition_3', label: 'Competition III', sub: 'Apparatus' },
  ];

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) { toast.error('Please login first'); navigate('/judge/login'); return; }
    try {
      const judge = JSON.parse(storedJudge);
      logger.log('Judge info loaded:', { 
        judgeType: judge.judgeType, 
        gender: judge.gender, 
        ageGroup: judge.ageGroup,
        competitionTypes: judge.competitionTypes,
        competition: judge.competition,
        allAssignments: judge.allAssignments
      });
      setJudgeInfo(judge);

      // Extract unique genders and age groups from all assignments
      const allAssignments = judge.allAssignments || [judge];
      const genders = [...new Set(allAssignments.map(a => a.gender))].filter(Boolean);
      const ageGroups = [...new Set(allAssignments.map(a => a.ageGroup))].filter(Boolean);
      
      setAvailableGenders(genders);
      setAvailableAgeGroups(ageGroups);

      // Auto-select if there's only one option
      if (genders.length === 1 && !sessionStorage.getItem('judge_selected_gender')) {
        setSelectedGender(genders[0]);
      }
      if (ageGroups.length === 1 && !sessionStorage.getItem('judge_selected_age_group')) {
        setSelectedAgeGroup(ageGroups[0]);
      }

      // Auto-select if there's only one competition type and we haven't selected one yet
      if (judge.competitionTypes?.length === 1 && !sessionStorage.getItem('judge_selected_comp_type')) {
        setSelectedCompetitionType(judge.competitionTypes[0]);
      }

      // For scorers without competitionTypes, auto-select competition_1 (Team Championship)
      if (judge.judgeType === 'Scorer' && !judge.competitionTypes?.length && !sessionStorage.getItem('judge_selected_comp_type')) {
        logger.log('Scorer without competitionTypes, defaulting to competition_1');
        setSelectedCompetitionType('competition_1');
      }
    } catch (error) {
      logger.error('Error loading judge info:', error);
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  const fetchTeams = async () => {
    if (!judgeInfo || !selectedCompetitionType) return;
    try {
      setLoading(true);
      
      // Extract competition ID from various possible locations
      const competitionId = judgeInfo.competition?._id || 
                           judgeInfo.competition || 
                           secureStorage.getItem('judge_competition_id');
      
      // Use selected values if available, otherwise fall back to judgeInfo
      const gender = selectedGender || judgeInfo.gender;
      const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
      
      // Build API request parameters
      const params = { 
        competitionId: competitionId,
        gender: gender, 
        ageGroup: ageGroup, 
        competitionType: selectedCompetitionType 
      };
      
      logger.log('Fetching teams with params:', params);
      
      // Validate parameters before making request
      if (!params.competitionId) {
        logger.error('Missing competitionId - cannot fetch teams', { judgeInfo });
        toast.error('Competition ID not found. Please contact admin.');
        setTeams([]);
        return;
      }
      
      if (!params.gender || !params.ageGroup) {
        logger.error('Missing gender or ageGroup', { gender, ageGroup, judgeInfo });
        toast.error('Judge assignment incomplete. Please select gender and age group.');
        setTeams([]);
        return;
      }
      
      const response = await judgeAPI.getSubmittedTeams(params);
      
      logger.log('Teams fetched successfully:', { count: response.data.data?.length || 0 });
      setTeams(response.data.data || []);
      
      if (response.data.data?.length === 0) {
        logger.warn('No teams found for filters', params);
      }
    } catch (error) {
      logger.error('Error fetching teams:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load teams';
      toast.error(errorMessage);
      setTeams([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (judgeInfo && !showModal && selectedCompetitionType) {
      fetchTeams();
    }
  }, [judgeInfo, showModal, selectedCompetitionType, selectedGender, selectedAgeGroup]);

  // The category this judge is currently working in. Also the socket room key.
  const categoryParams = useMemo(() => {
    if (!judgeInfo || !selectedCompetitionType) return null;
    const competitionId = judgeInfo.competition?._id || judgeInfo.competition;
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
    if (!competitionId || !gender || !ageGroup) return null;
    return { competitionId, gender, ageGroup, competitionType: selectedCompetitionType };
  }, [judgeInfo, selectedCompetitionType, selectedGender, selectedAgeGroup]);

  /**
   * Load the running order set by the panel's Senior Judge / Scorer, or drawn
   * by an admin.
   *
   * A failure here is deliberately quiet: the order is presentation, and
   * blocking or alarming a judge because it could not be read would be worse
   * than showing the previous alphabetical list.
   */
  const fetchOrder = useCallback(async () => {
    if (!categoryParams) return;
    try {
      const response = await judgeLotsAPI.getOrder(categoryParams);
      setOrderIndex(indexPerformanceOrder(response.data?.data));
    } catch (error) {
      logger.warn('Could not load running order; falling back to name order', error);
    }
  }, [categoryParams]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Live re-sort. The Senior Judge dragging a team on /judge/sequence, or an
  // admin drawing lots, has to land here without the judge reloading —
  // otherwise two people on the same panel disagree about who performs next.
  useEffect(() => {
    if (!categoryParams) return;

    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');
    const socket = io(socketUrl, { auth: { token }, withCredentials: true });

    const roomId = `scoring_${categoryParams.gender}_${categoryParams.ageGroup}_${categoryParams.competitionType}`;
    socket.on('connect', () => socket.emit('join_scoring_room', { roomId }));

    socket.on('performance_order_updated', (event) => {
      if (!eventMatchesCategory(event, categoryParams)) return;
      // The event carries the whole order, so it is applied directly rather
      // than triggering a refetch — one fewer round trip per drag, and every
      // judge in the room gets the same payload.
      setOrderIndex(indexPerformanceOrder(event));
      toast.success(
        event.reason === 'lots_drawn' ? 'Lots drawn — order updated' : 'Running order updated'
      );
    });

    return () => socket.disconnect();
  }, [categoryParams]);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  const getFilteredPlayersForTeam = (team) => {
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
    
    return team.players
      .filter(e => {
        if (!e.player || e.player.gender !== gender || e.ageGroup !== ageGroup) return false;
        if (selectedApparatus && e.apparatus && e.apparatus[selectedCompetitionType]) {
          const apps = e.apparatus[selectedCompetitionType];
          if (Array.isArray(apps) && apps.length > 0 && !apps.includes(selectedApparatus)) {
            return false;
          }
        }
        return true;
      });
  };

  const handleTeamSelect = (team) => {
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
    
    logger.log('handleTeamSelect called:', {
      teamId: team._id,
      teamName: team.name,
      judgeType: judgeInfo?.judgeType,
      gender,
      ageGroup,
      selectedCompetitionType
    });
    
    const competitionTypeObj = {
      value: selectedCompetitionType,
      label: competitionTypes.find(ct => ct.value === selectedCompetitionType)?.label || selectedCompetitionType
    };

    // Both scorers and regular judges go to /judge/scoring
    // The JudgeScoring component will handle the role-based UI
    if (judgeInfo?.judgeType === 'Scorer') {
      logger.log('Navigating to scorer scoring page');
      // Scorer: Navigate to scoring with team-level state
      navigate(`/judge/scoring`, {
        state: {
          selectedTeam: team,
          selectedCompetitionType: competitionTypeObj,
          apparatus: selectedApparatus,
          gender: gender,
          ageGroup: ageGroup,
          isScorer: true, // Flag to indicate scorer mode
        },
      });
    } else {
      logger.log('Navigating to team players page:', `/judge/team/${team._id}`);
      // Regular Judge: Navigate to team players first
      navigate(`/judge/team/${team._id}`, {
        state: {
          team,
          competitionType: selectedCompetitionType,
          apparatus: selectedApparatus,
          gender: gender,
          ageGroup: ageGroup,
        },
      });
    }
  };

  const handleConfirmSelection = () => {
    sessionStorage.setItem('judge_category_selected', 'true');
    sessionStorage.setItem('judge_selected_comp_type', selectedCompetitionType);
    sessionStorage.setItem('judge_selected_gender', selectedGender || judgeInfo.gender);
    sessionStorage.setItem('judge_selected_age_group', selectedAgeGroup || judgeInfo.ageGroup);
    if (selectedApparatus) {
      sessionStorage.setItem('judge_selected_apparatus', selectedApparatus);
    } else {
      sessionStorage.removeItem('judge_selected_apparatus');
    }
    setShowModal(false);
  };

  if (!judgeInfo) return null;

  // Apparatus options for the selected competition type, filtered by the COP
  // gender rule (Women's competitions exclude Hanging Mallakhamb, §11 / 1.8.2).
  const apparatusOptions = (
    (selectedCompetitionType && judgeInfo.competition?.apparatusConfig?.[selectedCompetitionType]) || []
  ).filter(app => isApparatusAllowedForGender(app, selectedGender || judgeInfo.gender));

  const needsApparatus = apparatusOptions.length > 0;
  const isApparatusSelected = !needsApparatus || !!selectedApparatus;
  const isGenderSelected = availableGenders.length <= 1 || !!selectedGender;
  const isAgeGroupSelected = availableAgeGroups.length <= 1 || !!selectedAgeGroup;
  const isSelectionComplete = selectedCompetitionType && isApparatusSelected && isGenderSelected && isAgeGroupSelected;

  /**
   * The seat held for the category currently selected on this screen. A judge
   * can chair one panel and merely score on another, so "am I the Senior
   * Judge" is only answerable once a category is chosen.
   */
  const mySeat = resolveJudgeSeat(judgeInfo, {
    gender: selectedGender || judgeInfo.gender,
    ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
    competitionType: selectedCompetitionType,
    apparatus: selectedApparatus,
  });
  const myJudgeType = mySeat?.judgeType;

  const canSequence = SEQUENCE_JUDGE_TYPES.includes(myJudgeType);

  // Running order first, then the search filter — filtering first would be
  // equivalent here but sorting the full list keeps the positions shown next to
  // each team meaningful while a search is active.
  const filteredTeams = applyRunningOrder(teams, orderIndex.teams, {
    key: (team) => String(team._id),
    name: (team) => team.name,
  }).filter(team =>
    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (team.coach?.name && team.coach.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const getCompLabel = (val) => competitionTypes.find(c => c.value === val)?.label || val;

  return (
    <div className="min-h-dvh relative flex flex-col" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Orb x={5} y={10} size={400} color={J.purple} delay={0} duration={8} blur={120} />
      <Orb x={95} y={60} size={300} color={COLORS.saffron} delay={3} duration={10} blur={100} />
      <Orb x={50} y={95} size={250} color={J.purpleDark} delay={1.5} duration={7} blur={90} />

      <header className="sticky top-0 z-40 border-b flex-shrink-0"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
              <Scale className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{judgeInfo.name}</p>
              <p className="text-xs truncate" style={{ color: J.purpleLight }}>{myJudgeType}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-red-500/10"
            style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
            aria-label="Logout">
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col" id="main-content">
        
        {/* Top Section */}
        <FadeIn delay={0}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-black text-white">Dashboard</h1>
            
            {!showModal && selectedCompetitionType && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Only the Senior Judge and the Scorer set the running order.
                    The other judges see the result but get no entry point. */}
                {canSequence && (
                  <button
                    onClick={() => navigate('/judge/sequence')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-sm font-bold transition-colors min-h-[44px]">
                    <ListOrdered className="w-4 h-4" />
                    Set Sequence
                  </button>
                )}
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-bold transition-colors min-h-[44px]">
                  <Filter className="w-4 h-4" />
                  Change Category
                </button>
              </div>
            )}
          </div>

          {!showModal && selectedCompetitionType && (
            <div className="rounded-2xl border p-4 flex flex-col sm:flex-row gap-4 mb-6"
              style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 flex-shrink-0" style={{ color: J.purple }} aria-hidden="true" />
                <span className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>Current Assignment</span>
              </div>
              <div className="flex flex-wrap gap-4 sm:ml-auto">
                {[
                  { label: 'Gender', value: selectedGender || judgeInfo.gender },
                  { label: 'Age Group', value: selectedAgeGroup || judgeInfo.ageGroup },
                  { label: 'Competition', value: getCompLabel(selectedCompetitionType) },
                  ...(selectedApparatus ? [{ label: 'Apparatus', value: selectedApparatus }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                    <span className="text-sm font-bold text-white">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </FadeIn>

        {/* Search & Team List */}
        {!showModal && selectedCompetitionType && (
          <FadeIn delay={0.1} className="flex-1 flex flex-col">
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input 
                type="text" 
                placeholder="Search teams by name..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-base text-white placeholder-white/40 outline-none focus:border-purple-500/50 transition-colors shadow-lg"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-3 flex-1">
                <motion.div className="w-6 h-6 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: J.purple, borderTopColor: 'transparent' }}
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                <span className="text-sm text-white/50">Loading teams...</span>
              </div>
            ) : filteredTeams.length > 0 ? (
              <div className="space-y-4 pb-12">
                {filteredTeams.map((team, orderIdx) => {
                  const teamPlayers = getFilteredPlayersForTeam(team);
                  const scoredCount = teamPlayers.filter((e) => e.isFinalized).length;

                  return (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => handleTeamSelect(team)}
                      className="w-full rounded-2xl border overflow-hidden transition-all duration-300 text-left hover:bg-white/5"
                      style={{ 
                        background: 'rgba(255,255,255,0.02)',
                        borderColor: 'rgba(255,255,255,0.08)'
                      }}
                    >
                      <div className="flex items-center justify-between p-5 gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          {/* Running position, with the drawn lot underneath.
                              These diverge the moment anyone re-sequences, so
                              both are shown rather than one standing in for the
                              other. */}
                          <span className="flex flex-col items-center justify-center w-10 flex-shrink-0">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black"
                              style={{ background: 'rgba(168,85,247,0.18)', color: J.purpleLight }}>
                              {orderIdx + 1}
                            </span>
                            {team.lotNo != null && (
                              <span className="text-[9px] mt-0.5 font-bold tracking-wider uppercase"
                                style={{ color: 'rgba(255,255,255,0.35)' }}>
                                Lot {team.lotNo}
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                          <p className="font-bold text-lg text-white truncate">{team.name}</p>
                          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            Coach: {team.coach?.name || 'N/A'}
                          </p>
                          {scoredCount > 0 && (
                            <p className="text-xs mt-1.5" style={{ color: J.green }}>
                              {scoredCount} of {teamPlayers.length} scored
                            </p>
                          )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 font-semibold">
                            {teamPlayers.length} {teamPlayers.length === 1 ? 'Player' : 'Players'}
                          </span>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 text-white/40">
                            <ChevronRight className="w-5 h-5" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 flex flex-col items-center flex-1 justify-center rounded-2xl border border-white/5 bg-white/5">
                <Users className="w-12 h-12 mb-4 text-white/20" />
                <p className="text-lg font-bold text-white/70">No teams found</p>
                <p className="text-sm text-white/40 mt-2 max-w-sm text-center">
                  {searchQuery 
                    ? "No teams match your search query." 
                    : "There are no teams submitted for this competition category yet."}
                </p>
              </div>
            )}
          </FadeIn>
        )}
      </main>

      {/* Selection Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            
            <motion.div 
              className="bg-[#0f0f0f] border border-purple-500/30 rounded-3xl w-full max-w-xl shadow-2xl relative my-8"
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
              
              {/* If we already made a selection once, we can cancel changing it */}
              {selectedCompetitionType && isSelectionComplete && (
                <button 
                  onClick={() => setShowModal(false)}
                  className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}

              <div className="p-8 space-y-8">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                    <Filter className="w-6 h-6 text-purple-400" />
                  </div>
                  <h2 className="text-2xl font-black text-white">Select Judging Category</h2>
                  <p className="text-white/50 text-sm mt-2">Choose the competition context you are judging for right now.</p>
                </div>

                {/* Fixed or Selectable Assignments */}
                <div className="space-y-4">
                  {/* Gender Selection or Display */}
                  {availableGenders.length > 1 ? (
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase text-purple-400 mb-3 ml-1">Gender</p>
                      <div className="grid grid-cols-2 gap-3">
                        {availableGenders.map(g => (
                          <SelectBtn key={g} selected={selectedGender === g} onClick={() => setSelectedGender(g)}>
                            <span>{g}</span>
                          </SelectBtn>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-1">Assigned Gender</p>
                      <p className="font-bold text-white">{availableGenders[0] || judgeInfo.gender}</p>
                    </div>
                  )}

                  {/* Age Group Selection or Display */}
                  {availableAgeGroups.length > 1 ? (
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase text-purple-400 mb-3 ml-1">Age Group</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {availableAgeGroups.map(ag => (
                          <SelectBtn key={ag} selected={selectedAgeGroup === ag} onClick={() => setSelectedAgeGroup(ag)}>
                            <span>{ag}</span>
                          </SelectBtn>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-1">Assigned Age Group</p>
                      <p className="font-bold text-white">{availableAgeGroups[0] || judgeInfo.ageGroup}</p>
                    </div>
                  )}
                </div>

                {/* Competition Type */}
                <div>
                  <p className="text-xs font-bold tracking-widest uppercase text-purple-400 mb-3 ml-1">Competition Type</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {competitionTypes
                      .filter(ct => {
                        // Every seat this judge holds in the chosen gender and
                        // age group has a say: someone seated for Competition I
                        // and Competition III must be offered both, and a seat
                        // with no competition types (routine for a Scorer)
                        // covers all of them.
                        const seats = (judgeInfo.allAssignments?.length
                          ? judgeInfo.allAssignments
                          : [judgeInfo]
                        ).filter((seat) => {
                          const gender = selectedGender || judgeInfo.gender;
                          const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
                          if (gender && seat.gender && seat.gender !== gender) return false;
                          if (ageGroup && seat.ageGroup && seat.ageGroup !== ageGroup) return false;
                          return true;
                        });

                        return seats.some((seat) => {
                          const types = seat.competitionTypes || [];
                          return types.length === 0 || types.includes(ct.value);
                        });
                      })
                      .map(ct => (
                        <SelectBtn key={ct.value} selected={selectedCompetitionType === ct.value}
                          onClick={() => { 
                            setSelectedCompetitionType(ct.value); 
                            setSelectedApparatus(''); // Reset apparatus when competition changes
                          }}>
                          <div>
                            <p>{ct.label}</p>
                            <p className="text-[10px] font-normal text-white/40 uppercase tracking-widest mt-0.5">{ct.sub}</p>
                          </div>
                        </SelectBtn>
                      ))}
                  </div>
                </div>

                {/* Apparatus (If needed) */}
                <AnimatePresence mode="wait">
                  {needsApparatus && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }} 
                      animate={{ height: 'auto', opacity: 1 }} 
                      exit={{ height: 0, opacity: 0 }} 
                      className="overflow-hidden">
                      <div className="pt-2">
                        <p className="text-xs font-bold tracking-widest uppercase text-purple-400 mb-3 ml-1">Apparatus</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {apparatusOptions.map(app => (
                            <SelectBtn key={app} selected={selectedApparatus === app} onClick={() => setSelectedApparatus(app)}>
                              <span>{app}</span>
                            </SelectBtn>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Confirm Button */}
                <div className="pt-4 border-t border-white/10">
                  <button 
                    onClick={handleConfirmSelection}
                    disabled={!isSelectionComplete}
                    className="w-full py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: isSelectionComplete ? `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})` : 'rgba(255,255,255,0.1)' }}>
                    {isSelectionComplete ? (
                      <>Continue to Dashboard <ChevronRight className="w-5 h-5" /></>
                    ) : (
                      'Please complete selection'
                    )}
                  </button>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default JudgeDashboard;
