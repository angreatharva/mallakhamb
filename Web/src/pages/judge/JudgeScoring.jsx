import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, Users, User, Trophy, LogOut, CheckCircle,
  RotateCcw, Send
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '../../utils/apiConfig';
import { logger } from '../../utils/logger';
import { COLORS, useReducedMotion, FadeIn } from '../public/Home';

// ─── Design tokens for judge theme ───────────────────────────────────────────
const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
  greenDark: '#16A34A',
  amber: '#F59E0B',
};

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
        background: `radial-gradient(circle at 35% 35%, ${color}44, ${color}11, transparent 70%)`,
        filter: `blur(${blur}px)`, transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -25, 0], scale: [1, 1.08, 1], opacity: [0.25, 0.5, 0.25] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Live indicator ───────────────────────────────────────────────────────────
const LiveDot = ({ connected }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${
    connected ? 'border-green-500/30' : 'border-red-500/30'
  }`} style={{ background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
    <motion.div
      className="w-2 h-2 rounded-full"
      style={{ background: connected ? J.green : '#EF4444' }}
      animate={connected ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    <span style={{ color: connected ? J.green : '#EF4444' }}>{connected ? 'Live' : 'Offline'}</span>
  </div>
);

// ─── Step badge ───────────────────────────────────────────────────────────────
const StepBadge = ({ n, active, done }) => (
  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
    style={{
      background: done ? J.green : active ? J.purple : 'rgba(255,255,255,0.08)',
      color: done || active ? '#fff' : 'rgba(255,255,255,0.3)',
    }}>
    {done ? <CheckCircle className="w-4 h-4" /> : n}
  </div>
);

// ─── Section card ─────────────────────────────────────────────────────────────
const SectionCard = ({ step, total, title, active, done, children }) => (
  <motion.div
    className="rounded-2xl border overflow-hidden"
    style={{
      background: active ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
      borderColor: active ? 'rgba(168,85,247,0.3)' : done ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
    }}
    animate={{ opacity: active || done ? 1 : 0.5 }}
    transition={{ duration: 0.3 }}>
    <div className="flex items-center gap-3 px-5 py-4 border-b"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <StepBadge n={step} active={active} done={done} />
      <span className="font-bold text-sm" style={{ color: active ? '#fff' : done ? J.green : 'rgba(255,255,255,0.4)' }}>
        {title}
      </span>
    </div>
    <AnimatePresence initial={false}>
      {(active || done) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}>
          <div className="p-5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

// ─── Selectable button ────────────────────────────────────────────────────────
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

// ─── Score number input ───────────────────────────────────────────────────────
const ScoreInput = ({ label, value, onChange, max, step = 0.1, hint }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{hint}</span>}
      </div>
      <motion.div
        className="relative rounded-xl border overflow-hidden"
        animate={{
          borderColor: focused ? J.purple : 'rgba(255,255,255,0.08)',
          boxShadow: focused ? `0 0 0 3px ${J.purple}20` : 'none',
        }}
        transition={{ duration: 0.2 }}>
        <input
          type="number"
          step={step}
          min="0"
          max={max}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 text-2xl font-black text-center outline-none bg-transparent"
          style={{ color: '#fff', background: 'rgba(255,255,255,0.04)' }}
          placeholder="0.00"
        />
      </motion.div>
    </div>
  );
};

// ─── Score row display ────────────────────────────────────────────────────────
const ScoreRow = ({ label, value, max, color = J.purple }) => (
  <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
    <span className="text-sm font-black" style={{ color }}>
      {typeof value === 'number' ? value.toFixed(2) : value}
      <span className="text-xs font-normal ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>/ {max}</span>
    </span>
  </div>
);

// ─── Checkbox row ─────────────────────────────────────────────────────────────
const CheckRow = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 min-h-[52px]"
    style={{
      background: checked ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
      borderColor: checked ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.07)',
    }}>
    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
      style={{ borderColor: checked ? J.green : 'rgba(255,255,255,0.2)', background: checked ? J.green : 'transparent' }}>
      {checked && <CheckCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
    </div>
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
    <span className="text-sm font-medium" style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.5)' }}>{label}</span>
    {!checked && <span className="ml-auto text-xs font-bold" style={{ color: '#EF4444' }}>-0.40</span>}
  </label>
);

//  Main component 
const JudgeScoring = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const joinedRoomRef = useRef(null);

  const [scores, setScores] = useState({
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
    combination: {
      fullApparatusUtilization: true,
      rightLeftExecution: true,
      forwardBackwardFlexibility: true,
      minimumElementCount: true,
      total: 1.60
    },
    execution: 0,
    originality: 0
  });

  const competitionTypes = [
    { value: 'competition_1', label: 'Competition I', sub: 'Team' },
    { value: 'competition_2', label: 'Competition II', sub: 'Individual' },
    { value: 'competition_3', label: 'Competition III', sub: 'Apparatus' },
  ];

  useEffect(() => {
    const storedJudge = localStorage.getItem('judge_user');
    if (!storedJudge) { toast.error('Please login first'); navigate('/judge/login'); return; }
    try {
      const judge = JSON.parse(storedJudge);
      setJudgeInfo(judge);
      if (judge.competitionTypes?.length === 1) setSelectedCompetitionType(judge.competitionTypes[0]);
    } catch {
      localStorage.removeItem('judge_user');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (!judgeInfo) return;
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const newSocket = io(socketUrl);
    setSocket(newSocket);
    newSocket.on('connect', () => {
      setIsConnected(true);
      if (judgeInfo && selectedCompetitionType) {
        const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
        if (joinedRoomRef.current !== roomId) {
          newSocket.emit('join_scoring_room', roomId);
          joinedRoomRef.current = roomId;
        }
      }
    });
    newSocket.on('disconnect', () => { setIsConnected(false); joinedRoomRef.current = null; });
    newSocket.on('connect_error', () => toast.error('Failed to connect to server'));
    return () => { newSocket.disconnect(); joinedRoomRef.current = null; };
  }, [judgeInfo, selectedCompetitionType]);

  useEffect(() => {
    if (!socket?.connected || !judgeInfo || !selectedCompetitionType) return;
    const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
    if (joinedRoomRef.current !== roomId) {
      socket.emit('join_scoring_room', roomId);
      joinedRoomRef.current = roomId;
    }
  }, [socket, judgeInfo, selectedCompetitionType]);

  useEffect(() => {
    if (judgeInfo && selectedCompetitionType) fetchTeams();
  }, [judgeInfo, selectedCompetitionType]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('judge_token');
      const response = await axios.get(`${apiConfig.getBaseUrl()}/public/submitted-teams`, {
        params: { gender: judgeInfo.gender, ageGroup: judgeInfo.ageGroup, competitionType: selectedCompetitionType },
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` }
      });
      setTeams(response.data.teams || []);
      setSelectedTeam(null); setSelectedPlayer(null); setPlayers([]);
    } catch (error) {
      logger.error('Error fetching teams:', error);
      toast.error('Failed to load teams');
      setTeams([]);
    } finally { setLoading(false); }
  };

  const handleTeamSelect = (team) => {
    setSelectedTeam(team);
    const filtered = team.players
      .filter(e => e.player && e.player.gender === judgeInfo.gender && e.ageGroup === judgeInfo.ageGroup)
      .map(e => ({ id: e.player._id, name: `${e.player.firstName} ${e.player.lastName}`, gender: e.player.gender, ageGroup: e.ageGroup }));
    setPlayers(filtered);
    setSelectedPlayer(null);
    resetScores();
  };

  const handlePlayerSelect = (player) => { setSelectedPlayer(player); resetScores(); setSubmitted(false); };

  const resetScores = () => setScores({
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
    combination: { fullApparatusUtilization: true, rightLeftExecution: true, forwardBackwardFlexibility: true, minimumElementCount: true, total: 1.60 },
    execution: 0, originality: 0
  });

  const calcDiffTotal = (a, b, c) => (a * 0.20) + (b * 0.40) + (c * 0.60);

  const handleDifficulty = (cls, val) => {
    const n = parseInt(val) || 0;
    const d = { ...scores.difficulty, [cls]: n };
    d.total = calcDiffTotal(d.aClass, d.bClass, d.cClass);
    setScores({ ...scores, difficulty: d });
  };

  const handleCombination = (field) => {
    const c = { ...scores.combination, [field]: !scores.combination[field] };
    let deductions = 0;
    if (!c.fullApparatusUtilization) deductions += 0.40;
    if (!c.rightLeftExecution) deductions += 0.40;
    if (!c.forwardBackwardFlexibility) deductions += 0.40;
    if (!c.minimumElementCount) deductions += 0.40;
    c.total = Math.max(0, 1.60 - deductions);
    setScores({ ...scores, combination: c });
  };

  const getRequiredElements = () =>
    selectedCompetitionType === 'competition_1' ? { a: 4, b: 6, c: 1 } : { a: 1, b: 6, c: 2 };

  const calcFinal = () => (
    scores.difficulty.total + scores.combination.total +
    parseFloat(scores.execution || 0) + parseFloat(scores.originality || 0)
  ).toFixed(2);

  const submitScore = async () => {
    if (!selectedPlayer) { toast.error('Please select a player'); return; }
    if (parseFloat(calcFinal()) === 0) { toast.error('Please enter scores'); return; }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('judge_token');
      const finalScore = calcFinal();
      const scoreData = {
        playerId: selectedPlayer.id, playerName: selectedPlayer.name,
        judgeType: judgeInfo.judgeType, score: parseFloat(finalScore),
        teamId: selectedTeam._id, gender: judgeInfo.gender,
        ageGroup: judgeInfo.ageGroup, competitionType: selectedCompetitionType,
        breakdown: { difficulty: scores.difficulty, combination: scores.combination, execution: parseFloat(scores.execution || 0), originality: parseFloat(scores.originality || 0) }
      };
      await axios.post(`${apiConfig.getBaseUrl()}/public/save-score`, scoreData, {
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` }
      });
      if (socket?.connected) {
        socket.emit('score_update', { ...scoreData, roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}` });
      }
      toast.success(`Score ${finalScore} submitted for ${selectedPlayer.name}`);
      setSubmitted(true);
      setTimeout(() => { setSelectedPlayer(null); resetScores(); setSubmitted(false); }, 1800);
    } catch (error) {
      logger.error('Failed to save score:', error);
      toast.error('Failed to save score. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('judge_token');
    localStorage.removeItem('judge_user');
    toast.success('Logged out successfully');
    navigate('/judge/login');
  };

  if (!judgeInfo) return null;

  const req = getRequiredElements();
  const finalScore = parseFloat(calcFinal());
  const step = !selectedCompetitionType ? 1 : !selectedTeam ? 2 : !selectedPlayer ? 3 : 4;

  return (
    <div className="min-h-dvh relative" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Orb x={5} y={10} size={400} color={J.purple} delay={0} duration={8} blur={120} />
      <Orb x={95} y={60} size={300} color={COLORS.saffron} delay={3} duration={10} blur={100} />
      <Orb x={50} y={95} size={250} color={J.purpleDark} delay={1.5} duration={7} blur={90} />

      {/*  Header  */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
              <Scale className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{judgeInfo.name}</p>
              <p className="text-xs truncate" style={{ color: J.purpleLight }}>{judgeInfo.judgeType}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <LiveDot connected={isConnected} />
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-red-500/10"
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
              aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-3" id="main-content">
        {/* Assignment banner */}
        <FadeIn delay={0}>
          <div className="rounded-2xl border p-4 flex flex-wrap gap-4"
            style={{ background: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 flex-shrink-0" style={{ color: J.purple }} aria-hidden="true" />
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>Assignment</span>
            </div>
            <div className="flex flex-wrap gap-3 ml-auto">
              {[
                { label: 'Gender', value: judgeInfo.gender },
                { label: 'Age Group', value: judgeInfo.ageGroup },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}:</span>
                  <span className="text-xs font-bold text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Step 1: Competition Type */}
        <FadeIn delay={0.05}>
          <SectionCard step={1} title="Select Competition Type" active={step === 1} done={step > 1}>
            <div className="space-y-2">
              {competitionTypes
                .filter(ct => !judgeInfo.competitionTypes || judgeInfo.competitionTypes.includes(ct.value))
                .map(ct => (
                  <SelectBtn key={ct.value} selected={selectedCompetitionType === ct.value}
                    onClick={() => { setSelectedCompetitionType(ct.value); setSelectedTeam(null); setSelectedPlayer(null); resetScores(); }}>
                    <span>{ct.label}</span>
                    <span className="text-xs ml-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{ct.sub}</span>
                  </SelectBtn>
                ))}
            </div>
          </SectionCard>
        </FadeIn>

        {/* Step 2: Team */}
        <FadeIn delay={0.1}>
          <SectionCard step={2} title="Select Team" active={step === 2} done={step > 2}>
            {loading ? (
              <div className="flex items-center justify-center py-8 gap-3">
                <motion.div className="w-5 h-5 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: J.purple, borderTopColor: 'transparent' }}
                  animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading teams...</span>
              </div>
            ) : teams.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {teams.map(team => (
                  <SelectBtn key={team._id} selected={selectedTeam?._id === team._id} onClick={() => handleTeamSelect(team)}>
                    <div>
                      <p className="font-bold text-sm">{team.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Coach: {team.coach?.name}</p>
                    </div>
                  </SelectBtn>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No teams found for this category</p>
              </div>
            )}
          </SectionCard>
        </FadeIn>

        {/* Step 3: Player */}
        <FadeIn delay={0.15}>
          <SectionCard step={3} title="Select Player" active={step === 3} done={step > 3}>
            {players.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {players.map(player => (
                  <SelectBtn key={player.id} selected={selectedPlayer?.id === player.id} onClick={() => handlePlayerSelect(player)}>
                    <div>
                      <p className="font-bold text-sm">{player.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{player.gender}  {player.ageGroup}</p>
                    </div>
                  </SelectBtn>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <User className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.2)' }} aria-hidden="true" />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No players found in this team for selected category</p>
              </div>
            )}
          </SectionCard>
        </FadeIn>

        {/* Step 4: Scoring */}
        <AnimatePresence>
          {selectedPlayer && (
            <motion.div key="scoring" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease: EASE_OUT }}
              className="space-y-3">

              {/* Scoring for banner */}
              <div className="rounded-2xl border p-4 flex items-center gap-4"
                style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <User className="w-5 h-5" style={{ color: J.green }} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: J.green }}>Scoring For</p>
                  <p className="text-white font-black text-base leading-tight truncate">{selectedPlayer.name}</p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{selectedTeam?.name}</p>
                </div>
                <button onClick={() => { setSelectedPlayer(null); resetScores(); }}
                  className="ml-auto p-2 rounded-lg transition-colors hover:bg-white/5 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  style={{ color: 'rgba(255,255,255,0.3)' }} aria-label="Change player">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* 1. Difficulty */}
              <div className="rounded-2xl border p-5 space-y-4"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-white text-sm">1. Difficulty</h3>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 3.80</span>
                </div>
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(168,85,247,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                  Required: A{req.a} (0.20)  B{req.b} (0.40)  C{req.c} (0.60)
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[['aClass', 'A Class', '0.20'], ['bClass', 'B Class', '0.40'], ['cClass', 'C Class', '0.60']].map(([key, lbl, mult]) => (
                    <ScoreInput key={key} label={lbl} hint={mult} value={scores.difficulty[key]} max="99" step={1}
                      onChange={e => handleDifficulty(key, e.target.value)} />
                  ))}
                </div>
                <div className="flex justify-end">
                  <span className="text-lg font-black" style={{ color: Math.abs(scores.difficulty.total - 3.80) < 0.01 ? J.green : J.amber }}>
                    {scores.difficulty.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>/ 3.80</span>
                  </span>
                </div>
              </div>

              {/* 2. Combination */}
              <div className="rounded-2xl border p-5 space-y-3"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-white text-sm">2. Combination</h3>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 1.60</span>
                </div>
                {[
                  ['fullApparatusUtilization', 'Full apparatus utilization'],
                  ['rightLeftExecution', 'Right & left side execution'],
                  ['forwardBackwardFlexibility', 'Forward & backward flexibility'],
                  ['minimumElementCount', 'Minimum element count met'],
                ].map(([field, label]) => (
                  <CheckRow key={field} checked={scores.combination[field]}
                    onChange={() => handleCombination(field)} label={label} />
                ))}
                <div className="flex justify-end pt-1">
                  <span className="text-lg font-black" style={{ color: J.purple }}>
                    {scores.combination.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>/ 1.60</span>
                  </span>
                </div>
              </div>

              {/* 3. Execution */}
              <div className="rounded-2xl border p-5"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-white text-sm">3. Execution</h3>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 4.40</span>
                </div>
                <ScoreInput label="Execution Score" value={scores.execution} max={4.40} step={0.1}
                  onChange={e => { const v = Math.max(0, Math.min(4.40, parseFloat(e.target.value) || 0)); setScores({ ...scores, execution: v }); }} />
              </div>

              {/* 4. Originality */}
              <div className="rounded-2xl border p-5"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-white text-sm">4. Originality</h3>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 0.20</span>
                </div>
                <ScoreInput label="Originality Score" value={scores.originality} max={0.20} step={0.05}
                  onChange={e => { const v = Math.max(0, Math.min(0.20, parseFloat(e.target.value) || 0)); setScores({ ...scores, originality: v }); }} />
              </div>

              {/* Final score card */}
              <motion.div className="rounded-2xl p-6 text-center relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #A855F720, #7C3AED20)', border: '1px solid rgba(168,85,247,0.3)' }}
                animate={{ boxShadow: finalScore > 0 ? `0 0 60px rgba(168,85,247,0.2)` : 'none' }}>
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.15), transparent 60%)' }} />
                <p className="text-xs font-bold tracking-widest uppercase mb-2 relative z-10" style={{ color: J.purpleLight }}>Final Score</p>
                <motion.p className="text-6xl font-black relative z-10"
                  key={calcFinal()}
                  initial={{ scale: 0.9, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{ color: '#fff' }}>
                  {calcFinal()}
                </motion.p>
                <p className="text-sm relative z-10 mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>out of 10.00</p>
                <div className="mt-4 grid grid-cols-4 gap-2 relative z-10">
                  <ScoreRow label="Difficulty" value={scores.difficulty.total} max="3.80" />
                  <ScoreRow label="Combination" value={scores.combination.total} max="1.60" />
                  <ScoreRow label="Execution" value={parseFloat(scores.execution || 0)} max="4.40" />
                  <ScoreRow label="Originality" value={parseFloat(scores.originality || 0)} max="0.20" />
                </div>
              </motion.div>

              {/* Submit */}
              <motion.button
                onClick={submitScore}
                disabled={submitting || !isConnected || submitted}
                className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-3 min-h-[56px] relative overflow-hidden"
                style={{
                  background: submitted ? `linear-gradient(135deg, ${J.green}, ${J.greenDark})` : `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})`,
                  opacity: (!isConnected || submitting) ? 0.6 : 1,
                }}
                whileHover={reduced || submitting || !isConnected ? {} : { scale: 1.01, filter: 'brightness(1.1)' }}
                whileTap={reduced || submitting || !isConnected ? {} : { scale: 0.98 }}
                transition={{ duration: 0.15 }}>
                <AnimatePresence mode="wait" initial={false}>
                  {submitting ? (
                    <motion.span key="submitting" className="flex items-center gap-2"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <motion.div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
                        animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                      Submitting...
                    </motion.span>
                  ) : submitted ? (
                    <motion.span key="done" className="flex items-center gap-2"
                      initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
                      <CheckCircle className="w-5 h-5" aria-hidden="true" /> Score Submitted!
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="flex items-center gap-2"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Send className="w-5 h-5" aria-hidden="true" /> Submit Score
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              {!isConnected && (
                <p className="text-center text-xs" style={{ color: '#EF4444' }}>
                  Not connected to server. Scores cannot be submitted.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default JudgeScoring;
