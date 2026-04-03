import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, Users, Save, ArrowLeft, Trophy, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { useRouteContext } from '../contexts/RouteContext';
import { ResponsiveScoringTable } from '../components/responsive/ResponsiveTable';
import { logger } from '../utils/logger';
import { COLORS, useReducedMotion, GradientText, FadeIn } from './Home';

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

const Orb = ({ x, y, size, color, delay, duration, blur = 80 }) => {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`, top: `${y}%`, width: size, height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}30, ${color}08, transparent 70%)`,
        filter: `blur(${blur}px)`, transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -25, 0], scale: [1, 1.08, 1], opacity: [0.25, 0.45, 0.25] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }} />
  );
};

const LiveDot = ({ connected }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold"
    style={{
      background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      borderColor: connected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
    }}>
    <motion.div className="w-2 h-2 rounded-full"
      style={{ background: connected ? '#22C55E' : '#EF4444' }}
      animate={connected ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }} />
    <span style={{ color: connected ? '#22C55E' : '#EF4444' }}>{connected ? 'Live' : 'Offline'}</span>
  </div>
);

const InfoChip = ({ label, value, accent = COLORS.saffron }) => (
  <div className="flex flex-col gap-0.5 px-4 py-3 rounded-xl border"
    style={{ background: `${accent}0A`, borderColor: `${accent}20` }}>
    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: accent }}>{label}</span>
    <span className="text-white font-bold text-sm">{value}</span>
  </div>
);

const JudgeBadge = ({ judge }) => (
  <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border text-center"
    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
    <span className="text-xs font-bold px-2 py-1 rounded-full"
      style={{
        background: judge.judgeType === 'Senior Judge' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.15)',
        color: judge.judgeType === 'Senior Judge' ? '#C084FC' : '#60A5FA',
        border: `1px solid ${judge.judgeType === 'Senior Judge' ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)'}`,
      }}>
      {judge.judgeType}
    </span>
    <p className="text-white font-bold text-sm leading-tight">{judge.name}</p>
    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{judge.username}</p>
  </div>
);

const SectionCard = ({ children, className = '' }) => (
  <div className={`rounded-2xl border p-5 md:p-6 ${className}`}
    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
    {children}
  </div>
);

