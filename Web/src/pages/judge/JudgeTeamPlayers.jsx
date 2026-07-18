import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Scale, User, LogOut, CheckCircle, ChevronRight, ArrowLeft, Users
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '@/config/api.config';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { FadeIn } from '@/components/design-system';

const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
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

const JudgeTeamPlayers = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { teamId } = useParams();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();

  const [judgeInfo, setJudgeInfo] = useState(null);
  const [team, setTeam] = useState(location.state?.team || null);
  const [loading, setLoading] = useState(!location.state?.team);

  const selectedCompetitionType =
    location.state?.competitionType || sessionStorage.getItem('judge_selected_comp_type') || '';
  const selectedApparatus =
    location.state?.apparatus || sessionStorage.getItem('judge_selected_apparatus') || 'Pole Mallakhamb';

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) { toast.error('Please login first'); navigate('/judge/login'); return; }
    try {
      setJudgeInfo(JSON.parse(storedJudge));
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  const fetchTeam = useCallback(async () => {
    if (!judgeInfo || !selectedCompetitionType || !teamId) return;
    try {
      setLoading(true);
      const token = secureStorage.getItem('judge_token');
      const response = await axios.get(`${apiConfig.getBaseUrl()}/public/submitted-teams`, {
        params: {
          competitionId: judgeInfo.competition?._id || judgeInfo.competition,
          gender: judgeInfo.gender,
          ageGroup: judgeInfo.ageGroup,
          competitionType: selectedCompetitionType,
        },
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      const teams = response.data.data || [];
      const found = teams.find((t) => String(t._id) === String(teamId));
      if (!found) {
        toast.error('Team not found');
        navigate('/judge/dashboard');
        return;
      }
      setTeam(found);
    } catch (error) {
      logger.error('Error loading team:', error);
      toast.error('Failed to load team');
      navigate('/judge/dashboard');
    } finally {
      setLoading(false);
    }
  }, [judgeInfo, selectedCompetitionType, teamId, navigate]);

  useEffect(() => {
    if (judgeInfo && selectedCompetitionType) fetchTeam();
  }, [judgeInfo, selectedCompetitionType, teamId, fetchTeam]);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  const players = (() => {
    if (!team || !judgeInfo) return [];
    return (team.players || [])
      .filter((e) => {
        if (!e.player || e.player.gender !== judgeInfo.gender || e.ageGroup !== judgeInfo.ageGroup) return false;
        if (selectedApparatus && e.apparatus && e.apparatus[selectedCompetitionType]) {
          const apps = e.apparatus[selectedCompetitionType];
          if (Array.isArray(apps) && apps.length > 0 && !apps.includes(selectedApparatus)) {
            return false;
          }
        }
        return true;
      })
      .map((e) => ({
        id: e.player._id,
        name: `${e.player.firstName} ${e.player.lastName}`,
        gender: e.player.gender,
        ageGroup: e.ageGroup,
        apparatus: e.apparatus || {},
        isFinalized: !!e.isFinalized,
        finalScore: e.finalScore ?? null,
        hasScore: !!e.hasScore,
      }));
  })();

  const handlePlayerSelect = (player) => {
    if (player.isFinalized) {
      toast.success(
        `Scores locked for ${player.name}${player.finalScore != null ? ` (${Number(player.finalScore).toFixed(2)})` : ''}`
      );
      return;
    }
    navigate('/judge/scoring', {
      state: {
        team,
        player,
        competitionType: selectedCompetitionType,
        apparatus: selectedApparatus,
        returnTo: `/judge/team/${team._id}`,
      },
    });
  };

  if (!judgeInfo) return null;

  const scoredCount = players.filter((p) => p.isFinalized).length;

  return (
    <div className="min-h-dvh relative flex flex-col" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Orb x={5} y={10} size={400} color={J.purple} delay={0} duration={8} blur={120} />
      <Orb x={95} y={60} size={300} color={COLORS.saffron} delay={3} duration={10} blur={100} />
      <Orb x={50} y={95} size={250} color={J.purpleDark} delay={1.5} duration={7} blur={90} />

      <header className="sticky top-0 z-40 border-b flex-shrink-0"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/judge/dashboard')}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
              <Scale className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{judgeInfo.name}</p>
              <p className="text-xs truncate" style={{ color: J.purpleLight }}>{judgeInfo.judgeType}</p>
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
        <FadeIn delay={0}>
          <div className="rounded-2xl border p-5 mb-6"
            style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: J.purpleLight }}>
              Team
            </p>
            <h1 className="text-2xl font-black text-white">{team?.name || 'Loading…'}</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Coach: {team?.coach?.name || 'N/A'}
            </p>
            {!loading && team && (
              <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {players.length} {players.length === 1 ? 'player' : 'players'}
                {scoredCount > 0 ? ` · ${scoredCount} scored` : ''}
              </p>
            )}
          </div>
        </FadeIn>

        <FadeIn delay={0.05} className="flex-1 flex flex-col">
          <h2 className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: J.purpleLight }}>
            Players
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 flex-1">
              <motion.div className="w-6 h-6 rounded-full border-2 border-t-transparent"
                style={{ borderColor: J.purple, borderTopColor: 'transparent' }}
                animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
              <span className="text-sm text-white/50">Loading players…</span>
            </div>
          ) : players.length > 0 ? (
            <div className="space-y-2 pb-12">
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => handlePlayerSelect(player)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all group ${
                    player.isFinalized
                      ? 'bg-green-500/10 border-green-500/30 cursor-default'
                      : 'hover:bg-purple-500/15 border-white/10 hover:border-purple-500/30 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                      player.isFinalized
                        ? 'bg-green-500/20 border-green-500/40'
                        : 'bg-white/5 border-white/10 group-hover:border-purple-500/30 group-hover:bg-purple-500/10'
                    }`}>
                      {player.isFinalized
                        ? <CheckCircle className="w-5 h-5" style={{ color: J.green }} aria-hidden="true" />
                        : <User className="w-5 h-5 text-white/60 group-hover:text-purple-400" aria-hidden="true" />}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-base text-white flex items-center gap-2">
                        {player.name}
                        {player.isFinalized && (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                            style={{ background: 'rgba(34,197,94,0.2)', color: J.green }}>
                            Scored
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {player.gender} - {player.ageGroup}
                        {player.isFinalized && player.finalScore != null
                          ? ` · Final ${Number(player.finalScore).toFixed(2)}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {player.apparatus?.[selectedCompetitionType]?.length > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-white/10 text-white/80 border border-white/5">
                        {player.apparatus[selectedCompetitionType].join(', ')}
                      </span>
                    )}
                    {player.isFinalized ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(34,197,94,0.2)' }}>
                        <CheckCircle className="w-4 h-4" style={{ color: J.green }} aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-purple-500/20 transition-colors">
                        <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-purple-400" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 flex flex-col items-center flex-1 justify-center rounded-2xl border border-white/5 bg-white/5">
              <Users className="w-12 h-12 mb-4 text-white/20" />
              <p className="text-lg font-bold text-white/70">No eligible players</p>
              <p className="text-sm text-white/40 mt-2 max-w-sm text-center">
                None of the players match your assigned category and apparatus.
              </p>
            </div>
          )}
        </FadeIn>
      </main>
    </div>
  );
};

export default JudgeTeamPlayers;
