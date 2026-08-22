import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { ArrowLeft, ListOrdered, Users, ChevronDown, ChevronRight, Info, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { resolveJudgeSeat } from './useJudgePanelData';
import { judgeLotsAPI } from '@/services/ordering/lots.api';
import SortableList from '@/components/ordering/SortableList';
import { eventMatchesCategory } from '@/utils/ordering/performanceOrder';
import { COLORS } from '@/styles/tokens';

const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
};

/** Judge roles allowed to set a panel's running order. Mirrors the server's
 *  `SEQUENCE_JUDGE_TYPES` and `requireSequenceManager`; this copy only decides
 *  what to render — the server decides what is allowed. */
const SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer'];

const COMP_LABEL = {
  competition_1: 'Competition I',
  competition_2: 'Competition II',
  competition_3: 'Competition III',
};

const OrderBadge = ({ lotNo, position, accent }) => (
  <span
    className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-black flex-shrink-0"
    style={{
      background: lotNo ? `${accent}25` : 'rgba(255,255,255,0.06)',
      color: lotNo ? accent : 'rgba(255,255,255,0.45)',
    }}
    title={lotNo ? `Lot ${lotNo} · runs ${position + 1}` : `Runs ${position + 1} · no lot drawn`}
  >
    {position + 1}
  </span>
);

/**
 * Running order — the Senior Judge / Scorer screen.
 *
 * Sets the order teams take the apparatus in, and the order of athletes inside
 * each team. Saving broadcasts over Socket.IO, so the other judges of the panel
 * — who see the same order read-only on their dashboard and team screens —
 * re-sort without reloading.
 *
 * Deliberately a separate route rather than an edit mode bolted onto
 * JudgeDashboard: the Scorer never visits the team-players screen (they go
 * straight from the dashboard into ScorerScoring), so an inline edit mode would
 * have to exist in two places and would still leave the Scorer no way to order
 * athletes. One screen serves both roles and both lists.
 */
