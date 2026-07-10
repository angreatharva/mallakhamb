import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, User, LogOut, CheckCircle, RotateCcw, Send, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '@/config/api.config';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import {
  getCombinationChecklist,
  getDifficultyRequirement,
  computeCombinationTotal,
  POINT_CEILINGS,
} from '@/utils/scoring/copRules';

// Design tokens for judge theme
const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
  greenDark: '#16A34A',
  amber: '#F59E0B',
};

const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

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

const ScoreRow = ({ label, value, max, color = J.purple }) => (
  <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
    <span className="text-sm font-black" style={{ color }}>
      {typeof value === 'number' ? value.toFixed(2) : value}
      <span className="text-xs font-normal ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>/ {max}</span>
    </span>
  </div>
);

const CheckRow = ({ checked, onChange, label, penalty }) => (
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
    {!checked && <span className="ml-auto text-xs font-bold" style={{ color: '#EF4444' }}>-{penalty.toFixed(2)}</span>}
  </label>
);

const JudgeScoring = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  const reduced = useReducedMotion();
  
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const joinedRoomRef = useRef(null);

  // Read data from location state
  const stateData = location.state;
  
  useEffect(() => {
    if (!stateData || !stateData.player || !stateData.team || !stateData.competitionType) {
      toast.error('Missing player selection. Redirecting to dashboard.');
      navigate('/judge/dashboard');
    }
  }, [stateData, navigate]);

  const selectedTeam = stateData?.team;
  const selectedPlayer = stateData?.player;
  const selectedCompetitionType = stateData?.competitionType;
  const selectedApparatus = stateData?.apparatus;

  // Apparatus-specific combination checklist (COP §5.1–5.3). Defaults to Pole
  // if no apparatus was passed. Stable for the component's lifetime.
  const combinationChecklist = useRef(getCombinationChecklist(selectedApparatus)).current;

  // Build the initial "all requirements met" checked-map for the checklist.
  const buildInitialCombination = () => {
    const checked = {};
    combinationChecklist.forEach(item => { checked[item.id] = true; });
    return { checked, total: POINT_CEILINGS.combination };
  };

  const [scores, setScores] = useState({
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
    combination: buildInitialCombination(),
    execution: 0,
    bonus: 0
  });

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) { toast.error('Please login first'); navigate('/judge/login'); return; }
    try {
      const judge = JSON.parse(storedJudge);
      setJudgeInfo(judge);
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (!judgeInfo || !selectedCompetitionType) return;
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');
    
    const newSocket = io(socketUrl, {
      auth: { token },
      withCredentials: true
    });
    
    setSocket(newSocket);
    newSocket.on('connect', () => {
      setIsConnected(true);
      logger.info('Socket connected successfully');
      const roomId = `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`;
      if (joinedRoomRef.current !== roomId) {
        newSocket.emit('join_scoring_room', { roomId });
        joinedRoomRef.current = roomId;
        logger.info(`Joined scoring room: ${roomId}`);
      }
    });
    newSocket.on('disconnect', () => { 
      setIsConnected(false); 
      joinedRoomRef.current = null;
    });
    newSocket.on('connect_error', (error) => {
      if (error.message && (error.message.includes('authorization') || error.message.includes('Unauthorized'))) {
        toast.error('Not authorized to access scoring room');
        navigate('/judge/dashboard');
      } else {
        toast.error('Failed to connect to server');
      }
    });
    
    newSocket.on('error', (error) => {
      if (error.message === 'Not authorized to join this room') {
        toast.error('You do not have permission to access this scoring room');
        navigate('/judge/dashboard');
      }
    });
    
    newSocket.on('score_update_error', (error) => {
      if (error.message === 'Only judges can update scores') {
        toast.error('Only judges can submit scores');
      }
    });
    
    newSocket.on('scores_saved_error', (error) => {
      if (error.message === 'Unauthorized to save scores') {
        toast.error('You do not have permission to save scores');
      }
    });
    return () => { newSocket.disconnect(); joinedRoomRef.current = null; };
  }, [judgeInfo, selectedCompetitionType, navigate]);

  const resetScores = () => setScores({
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
    combination: buildInitialCombination(),
    execution: 0, bonus: 0
  });

  const calcDiffTotal = (a, b, c) => (a * 0.20) + (b * 0.40) + (c * 0.60);

  const handleDifficulty = (cls, val) => {
    const n = parseInt(val) || 0;
    const d = { ...scores.difficulty, [cls]: n };
    d.total = calcDiffTotal(d.aClass, d.bClass, d.cClass);
    setScores({ ...scores, difficulty: d });
  };

  const handleCombination = (itemId) => {
    const checked = { ...scores.combination.checked, [itemId]: !scores.combination.checked[itemId] };
    const total = computeCombinationTotal(selectedApparatus, checked);
    setScores({ ...scores, combination: { checked, total } });
  };

  const req = getDifficultyRequirement(selectedCompetitionType);

  // Difficulty mix warning (COP §4.1) — non-blocking. Fires when any entered
  // count differs from the required mix for this competition type.
  const difficultyMismatch =
    (scores.difficulty.aClass || 0) !== req.A ||
    (scores.difficulty.bClass || 0) !== req.B ||
    (scores.difficulty.cClass || 0) !== req.C;

  const calcFinal = () => (
    scores.difficulty.total + scores.combination.total +
    parseFloat(scores.execution || 0) + parseFloat(scores.bonus || 0)
  ).toFixed(2);

  const submitScore = async () => {
    if (!selectedPlayer) return;
    if (parseFloat(calcFinal()) === 0) { toast.error('Please enter scores'); return; }
    setSubmitting(true);
    try {
      const token = secureStorage.getItem('judge_token');
      const finalScore = calcFinal();
      const scoreData = {
        playerId: selectedPlayer.id, playerName: selectedPlayer.name,
        judgeType: judgeInfo.judgeType, score: parseFloat(finalScore),
        teamId: selectedTeam._id, gender: judgeInfo.gender,
        ageGroup: judgeInfo.ageGroup, competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        apparatus: selectedApparatus,
        breakdown: {
          difficulty: scores.difficulty,
          combination: { total: scores.combination.total, checked: scores.combination.checked },
          execution: parseFloat(scores.execution || 0),
          // DB key stays `originality` (no migration); it now carries the COP Bonus (0 or 0.20).
          originality: parseFloat(scores.bonus || 0),
          bonus: parseFloat(scores.bonus || 0)
        }
      };
      await axios.post(`${apiConfig.getBaseUrl()}/public/save-score`, scoreData, {
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      if (socket?.connected) {
        socket.emit('score_update', { ...scoreData, roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}` });
      }
      toast.success(`Score ${finalScore} submitted for ${selectedPlayer.name}`);
      setSubmitted(true);
      setTimeout(() => { 
        // Go back to dashboard after submitting
        navigate('/judge/dashboard');
      }, 1800);
    } catch (error) {
      logger.error('Failed to save score:', error);
      toast.error('Failed to save score. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  if (!judgeInfo || !selectedPlayer) return null;

  const finalScore = parseFloat(calcFinal());

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
            <button onClick={() => navigate('/judge/dashboard')}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }} className="space-y-3">

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
            <button onClick={() => navigate('/judge/dashboard')}
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
              Required: A{req.A} (0.20)  B{req.B} (0.40)  C{req.C} (0.60)
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[['aClass', 'A Class', '0.20'], ['bClass', 'B Class', '0.40'], ['cClass', 'C Class', '0.60']].map(([key, lbl, mult]) => (
                <ScoreInput key={key} label={lbl} hint={mult} value={scores.difficulty[key]} max="99" step={1}
                  onChange={e => handleDifficulty(key, e.target.value)} />
              ))}
            </div>
            {difficultyMismatch && (
              <div className="p-2.5 rounded-lg text-xs flex items-start gap-2"
                style={{ background: 'rgba(245,158,11,0.1)', color: J.amber, border: '1px solid rgba(245,158,11,0.25)' }}>
                <span aria-hidden="true">⚠</span>
                <span>Element mix differs from the required A{req.A}/B{req.B}/C{req.C} for this competition. You can still submit.</span>
              </div>
            )}
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
              <div>
                <h3 className="font-black text-white text-sm">2. Combination</h3>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{selectedApparatus || 'Pole Mallakhamb'}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 1.60</span>
            </div>
            {combinationChecklist.map((item) => (
              <CheckRow key={item.id} checked={scores.combination.checked[item.id]}
                onChange={() => handleCombination(item.id)} label={item.rule} penalty={item.penalty} />
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

          {/* 4. Bonus */}
          <div className="rounded-2xl border p-5"
            style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-white text-sm">4. Bonus</h3>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>0 or 0.20</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['None', 0], ['Awarded (+0.20)', POINT_CEILINGS.bonus]].map(([label, val]) => {
                const active = Math.abs((scores.bonus || 0) - val) < 1e-6;
                return (
                  <button key={label} type="button"
                    onClick={() => setScores({ ...scores, bonus: val })}
                    className="py-3 rounded-xl border font-bold text-sm transition-all duration-200 min-h-[52px]"
                    style={{
                      background: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: active ? J.purple : 'rgba(255,255,255,0.08)',
                      color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
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
              <ScoreRow label="Bonus" value={parseFloat(scores.bonus || 0)} max="0.20" />
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
      </main>
    </div>
  );
};

export default JudgeScoring;
