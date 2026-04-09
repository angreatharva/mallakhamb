import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, Users, Calendar, Award, User, RefreshCw, LogOut, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { playerAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { CompetitionProvider } from '../../contexts/CompetitionContext';
import CompetitionDisplay from '../../components/CompetitionDisplay';
import { logger } from '../../utils/logger';
import { useProfileQuery } from '../../hooks/queries/useProfileQuery';
import { useTeamsQuery } from '../../hooks/queries/useTeamsQuery';
import { queryKeys } from '../../utils/queryClient';
import { COLORS, GradientText, FadeIn, GlassCard, SaffronButton, useReducedMotion } from '../public/Home';
import Dropdown from '../../components/Dropdown';

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
  const [selectedTeam, setSelectedTeam] = useState(null);
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  useReducedMotion(); // Initialize for accessibility

  const profileQuery = useProfileQuery({ scope: 'player' });
  const teamsQuery = useTeamsQuery({
    scope: 'player',
    enabled: Boolean(profileQuery.data && !profileQuery.data.team),
  });

  const updateTeamMutation = useMutation({
    mutationFn: (teamId) => playerAPI.updateTeam({ teamId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile('player') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.teams('player') });
    },
  });

  const player = profileQuery.data;
  const loading = profileQuery.isLoading || profileQuery.isFetching;
  const teamsLoading = teamsQuery.isLoading || teamsQuery.isFetching;
  const updatingTeam = updateTeamMutation.isPending;
  const teams = useMemo(
    () => (teamsQuery.data || []).map((t) => ({ value: t._id, label: t.name })),
    [teamsQuery.data]
  );

  const refreshProfile = async () => {
    try {
      await profileQuery.refetch();
      if (!player?.team) {
        await teamsQuery.refetch();
      }
    } catch (error) {
      logger.error('Failed to refresh player dashboard data:', error);
    }
  };

  const handleTeamSelect = async (teamOption) => {
    setSelectedTeam(teamOption);
    try {
      await updateTeamMutation.mutateAsync(teamOption.value);
      toast.success('Team selected successfully!');
      setSelectedTeam(null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to select team');
      setSelectedTeam(null);
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
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: `${COLORS.saffron}18` }}>
              <User className="w-4 h-4" style={{ color: COLORS.saffron }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">
                {player?.firstName} {player?.lastName}
              </p>
              <p className="text-white/35 text-xs">Player Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refreshProfile} disabled={loading}
              className="p-2 rounded-xl text-white/45 hover:text-white hover:bg-white/5 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Refresh data">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={logout}
              className="p-2 rounded-xl text-white/45 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8 pt-24">
        {/* Competition context */}
        <CompetitionProvider userType="player">
          <CompetitionDisplay className="mb-0" />
        </CompetitionProvider>

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
    </div>
  );
};

export default PlayerDashboard;
