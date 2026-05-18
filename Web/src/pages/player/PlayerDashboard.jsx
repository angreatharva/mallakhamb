import { useState, useEffect } from 'react';
import { Trophy, Users, Calendar, Award, User, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { playerAPI } from '@/services/api';
import { useCompetition } from '../../contexts/CompetitionContext';
import CompetitionDisplay from '@/components/competition/CompetitionDisplay';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { getCompetitionIdFromToken } from '@/utils/auth/tokenUtils';
import { COLORS, GradientText, FadeIn, GlassCard, SaffronButton, useReducedMotion } from '../public/Home';
import Dropdown from '@/components/auth/Dropdown';

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, accent, delay = 0, children }) => (
  <FadeIn delay={delay}>
    <motion.div
      className="p-5 rounded-2xl border relative overflow-hidden"
      style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}
      whileHover={{ borderColor: `${accent}35`, boxShadow: `0 0 30px ${accent}10` }}
      transition={{ duration: 0.25 }}>
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `${accent}06`, filter: 'blur(20px)', transform: 'translate(30%, -30%)' }} />
      <div className="flex items-start gap-4 relative z-10">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}15` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-white/45 text-xs font-medium tracking-wide uppercase mb-1">{label}</p>
          {children || (
            <p className="text-white font-bold text-lg leading-tight truncate">{value || '—'}</p>
          )}
        </div>
      </div>
    </motion.div>
  </FadeIn>
);

// ─── Info row ─────────────────────────────────────────────────────────────────
const InfoRow = ({ label, value, last = false }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1 ${!last ? 'border-b' : ''}`}
    style={{ borderColor: COLORS.darkBorderSubtle }}>
    <span className="text-white/45 text-sm font-medium">{label}</span>
    <span className="text-white text-sm font-semibold sm:text-right break-all">{value || '—'}</span>
  </div>
);

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    Submitted: { bg: '#22C55E18', border: '#22C55E40', text: '#4ADE80' },
    Active: { bg: `${COLORS.saffron}18`, border: `${COLORS.saffron}40`, text: COLORS.saffronLight },
  };
  const style = map[status] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.5)' };
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border"
      style={{ background: style.bg, borderColor: style.border, color: style.text }}>
      {status || 'Not assigned'}
    </span>
  );
};

// ─── Age group display ────────────────────────────────────────────────────────
const AGE_GROUP_MAP = {
  Under10: 'Under 10', Under12: 'Under 12', Under14: 'Under 14',
  Under16: 'Under 16', Under18: 'Under 18', Above18: 'Above 18', Above16: 'Above 16',
};

