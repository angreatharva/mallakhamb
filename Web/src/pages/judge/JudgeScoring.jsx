import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, User, LogOut, CheckCircle, RotateCcw, Send, ArrowLeft,
  AlertTriangle, Pencil, Lock
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
  resolveDifficultyValue,
  POINT_CEILINGS,
  analyzePanelMismatches,
  calculateAverageMarks,
  panelScoresToJudgeFields,
} from '@/utils/scoring/copRules';
import ScorerScoring from './ScorerScoring'; // Import scorer component

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

const LiveDot = ({ connected, compact = false }) => (
  <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full border text-xs font-bold ${connected ? 'border-green-500/30' : 'border-red-500/30'
    }`} style={{ background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
    <motion.div
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: connected ? J.green : '#EF4444' }}
      animate={connected ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    {!compact && (
      <span style={{ color: connected ? J.green : '#EF4444' }}>{connected ? 'Live' : 'Offline'}</span>
    )}
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
        <style>{`
          .no-spinners::-webkit-inner-spin-button,
          .no-spinners::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .no-spinners {
            -moz-appearance: textfield;
          }
        `}</style>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min="0"
          max={max}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 text-2xl font-black text-center outline-none bg-transparent no-spinners"
          style={{ color: '#fff', background: 'rgba(255,255,255,0.04)', fontSize: '1.5rem' }}
          placeholder="0.00"
        />
      </motion.div>
    </div>
  );
};

const Stepper = ({ label, hint, value, onChange, min = 0 }) => {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(value + 1);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{hint}</span>}
      </div>
      <div className="flex items-center gap-0 rounded-xl border overflow-hidden"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
        <motion.button type="button" onClick={dec} aria-label={`Decrease ${label}`}
          className="flex items-center justify-center flex-shrink-0 text-xl font-black select-none"
          style={{
            width: 44, height: 52, color: value <= min ? 'rgba(255,255,255,0.15)' : J.purpleLight,
            background: 'rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.08)'
          }}
          whileTap={value > min ? { scale: 0.9 } : {}}
          disabled={value <= min}>
          −
        </motion.button>
        <span className="flex-1 text-center text-2xl font-black py-2 select-none"
          style={{ color: '#fff', minWidth: 0 }}>
          {value}
        </span>
        <motion.button type="button" onClick={inc} aria-label={`Increase ${label}`}
          className="flex items-center justify-center flex-shrink-0 text-xl font-black select-none"
          style={{
            width: 44, height: 52, color: J.purpleLight,
            background: 'rgba(255,255,255,0.04)', borderLeft: '1px solid rgba(255,255,255,0.08)'
          }}
          whileTap={{ scale: 0.9 }}>
          +
        </motion.button>
      </div>
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
    {!checked && <span className="ml-auto text-xs font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>{penalty.toFixed(2)}</span>}
  </label>
);

const JudgeScoring = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  const reduced = useReducedMotion();

  // Check if current user is a Scorer (from navigation state or user profile)
  const storedJudgeUser = useMemo(() => {
    try {
      const u = secureStorage.getItem('judge_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  }, []);

  const isScorer = location.state?.isScorer || storedJudgeUser?.judgeType === 'Scorer';

  // If scorer, render ScorerScoring component directly without validating player selection
  if (isScorer) {
    return <ScorerScoring />;
  }

  // Read data from location state or sessionStorage fallback for regular judge refresh resilience
  const activeSessionData = useMemo(() => {
    if (location.state && location.state.player && (location.state.team || location.state.selectedTeam) && location.state.competitionType) {
      sessionStorage.setItem('judge_scoring_active_session', JSON.stringify(location.state));
      return location.state;
    }
    const saved = sessionStorage.getItem('judge_scoring_active_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [location.state]);

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [judgeInfo, setJudgeInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [viewMode, setViewMode] = useState('scoring'); // 'scoring' | 'review'
  const [panelScores, setPanelScores] = useState({}); // { judgeType: scoreData }
  const [panelSize, setPanelSize] = useState(null); // 3 | 4 | 5 from assigned judges
  const joinedRoomRef = useRef(null);

  useEffect(() => {
    if (!activeSessionData || !activeSessionData.player || !activeSessionData.team || !activeSessionData.competitionType) {
      toast.error('Missing player selection. Redirecting to dashboard.');
      navigate('/judge/dashboard');
    }
  }, [activeSessionData, navigate]);

  const selectedTeam = activeSessionData?.team;
  const selectedPlayer = activeSessionData?.player;
  const selectedCompetitionType = activeSessionData?.competitionType;
  const selectedApparatus = activeSessionData?.apparatus || 'Pole Mallakhamb';
  const selectedGender = activeSessionData?.gender;
  const selectedAgeGroup = activeSessionData?.ageGroup;

  const goBackAfterScoring = () => {
    sessionStorage.removeItem('judge_scoring_active_session');
    const returnTo = activeSessionData?.returnTo
      || (selectedTeam?._id ? `/judge/team/${selectedTeam._id}` : '/judge/dashboard');
    navigate(returnTo, {
      state: selectedTeam?._id
        ? {
            team: selectedTeam,
            competitionType: selectedCompetitionType,
            apparatus: selectedApparatus,
            gender: selectedGender,
            ageGroup: selectedAgeGroup,
          }
        : undefined,
    });
  };

  // Apparatus-specific combination checklist (COP §5.1–5.3). Defaults to Pole
  // if no apparatus was passed. Stable for the component's lifetime.
  const combinationChecklist = useRef(getCombinationChecklist(selectedApparatus)).current;

  // Build the initial combination map with all items unchecked.
  const buildInitialCombination = () => {
    const checked = {};
    combinationChecklist.forEach(item => { checked[item.id] = false; });
    const total = computeCombinationTotal(selectedApparatus, checked);
    return { checked, total };
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

  // Resolve panel size from assigned judges in this category
  useEffect(() => {
    if (!judgeInfo || !selectedCompetitionType) return;
    const loadPanelSize = async () => {
      try {
        const token = secureStorage.getItem('judge_token');
        const competitionId = judgeInfo.competition?._id || judgeInfo.competition;
        const res = await axios.get(`${apiConfig.getBaseUrl()}/public/judges`, {
          params: {
            competitionId,
            gender: selectedGender || judgeInfo.gender,
            ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
            competitionTypes: selectedCompetitionType,
            apparatus: selectedApparatus,
          },
          headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
          withCredentials: true,
        });
        const PANEL_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
        const judgesData = res.data?.data || [];
        const panelJudges = (Array.isArray(judgesData) ? judgesData : [])
          .filter(j => !j.isEmpty && j.name?.trim())
          .filter(j => PANEL_TYPES.includes(j.judgeType));
        const count = panelJudges.length;
        if (count >= 3 && count <= 5) setPanelSize(count);
        else if (count > 5) setPanelSize(5);
        else setPanelSize(null);
      } catch (err) {
        logger.warn('Could not load panel size from judges list', err);
      }
    };
    loadPanelSize();
  }, [judgeInfo, selectedCompetitionType, selectedApparatus, selectedGender, selectedAgeGroup]);

  const playerIdOf = (player) => player?.id || player?._id;

  const normalizeBreakdown = (breakdown, fallbackScore) => {
    if (!breakdown) {
      return {
        difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
        combination: { checked: {}, total: 0 },
        execution: 0,
        bonus: 0,
      };
    }
    const difficulty = breakdown.difficulty || { aClass: 0, bClass: 0, cClass: 0, total: 0 };
    const combination = {
      total: breakdown.combination?.total ?? 0,
      checked: breakdown.combination?.checked || {},
    };
    const execution = typeof breakdown.execution === 'number'
      ? breakdown.execution
      : parseFloat(breakdown.execution) || 0;
    const bonus = parseFloat(breakdown.bonus ?? breakdown.originality ?? 0) || 0;
    return { difficulty, combination, execution, bonus, _score: fallbackScore };
  };

  // Fetch existing submitted scores for this player and panel upon mount/refresh
  const fetchExistingScores = useCallback(async () => {
    if (!judgeInfo || !selectedPlayer || !selectedTeam) return;
    try {
      const token = secureStorage.getItem('judge_token');
      const competitionId = judgeInfo.competition?._id || judgeInfo.competition;
      const gender = selectedGender || judgeInfo.gender;
      const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
      const playerId = playerIdOf(selectedPlayer);

      const res = await axios.get(`${apiConfig.getBaseUrl()}/public/scores`, {
        params: {
          competitionId,
          teamId: selectedTeam._id || selectedTeam.id,
          gender,
          ageGroup,
          competitionType: selectedCompetitionType,
        },
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const scoreDocs = res.data?.data || [];
      if (!Array.isArray(scoreDocs) || scoreDocs.length === 0) return;

      const scoreDoc = scoreDocs[0];
      const playerScoresList = scoreDoc.playerScores || [];
      const targetPs = playerScoresList.find(
        (ps) => String(ps.playerId) === String(playerId)
      );

      if (!targetPs) return;

      const PANEL_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
      const loadedPanelScores = {};

      if (Array.isArray(targetPs.judgeSlips) && targetPs.judgeSlips.length > 0) {
        const roleMap = { SJ: 'Senior Judge', J1: 'Judge 1', J2: 'Judge 2', J3: 'Judge 3', J4: 'Judge 4' };
        targetPs.judgeSlips.forEach((slip) => {
          const jType = roleMap[slip.judgeRole] || slip.judgeRole;
          if (PANEL_TYPES.includes(jType) && Number(slip.total) > 0) {
            loadedPanelScores[jType] = {
              judgeType: jType,
              score: slip.total,
              breakdown: normalizeBreakdown(slip.breakdown, slip.total),
              timestamp: slip.submittedAt || new Date().toISOString(),
            };
          }
        });
      }

      if (targetPs.judgeScores) {
        const roleToType = {
          seniorJudge: 'Senior Judge',
          judge1: 'Judge 1',
          judge2: 'Judge 2',
          judge3: 'Judge 3',
          judge4: 'Judge 4',
        };
        Object.entries(targetPs.judgeScores).forEach(([key, val]) => {
          const jType = roleToType[key];
          if (jType && PANEL_TYPES.includes(jType) && Number(val) > 0 && !loadedPanelScores[jType]) {
            loadedPanelScores[jType] = {
              judgeType: jType,
              score: Number(val),
              breakdown: normalizeBreakdown(targetPs.breakdown, val),
              timestamp: new Date().toISOString(),
            };
          }
        });
      }

      setPanelScores(prev => ({
        ...loadedPanelScores,
        ...prev
      }));

      // Restore judge's own submitted score & inputs if present
      const myScore = loadedPanelScores[judgeInfo.judgeType];
      if (myScore) {
        setSubmitted(true);
        if (myScore.breakdown) {
          const b = normalizeBreakdown(myScore.breakdown, myScore.score);
          setScores({
            difficulty: {
              aClass: b.difficulty.aClass || 0,
              bClass: b.difficulty.bClass || 0,
              cClass: b.difficulty.cClass || 0,
              total: b.difficulty.total || 0,
            },
            combination: {
              checked: { ...buildInitialCombination().checked, ...(b.combination.checked || {}) },
              total: b.combination.total ?? 0,
            },
            execution: b.execution || 0,
            bonus: b.bonus || 0,
          });
        }
      }

      if (targetPs.isFinalized || scoreDoc.isLocked) {
        setFinalized(true);
      }
    } catch (err) {
      logger.warn('Could not load existing player scores:', err);
    }
  }, [judgeInfo, selectedPlayer, selectedTeam, selectedGender, selectedAgeGroup, selectedCompetitionType]);

  useEffect(() => {
    if (judgeInfo && selectedPlayer) {
      fetchExistingScores();
    }
  }, [judgeInfo, selectedPlayer, fetchExistingScores]);

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

    newSocket.on('score_updated', (data) => {
      const currentPlayerId = String(playerIdOf(selectedPlayer) || '');
      if (currentPlayerId && String(data.playerId) === currentPlayerId) {
        const PANEL_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
        if (PANEL_TYPES.includes(data.judgeType)) {
          setPanelScores(prev => ({
            ...prev,
            [data.judgeType]: {
              judgeType: data.judgeType,
              score: data.score,
              breakdown: normalizeBreakdown(data.breakdown, data.score),
              timestamp: data.timestamp || new Date().toISOString(),
            }
          }));
          if (data.isFinalSubmit || data.isLocked) {
            setFinalized(true);
          }
        }
      }
    });

    newSocket.on('scores_saved_notification', (data) => {
      const currentPlayerId = String(playerIdOf(selectedPlayer) || '');
      if (currentPlayerId && String(data.playerId) === currentPlayerId) {
        setFinalized(true);
        toast.success('Panel score finalized and locked');
      }
    });

    newSocket.on('scores_saved_error', (error) => {
      if (error.message === 'Unauthorized to save scores') {
        toast.error('You do not have permission to save scores');
      }
    });
    return () => { newSocket.disconnect(); joinedRoomRef.current = null; };
  }, [judgeInfo, selectedCompetitionType, navigate, selectedPlayer]);

  const resetScores = () => setScores({
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
    combination: buildInitialCombination(),
    execution: 0, bonus: 0
  });

  const handleDifficulty = (cls, val) => {
    const n = parseInt(val) || 0;
    const d = { ...scores.difficulty, [cls]: n };
    // Use C→B→A cascade: excess higher-class elements fill lower-class slots
    const resolved = resolveDifficultyValue(
      { A: d.aClass, B: d.bClass, C: d.cClass },
      req
    );
    // Hard-cap at the COP difficulty ceiling (3.80)
    d.total = Math.min(resolved.total, POINT_CEILINGS.difficulty);
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
    if (finalized) { toast.error('Panel score is already finalized'); return; }
    setSubmitting(true);
    try {
      const token = secureStorage.getItem('judge_token');
      const finalScore = calcFinal();
      const breakdown = {
        difficulty: scores.difficulty,
        combination: { total: scores.combination.total, checked: scores.combination.checked },
        execution: parseFloat(scores.execution || 0),
        originality: parseFloat(scores.bonus || 0),
        bonus: parseFloat(scores.bonus || 0)
      };
      const scoreData = {
        playerId: playerIdOf(selectedPlayer), playerName: selectedPlayer.name,
        judgeType: judgeInfo.judgeType, judgeNo: judgeInfo.judgeNo, score: parseFloat(finalScore),
        teamId: selectedTeam._id,
        gender: selectedGender || judgeInfo.gender,
        ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
        competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        apparatus: selectedApparatus,
        breakdown
      };
      await axios.post(`${apiConfig.getBaseUrl()}/public/save-score`, scoreData, {
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      try {
        const sKey = `judge_submitted_players_${selectedTeam._id}`;
        const prev = JSON.parse(sessionStorage.getItem(sKey) || '{}');
        prev[playerIdOf(selectedPlayer)] = true;
        sessionStorage.setItem(sKey, JSON.stringify(prev));
      } catch (e) {}
      if (socket?.connected) {
        socket.emit('score_update', {
          ...scoreData,
          roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`
        });
      }

      setPanelScores(prev => ({
        ...prev,
        [judgeInfo.judgeType]: {
          judgeType: judgeInfo.judgeType,
          score: finalScore,
          breakdown: normalizeBreakdown(breakdown, finalScore),
          timestamp: new Date().toISOString()
        }
      }));

      toast.success(`Score ${finalScore} submitted for ${selectedPlayer.name}`);
      setSubmitted(true);
      setViewMode('review');
    } catch (error) {
      logger.error('Failed to save score:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save score. Please try again.');
    } finally { setSubmitting(false); }
  };

  const goBackToScoring = () => {
    if (finalized) {
      toast.error('Cannot edit — panel score is already finalized');
      return;
    }
    // Restore local slip from last submitted panel entry if present
    const mine = panelScores[judgeInfo?.judgeType];
    if (mine?.breakdown) {
      const b = normalizeBreakdown(mine.breakdown, mine.score);
      setScores({
        difficulty: {
          aClass: b.difficulty.aClass || 0,
          bClass: b.difficulty.bClass || 0,
          cClass: b.difficulty.cClass || 0,
          total: b.difficulty.total || 0,
        },
        combination: {
          checked: { ...buildInitialCombination().checked, ...(b.combination.checked || {}) },
          total: b.combination.total ?? 0,
        },
        execution: b.execution || 0,
        bonus: b.bonus || 0,
      });
    }
    setSubmitted(false);
    setViewMode('scoring');
  };

  const PANEL_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
  const panelScoresCount = Object.keys(panelScores).filter(jt => PANEL_TYPES.includes(jt)).length;
  const effectivePanelSize = panelSize || panelScoresCount || 0;
  const panelMismatch = analyzePanelMismatches(panelScores, effectivePanelSize);
  const panelCalc = calculateAverageMarks(panelScoresToJudgeFields(panelScores), effectivePanelSize);
  const allPanelSubmitted = effectivePanelSize > 0 && panelScoresCount >= effectivePanelSize;
  const isSeniorJudge = judgeInfo?.judgeType === 'Senior Judge';
  // Final Submit is Senior Judge only
  const canFinalSubmit = !finalized && allPanelSubmitted && isSeniorJudge;

  const finalizePanelScore = async () => {
    if (!canFinalSubmit) return;
    if (panelMismatch.hasBlockingMismatch) {
      toast.error('Resolve Difficulty and Combination mismatches before final submit');
      return;
    }
    setFinalizing(true);
    try {
      const token = secureStorage.getItem('judge_token');
      const fields = panelScoresToJudgeFields(panelScores);
      const calc = calculateAverageMarks(fields, effectivePanelSize);
      const payload = {
        teamId: selectedTeam._id,
        gender: selectedGender || judgeInfo.gender,
        ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
        competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        isFinalSubmit: true,
        judgeType: judgeInfo.judgeType,
        panelSize: effectivePanelSize,
        playerScores: [{
          playerId: playerIdOf(selectedPlayer),
          playerName: selectedPlayer.name,
          apparatus: selectedApparatus,
          judgeScores: fields,
          executionAverage: calc.executionAvg,
          baseScore: calc.baseScore,
          baseScoreApplied: calc.baseScoreApplied,
          toleranceUsed: calc.tolerance,
          averageMarks: calc.average,
          finalScore: calc.average,
          panelSize: effectivePanelSize,
          isFinalized: true,
          finalizedAt: new Date().toISOString(),
          breakdown: panelScores[judgeInfo.judgeType]?.breakdown || {},
          judgeSlips: Object.values(panelScores).map((entry) => {
            const roleMap = {
              'Senior Judge': 'SR_JUDGE',
              'Judge 1': 'J1',
              'Judge 2': 'J2',
              'Judge 3': 'J3',
              'Judge 4': 'J4',
            };
            const b = normalizeBreakdown(entry.breakdown, entry.score);
            return {
              judgeRole: roleMap[entry.judgeType] || 'J1',
              difficultyScore: b.difficulty.total || 0,
              combinationScore: b.combination.total || 0,
              executionScore: b.execution || 0,
              bonusScore: b.bonus === 0.20 ? 0.20 : 0,
              total: parseFloat(entry.score) || 0,
              submittedAt: entry.timestamp || new Date(),
              isChiefPrefilled: entry.judgeType === 'Senior Judge',
            };
          }),
        }],
      };
      await axios.post(`${apiConfig.getBaseUrl()}/public/save-score`, payload, {
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      try {
        const sKey = `judge_submitted_players_${selectedTeam._id}`;
        const prev = JSON.parse(sessionStorage.getItem(sKey) || '{}');
        prev[playerIdOf(selectedPlayer)] = true;
        sessionStorage.setItem(sKey, JSON.stringify(prev));
      } catch (e) {}
      if (socket?.connected) {
        socket.emit('scores_saved', {
          roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`,
          playerId: playerIdOf(selectedPlayer),
          scores: { finalScore: calc.average, panelSize: effectivePanelSize },
        });
      }
      setFinalized(true);
      toast.success(`Final score ${calc.average.toFixed(2)} locked for ${selectedPlayer.name}`);
      // Return to dashboard so the player shows as scored/locked
      setTimeout(() => goBackAfterScoring(), 800);
    } catch (error) {
      logger.error('Failed to finalize panel score:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to finalize score');
    } finally {
      setFinalizing(false);
    }
  };

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  if (!judgeInfo || !selectedPlayer) return null;

  const finalScore = parseFloat(calcFinal());
  const JUDGE_ORDER = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
  const orderedPanelEntries = JUDGE_ORDER
    .filter((jt) => panelScores[jt])
    .map((jt) => [jt, panelScores[jt]]);

  return (
    <div className="min-h-dvh relative pb-24 lg:pb-0" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Orb x={5} y={10} size={400} color={J.purple} delay={0} duration={8} blur={120} />
      <Orb x={95} y={60} size={300} color={COLORS.saffron} delay={3} duration={10} blur={100} />
      <Orb x={50} y={95} size={250} color={J.purpleDark} delay={1.5} duration={7} blur={90} />

      {/*  Header  */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 sm:h-14 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button onClick={() => {
                if (viewMode === 'review' && !finalized) goBackToScoring();
                else goBackAfterScoring();
              }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                aria-label={viewMode === 'review' && !finalized ? 'Back to scoring' : 'Back to team'}>
                <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
              </button>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
                <Scale className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight truncate max-w-[140px] sm:max-w-[200px]">{judgeInfo.name}</p>
                <p className="text-xs truncate" style={{ color: J.purpleLight }}>{judgeInfo.judgeType}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 sm:hidden">
              <LiveDot connected={isConnected} compact />
              <button onClick={handleLogout}
                className="w-9 h-9 rounded-xl flex items-center justify-center border hover:bg-red-500/10"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
                aria-label="Logout">
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Scoring-for banner */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-xl border min-w-0 w-full sm:w-auto sm:max-w-xs"
            style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }}>
            <User className="w-4 h-4 flex-shrink-0" style={{ color: J.green }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{selectedPlayer.name}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{selectedTeam?.name}</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            <LiveDot connected={isConnected} />
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-red-500/10"
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
              aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-5" id="main-content">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}>
          
          <AnimatePresence mode="wait">
            {viewMode === 'scoring' && (
              <div key="scoring" className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 sm:gap-5 lg:min-h-[calc(100dvh-80px)]">
                {/* Left Column: Scoring Controls */}
                <div className="flex flex-col gap-3 sm:gap-4 order-1">
                  {/* Score hero — always first on mobile */}
                  <motion.div className="rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center relative overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #A855F720, #7C3AED20)', border: '1px solid rgba(168,85,247,0.3)' }}
                    animate={{ boxShadow: finalScore > 0 ? `0 0 60px rgba(168,85,247,0.2)` : 'none' }}>
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.15), transparent 60%)' }} />
                    <p className="text-xs font-bold tracking-widest uppercase mb-1 sm:mb-2 relative z-10" style={{ color: J.purpleLight }}>Final Score</p>
                    <motion.p className="text-5xl sm:text-7xl font-black relative z-10"
                      key={calcFinal()}
                      initial={{ scale: 0.9, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      style={{ color: '#fff' }}>
                      {calcFinal()}
                    </motion.p>
                    <p className="text-sm relative z-10 mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>out of 10.00</p>
                  </motion.div>

                  {/* Difficulty — high priority on mobile (right after score) */}
                  <div className="rounded-2xl border p-3 sm:p-4 space-y-3 lg:hidden"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-white text-sm">Difficulty</h3>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 3.80</span>
                    </div>
                    <div className="space-y-3">
                      {[['aClass', 'A', '0.20'], ['bClass', 'B', '0.40'], ['cClass', 'C', '0.60']].map(([key, lbl, mult]) => (
                        <Stepper key={key} label={`${lbl} - Class - ${mult}`} hint="" value={scores.difficulty[key]}
                          onChange={v => handleDifficulty(key, v)} />
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <span className="text-lg font-black" style={{ color: Math.abs(scores.difficulty.total - 3.80) < 0.01 ? J.green : J.amber }}>
                        {scores.difficulty.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>/ 3.80</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="rounded-2xl border p-3 sm:p-4"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-black text-white text-sm">Execution</h3>
                        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 4.40</span>
                      </div>
                      <ScoreInput label="" value={scores.execution} max={4.40} step={0.05}
                        onChange={e => {
                          const raw = parseFloat(e.target.value) || 0;
                          // Round to nearest 0.05 increment (0.00, 0.05, 0.10, ...)
                          const v = Math.round(raw * 20) / 20;
                          setScores({ ...scores, execution: Math.max(0, Math.min(4.40, v)) });
                        }} />
                    </div>

                    <div className="rounded-2xl border p-3 sm:p-4"
                      style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-black text-white text-sm">Originality</h3>
                        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>0.20</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {[['None', 0], ['+0.20', POINT_CEILINGS.bonus]].map(([label, val]) => {
                          const active = Math.abs((scores.bonus || 0) - val) < 1e-6;
                          return (
                            <button key={label} type="button"
                              onClick={() => setScores({ ...scores, bonus: val })}
                              className="py-3 rounded-xl border font-bold text-sm transition-all duration-200 min-h-[44px]"
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
                  </div>

                  <div className="rounded-2xl border p-3 sm:p-4 flex-1"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-white text-sm">Combination</h3>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{selectedApparatus || 'Pole Mallakhamb'}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 1.60</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {combinationChecklist.map((item) => (
                        <CheckRow key={item.id} checked={scores.combination.checked[item.id]}
                          onChange={() => handleCombination(item.id)} label={item.rule} penalty={item.penalty} />
                      ))}
                    </div>
                    <div className="flex justify-end pt-2">
                      <span className="text-lg font-black" style={{ color: J.purple }}>
                        {scores.combination.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>/ 1.60</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Summary & Submit (desktop difficulty lives here) */}
                <div className="flex flex-col gap-3 sm:gap-4 order-2">
                  <div className="hidden lg:block rounded-2xl border p-3 sm:p-4 space-y-3"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-white text-sm">Difficulty</h3>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: J.purpleLight }}>Max 3.80</span>
                    </div>
                    <div className="space-y-3">
                      {[['aClass', 'A', '0.20'], ['bClass', 'B', '0.40'], ['cClass', 'C', '0.60']].map(([key, lbl, mult]) => (
                        <Stepper key={key} label={`${lbl} - Class - ${mult}`} hint="" value={scores.difficulty[key]}
                          onChange={v => handleDifficulty(key, v)} />
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <span className="text-lg font-black" style={{ color: Math.abs(scores.difficulty.total - 3.80) < 0.01 ? J.green : J.amber }}>
                        {scores.difficulty.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'rgba(255,255,255,0.3)' }}>/ 3.80</span>
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-3 sm:p-4 space-y-1"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <h3 className="font-black text-white text-sm mb-2">Score Summary</h3>
                    <ScoreRow label="1. Difficulty" value={scores.difficulty.total} max="3.80" />
                    <ScoreRow label="2. Combination" value={scores.combination.total} max="1.60" />
                    <ScoreRow label="3. Execution" value={parseFloat(scores.execution || 0)} max="4.40" />
                    <ScoreRow label="4. Originality" value={parseFloat(scores.bonus || 0)} max="0.20" />
                  </div>

                  {/* Desktop submit */}
                  <div className="hidden lg:flex flex-col gap-3">
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
                            <Send className="w-5 h-5" aria-hidden="true" />
                            {panelScores[judgeInfo?.judgeType] ? 'Resubmit Score' : 'Submit Score'}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                    {!isConnected && (
                      <p className="text-center text-xs" style={{ color: '#EF4444' }}>
                        Not connected to server. Scores cannot be submitted.
                      </p>
                    )}
                    <button onClick={resetScores}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200 hover:bg-white/5"
                      style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset All Scores
                    </button>
                  </div>

                  {/* Mobile reset only (submit is sticky footer) */}
                  <button onClick={resetScores}
                    className="lg:hidden flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200 hover:bg-white/5"
                    style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset All Scores
                  </button>
                </div>

              </div>
            )}

            {/* Mobile sticky submit bar */}
            {viewMode === 'scoring' && (
              <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 p-3 border-t"
                style={{
                  background: 'rgba(10,10,10,0.96)',
                  backdropFilter: 'blur(16px)',
                  borderColor: 'rgba(168,85,247,0.2)',
                  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                }}>
                <div className="max-w-[1400px] mx-auto flex items-center gap-3">
                  <div className="flex-shrink-0 text-center px-2">
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: J.purpleLight }}>Total</p>
                    <p className="text-xl font-black text-white leading-none">{calcFinal()}</p>
                  </div>
                  <motion.button
                    onClick={submitScore}
                    disabled={submitting || !isConnected || submitted}
                    className="flex-1 py-3.5 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 min-h-[52px]"
                    style={{
                      background: submitted ? `linear-gradient(135deg, ${J.green}, ${J.greenDark})` : `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})`,
                      opacity: (!isConnected || submitting) ? 0.6 : 1,
                    }}
                    whileTap={reduced || submitting || !isConnected ? {} : { scale: 0.98 }}
                  >
                    {submitting ? 'Submitting…' : submitted ? (
                      <><CheckCircle className="w-4 h-4" aria-hidden="true" /> Submitted</>
                    ) : (
                      <><Send className="w-4 h-4" aria-hidden="true" /> {panelScores[judgeInfo?.judgeType] ? 'Resubmit' : 'Submit Score'}</>
                    )}
                  </motion.button>
                </div>
                {!isConnected && (
                  <p className="text-center text-[10px] mt-1.5" style={{ color: '#EF4444' }}>
                    Offline — cannot submit
                  </p>
                )}
              </div>
            )}

          {viewMode === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-5 pb-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-white">Panel Review</h2>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {panelScoresCount}
                    {effectivePanelSize ? ` / ${effectivePanelSize}` : ''} judges submitted
                    {effectivePanelSize ? ` · ${effectivePanelSize}-judge panel` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!finalized && (
                    <button
                      type="button"
                      onClick={goBackToScoring}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all duration-200 hover:bg-white/5"
                      style={{ borderColor: 'rgba(168,85,247,0.4)', color: J.purpleLight }}
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit My Score
                    </button>
                  )}
                  {finalized && (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.15)', color: J.green }}>
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" /> Finalized
                    </span>
                  )}
                </div>
              </div>

              {/* Panel mismatch alerts */}
              {(panelMismatch.difficultyMismatch || panelMismatch.combinationMismatch || panelMismatch.toleranceMismatch) && (
                <div className="space-y-2">
                  {panelMismatch.combinationMismatch && (
                    <div className="flex items-start gap-3 p-3.5 rounded-xl border"
                      style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)' }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-bold text-white">Combination of all the judges not matched</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {panelMismatch.combinationSelectionMismatch
                            ? 'Checklist selections differ between judges (same total is not enough — failed items must match).'
                            : `Totals: ${panelMismatch.combinationValues.map((v) => Number(v).toFixed(2)).join(', ')}`}
                        </p>
                      </div>
                    </div>
                  )}
                  {panelMismatch.difficultyMismatch && (
                    <div className="flex items-start gap-3 p-3.5 rounded-xl border"
                      style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)' }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-bold text-white">Difficulty of all the judges not matched</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {panelMismatch.difficultyMixMismatch
                            ? 'A/B/C element counts differ between judges (same total is not enough — the mix must match).'
                            : `Totals: ${panelMismatch.difficultyValues.map((v) => Number(v).toFixed(2)).join(', ')}`}
                        </p>
                      </div>
                    </div>
                  )}
                  {panelMismatch.toleranceMismatch && effectivePanelSize >= 4 && panelMismatch.toleranceInfo && (
                    <div className="flex items-start gap-3 p-3.5 rounded-xl border"
                      style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.4)' }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: J.amber }} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-bold text-white">Tolerance level mismatch</p>
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          |Exec avg {panelMismatch.toleranceInfo.executionAvg?.toFixed(2)} − Senior|
                          {' '}={panelMismatch.toleranceInfo.difference?.toFixed(2)} exceeds
                          ±{panelMismatch.toleranceInfo.tolerance?.toFixed(2)}. Base score
                          {' '}{panelMismatch.toleranceInfo.baseScore?.toFixed(2)} will be applied.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Detailed per-judge slips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {orderedPanelEntries.map(([judge, data]) => {
                  const b = normalizeBreakdown(data.breakdown, data.score);
                  const isYou = judge === judgeInfo?.judgeType;
                  const checkedMap = b.combination.checked || {};
                  const failedItems = combinationChecklist.filter((item) => !checkedMap[item.id]);
                  return (
                    <div key={judge} className="rounded-2xl border p-4 space-y-3"
                      style={{
                        background: isYou ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
                        borderColor: isYou ? J.purple : 'rgba(255,255,255,0.1)',
                      }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-white">
                          {judge}
                          {isYou && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">You</span>
                          )}
                        </div>
                        <div className="text-2xl font-black" style={{ color: isYou ? J.purpleLight : '#fff' }}>
                          {Number(data.score).toFixed(2)}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>Difficulty</p>
                        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          <span>A: {b.difficulty.aClass ?? 0}</span>
                          <span>B: {b.difficulty.bClass ?? 0}</span>
                          <span>C: {b.difficulty.cClass ?? 0}</span>
                          <span className="font-bold text-white">= {(b.difficulty.total ?? 0).toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>
                          Combination · {(b.combination.total ?? 0).toFixed(2)} / 1.60
                        </p>
                        {failedItems.length === 0 ? (
                          <p className="text-xs" style={{ color: J.green }}>All requirements met</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {failedItems.map((item) => (
                              <li key={item.id} className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                −{item.penalty.toFixed(2)} {item.rule}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <span>Execution: <strong className="text-white">{(b.execution || 0).toFixed(2)}</strong></span>
                        <span>Originality: <strong className="text-white">{(b.bonus || 0).toFixed(2)}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {panelScoresCount === 0 && (
                <p className="text-center text-sm py-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Waiting for judges to submit…
                </p>
              )}

              {/* Panel average preview */}
              {panelScoresCount > 0 && (
                <div className="rounded-2xl border p-4"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: J.purpleLight }}>
                    Panel Average Preview
                  </p>
                  <p className="text-3xl font-black text-white">
                    {(panelCalc.average || 0).toFixed(2)}
                  </p>
                  {panelCalc.baseScoreApplied && (
                    <p className="text-xs mt-1" style={{ color: J.amber }}>
                      Base score applied (exec avg {panelCalc.executionAvg?.toFixed(2)})
                    </p>
                  )}
                  {!allPanelSubmitted && (
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Waiting for remaining judges before final submit…
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                {canFinalSubmit && (
                  <motion.button
                    type="button"
                    onClick={finalizePanelScore}
                    disabled={finalizing || panelMismatch.hasBlockingMismatch}
                    className="flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl text-white font-bold min-h-[52px]"
                    style={{
                      background: panelMismatch.hasBlockingMismatch
                        ? 'rgba(255,255,255,0.1)'
                        : `linear-gradient(135deg, ${J.green}, ${J.greenDark})`,
                      opacity: finalizing || panelMismatch.hasBlockingMismatch ? 0.6 : 1,
                    }}
                    whileHover={reduced || finalizing ? {} : { scale: 1.01 }}
                    whileTap={reduced || finalizing ? {} : { scale: 0.98 }}
                  >
                    {finalizing ? (
                      <>
                        <motion.div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
                          animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                        Finalizing…
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" aria-hidden="true" />
                        Final Submit
                      </>
                    )}
                  </motion.button>
                )}
                {isSeniorJudge && !allPanelSubmitted && !finalized && (
                  <p className="flex-1 text-center text-xs self-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Final Submit unlocks when all {effectivePanelSize || 'panel'} judges have submitted
                    {panelMismatch.hasBlockingMismatch ? ' and mismatches are resolved' : ''}
                  </p>
                )}
                {!isSeniorJudge && !finalized && (
                  <p className="flex-1 text-center text-xs self-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Waiting for Senior Judge to Final Submit and lock scores
                  </p>
                )}
                <button
                  type="button"
                  onClick={goBackAfterScoring}
                  className="flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl text-white font-bold transition-all duration-300 min-h-[52px]"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  Return to Team
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default JudgeScoring;