const JudgeSequence = () => {
  const navigate = useNavigate();

  const [judgeInfo, setJudgeInfo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState(null);

  // See the identical note in AdminLots: framer-motion's drag-end can fire
  // before React has re-rendered with the final `onReorder` result, so the
  // committed order is read from a ref rather than from state.
  const teamsRef = useRef([]);
  const savingRef = useRef(false);

  const setTeamsTracked = useCallback((next) => {
    teamsRef.current = next;
    setTeams(next);
  }, []);

  // The judge dashboard writes the active category into sessionStorage when the
  // judge confirms their selection; this screen is always reached from there.
  const category = useMemo(() => ({
    gender: sessionStorage.getItem('judge_selected_gender') || '',
    ageGroup: sessionStorage.getItem('judge_selected_age_group') || '',
    competitionType: sessionStorage.getItem('judge_selected_comp_type') || '',
  }), []);

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) {
      toast.error('Please login first');
      navigate('/judge/login');
      return;
    }
    try {
      const judge = JSON.parse(storedJudge);
      // The role that matters is the one held in THIS category: a judge can
      // chair Under-14 Male and merely score Under-16 Female, and only the
      // first of those may re-sequence.
      const seat = resolveJudgeSeat(judge, category);
      if (!SEQUENCE_JUDGE_TYPES.includes(seat?.judgeType)) {
        toast.error('Only the Senior Judge or Scorer can set the running order');
        navigate('/judge/dashboard');
        return;
      }
      setJudgeInfo(judge);
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate, category]);

  const competitionId = judgeInfo?.competition?._id || judgeInfo?.competition;

  const categoryParams = useMemo(() => {
    const gender = category.gender || judgeInfo?.gender;
    const ageGroup = category.ageGroup || judgeInfo?.ageGroup;
    if (!competitionId || !gender || !ageGroup || !category.competitionType) return null;
    return { competitionId, gender, ageGroup, competitionType: category.competitionType };
  }, [competitionId, category, judgeInfo]);

  const fetchRoster = useCallback(async () => {
    if (!categoryParams) return;
    setLoading(true);
    try {
      const response = await judgeLotsAPI.getOrder(categoryParams);
      const data = response.data?.data || null;
      setRoster(data);
      setTeamsTracked(data?.teams || []);
    } catch (error) {
      logger.error('Failed to load running order:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to load running order');
    } finally {
      setLoading(false);
    }
  }, [categoryParams, setTeamsTracked]);

  useEffect(() => {
    if (!judgeInfo) return;
    if (!categoryParams) {
      toast.error('Select a judging category on the dashboard first');
      navigate('/judge/dashboard');
      return;
    }
    fetchRoster();
  }, [judgeInfo, categoryParams, fetchRoster, navigate]);

  // Live feed. An admin can redraw lots while this screen is open, and the
  // Scorer and Senior Judge may both be looking at it — whoever is not editing
  // should see the change rather than save a stale order over it.
  useEffect(() => {
    if (!judgeInfo || !categoryParams) return;

    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');
    const socket = io(socketUrl, { auth: { token }, withCredentials: true });

    const roomId = `scoring_${categoryParams.gender}_${categoryParams.ageGroup}_${categoryParams.competitionType}`;
    socket.on('connect', () => socket.emit('join_scoring_room', { roomId }));

    socket.on('performance_order_updated', (event) => {
      if (!eventMatchesCategory(event, categoryParams)) return;
      // Our own save echoes back through the room. Applying it mid-save would
      // fight the optimistic order the user is still looking at.
      if (savingRef.current) return;
      fetchRoster();
      toast.success(
        event.updatedByName
          ? `Running order updated by ${event.updatedByName}`
          : 'Running order updated'
      );
    });

    return () => socket.disconnect();
  }, [judgeInfo, categoryParams, fetchRoster]);

  const runSave = async (label, request) => {
    if (!categoryParams) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await request();
      toast.success(`${label} saved — judges updated`);
    } catch (error) {
      logger.error(`Failed to save ${label.toLowerCase()}:`, error);
      toast.error(error.response?.data?.error?.message || `Failed to save ${label.toLowerCase()}`);
      // Never leave this screen showing an order the server rejected: the
      // judges are still on the old one, and a silent disagreement about who
      // performs next is worse than the failed save.
      await fetchRoster();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const persistTeamOrder = (nextTeams) => runSave('Team order', () =>
    judgeLotsAPI.setTeamOrder({ ...categoryParams, teamIds: nextTeams.map((t) => String(t._id)) })
  );

  const persistPlayerOrder = (teamId, nextPlayers) => runSave('Athlete order', () =>
    judgeLotsAPI.setPlayerOrder({
      ...categoryParams,
      teamId: String(teamId),
      playerIds: nextPlayers.map((p) => String(p._id)),
    })
  );

  const handlePlayersReorder = (teamId, nextPlayers) => {
    setTeamsTracked(teamsRef.current.map((t) =>
      (String(t._id) === String(teamId) ? { ...t, players: nextPlayers } : t)
    ));
  };

  const currentPlayersOf = (teamId) =>
    teamsRef.current.find((t) => String(t._id) === String(teamId))?.players || [];

  if (!judgeInfo) return null;

  return (
    <div className="min-h-dvh relative flex flex-col"
      style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-40 border-b flex-shrink-0"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/judge/dashboard')}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            aria-label="Back to dashboard">
            <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
            <ListOrdered className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">Running Order</p>
            <p className="text-xs truncate" style={{ color: J.purpleLight }}>{resolveJudgeSeat(judgeInfo, category)?.judgeType}</p>
          </div>
          {saving && <span className="ml-auto text-xs text-white/40">Saving…</span>}
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col" id="main-content">
        <div className="rounded-2xl border p-5 mb-6"
          style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: J.purpleLight }}>Category</p>
          <h1 className="text-xl font-black text-white">
            {categoryParams?.gender} — {categoryParams?.ageGroup}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {COMP_LABEL[category.competitionType] || category.competitionType}
          </p>
          {roster?.lotsDrawnAt && (
            <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Lots drawn {new Date(roster.lotsDrawnAt).toLocaleString()}
              {roster.lotsDrawnByName ? ` by ${roster.lotsDrawnByName}` : ''}
            </p>
          )}
        </div>

        <div className="flex items-start gap-2 text-xs text-white/40 mb-4 px-1">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            Drag by the grip to change the order. The number shown is the running position;
            hover to see the lot a team drew. Saving updates every judge on this panel straight away.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 flex-1">
            <motion.div className="w-6 h-6 rounded-full border-2 border-t-transparent"
              style={{ borderColor: J.purple, borderTopColor: 'transparent' }}
              animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
            <span className="text-sm text-white/50">Loading running order…</span>
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center flex-1 justify-center rounded-2xl border border-white/5 bg-white/5">
            <Users className="w-12 h-12 mb-4 text-white/20" />
            <p className="text-lg font-bold text-white/70">No teams to order</p>
            <p className="text-sm text-white/40 mt-2 max-w-sm text-center">
              No coach has submitted a team for this category yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pb-12">
            <SortableList
              items={teams}
              getKey={(team) => String(team._id)}
              onReorder={setTeamsTracked}
              onCommit={() => persistTeamOrder(teamsRef.current)}
              accent={J.purple}
              renderItem={(team, index) => {
                const isExpanded = String(expandedTeamId) === String(team._id);
                return (
                  <div>
                    <div className="flex items-center gap-3">
                      <OrderBadge lotNo={team.lotNo} position={index} accent={J.purpleLight} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{team.name}</p>
                        <p className="text-xs text-white/40 truncate">
                          {team.coachName ? `Coach: ${team.coachName} · ` : ''}
                          {team.playerCount} athlete{team.playerCount !== 1 ? 's' : ''}
                          {team.lotNo ? ` · Lot ${team.lotNo}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedTeamId(isExpanded ? null : team._id)}
                        className="flex items-center gap-1 px-3 min-h-[44px] rounded-lg text-xs font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                        aria-label={isExpanded ? 'Hide athletes' : 'Show athletes'}>
                        <Users className="w-3.5 h-3.5" />
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 border-l-2" style={{ borderColor: `${J.purple}30` }}>
                        <p className="text-[10px] font-bold tracking-widest uppercase mb-2 pl-3" style={{ color: J.purpleLight }}>
                          Athlete order
                        </p>
                        <div className="pl-3">
                          <SortableList
                            items={team.players}
                            getKey={(player) => String(player._id)}
                            onReorder={(next) => handlePlayersReorder(team._id, next)}
                            onCommit={() => persistPlayerOrder(team._id, currentPlayersOf(team._id))}
                            accent={J.green}
                            emptyMessage="No athletes in this category for this team."
                            renderItem={(player, playerIndex) => (
                              <div className="flex items-center gap-3">
                                <OrderBadge lotNo={player.lotNo} position={playerIndex} accent={J.green} />
                                <div className="min-w-0">
                                  <p className="text-sm text-white truncate">{player.name}</p>
                                  <p className="text-xs text-white/35">
                                    {player.gender} · {player.ageGroup}
                                    {player.isFinalized ? ' · finalized' : ''}
                                  </p>
                                </div>
                              </div>
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <div className="flex justify-end">
              <motion.button
                onClick={() => persistTeamOrder(teamsRef.current)}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white min-h-[48px] disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})` }}
                whileHover={saving ? {} : { scale: 1.02 }} whileTap={saving ? {} : { scale: 0.97 }}>
                <Save className="w-4 h-4" /> Save Order
              </motion.button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JudgeSequence;
