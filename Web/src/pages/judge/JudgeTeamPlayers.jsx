import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, User, CheckCircle, ChevronRight, ArrowLeft, Users, Lock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { apparatusFor, apparatusKey, apparatusToJudge, entryGender, isRegisteredFor } from '@/utils/scoring/apparatus';
import { judgeAPI } from '@/services/public/judge.api';
import { judgeLotsAPI } from '@/services/ordering/lots.api';
import {
  indexPerformanceOrder,
  applyRunningOrder,
  eventMatchesCategory,
} from '@/utils/ordering/performanceOrder';
import { secureStorage } from '@/utils/auth/secureStorage';
import { resolveJudgeSeat } from './useJudgePanelData';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS, DATA_COLORS, FG } from '@/styles/tokens';
import { FadeIn } from '@/components/design-system';
import { J, JudgeAmbience, JudgeLogoutButton } from './judgeShared';
import AppearanceMenu from '@/components/layout/AppearanceMenu';

const JudgeTeamPlayers = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { teamId } = useParams();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();

  const [judgeInfo, setJudgeInfo] = useState(null);
  const [team, setTeam] = useState(location.state?.team || null);
  const [loading, setLoading] = useState(!location.state?.team);
  const [judgeScoreMap, setJudgeScoreMap] = useState({}); // { playerId: true } for players this judge has scored
  const [finalizedScoreMap, setFinalizedScoreMap] = useState({}); // { playerId: finalScore|true } for finalized scores
  // Athlete running order for this category, set by the panel's Senior Judge or
  // Scorer (or drawn by an admin). Empty until loaded; anyone without a stored
  // position falls back to name order.
  const [orderIndex, setOrderIndex] = useState(() => ({ teams: new Map(), players: new Map() }));

  const selectedCompetitionType =
    location.state?.competitionType || sessionStorage.getItem('judge_selected_comp_type') || '';
  /*
   * The apparatus being judged, when the judge narrowed the category to one.
   *
   * Empty is a real answer and NOT the same as Pole: it means "this panel is
   * judging whatever each athlete is entered for", which is the normal state
   * of a competition that declares no apparatusConfig. It used to default to
   * 'Pole Mallakhamb' here, which quietly filtered the roster down to Pole
   * athletes and handed everyone else the wrong score sheet — the Above16 Rope
   * athletes were judged on the ten-item Pole checklist because of this line.
   *
   * With no selection nothing is filtered out, and each athlete's slip picks up
   * their own registered apparatus (see apparatusToJudge in useJudgePanelData).
   */
  const selectedApparatus =
    location.state?.apparatus || sessionStorage.getItem('judge_selected_apparatus') || '';
  
  // Use gender and ageGroup from navigation state (if passed), otherwise fall back to session storage or judgeInfo
  const selectedGender = 
    location.state?.gender || 
    sessionStorage.getItem('judge_selected_gender') || 
    judgeInfo?.gender;
  const selectedAgeGroup = 
    location.state?.ageGroup || 
    sessionStorage.getItem('judge_selected_age_group') || 
    judgeInfo?.ageGroup;

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
      
      logger.log('Fetching team with params:', {
        teamId,
        gender: selectedGender,
        ageGroup: selectedAgeGroup,
        competitionType: selectedCompetitionType
      });
      
      // Fetch team data from public API
      const response = await judgeAPI.getSubmittedTeams({
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        gender: selectedGender,
        ageGroup: selectedAgeGroup,
        competitionType: selectedCompetitionType,
      });
      const teams = response.data.data || [];
      const found = teams.find((t) => String(t._id) === String(teamId));
      if (!found) {
        logger.error('Team not found in response:', { teamId, teamsCount: teams.length, teams });
        toast.error('Team not found or has not been submitted by coach yet');
        navigate('/judge/dashboard');
        return;
      }
      setTeam(found);

      /*
       * Which athletes are already scored, and which are locked.
       *
       * Keyed by (athlete, APPARATUS), not by athlete. Somebody entered for
       * Pole, Hanging and Rope is judged three separate times and earns three
       * separate scores; a map keyed on the athlete alone marked all three done
       * the moment the first was finalized, and the other two could never be
       * scored at all.
       */
      try {
        const scoreMap = {};
        const finalizedMap = {};
        const statusKey = (playerId, apparatus) => `${String(playerId)}::${apparatusKey(apparatus)}`;

        // 1. The judge-specific endpoint, which reports per ATHLETE and has no
        //    idea about apparatus. Its answer is only unambiguous for athletes
        //    entered for exactly one, so it is applied to those alone — for
        //    anyone else it would lock apparatus nobody has judged yet.
        try {
          const judgePlayersRes = await judgeAPI.getTeamPlayers(teamId, {
            gender: selectedGender,
            ageGroup: selectedAgeGroup,
            competitionType: selectedCompetitionType,
          });
          const judgePlayers = judgePlayersRes.data?.data?.players || judgePlayersRes.data?.players || [];
          const soleApparatus = new Map(
            (found.players || [])
              .map((e) => [String(e.player?._id), apparatusFor(e, selectedCompetitionType)])
              .filter(([, list]) => list.length === 1)
              .map(([id, list]) => [id, list[0]])
          );
          judgePlayers.forEach((p) => {
            const only = soleApparatus.get(String(p._id));
            if (!only) return;
            if (p.hasScore) scoreMap[statusKey(p._id, only)] = true;
            if (p.isFinalized) finalizedMap[statusKey(p._id, only)] = p.finalScore ?? true;
          });
        } catch (e) {
          logger.warn('Judge-specific endpoint fallback:', e.message);
        }

        // 2. Supplement from the judge-authenticated team feed.
        //
        // This used to read /public/scores, which is the RESULTS feed: it
        // returns only sheets the Scorer has locked, and drops every athlete
        // the Senior Judge has not Final Submitted. A panel mid-session is
        // exactly the state that feed is built to hide, so as a supplement it
        // contributed nothing until the scoring was already over.
        try {
          const scoresRes = await judgeAPI.getTeamScores({
            competitionId: judgeInfo.competition?._id || judgeInfo.competition,
            gender: selectedGender,
            ageGroup: selectedAgeGroup,
            competitionType: selectedCompetitionType,
          });

          // The feed returns every team in the category; take ours by id
          // rather than trusting position.
          const teamRows = scoresRes.data?.data || [];
          const ourTeam = teamRows.find((t) => String(t._id) === String(teamId));
          const scoreDocs = ourTeam
            ? [{ playerScores: ourTeam.scores || [], isLocked: ourTeam.scoreMetadata?.isLocked === true }]
            : [];
          const judgeRoleMap = {
            'Senior Judge': { field: 'seniorJudge', role: 'SR_JUDGE' },
            'Judge 1': { field: 'judge1', role: 'J1' },
            'Judge 2': { field: 'judge2', role: 'J2' },
            'Judge 3': { field: 'judge3', role: 'J3' },
            'Judge 4': { field: 'judge4', role: 'J4' }
          };
          const currentRoleInfo = judgeRoleMap[judgeInfo?.judgeType] || { field: 'judge1', role: 'J1' };

          scoreDocs.forEach((doc) => {
            (doc.playerScores || []).forEach((ps) => {
              const pid = ps.playerId?._id || ps.playerId;
              if (pid) {
                const hasScore =
                  (ps.judgeScores && ps.judgeScores[currentRoleInfo.field] > 0) ||
                  (ps.judgeSlips && ps.judgeSlips.some(s => s.judgeRole === currentRoleInfo.role)) ||
                  (ps.judgeScores && Object.values(ps.judgeScores).some(v => Number(v) > 0));

                if (hasScore) {
                  scoreMap[statusKey(pid, ps.apparatus)] = true;
                }
                // A locked sheet is closed to everyone, so its rows read as
                // finalized here even if the Senior Judge never signed one off
                // individually — the judge cannot edit it either way.
                if (ps.isFinalized || doc.isLocked) {
                  finalizedMap[statusKey(pid, ps.apparatus)] = ps.finalScore ?? true;
                }
              }
            });
          });
        } catch (e) {
          logger.warn('Team scores supplement unavailable:', e.message);
        }

        // 3. Merge locally saved submitted player IDs for instant session persistence
        try {
          // Written by the slip as `<playerId>::<apparatus>` so it carries the
          // same identity as the maps above.
          const localSubmitted = JSON.parse(sessionStorage.getItem(`judge_submitted_players_${teamId}`) || '{}');
          Object.keys(localSubmitted).forEach((key) => {
            if (localSubmitted[key]) scoreMap[key] = true;
          });
        } catch {
          // Best-effort read of the local "already submitted" cache. A corrupt
          // or missing entry just means we fall back to the server's flags.
        }

        setJudgeScoreMap(scoreMap);
        setFinalizedScoreMap(finalizedMap);
        logger.log('Final merged judge score map loaded:', scoreMap, 'finalized map:', finalizedMap);
      } catch (scoreErr) {
        logger.warn('Could not fetch scores (non-critical):', scoreErr.message);
      }
    } catch (error) {
      logger.error('Error loading team:', error);
      toast.error('Failed to load team');
      navigate('/judge/dashboard');
    } finally {
      setLoading(false);
    }
  }, [judgeInfo, selectedCompetitionType, teamId, selectedGender, selectedAgeGroup, navigate]);

  useEffect(() => {
    if (judgeInfo && selectedCompetitionType) fetchTeam();
  }, [judgeInfo, selectedCompetitionType, fetchTeam]);

  const categoryParams = useMemo(() => {
    const competitionId = judgeInfo?.competition?._id || judgeInfo?.competition;
    if (!competitionId || !selectedGender || !selectedAgeGroup || !selectedCompetitionType) return null;
    return {
      competitionId,
      gender: selectedGender,
      ageGroup: selectedAgeGroup,
      competitionType: selectedCompetitionType,
    };
  }, [judgeInfo, selectedGender, selectedAgeGroup, selectedCompetitionType]);

  /**
   * Load the athlete running order. Failure is intentionally quiet — the order
   * is presentation, and a judge should still get their roster (in name order)
   * rather than an error, mid-session.
   */
  const fetchOrder = useCallback(async () => {
    if (!categoryParams) return;
    try {
      const response = await judgeLotsAPI.getOrder(categoryParams);
      setOrderIndex(indexPerformanceOrder(response.data?.data));
    } catch (error) {
      logger.warn('Could not load athlete running order; falling back to name order', error);
    }
  }, [categoryParams]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Live re-sort when the Senior Judge or Scorer re-sequences this team.
  useEffect(() => {
    if (!categoryParams) return;

    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');
    const socket = io(socketUrl, { auth: { token }, withCredentials: true });

    const roomId = `scoring_${categoryParams.gender}_${categoryParams.ageGroup}_${categoryParams.competitionType}`;
    socket.on('connect', () => socket.emit('join_scoring_room', { roomId }));

    socket.on('performance_order_updated', (event) => {
      if (!eventMatchesCategory(event, categoryParams)) return;
      setOrderIndex(indexPerformanceOrder(event));
    });

    return () => socket.disconnect();
  }, [categoryParams]);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  const orderedPlayers = (() => {
    if (!team || !judgeInfo) return [];

    logger.log('Filtering players:', {
      totalPlayers: team.players?.length,
      filterGender: selectedGender,
      filterAgeGroup: selectedAgeGroup,
      apparatus: selectedApparatus
    });
    
    return (team.players || [])
      .filter((e) => {
        // Filter by selected gender and age group (not judgeInfo)
        if (!e.player || entryGender(e) !== selectedGender || e.ageGroup !== selectedAgeGroup) {
          return false;
        }
        // Only the athletes registered for the apparatus being judged. Goes
        // through isRegisteredFor because `apparatus` has been stored as a bare
        // name, a list and a map keyed by competition type — the object lookup
        // this replaced understood only the last of the three, so a Rope
        // athlete passed the filter for a Pole session.
        return isRegisteredFor(e, selectedCompetitionType, selectedApparatus);
      })
      .map((e) => {
        const pidStr = String(e.player._id);
        /*
         * Status is per (athlete, apparatus). With an apparatus selected that
         * is the one being judged; without one, it is whatever this athlete is
         * entered for — the same resolution the slip itself makes.
         */
        const forApparatus = apparatusToJudge(selectedApparatus, e, selectedCompetitionType);
        const key = `${pidStr}::${apparatusKey(forApparatus)}`;
        const finVal = finalizedScoreMap[key];
        const isFinalized = !!finVal;
        const finalScore = typeof finVal === 'number' ? finVal : null;
        return {
          id: e.player._id,
          name: `${e.player.firstName} ${e.player.lastName}`,
          gender: e.player.gender,
          ageGroup: e.ageGroup,
          apparatus: e.apparatus || {},
          isFinalized,
          finalScore,
          hasScore: !!judgeScoreMap[key],
        };
      });
  })();

  // Athlete positions are stored per team, so the lookup key is
  // "<teamId>:<playerId>" — see indexPerformanceOrder.
  const players = applyRunningOrder(orderedPlayers, orderIndex.players, {
    key: (player) => `${String(teamId)}:${String(player.id)}`,
    name: (player) => player.name,
  });

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
        gender: selectedGender,
        ageGroup: selectedAgeGroup,
        returnTo: `/judge/team/${team._id}`,
      },
    });
  };

  if (!judgeInfo) return null;

  const finalizedCount = players.filter((p) => p.isFinalized).length;
  const scoredCount = players.filter((p) => p.hasScore || p.isFinalized).length;

  return (
    <div className="min-h-dvh relative flex flex-col" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <JudgeAmbience />

      <header className="sticky top-0 z-40 border-b flex-shrink-0"
        style={{ background: 'rgb(var(--bg) / 0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/judge/dashboard')}
              className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center flex-shrink-0 bg-ink/5 hover:bg-ink/10 transition-colors border border-ink/10"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-ink" aria-hidden="true" />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
              <Scale className="w-4 h-4 text-snow" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-ink font-bold text-sm leading-tight truncate">{judgeInfo.name}</p>
              <p className="text-xs truncate" style={{ color: DATA_COLORS.purpleSoft }}>
                {resolveJudgeSeat(judgeInfo, {
                  gender: selectedGender,
                  ageGroup: selectedAgeGroup,
                  competitionType: selectedCompetitionType,
                })?.judgeType}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
          <AppearanceMenu />
          <JudgeLogoutButton onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col" id="main-content">
        <FadeIn delay={0}>
          <div className="rounded-2xl border p-5 mb-6"
            style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: DATA_COLORS.purpleSoft }}>
              Team
            </p>
            <h1 className="text-2xl font-black text-ink">{team?.name || 'Loading…'}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>
              Coach: {team?.coach?.name || 'N/A'}
            </p>
            {!loading && team && (
              <p className="text-xs mt-3" style={{ color: 'var(--fg-muted)' }}>
                {players.length} {players.length === 1 ? 'player' : 'players'}
                {finalizedCount > 0 ? ` · ${finalizedCount} finalized` : scoredCount > 0 ? ` · ${scoredCount} submitted` : ''}
              </p>
            )}
          </div>
        </FadeIn>

        <FadeIn delay={0.05} className="flex-1 flex flex-col">
          <h2 className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: DATA_COLORS.purpleSoft }}>
            Players
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 flex-1">
              <div className="animate-spin w-6 h-6 rounded-full border-2 border-t-transparent"
                style={{ borderColor: J.purple, borderTopColor: 'transparent' }} />
              <span className="text-sm text-fg-muted">Loading players…</span>
            </div>
          ) : players.length > 0 ? (
            <div className="space-y-2 pb-12">
              {players.map((player, orderIdx) => {
                const isLocked = player.isFinalized;
                const isSubmitted = player.hasScore;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handlePlayerSelect(player)}
                    className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl border transition-all group ${
                      isLocked
                        ? 'bg-green-500/10 border-green-500/30 cursor-default'
                        : isSubmitted
                        ? 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 cursor-pointer'
                        : 'hover:bg-purple-500/15 border-ink/10 hover:border-purple-500/30 bg-ink/[0.02] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Running position within the team. The lot number, when
                          one was drawn, sits underneath — the two diverge as
                          soon as the panel re-sequences. */}
                      <span className="flex flex-col items-center justify-center w-8 flex-shrink-0">
                        <span className="text-sm font-black" style={{ color: DATA_COLORS.purpleSoft }}>
                          {orderIdx + 1}
                        </span>
                        {player.lotNo != null && (
                          <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: 'var(--fg-muted)' }}>
                            Lot {player.lotNo}
                          </span>
                        )}
                      </span>
                      <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center border transition-colors ${
                        isLocked
                          ? 'bg-green-500/20 border-green-500/40'
                          : isSubmitted
                          ? 'bg-purple-500/20 border-purple-500/40 group-hover:bg-purple-500/30'
                          : 'bg-ink/5 border-ink/10 group-hover:border-purple-500/30 group-hover:bg-purple-500/10'
                      }`}>
                        {isLocked ? (
                          <Lock className="w-5 h-5 text-green-700 dark:text-green-400" aria-hidden="true" />
                        ) : isSubmitted ? (
                          <CheckCircle className="w-5 h-5" style={{ color: DATA_COLORS.purpleSoft }} aria-hidden="true" />
                        ) : (
                          <User className="w-5 h-5 text-ink/60 group-hover:text-purple-700 dark:group-hover:text-purple-400" aria-hidden="true" />
                        )}
                      </div>
                      <div className="text-left min-w-0">
                        <p className="font-bold text-base text-ink flex flex-wrap items-center gap-x-2 gap-y-1">
                          {player.name}
                          {isLocked ? (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                              style={{ background: 'rgba(34,197,94,0.2)', color: FG.success }}>
                              Finalized
                            </span>
                          ) : isSubmitted ? (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                              style={{ background: 'rgba(168,85,247,0.2)', color: DATA_COLORS.purpleSoft }}>
                              Partial Score Submitted
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-fg-muted mt-0.5">
                          {player.gender} - {player.ageGroup}
                          {isLocked && player.finalScore != null
                            ? ` · Final ${Number(player.finalScore).toFixed(2)}`
                            : ''}
                        </p>
                        {/* Below sm the apparatus sits under the name: beside it, a three-apparatus list
                            squeezed the name and age group into a one-letter column on a phone. */}
                        {player.apparatus?.[selectedCompetitionType]?.length > 0 && (
                          <span className="sm:hidden mt-1.5 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-ink/10 text-ink/80 border border-ink/5">
                            {player.apparatus[selectedCompetitionType].join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      {player.apparatus?.[selectedCompetitionType]?.length > 0 && (
                        <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-ink/10 text-ink/80 border border-ink/5 text-right">
                          {player.apparatus[selectedCompetitionType].join(', ')}
                        </span>
                      )}
                      {isLocked ? (
                        <div className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center"
                          style={{ background: 'rgba(34,197,94,0.2)' }}>
                          <Lock className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden="true" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-ink/5 group-hover:bg-purple-500/20 transition-colors">
                          <ChevronRight className="w-4 h-4 text-fg-muted group-hover:text-purple-700 dark:group-hover:text-purple-400" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 flex flex-col items-center flex-1 justify-center rounded-2xl border border-ink/5 bg-ink/5">
              <Users className="w-12 h-12 mb-4 text-ink/20" />
              <p className="text-lg font-bold text-ink/70">No eligible players</p>
              <p className="text-sm text-fg-muted mt-2 max-w-sm text-center">
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
