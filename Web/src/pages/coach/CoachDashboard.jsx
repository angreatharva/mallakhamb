import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Users, UserPlus, Search, Trash2, X, Check, CheckCircle, LogOut, User, Save, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { coachAPI } from '@/services/api';
import { useAgeGroups, useAgeGroupValues } from '../../hooks/useAgeGroups';
import Dropdown from '@/components/auth/Dropdown';
import { useCompetition } from '../../contexts/CompetitionContext';
import { useAuth } from '../../contexts/AuthContext';
import CompetitionDisplay from '@/components/competition/CompetitionDisplay';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import CompetitionSelector from '@/components/competition/CompetitionSelector';
import { COLORS, DATA_COLORS, FG, SAFFRON_CTA, alpha } from '@/styles/tokens';
import { apparatusFor, offeredApparatus } from '@/utils/scoring/apparatus';
import { countedScoresFor } from '@/utils/scoring/teamSize';
import { useReducedMotion } from '@/hooks/useResponsive';
import { FadeIn } from '@/components/design-system';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import PerformancePanel from '@/components/performance/PerformancePanel';

const CoachDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading: competitionLoading, clearCompetitionContext } = useCompetition();
  const { logout } = useAuth();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState(null);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(null);
  const [selectedGender, setSelectedGender] = useState(null);
  /*
   * The apparatus an athlete is entered for — a LIST, because one athlete can
   * compete on several and is judged separately on each. It was a single value
   * until multi-apparatus entry, and everything downstream (the score sheet the
   * judge is shown, the panel roster, the standings) keys off it.
   */
  const [selectedApparatus, setSelectedApparatus] = useState([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showTeamSummary, setShowTeamSummary] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const urlCompetitionHandledRef = useRef(false);
  useReducedMotion(); // Initialize for accessibility

  const clearCompetitionIdFromUrl = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('competitionId')) return;
    searchParams.delete('competitionId');
    const newSearch = searchParams.toString();
    navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // Load user data
  useEffect(() => {
    const userData = secureStorage.getItem('coach_user');
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        logger.error('Failed to parse user data:', e);
      }
    }
  }, []);

  // Apply ?competitionId= from login only once — never fight later dropdown switches
  useEffect(() => {
    const competitionIdFromUrl = new URLSearchParams(location.search).get('competitionId');

    if (
      competitionIdFromUrl &&
      currentCompetition &&
      String(currentCompetition._id) !== String(competitionIdFromUrl)
    ) {
      clearCompetitionIdFromUrl();
      urlCompetitionHandledRef.current = true;
      return;
    }

    if (competitionIdFromUrl && assignedCompetitions?.length > 0 && !urlCompetitionHandledRef.current) {
      urlCompetitionHandledRef.current = true;
      const competition = assignedCompetitions.find(
        (c) => String(c._id) === String(competitionIdFromUrl)
      );

      if (competition && (!currentCompetition || String(currentCompetition._id) !== String(competitionIdFromUrl))) {
        logger.info('Setting competition from URL parameter', {
          competitionId: competitionIdFromUrl,
          competitionName: competition.name,
        });
        switchCompetition(competitionIdFromUrl)
          .catch((error) => {
            logger.error('Failed to set competition from URL:', error);
          })
          .finally(() => {
            clearCompetitionIdFromUrl();
          });
        return;
      }

      clearCompetitionIdFromUrl();
    }
  }, [
    location.search,
    assignedCompetitions,
    currentCompetition,
    switchCompetition,
    clearCompetitionIdFromUrl,
  ]);

  // Redirect to competition selection if no competition is set
  useEffect(() => {
    // Wait for competition context to finish loading
    if (competitionLoading) return;
    
    // Check if we have a competitionId in the URL (coming from selection page)
    const urlParams = new URLSearchParams(location.search);
    const competitionIdFromUrl = urlParams.get('competitionId');
    
    // If we have a competitionId in URL, give more time for the context to load
    // The CompetitionProvider should pick up the competition from localStorage
    if (competitionIdFromUrl) {
      // Check if the competition is already set
      if (currentCompetition && currentCompetition._id === competitionIdFromUrl) {
        // Competition is set, remove URL parameter
        clearCompetitionIdFromUrl();
        return;
      }
      
      // Still waiting for competition to be set
      logger.info('Competition ID in URL, waiting for context to load', { competitionIdFromUrl });
      return;
    }
    
    // If no current competition and no URL parameter, redirect to selection
    if (!currentCompetition) {
      logger.info('No competition context, redirecting to competition selection');
      navigate('/coach/select-competition', { replace: true });
    }
  }, [currentCompetition, competitionLoading, navigate, location.search]);

  // Scroll handler for navbar
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
  };

  const genders = [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }];
  const ageGroupLimits = {
    'Under10': { minAge: 0, maxAge: 9 }, 'Under12': { minAge: 0, maxAge: 11 },
    'Under14': { minAge: 0, maxAge: 13 }, 'Under16': { minAge: 0, maxAge: 15 },
    'Under18': { minAge: 0, maxAge: 17 }, 'Above16': { minAge: 16, maxAge: 100 },
    'Above18': { minAge: 18, maxAge: 100 },
  };

  const competitionAgeGroups = useAgeGroups(selectedGender?.value || 'Male');
  const maleAgeGroupValues = useAgeGroupValues('Male');
  const femaleAgeGroupValues = useAgeGroupValues('Female');

  useEffect(() => { 
    if (currentCompetition) {
      fetchTeamDashboard(); 
    }
  }, [currentCompetition?._id]);
  useEffect(() => { if (selectedGender && selectedPlayerData) setSelectedAgeGroup(null); }, [selectedGender, selectedPlayerData]);

  /*
   * What this meet runs for the athlete's gender, across every competition
   * type — the superadmin configures Male and Female separately. A meet saved
   * before that split falls back to its per-type list, less Hanging Mallakhamb
   * for women (COP §11 / 1.8.2). The athlete is picked before the apparatus,
   * so the gender is always known here. The server narrows each competition
   * type to what that type offers.
   */
  const apparatusOptions = (selectedGender ? offeredApparatus(currentCompetition, null, selectedGender.value) : [])
    .map(app => ({ value: app, label: app }));

  /**
   * How a stored apparatus reads on screen.
   *
   * The field is Mixed and all three shapes reach here, so this goes through
   * the shared reader rather than testing for them again. It used to test for
   * a string and an array and return '' for anything else — which blanked
   * every athlete's apparatus on this dashboard the moment the server started
   * writing the canonical per-competition-type object.
   *
   * No competition type is passed on purpose: this is "what is this athlete
   * entered for", across every category. De-duplicated, because an athlete
   * entered for the same apparatus in two categories appears twice in the
   * flattened object and reads as "Pole · Pole".
   */
  const apparatusLabel = (apparatus) =>
    [...new Set(apparatusFor({ apparatus }))].join(' · ');

  const toggleApparatus = (value) => {
    setSelectedApparatus(current => (
      current.includes(value) ? current.filter(a => a !== value) : [...current, value]
    ));
  };

  const calculateAge = (dob) => {
    const today = new Date(), birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const getAvailableAgeGroups = (gender, playerAge) => {
    // Add age limits to each age group
    const ageGroups = competitionAgeGroups.map(ag => ({ ...ag, ...ageGroupLimits[ag.value] }));
    
    // Filter age groups where the player is eligible
    // A player can play in ANY category where they meet the age requirement
    const eligibleGroups = ageGroups.filter(ag => {
      if (ag.value.startsWith('Under')) {
        // For "Under" categories, player age must be <= maxAge
        return playerAge <= ag.maxAge;
      } else if (ag.value.startsWith('Above')) {
        // For "Above" categories, player can play regardless of age
        // (they can play up in higher age categories)
        return true;
      }
      return false;
    });
    
    // Sort the eligible groups: Under categories first (by maxAge), then Above categories (by minAge)
    return eligibleGroups.sort((a, b) => {
      if (a.value.startsWith('Under') && b.value.startsWith('Under')) {
        return a.maxAge - b.maxAge;
      }
      if (a.value.startsWith('Above') && b.value.startsWith('Above')) {
        return a.minAge - b.minAge;
      }
      // Under categories come before Above categories
      return a.value.startsWith('Under') ? -1 : 1;
    });
  };

  const fetchTeamDashboard = async () => {
    try {
      const response = await coachAPI.getDashboard();
      console.log('Dashboard full response:', response);
      console.log('response.data:', response.data);
      console.log('response.data.data:', response.data?.data);
      console.log('response.data.data.team:', response.data?.data?.team);
      console.log('response.data.team:', response.data?.team);
      
      // Try multiple possible structures
      let teamData = null;
      
      if (response.data?.data?.team !== undefined) {
        teamData = response.data.data.team;
        console.log('Using response.data.data.team');
      } else if (response.data?.team !== undefined) {
        teamData = response.data.team;
        console.log('Using response.data.team');
      }
      
      console.log('Final team data:', teamData);
      setTeam(teamData);
    } catch (error) { 
      console.error('Failed to load team dashboard:', error);
      toast.error('Failed to load team dashboard'); 
    }
    finally { setLoading(false); }
  };

  const handleSearchPlayers = async (query) => {
    if (query.length < 2) { setPlayers([]); return; }
    setSearchLoading(true);
    try {
      const response = await coachAPI.searchPlayers(query);
      // API returns: { success: true, data: [...players] }
      const playersData = response.data?.data || [];
      setPlayers(playersData);
    } catch { toast.error('Failed to search players'); }
    finally { setSearchLoading(false); }
  };

  const handlePlayerSelect = (player) => {
    if (!player.dateOfBirth) { toast.error('Player date of birth is missing.'); return; }
    const age = calculateAge(player.dateOfBirth);
    setSelectedPlayer({ value: player._id, label: `${player.firstName} ${player.lastName}` });
    setSelectedPlayerData({ ...player, age });
    setSelectedGender(genders.find(g => g.value === player.gender));
    setSelectedAgeGroup(null);
  };

  const handleAddPlayer = async () => {
    if (!selectedPlayer || !selectedAgeGroup || !selectedGender || !selectedPlayerData || selectedApparatus.length === 0) {
      return toast.error('Please select player, age group, and at least one apparatus');
    }
    const { age } = selectedPlayerData;
    // The server enforces the cap; checking here saves the coach a round trip.
    if (team?.maxTeamSize) {
      const inCategory = (team.players || []).filter((p) =>
        p.gender === selectedGender.value && p.ageGroup === selectedAgeGroup.value
        && String(p.player?._id || p.player) !== String(selectedPlayer.value)
      ).length;
      if (inCategory >= team.maxTeamSize) {
        return toast.error(`This competition allows at most ${team.maxTeamSize} players per age group — ${selectedAgeGroup.label} is full`);
      }
    }
    if (selectedAgeGroup.value.startsWith('Under') && age > selectedAgeGroup.maxAge) {
      return toast.error(`Player is ${age} years old and cannot play in ${selectedAgeGroup.label} (max: ${selectedAgeGroup.maxAge})`);
    }
    try {
      await coachAPI.addPlayerToAgeGroup({ 
        playerId: selectedPlayer.value, 
        ageGroup: selectedAgeGroup.value, 
        gender: selectedGender.value,
        apparatus: selectedApparatus
      });
      toast.success('Player added to age group successfully!');
      handleCloseModal();
      fetchTeamDashboard();
    } catch (error) { toast.error(error.response?.data?.message || 'Failed to add player'); }
  };

  const handleCloseModal = () => {
    setShowAddPlayer(false); setSelectedPlayer(null); setSelectedPlayerData(null);
    setSelectedAgeGroup(null); setSelectedGender(null); setSelectedApparatus([]); setSearchQuery(''); setPlayers([]);
  };

  const handleRemovePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from the age group?')) return;
    try {
      await coachAPI.removePlayerFromAgeGroup(playerId);
      toast.success('Player removed successfully!');
      fetchTeamDashboard();
    } catch { toast.error('Failed to remove player'); }
  };

  const handleSaveDraft = async () => {
    if (!team) return;
    setSavingDraft(true);
    try {
      await fetchTeamDashboard();
      toast.success('Team draft saved to database! Roster will persist across devices and sessions.');
    } catch (error) {
      toast.error('Failed to save team draft to database.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDragStart = (e, playerItem, gender, ageGroup) => {
    if (team?.isSubmitted) return;
    const dragPayload = {
      playerId: playerItem.player._id,
      firstName: playerItem.player.firstName,
      lastName: playerItem.player.lastName,
      dateOfBirth: playerItem.player.dateOfBirth,
      gender: playerItem.gender || gender,
      currentAgeGroup: ageGroup,
      apparatus: playerItem.apparatus,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragPayload));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropPlayer = async (e, targetGender, targetAgeGroup) => {
    if (team?.isSubmitted) return;
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      const data = JSON.parse(rawData);

      if (data.gender !== targetGender) {
        toast.error(`Cannot move ${data.firstName} (${data.gender}) to ${targetGender} category.`);
        return;
      }

      if (data.currentAgeGroup === targetAgeGroup) return;

      if (!data.dateOfBirth) {
        toast.error(`${data.firstName}'s date of birth is missing.`);
        return;
      }

      const playerAge = calculateAge(data.dateOfBirth);
      const limits = ageGroupLimits[targetAgeGroup];

      if (targetAgeGroup.startsWith('Under') && limits && playerAge > limits.maxAge) {
        toast.error(
          `${data.firstName} is ${playerAge} yrs old and cannot play in ${getAgeGroupDisplay(targetAgeGroup)} (max age: ${limits.maxAge})`
        );
        return;
      }

      if (targetAgeGroup.startsWith('Above') && limits && playerAge < limits.minAge) {
        toast.error(
          `${data.firstName} is ${playerAge} yrs old and cannot play in ${getAgeGroupDisplay(targetAgeGroup)} (min age: ${limits.minAge})`
        );
        return;
      }

      toast.loading(`Moving ${data.firstName} to ${getAgeGroupDisplay(targetAgeGroup)}...`, { id: 'move-player' });

      await coachAPI.addPlayerToAgeGroup({
        playerId: data.playerId,
        ageGroup: targetAgeGroup,
        gender: targetGender,
        apparatus: data.apparatus,
      });

      toast.success(`${data.firstName} moved to ${getAgeGroupDisplay(targetAgeGroup)}!`, { id: 'move-player' });
      fetchTeamDashboard();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to move player', { id: 'move-player' });
    }
  };

  const getAgeGroupDisplay = (ag) => ({
    'Under10': 'Under 10', 'Under12': 'Under 12', 'Under14': 'Under 14',
    'Under16': 'Under 16', 'Under18': 'Under 18', 'Above18': 'Above 18', 'Above16': 'Above 16',
  }[ag] || ag);

  const getPlayersByAgeGroup = () => {
    if (!team?.players) return {};
    return team.players.reduce((acc, p) => {
      const key = `${p.gender}_${p.ageGroup}`;
      acc[key] = [...(acc[key] || []), p];
      return acc;
    }, {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: `${alpha(COLORS.saffron, 0x40)}`, borderTopColor: COLORS.saffron }} />
          <p className="text-fg-muted text-sm">Loading team dashboard...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* Navbar */}
        <motion.nav
          className="fixed top-0 left-0 right-0 z-50"
          style={{
            background: scrolled ? 'rgb(var(--bg) / 0.94)' : 'rgb(var(--bg) / 0.75)',
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${scrolled ? COLORS.darkBorder : 'transparent'}`,
            transition: 'background 0.3s, border-color 0.3s',
          }}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <motion.div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
                whileHover={{ scale: 1.08, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Trophy className="w-4 h-4 text-white" aria-hidden="true" />
              </motion.div>
              <span className="text-white font-bold text-sm tracking-wide hidden sm:block">
                Mallakhamb<span style={{ color: FG.brand }}>India</span>
              </span>
            </div>

            {/* Right: Competition Selector + User info + Logout */}
            <div className="flex items-center gap-2">
              <CompetitionSelector userType="coach" />
              {user && (
                <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border"
                  style={{ borderColor: COLORS.darkBorderSubtle, background: 'rgb(var(--ink) / 0.04)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: `${alpha(COLORS.saffron, 0x20)}` }}>
                    <User className="w-3.5 h-3.5" style={{ color: FG.brandSoft }} aria-hidden="true" />
                  </div>
                  <span className="text-white/80 text-sm font-medium">{user.firstName || user.name}</span>
                </div>
              )}
              <motion.button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold border transition-colors min-h-[44px] tap-safe justify-center"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: FG.danger, background: 'rgba(239,68,68,0.06)' }}
                whileHover={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.5)' }}
                whileTap={{ scale: 0.96 }}
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden md:inline">Logout</span>
              </motion.button>
            </div>
          </div>
        </motion.nav>

        <div className="max-w-4xl mx-auto px-4 py-10 pt-24">
          <CompetitionDisplay className="mb-8" />
          <CompetitionLockBanner className="mb-8" />
          <div className="rounded-3xl border p-12 text-center"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <Trophy className="w-16 h-16 mx-auto mb-4 text-white/20" aria-hidden="true" />
            <h2 className="text-2xl font-black text-white mb-2">No Team Registered</h2>
            <p className="text-fg-muted mb-6">You don&apos;t have a team registered for this competition yet.</p>
            <button onClick={() => window.location.href = '/coach/select-competition'}
              className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px] inline-flex items-center gap-2"
              style={SAFFRON_CTA}>
              <Trophy className="w-4 h-4" aria-hidden="true" />
              Select Team for Competition
            </button>
          </div>
        </div>
      </div>
    );
  }

  const playersByAgeGroup = getPlayersByAgeGroup();

  const AgeGroupCard = ({ ageGroup, gender, accentColor }) => {
    const key = `${gender}_${ageGroup}`;
    const groupPlayers = playersByAgeGroup[key] || [];
    const [isDragOver, setIsDragOver] = useState(false);

    return (
      <div
        className={`rounded-xl border p-4 transition-all duration-200 ${
          isDragOver ? 'ring-2 ring-saffron scale-[1.01]' : ''
        }`}
        style={{
          background: isDragOver ? `${alpha(accentColor, 0x12)}` : 'rgb(var(--ink) / 0.02)',
          borderColor: isDragOver ? accentColor : COLORS.darkBorderSubtle,
        }}
        onDragOver={(e) => {
          if (team?.isSubmitted) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          if (team?.isSubmitted) return;
          setIsDragOver(false);
          handleDropPlayer(e, gender, ageGroup);
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-semibold text-sm">
            {getAgeGroupDisplay(ageGroup)} {gender === 'Male' ? 'Boys' : 'Girls'}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${alpha(accentColor, 0x18)}`, color: accentColor, border: `1px solid ${alpha(accentColor, 0x30)}` }}
          >
            {team?.maxTeamSize ? `${groupPlayers.length} / ${team.maxTeamSize}` : groupPlayers.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {groupPlayers.map((player, idx) => (
            <div
              key={idx}
              draggable={!team?.isSubmitted}
              onDragStart={(e) => handleDragStart(e, player, gender, ageGroup)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                !team?.isSubmitted ? 'cursor-grab active:cursor-grabbing hover:bg-white/10' : ''
              }`}
              style={{ background: 'rgb(var(--ink) / 0.03)' }}
            >
              <div className="flex items-center min-w-0 flex-1">
                {!team?.isSubmitted && (
                  <GripVertical className="w-3.5 h-3.5 mr-1.5 text-white/30 flex-shrink-0" aria-hidden="true" />
                )}
                <span className="text-white/70 text-sm truncate">
                  {player.player.firstName} {player.player.lastName}
                  {apparatusLabel(player.apparatus) ? <span className="ml-2 text-xs opacity-60">({apparatusLabel(player.apparatus)})</span> : null}
                </span>
              </div>
              <button
                onClick={() => handleRemovePlayer(player.player._id)}
                disabled={team?.isSubmitted}
                className="ml-2 p-1.5 rounded-lg transition-colors tap-safe mouse:min-h-[36px] mouse:min-w-[36px] flex items-center justify-center flex-shrink-0"
                style={{ color: team?.isSubmitted ? 'rgb(var(--ink) / 0.2)' : FG.danger }}
                title={team?.isSubmitted ? 'Cannot remove after submission' : 'Remove player'}
                aria-label={`Remove ${player.player.firstName} ${player.player.lastName}`}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {groupPlayers.length === 0 && (
            <p className="text-fg-muted text-xs italic px-1">
              {team?.isSubmitted ? 'No players assigned' : 'No players assigned · Drag player here'}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Navbar */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: scrolled ? 'rgb(var(--bg) / 0.94)' : 'rgb(var(--bg) / 0.75)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${scrolled ? COLORS.darkBorder : 'transparent'}`,
          transition: 'background 0.3s, border-color 0.3s',
        }}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <motion.div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
              whileHover={{ scale: 1.08, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Trophy className="w-4 h-4 text-white" aria-hidden="true" />
            </motion.div>
            <span className="text-white font-bold text-sm tracking-wide hidden sm:block">
              Mallakhamb<span style={{ color: FG.brand }}>India</span>
            </span>
          </div>

          {/* Right: Competition Selector + User info + Logout */}
          <div className="flex items-center gap-2">
            <CompetitionSelector userType="coach" />
            {user && (
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl border"
                style={{ borderColor: COLORS.darkBorderSubtle, background: 'rgb(var(--ink) / 0.04)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${alpha(COLORS.saffron, 0x20)}` }}>
                  <User className="w-3.5 h-3.5" style={{ color: FG.brandSoft }} aria-hidden="true" />
                </div>
                <span className="text-white/80 text-sm font-medium">{user.firstName || user.name}</span>
              </div>
            )}
            <motion.button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold border transition-colors min-h-[44px] tap-safe justify-center"
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: FG.danger, background: 'rgba(239,68,68,0.06)' }}
              whileHover={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.5)' }}
              whileTap={{ scale: 0.96 }}
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="hidden md:inline">Logout</span>
            </motion.button>
          </div>
        </div>
      </motion.nav>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 pt-24">
        <CompetitionDisplay className="mb-8" />
        <CompetitionLockBanner className="mb-8" />

        {/* Header card */}
        <FadeIn className="mb-6">
          <div className="rounded-3xl border p-6 md:p-8"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `1px solid ${alpha(COLORS.saffron, 0x28)}` }}>
                  <Trophy className="w-7 h-7" style={{ color: FG.brand }} aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-white">{team.name}</h1>
                  <p className="text-fg-muted text-sm">
                    Team Dashboard
                    {team.maxTeamSize && (
                      <> · max {team.maxTeamSize} players per age group (best {countedScoresFor(team.maxTeamSize)} count)</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <motion.button
                  onClick={handleSaveDraft}
                  disabled={savingDraft || team?.isSubmitted}
                  className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] transition-all duration-200 border disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    borderColor: 'rgb(var(--ink) / 0.15)',
                    background: 'rgb(var(--ink) / 0.06)',
                  }}
                  whileHover={team?.isSubmitted ? {} : { scale: 1.02, background: 'rgba(255,255,255,0.1)' }}
                  whileTap={team?.isSubmitted ? {} : { scale: 0.98 }}>
                  <Save className="w-4 h-4" aria-hidden="true" />
                  {savingDraft ? 'Saving...' : 'Save Team'}
                </motion.button>
                <motion.button onClick={() => setShowAddPlayer(true)}
                  disabled={team?.isSubmitted}
                  className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={SAFFRON_CTA}
                  whileHover={team?.isSubmitted ? {} : { scale: 1.02 }}
                  whileTap={team?.isSubmitted ? {} : { scale: 0.98 }}>
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add Player
                </motion.button>
                <motion.button 
                  onClick={() => {
                    if (team?.isSubmitted) {
                      toast.error('Team already submitted. Contact admin to make changes.');
                      return;
                    }
                    if (!team?.players?.length) {
                      toast.error('Please add at least one player before submitting.');
                      return;
                    }
                    setShowTeamSummary(true);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 min-h-[44px] transition-all duration-200"
                  style={{ 
                    background: team?.isSubmitted 
                      ? 'rgb(var(--ink) / 0.1)' 
                      : SAFFRON_CTA.background,
                    color: team?.isSubmitted ? undefined : SAFFRON_CTA.color,
                    opacity: team?.isSubmitted ? 0.6 : 1,
                    cursor: team?.isSubmitted ? 'not-allowed' : 'pointer'
                  }}
                  whileHover={team?.isSubmitted ? {} : { scale: 1.02 }}
                  whileTap={team?.isSubmitted ? {} : { scale: 0.98 }}>
                  {team?.isSubmitted ? (
                    <>
                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                      Team Submitted
                    </>
                  ) : (
                    <>
                      <Trophy className="w-4 h-4" aria-hidden="true" />
                      Pay Fees
                    </>
                  )}
                </motion.button>
              </div>
            </div>
            {team.description && <p className="mt-4 text-fg-muted text-sm">{team.description}</p>}
            {team?.isSubmitted && (
              <div className="mt-4 p-3 rounded-xl flex items-center gap-2"
                style={{ background: `${alpha(COLORS.saffron, 0x10)}`, border: `1px solid ${alpha(COLORS.saffron, 0x25)}` }}>
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: FG.brand }} aria-hidden="true" />
                <p className="text-sm" style={{ color: FG.brandSoft }}>
                  Team has been submitted. Contact Admin to make changes.
                </p>
              </div>
            )}
          </div>
        </FadeIn>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { icon: Users, label: 'Total Players', value: team.players?.length || 0, color: DATA_COLORS.blue },
            { icon: Trophy, label: 'Age Groups', value: Object.keys(playersByAgeGroup).length, color: FG.brand },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <FadeIn key={label} delay={i * 0.05}>
              <div className="rounded-2xl border p-5 flex items-center gap-4"
                style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${alpha(color, 0x18)}` }}>
                  <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-fg-muted text-xs uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-black text-white">{value}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Age group grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FadeIn delay={0.1}>
            <div className="rounded-3xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" aria-hidden="true" />
                Boys Age Groups
              </h2>
              <div className="space-y-3">
                {maleAgeGroupValues.map(ag => (
                  <AgeGroupCard key={ag} ageGroup={ag} gender="Male" accentColor={DATA_COLORS.blue} />
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="rounded-3xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-lg font-black text-white mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" aria-hidden="true" />
                Girls Age Groups
              </h2>
              <div className="space-y-3">
                {femaleAgeGroupValues.map(ag => (
                  <AgeGroupCard key={ag} ageGroup={ag} gender="Female" accentColor={DATA_COLORS.pink} />
                ))}
              </div>
            </div>
          </FadeIn>
        </div>

        {/* Team Performance Section */}
        {team?._id && currentCompetition && (
          <div className="mt-6">
            <PerformancePanel
              competitionId={currentCompetition._id}
              competitionTypes={currentCompetition.competitionTypes || []}
              apparatusConfig={currentCompetition.apparatusConfig || {}}
              teamId={team._id}
              title="Team Performance"
              emptyLabel="No finalized scores for this competition yet."
            />
          </div>
        )}
      </div>

      {/* Team Summary Modal */}
      <AnimatePresence>
        {showTeamSummary && (
          <motion.div className="modal-overlay z-50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowTeamSummary(false)} />
            <motion.div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border modal-panel"
              style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
              <div className="sticky top-0 flex items-center justify-between p-6 border-b"
                style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}>
                <h3 className="text-xl font-black text-white">Team Summary — {team.name}</h3>
                <button onClick={() => setShowTeamSummary(false)}
                  className="p-2 rounded-xl text-fg-muted hover:text-fg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={{ border: `1px solid ${COLORS.darkBorderSubtle}` }} aria-label="Close">
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-4 rounded-2xl" style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                  <p className="text-white/70 text-sm"><span className="text-white font-semibold">Team:</span> {team.name}</p>
                  <p className="text-white/70 text-sm mt-1"><span className="text-white font-semibold">Total Players:</span> {team.players?.length || 0}</p>
                  {team?.isSubmitted && (
                    <div className="mt-3 flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: `${alpha(COLORS.saffron, 0x10)}`, border: `1px solid ${alpha(COLORS.saffron, 0x25)}` }}>
                      <CheckCircle className="w-4 h-4" style={{ color: FG.brand }} aria-hidden="true" />
                      <p className="text-sm" style={{ color: FG.brandSoft }}>Team Submitted</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[{ label: 'Boys', values: maleAgeGroupValues, gender: 'Male', color: DATA_COLORS.blue },
                    { label: 'Girls', values: femaleAgeGroupValues, gender: 'Female', color: DATA_COLORS.pink }].map(({ label, values, gender, color }) => (
                    <div key={gender}>
                      <h4 className="font-bold text-sm mb-3" style={{ color }}>{label} Age Groups</h4>
                      <div className="space-y-2">
                        {values.map(ag => {
                          const gPlayers = playersByAgeGroup[`${gender}_${ag}`] || [];
                          return (
                            <div key={ag} className="p-3 rounded-xl border"
                              style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: COLORS.darkBorderSubtle }}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-white text-sm font-semibold">{getAgeGroupDisplay(ag)}</span>
                                <span className="text-fg-muted text-xs">{gPlayers.length} players</span>
                              </div>
                              {gPlayers.length > 0
                                ? gPlayers.map((p, i) => (
                                    <p key={i} className="text-fg-muted text-xs">
                                      {p.player.firstName} {p.player.lastName}
                                      {apparatusLabel(p.apparatus) ? <span className="opacity-60 ml-1">({apparatusLabel(p.apparatus)})</span> : null}
                                    </p>
                                  ))
                                : <p className="text-fg-muted text-xs italic">No players</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-4 border-t" style={{ borderColor: COLORS.darkBorderSubtle }}>
                  <button onClick={() => setShowTeamSummary(false)}
                    className="px-6 py-3 rounded-xl text-white/60 hover:text-white/80 border transition-colors min-h-[44px]"
                    style={{ borderColor: COLORS.darkBorderSubtle }}>
                    Cancel
                  </button>
                  {team?.isSubmitted ? (
                    <div className="px-6 py-3 rounded-xl text-center min-h-[44px] flex items-center justify-center"
                      style={{ background: `${alpha(COLORS.saffron, 0x15)}`, color: FG.brandSoft, border: `1px solid ${alpha(COLORS.saffron, 0x30)}` }}>
                      Team Already Submitted
                    </div>
                  ) : (
                    <button 
                      onClick={() => {
                        setShowTeamSummary(false);
                        setShowSubmitWarning(true);
                      }}
                      className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px]"
                      style={SAFFRON_CTA}>
                      Proceed to Payment
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Warning Modal */}
      <AnimatePresence>
        {showSubmitWarning && (
          <motion.div className="modal-overlay z-50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              onClick={() => setShowSubmitWarning(false)} />
            <motion.div className="relative w-full max-w-md rounded-3xl border modal-panel"
              style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
              <div className="p-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `1px solid ${alpha(COLORS.saffron, 0x28)}` }}>
                  <Trophy className="w-7 h-7" style={{ color: FG.brand }} aria-hidden="true" />
                </div>
                <h3 className="text-xl font-black text-white text-center mb-3">Submit Team for Competition?</h3>
                <div className="space-y-3 mb-6">
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)' }}>
                    <p className="text-sm text-white/80 leading-relaxed">
                      ⚠️ <strong>Important:</strong> Once you complete the payment and submit your team, it will be <strong>locked</strong>.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                    <p className="text-sm text-white/70 leading-relaxed">
                      You will <strong>not be able to add or remove players</strong> after submission. To make any changes, you&apos;ll need to contact the admin.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ background: `${alpha(COLORS.saffron, 0x10)}`, border: `1px solid ${alpha(COLORS.saffron, 0x25)}` }}>
                    <p className="text-xs text-center" style={{ color: FG.brandSoft }}>
                      Please review your team carefully before proceeding
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => {
                      setShowSubmitWarning(false);
                      navigate('/coach/payment');
                    }}
                    className="w-full py-3 rounded-xl font-bold text-white min-h-[44px]"
                    style={SAFFRON_CTA}>
                    I Understand, Proceed to Payment
                  </button>
                  <button 
                    onClick={() => setShowSubmitWarning(false)}
                    className="w-full py-3 rounded-xl text-white/60 hover:text-white/80 border transition-colors min-h-[44px]"
                    style={{ borderColor: COLORS.darkBorderSubtle }}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Player Modal */}
      <AnimatePresence>
        {showAddPlayer && (
          <motion.div className="modal-overlay z-50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              onClick={handleCloseModal} />
            <motion.div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border modal-panel"
              style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.25 }}>
              <div className="sticky top-0 flex items-center justify-between p-6 border-b"
                style={{ background: COLORS.darkElevated, borderColor: COLORS.darkBorderSubtle }}>
                <h3 className="text-lg font-black text-white">Add Player to Age Group</h3>
                <button onClick={handleCloseModal}
                  className="p-2 rounded-xl text-fg-muted hover:text-fg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  style={{ border: `1px solid ${COLORS.darkBorderSubtle}` }} aria-label="Close">
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <div className="p-6 space-y-5">
                {/* Search */}
                <div>
                  <label htmlFor="player-search" className="block text-xs font-semibold tracking-wide uppercase mb-2"
                    style={{ color: FG.brandSoft }}>Search Players</label>
                  <div className="relative">
                    <input id="player-search" type="text" value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); handleSearchPlayers(e.target.value); }}
                      className="w-full px-4 py-3 pr-10 rounded-xl text-white placeholder-white/25 min-h-[44px]"
                      style={{ background: 'rgb(var(--ink) / 0.05)', border: `1px solid ${COLORS.darkBorderSubtle}` }}
                      onFocus={e => e.target.style.borderColor = COLORS.saffron}
                      onBlur={e => e.target.style.borderColor = COLORS.darkBorderSubtle}
                      placeholder="Search by name" />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
                  </div>
                  {searchLoading && <p className="text-fg-muted text-xs mt-1">Searching...</p>}
                  {players.length > 0 && (
                    <div className="mt-2 rounded-xl border overflow-hidden max-h-40 overflow-y-auto"
                      style={{ borderColor: COLORS.darkBorderSubtle }}>
                      {players.map((player, i) => (
                        <button key={i} onClick={() => handlePlayerSelect(player)}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 border-b last:border-b-0 transition-colors min-h-[44px]"
                          style={{ borderColor: COLORS.darkBorderSubtle }}>
                          <p className="text-white font-medium text-sm">{player.firstName} {player.lastName}</p>
                          <p className="text-fg-muted text-xs">{player.email} · {player.gender} · Age: {player.dateOfBirth ? calculateAge(player.dateOfBirth) : 'Unknown'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPlayer && selectedPlayerData && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl" style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                      <p className="text-white font-semibold text-sm">{selectedPlayer.label}</p>
                      <p className="text-fg-muted text-xs mt-1">
                        Gender: {selectedPlayerData.gender} · Age: {selectedPlayerData.age} yrs · DOB: {new Date(selectedPlayerData.dateOfBirth).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide uppercase mb-2"
                        style={{ color: FG.brandSoft }}>Gender (Auto-selected)</label>
                      <div className="px-4 py-3 rounded-xl text-fg-muted min-h-[44px] flex items-center"
                        style={{ background: 'rgb(var(--ink) / 0.03)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
                        {selectedGender?.label || 'Loading...'}
                      </div>
                      <p className="text-fg-muted text-xs mt-1">Automatically set from player&apos;s registration</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide uppercase mb-2"
                        style={{ color: FG.brandSoft }}>
                        Age Group <span aria-hidden="true" style={{ color: FG.brand }}>*</span>
                      </label>
                      <Dropdown
                        options={selectedGender && selectedPlayerData ? getAvailableAgeGroups(selectedGender.value, selectedPlayerData.age) : []}
                        value={selectedAgeGroup}
                        onChange={setSelectedAgeGroup}
                        placeholder="Select age group"
                      />
                      <p className="text-fg-muted text-xs mt-1">
                        Player age: {selectedPlayerData.age} yrs. Showing eligible categories.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold tracking-wide uppercase mb-2"
                        style={{ color: FG.brandSoft }}>
                        Apparatus <span aria-hidden="true" style={{ color: FG.brand }}>*</span>
                      </label>
                      {/*
                        * Checkboxes rather than the shared Dropdown: an athlete
                        * can be entered for more than one apparatus and is
                        * judged separately on each, so this is a set and not a
                        * choice. The real <input> carries the state — its label
                        * gives it an accessible name, and it stays reachable by
                        * keyboard and screen reader while the chip does the
                        * looking.
                        */}
                      <div role="group" aria-label="Apparatus" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {apparatusOptions.map(option => {
                          const checked = selectedApparatus.includes(option.value);
                          return (
                            <label key={option.value}
                              className="flex items-center gap-2 px-3 py-3 rounded-xl border cursor-pointer transition-colors min-h-[44px]"
                              style={{
                                background: checked ? `${alpha(COLORS.saffron, 0x1A)}` : 'rgb(var(--ink) / 0.03)',
                                borderColor: checked ? COLORS.saffron : COLORS.darkBorderSubtle,
                              }}>
                              <input type="checkbox" className="sr-only"
                                checked={checked}
                                onChange={() => toggleApparatus(option.value)} />
                              <span className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                                style={{
                                  borderColor: checked ? COLORS.saffron : 'rgb(var(--ink) / 0.25)',
                                  background: checked ? COLORS.saffron : 'transparent',
                                }}>
                                {checked && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
                              </span>
                              <span className="text-sm" style={{ color: checked ? FG.ink : 'rgb(var(--ink) / 0.55)' }}>
                                {option.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-fg-muted text-xs mt-1">
                        Pick every apparatus this athlete competes on — each one is judged and ranked separately.
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={handleCloseModal}
                        className="flex-1 py-3 rounded-xl text-white/60 hover:text-white/80 border transition-colors min-h-[44px]"
                        style={{ borderColor: COLORS.darkBorderSubtle }}>
                        Cancel
                      </button>
                      <button onClick={handleAddPlayer}
                        disabled={!selectedPlayer || !selectedAgeGroup || !selectedGender || selectedApparatus.length === 0}
                        className="flex-1 py-3 rounded-xl font-bold text-white min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={SAFFRON_CTA}>
                        Add Player
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CoachDashboard;