// ─── PlayerDashboard ──────────────────────────────────────────────────────────
const PlayerDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading: competitionLoading } = useCompetition();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [updatingTeam, setUpdatingTeam] = useState(false);
  const [showCompetitionModal, setShowCompetitionModal] = useState(false);
  useReducedMotion(); // Initialize for accessibility

  // Handle competition selection from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const competitionIdFromUrl = urlParams.get('competitionId');
    
    if (competitionIdFromUrl && assignedCompetitions?.length > 0) {
      const competition = assignedCompetitions.find(c => c._id === competitionIdFromUrl);
      if (competition && (!currentCompetition || currentCompetition._id !== competitionIdFromUrl)) {
        logger.info('Setting competition from URL parameter', { competitionId: competitionIdFromUrl, competitionName: competition.name });
        switchCompetition(competitionIdFromUrl).then(() => {
          // Remove the URL parameter after successfully setting the competition
          const newUrl = new URL(window.location);
          newUrl.searchParams.delete('competitionId');
          window.history.replaceState({}, '', newUrl);
        }).catch(error => {
          logger.error('Failed to set competition from URL:', error);
        });
        return;
      }
    }
  }, [location.search, assignedCompetitions, currentCompetition, switchCompetition]);

  useEffect(() => {
    fetchPlayerProfile();
  }, []);

  // `/players/team` requires JWT competition context — refetch after context is set (auto-select, modal, URL).
  useEffect(() => {
    if (!currentCompetition?._id) return;
    fetchPlayerProfile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when competition id changes only
  }, [currentCompetition?._id]);

  // Show modal if multiple competitions and no current competition selected
  useEffect(() => {
    // Wait for competitions to load
    if (competitionLoading || !assignedCompetitions) return;

    const competitionCount = assignedCompetitions.length;
    
    // If 2+ competitions and no current competition, show modal
    if (competitionCount > 1 && !currentCompetition) {
      logger.info('Multiple competitions found, showing selection modal', { count: competitionCount });
      setShowCompetitionModal(true);
    }
  }, [competitionLoading, assignedCompetitions, currentCompetition]);

  // Redirect to team selection if player has no team
  useEffect(() => {
    if (!loading && player) {
      // Team can be null, undefined, or a string ID, or an object
      const hasTeam = player.team && (
        typeof player.team === 'string' ? player.team : 
        (player.team._id || player.team.id)
      );
      
      if (!hasTeam) {
        logger.info('Player has no team, redirecting to team selection');
        navigate('/player/select-team', { replace: true });
      }
    }
  }, [loading, player, navigate]);

  useEffect(() => {
    if (player && !player.team) fetchTeams();
  }, [player]);

  const fetchPlayerProfile = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      // Always load profile first (stable source for player identity fields)
      const profileResponse = await playerAPI.getProfile();
      const profileData = profileResponse.data?.data || profileResponse.data || {};

      const token = secureStorage.getItem('player_token');
      const competitionIdInToken = getCompetitionIdFromToken(token);

      // GET /players/team requires competition in JWT (validateCompetitionContext). Skip until set-competition.
      if (!competitionIdInToken) {
        const hasTeam = profileData.team && profileData.team._id;
        setPlayer({
          ...profileData,
          teamStatus: hasTeam ? 'Assigned' : 'Not assigned',
        });
      } else {
        try {
          const teamResponse = await playerAPI.getTeam();
          const teamPayload = teamResponse.data?.data || teamResponse.data || {};
          const resolvedTeam = teamPayload.team || null;
          const hasTeam = !!(resolvedTeam && (resolvedTeam._id || resolvedTeam.id));

          setPlayer({
            ...profileData,
            team: resolvedTeam || profileData.team || null,
            teamStatus: teamPayload.teamStatus || (hasTeam ? 'Assigned' : 'Not assigned'),
          });
        } catch (teamError) {
          logger.info('Team fetch failed, using profile fallback:', teamError.response?.data?.error?.message || teamError.response?.data?.message);
          const hasTeam = profileData.team && profileData.team._id;
          setPlayer({
            ...profileData,
            teamStatus: hasTeam ? 'Assigned' : 'Not assigned',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to fetch player profile:', error);
      // Don't show error toast if it's just a competition context issue
      const errCode = error.response?.data?.error?.code || error.response?.data?.code;
      if (errCode !== 'COMPETITION_CONTEXT_REQUIRED') {
        toast.error('Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    setTeamsLoading(true);
    try {
      const response = await playerAPI.getTeams();
      const payload = response.data?.data ?? response.data?.teams ?? response.data ?? [];
      const teamsList = Array.isArray(payload) ? payload : [];
      setTeams(teamsList.map((t) => ({ value: t._id || t.id, label: t.name })));
    } catch {
      toast.error('Failed to load teams');
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleTeamSelect = async (teamOption) => {
    setSelectedTeam(teamOption);
    setUpdatingTeam(true);
    try {
      await playerAPI.updateTeam({ teamId: teamOption.value });
      toast.success('Team selected successfully!');
      await fetchPlayerProfile();
      setSelectedTeam(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to select team');
      setSelectedTeam(null);
    } finally {
      setUpdatingTeam(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4"
            style={{ borderColor: `${COLORS.saffron}40`, borderTopColor: COLORS.saffron }}
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
          <p className="text-white/45 text-sm">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Competition context */}
        {assignedCompetitions && assignedCompetitions.length > 0 ? (
          <CompetitionDisplay className="mb-0" />
        ) : (
          <FadeIn>
            <div className="rounded-2xl border p-4 text-center"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <p className="text-white/40 text-sm">
                No competitions assigned yet. Your coach will add you to competitions.
              </p>
            </div>
          </FadeIn>
        )}

        {/* Welcome banner */}
        <FadeIn>
          <div className="rounded-3xl border p-6 md:p-8 relative overflow-hidden"
            style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorder }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 0% 50%, ${COLORS.saffron}08, transparent 60%)` }} />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-white/40 text-xs tracking-widest uppercase mb-1">Welcome back</p>
                <h1 className="text-2xl md:text-3xl font-black text-white">
                  {player?.firstName} <GradientText>{player?.lastName}</GradientText>
                </h1>
                <p className="text-white/40 text-sm mt-1">
                  {player?.team ? `Team: ${player.team.name}` : 'No team assigned yet'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => fetchPlayerProfile(true)}
                  className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                  title="Refresh player data"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <StatusBadge status={player?.teamStatus} />
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Trophy} label="Team" accent={COLORS.saffron} delay={0}>
            {player?.team ? (
              <p className="text-white font-bold text-base leading-tight truncate">{player.team.name}</p>
            ) : (
              <div className="mt-1">
                <Dropdown
                  options={teams}
                  value={selectedTeam}
                  onChange={handleTeamSelect}
                  placeholder="Select a team"
                  loading={teamsLoading || updatingTeam}
                  disabled={updatingTeam}
                />
              </div>
            )}
          </StatCard>

          <StatCard icon={Award} label="Age Group" accent="#22C55E" delay={0.06}
            value={player?.ageGroup ? AGE_GROUP_MAP[player.ageGroup] || player.ageGroup : 'Not assigned'} />

          <StatCard icon={Users} label="Gender" accent="#A855F7" delay={0.12}
            value={player?.gender} />

          <StatCard icon={Calendar} label="Date of Birth" accent="#3B82F6" delay={0.18}
            value={player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'} />
        </div>

        {/* Detail panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profile */}
          <FadeIn delay={0.1}>
            <div className="rounded-2xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-white font-bold text-lg mb-5 flex items-center gap-2">
                <User className="w-4 h-4" style={{ color: COLORS.saffron }} aria-hidden="true" />
                Profile Information
              </h2>
              <InfoRow label="Full Name" value={`${player?.firstName} ${player?.lastName}`} />
              <InfoRow label="Email" value={player?.email} />
              <InfoRow label="Date of Birth"
                value={player?.dateOfBirth ? new Date(player.dateOfBirth).toLocaleDateString() : 'N/A'} />
              <InfoRow label="Gender" value={player?.gender} />
              <InfoRow label="Team" value={player?.team?.name || 'Not assigned'} last />
            </div>
          </FadeIn>

          {/* Team info */}
          <FadeIn delay={0.15}>
            <div className="rounded-2xl border p-6"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorderSubtle }}>
              <h2 className="text-white font-bold text-lg mb-5 flex items-center gap-2">
                <Trophy className="w-4 h-4" style={{ color: COLORS.saffron }} aria-hidden="true" />
                Team Information
              </h2>

              {player?.team ? (
                <>
                  <InfoRow label="Team Name" value={player.team.name} />
                  <InfoRow label="Age Group"
                    value={player.ageGroup ? (AGE_GROUP_MAP[player.ageGroup] || player.ageGroup) : 'Not assigned'} />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1">
                    <span className="text-white/45 text-sm font-medium">Status</span>
                    <StatusBadge status={player.teamStatus} />
                  </div>
                </>
              ) : (
                <div className="py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                    style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <Users className="w-6 h-6 text-white/20" />
                  </div>
                  <p className="text-white/45 text-sm mb-1">Not assigned to any team yet.</p>
                  <p className="text-white/25 text-xs mb-5">Select a team from the card above to join.</p>
                  <div className="max-w-xs mx-auto">
                    <Dropdown
                      options={teams}
                      value={selectedTeam}
                      onChange={handleTeamSelect}
                      placeholder="Select a team to join"
                      loading={teamsLoading || updatingTeam}
                      disabled={updatingTeam}
                    />
                    {updatingTeam && (
                      <p className="text-xs mt-2 text-center" style={{ color: COLORS.saffronLight }}>
                        Joining team...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Competition Selection Modal */}
      <AnimatePresence>
        {showCompetitionModal && assignedCompetitions && assignedCompetitions.length > 1 && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              // Don't allow closing by clicking backdrop - force selection
              e.stopPropagation();
            }}
          >
            <motion.div
              className="w-full max-w-2xl rounded-3xl border p-6 md:p-8"
              style={{ background: COLORS.darkCard, borderColor: COLORS.darkBorder }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ background: `${COLORS.saffron}15` }}>
                  <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">Select Competition</h2>
                <p className="text-white/45 text-sm">
                  You're registered for multiple competitions. Please select one to continue.
                </p>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {assignedCompetitions.map((competition) => (
                  <motion.button
                    key={competition._id}
                    onClick={async () => {
                      try {
                        logger.info('Modal: Selecting competition', { 
                          competitionId: competition._id, 
                          competitionName: competition.name 
                        });
                        await switchCompetition(competition._id);
                        logger.info('Modal: Competition switched successfully');
                        setShowCompetitionModal(false);
                        toast.success(`Selected ${competition.name}`);
                      } catch (error) {
                        logger.error('Modal: Failed to select competition', error);
                        toast.error('Failed to select competition');
                      }
                    }}
                    className="w-full text-left p-4 rounded-xl border transition-all"
                    style={{ 
                      background: COLORS.dark,
                      borderColor: COLORS.darkBorderSubtle 
                    }}
                    whileHover={{ 
                      borderColor: `${COLORS.saffron}40`,
                      boxShadow: `0 0 20px ${COLORS.saffron}10` 
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${COLORS.saffron}15` }}>
                        <Trophy className="w-5 h-5" style={{ color: COLORS.saffron }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-base mb-1 truncate">
                          {competition.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                          {competition.place && <span>{competition.place}</span>}
                          {competition.level && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{competition.level}</span>
                            </>
                          )}
                          {competition.year && (
                            <>
                              <span>•</span>
                              <span>{competition.year}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlayerDashboard;