const SectionHeading = ({ icon: Icon, children, accent = COLORS.saffron }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${accent}18` }}>
      <Icon className="w-4 h-4" style={{ color: accent }} aria-hidden="true" />
    </div>
    <h3 className="text-white font-black text-base">{children}</h3>
  </div>
);

const DarkInput = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: COLORS.saffron }}>
      {label}
    </label>
    <input type="text" value={value} onChange={onChange} placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl border outline-none transition-all duration-200 text-sm min-h-[44px]"
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#fff' }}
      onFocus={e => { e.target.style.borderColor = `${COLORS.saffron}60`; e.target.style.boxShadow = `0 0 0 3px ${COLORS.saffron}15`; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = 'none'; }} />
  </div>
);


const ScoringPage = ({ routePrefix: routePrefixProp }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const contextValue = useRouteContext();
  const routePrefix = routePrefixProp || contextValue.routePrefix;
  const apiService = routePrefix === '/superadmin' ? superAdminAPI : adminAPI;
  const { selectedTeam, selectedGender, selectedAgeGroup } = location.state || {};

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [judges, setJudges] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [timeKeeper, setTimeKeeper] = useState('');
  const [scorer, setScorer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);
    newSocket.on('connect', () => {
      setIsConnected(true);
      if (selectedGender?.value && selectedAgeGroup?.value) {
        newSocket.emit('join_scoring_room', `scoring_${selectedGender.value}_${selectedAgeGroup.value}`);
      }
    });
    newSocket.on('disconnect', () => setIsConnected(false));
    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleScoreUpdate = (data) => {
      const playerExists = players.some(p => p.id === data.playerId);
      if (!playerExists) {
        setPlayers(prev => [...prev, { id: data.playerId, name: data.playerName, gender: selectedGender?.value, ageGroup: selectedAgeGroup?.value, teamName: 'Unknown Team' }]);
        setScores(prev => ({ ...prev, [data.playerId]: { time: '', seniorJudge: '', judge1: '', judge2: '', judge3: '', judge4: '', deduction: '', otherDeduction: '' } }));
        toast.success(`Added ${data.playerName} to session`);
      }
      const fieldMap = { 'Senior Judge': 'seniorJudge', 'Judge 1': 'judge1', 'Judge 2': 'judge2', 'Judge 3': 'judge3', 'Judge 4': 'judge4' };
      const fieldName = fieldMap[data.judgeType] || 'seniorJudge';
      setScores(prev => ({ ...prev, [data.playerId]: { ...prev[data.playerId], [fieldName]: data.score.toString() } }));
      toast.success(`${data.judgeType}: ${data.score} for ${data.playerName}`, { duration: 2000 });
    };
    socket.off('score_updated');
    socket.on('score_updated', handleScoreUpdate);
    return () => socket.off('score_updated', handleScoreUpdate);
  }, [socket, players, selectedGender, selectedAgeGroup]);

  useEffect(() => {
    if (socket?.connected && selectedGender?.value && selectedAgeGroup?.value) {
      socket.emit('join_scoring_room', `scoring_${selectedGender.value}_${selectedAgeGroup.value}`);
    }
  }, [socket, selectedGender, selectedAgeGroup]);

  useEffect(() => {
    if (!selectedTeam || !selectedGender || !selectedAgeGroup) { navigate(routePrefix); return; }
    fetchJudgesAndPlayers();
  }, [selectedTeam, selectedGender, selectedAgeGroup]);

  const initScores = (playersList) => {
    const s = {};
    playersList.forEach(p => { s[p.id] = { time: '', seniorJudge: '', judge1: '', judge2: '', judge3: '', judge4: '', deduction: '', otherDeduction: '' }; });
    return s;
  };

  const fetchJudgesAndPlayers = async () => {
    try {
      setLoading(true);
      const judgesRes = await apiService.getJudges({ gender: selectedGender.value, ageGroup: selectedAgeGroup.value });
      setJudges(judgesRes.data.judges.filter(j => j.name?.trim()).sort((a, b) => a.judgeNo - b.judgeNo));
      try {
        const allTeamsRes = await apiService.getSubmittedTeams({ gender: selectedGender.value, ageGroup: selectedAgeGroup.value });
        const allPlayers = [];
        allTeamsRes.data.teams.forEach(team => {
          team.players.filter(e => e.player.gender === selectedGender.value && e.ageGroup === selectedAgeGroup.value)
            .forEach(e => allPlayers.push({ id: e.player._id, name: `${e.player.firstName} ${e.player.lastName}`, gender: e.player.gender, ageGroup: e.ageGroup, teamId: team._id, teamName: team.name }));
        });
        setPlayers(allPlayers);
        const initialScores = initScores(allPlayers);
        setScores(initialScores);
        loadExistingScores(null, selectedGender.value, selectedAgeGroup.value, initialScores);
      } catch {
        const teamPlayers = selectedTeam.players
          .filter(e => e.player.gender === selectedGender.value && e.ageGroup === selectedAgeGroup.value)
          .map(e => ({ id: e.player._id, name: `${e.player.firstName} ${e.player.lastName}`, gender: e.player.gender, ageGroup: e.ageGroup, teamId: selectedTeam._id, teamName: selectedTeam.name }));
        setPlayers(teamPlayers);
        const initialScores = initScores(teamPlayers);
        setScores(initialScores);
        loadExistingScores(selectedTeam._id, selectedGender.value, selectedAgeGroup.value, initialScores);
      }
    } catch (error) {
      logger.error('Error fetching data:', error);
      toast.error('Failed to load judges and players');
    } finally { setLoading(false); }
  };

  const loadExistingScores = async (teamId, gender, ageGroup, initialScores) => {
    try {
      const res = await apiService.getTeamScores({ teamId, gender, ageGroup });
      if (res.data?.scores) {
        const existing = { ...initialScores };
        res.data.scores.forEach(record => {
          record.playerScores.forEach(ps => {
            if (existing[ps.playerId]) {
              existing[ps.playerId] = { ...existing[ps.playerId], seniorJudge: ps.judgeScores.seniorJudge.toString(), judge1: ps.judgeScores.judge1.toString(), judge2: ps.judgeScores.judge2.toString(), judge3: ps.judgeScores.judge3.toString(), judge4: ps.judgeScores.judge4.toString(), deduction: ps.deduction.toString(), otherDeduction: ps.otherDeduction.toString() };
            }
          });
        });
        setScores(existing);
      }
    } catch { /* no existing scores */ }
  };

  const calcAverage = (ps) => {
    const vals = [ps.seniorJudge, ps.judge1, ps.judge2, ps.judge3, ps.judge4].map(v => parseFloat(v) || 0).filter(v => v > 0);
    if (!vals.length) return 0;
    if (vals.length <= 3) return vals.reduce((s, v) => s + v, 0) / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  };

  const calcFinal = (ps) => Math.max(0, calcAverage(ps) - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0));

  const handleScoreChange = (playerId, field, value) => {
    setScores(prev => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
    if (socket && !['time', 'deduction', 'otherDeduction'].includes(field)) {
      const player = players.find(p => p.id === playerId);
      const judgeTypeMap = { seniorJudge: 'Senior Judge', judge1: 'Judge 1', judge2: 'Judge 2', judge3: 'Judge 3', judge4: 'Judge 4' };
      const judgeType = judgeTypeMap[field];
      if (judgeType) socket.emit('score_update', { playerId, playerName: player?.name, judgeType, score: parseFloat(value) || 0, roomId: `scoring_${selectedGender?.value}_${selectedAgeGroup?.value}` });
    }
  };

  const handleSaveScores = async () => {
    setSaving(true);
    try {
      await apiService.saveScores({
        teamId: selectedTeam._id, gender: selectedGender.value, ageGroup: selectedAgeGroup.value,
        timeKeeper, scorer, remarks,
        playerScores: players.map(p => ({
          playerId: p.id, playerName: p.name, time: scores[p.id].time,
          judgeScores: { seniorJudge: parseFloat(scores[p.id].seniorJudge) || 0, judge1: parseFloat(scores[p.id].judge1) || 0, judge2: parseFloat(scores[p.id].judge2) || 0, judge3: parseFloat(scores[p.id].judge3) || 0, judge4: parseFloat(scores[p.id].judge4) || 0 },
          averageMarks: parseFloat(calcAverage(scores[p.id]).toFixed(2)),
          deduction: parseFloat(scores[p.id].deduction) || 0,
          otherDeduction: parseFloat(scores[p.id].otherDeduction) || 0,
          finalScore: parseFloat(calcFinal(scores[p.id]).toFixed(2)),
        })),
      });
      toast.success('All scores saved successfully!', { duration: 3000 });
      setSaved(true);
      if (socket) socket.emit('scores_saved', { teamId: selectedTeam._id, roomId: `scoring_${selectedGender?.value}_${selectedAgeGroup?.value}` });
      setTimeout(() => navigate(`${routePrefix}/dashboard/scores`), 2000);
    } catch (error) {
      logger.error('Error saving scores:', error);
      toast.error('Failed to save scores');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div className="w-12 h-12 rounded-full border-2 border-t-transparent mx-auto mb-4"
            style={{ borderColor: COLORS.saffron, borderTopColor: 'transparent' }}
            animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading scoring session...</p>
        </div>
      </div>
    );
  }

  if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center p-8">
          <p className="text-white font-bold mb-4">Invalid scoring session.</p>
          <button onClick={() => navigate(routePrefix)} className="px-6 py-3 rounded-xl font-bold text-white min-h-[44px]"
            style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh relative" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Orb x={5} y={10} size={500} color={COLORS.saffron} delay={0} duration={9} blur={120} />
      <Orb x={95} y={40} size={350} color="#A855F7" delay={2} duration={11} blur={100} />
      <Orb x={50} y={90} size={300} color={COLORS.saffronDark} delay={1} duration={8} blur={90} />

      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: COLORS.darkBorder }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(routePrefix)}
              className="flex items-center gap-2 text-sm font-semibold transition-colors duration-200 min-h-[44px] px-2 rounded-xl hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Back to Dashboard">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <div className="w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.saffron }} aria-hidden="true" />
              <h1 className="text-white font-black text-sm sm:text-base">Live Scoring</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveDot connected={isConnected} />
            <a href="/judge" target="_blank" rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
              Open Judge Panel
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6" id="main-content">
        <FadeIn>
          <div className="rounded-2xl border p-5 md:p-6"
            style={{ background: 'rgba(255,255,255,0.02)', borderColor: COLORS.darkBorder }}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
              <div>
                <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: COLORS.saffron }}>Scoring Session</p>
                <h2 className="text-xl md:text-2xl font-black text-white">
                  {selectedGender.label} · <GradientText>{selectedAgeGroup.label}</GradientText>
                </h2>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Team: {selectedTeam.name}{selectedTeam.coach?.name && ` · Coach: ${selectedTeam.coach.name}`}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <InfoChip label="Players" value={players.length} accent={COLORS.saffron} />
                <InfoChip label="Judges" value={judges.length} accent="#A855F7" />
              </div>
            </div>
            <div className="p-4 rounded-xl text-xs leading-relaxed"
              style={{ background: 'rgba(255,107,0,0.06)', border: `1px solid ${COLORS.saffron}20`, color: 'rgba(255,255,255,0.5)' }}>
              <span className="font-bold" style={{ color: COLORS.saffronLight }}>Scoring System: </span>
              With 4+ judges, highest and lowest scores are excluded before averaging.
              <span className="ml-2 font-bold" style={{ color: COLORS.saffronLight }}>Final = </span>
              Average − Deduction − Other Deduction
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.08}>
          <SectionCard>
            <SectionHeading icon={Users} accent="#A855F7">Judges Panel</SectionHeading>
            {judges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {judges.map(judge => <JudgeBadge key={judge._id} judge={judge} />)}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No judges found for this category</p>
              </div>
            )}
          </SectionCard>
        </FadeIn>

        <FadeIn delay={0.12}>
          <SectionCard>
            <SectionHeading icon={Clock} accent={COLORS.saffron}>Player Scoring</SectionHeading>
            {players.length > 0 ? (
              <ResponsiveScoringTable players={players} scores={scores} judges={judges} onScoreChange={handleScoreChange} isLocked={false} />
            ) : (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No players found for this category.</p>
              </div>
            )}
          </SectionCard>
        </FadeIn>

        <FadeIn delay={0.16}>
          <SectionCard>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <DarkInput label="Time Keeper" value={timeKeeper} onChange={e => setTimeKeeper(e.target.value)} placeholder="Enter name" />
              <DarkInput label="Scorer" value={scorer} onChange={e => setScorer(e.target.value)} placeholder="Enter name" />
              <DarkInput label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks" />
            </div>
            <div className="flex justify-end">
              <motion.button onClick={handleSaveScores} disabled={saving || saved}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-black text-white min-h-[48px]"
                style={{
                  background: saved ? 'linear-gradient(135deg, #22C55E, #16A34A)' : `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`,
                  opacity: saving ? 0.7 : 1,
                }}
                whileHover={saving || saved ? {} : { scale: 1.02, filter: 'brightness(1.1)' }}
                whileTap={saving || saved ? {} : { scale: 0.98 }}
                transition={{ duration: 0.15 }}>
                <AnimatePresence mode="wait" initial={false}>
                  {saving ? (
                    <motion.span key="saving" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <motion.div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                      Saving...
                    </motion.span>
                  ) : saved ? (
                    <motion.span key="saved" className="flex items-center gap-2" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
                      <CheckCircle className="w-4 h-4" aria-hidden="true" /> Saved!
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Save className="w-4 h-4" aria-hidden="true" /> Save Scores
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </SectionCard>
        </FadeIn>
      </main>
    </div>
  );
};

export default ScoringPage;
