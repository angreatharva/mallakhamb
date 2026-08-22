/**
 * ScorerScoring.jsx - Scoring interface for Scorers
 *
 * Reuses the AdminScoring UI but for scorer role access.
 * Scorers can view and save scores (Time Keeper, Scorer name, Remarks)
 * but cannot unlock scores (only superadmin has that permission).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { Clock, Save, ArrowLeft, Lock, Eye, Trophy, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAdminAPI } from '@/services/user/admin.api';

const scorerAPI = createAdminAPI('/judge');
import { ResponsiveScoringTable } from '../../components/responsive/ResponsiveTable';
import { getTimeDeduction } from '@/utils/scoring/copRules';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ADMIN_COLORS } from '../../styles/tokens';
import BHALogo from '../../assets/BHA.png';
import ConfirmDialog from '@/components/auth/ConfirmDialog';

const ScorerScoring = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSessionData = useMemo(() => {
    if (location.state && location.state.selectedTeam && location.state.selectedCompetitionType) {
      sessionStorage.setItem('scorer_scoring_active_session', JSON.stringify(location.state));
      return location.state;
    }
    const saved = sessionStorage.getItem('scorer_scoring_active_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [location.state]);

  const { selectedTeam, selectedCompetitionType, gender, ageGroup } = activeSessionData || {};

  const [socket, setSocket] = useState(null);
  const [judges, setJudges] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [timeKeeper, setTimeKeeper] = useState('');
  const [scorer, setScorer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [existingScoreId, setExistingScoreId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [ageGroupStarted, setAgeGroupStarted] = useState(false);
  const [competitionType, setCompetitionType] = useState('Competition I');
  const [calculatedScores, setCalculatedScores] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogConfig, setConfirmDialogConfig] = useState({ title: '', message: '', shouldLock: false });

  // Get judge info from storage
  const [judgeInfo, setJudgeInfo] = useState(null);

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) {
      toast.error('Please login first');
      navigate('/judge/login');
      return;
    }
    try {
      const judge = JSON.parse(storedJudge);
      setJudgeInfo(judge);
      if (judge.judgeType !== 'Scorer') {
        toast.error('This page is only accessible to Scorers');
        navigate('/judge/dashboard');
      }
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  // Stabilize selectedGender and selectedAgeGroup using useMemo
  const selectedGender = useMemo(() => {
    if (gender) {
      return typeof gender === 'string' ? { value: gender, label: gender } : gender;
    }
    if (judgeInfo) {
      return { value: judgeInfo.gender, label: judgeInfo.gender };
    }
    return null;
  }, [gender, judgeInfo]);

  const selectedAgeGroup = useMemo(() => {
    if (ageGroup) {
      return typeof ageGroup === 'string' ? { value: ageGroup, label: ageGroup } : ageGroup;
    }
    if (judgeInfo) {
      return { value: judgeInfo.ageGroup, label: judgeInfo.ageGroup };
    }
    return null;
  }, [ageGroup, judgeInfo]);

  // Define loadExistingScores first (needed by fetchScoringData)
  const loadExistingScores = useCallback(async (teamId, gender, ageGroup, initialScores, currentPlayers) => {
    try {
      const scoresParams = { teamId, gender, ageGroup };
      const allResponse = await scorerAPI.getTeamScores(scoresParams);

      if (!allResponse?.data) {
        setScores(initialScores);
        return;
      }

      let teamsData = allResponse.data;
      if (allResponse.data.success && allResponse.data.data) {
        teamsData = allResponse.data.data;
      } else if (!Array.isArray(allResponse.data)) {
        teamsData = [allResponse.data];
      }

      const teamData = Array.isArray(teamsData) ? teamsData.find(t => t._id === teamId) || teamsData[0] : teamsData;

      if (!teamData || !teamData.scores || teamData.scores.length === 0) {
        toast('Starting fresh session', { icon: 'ℹ️' });
        setScores(initialScores);
        return;
      }

      const scoreMetadata = teamData.scoreMetadata;
      if (scoreMetadata) {
        setIsLocked(scoreMetadata.isLocked || false);
        setExistingScoreId(scoreMetadata._id);
        if (scoreMetadata.timeKeeper) setTimeKeeper(scoreMetadata.timeKeeper);
        if (scoreMetadata.scorer) setScorer(scoreMetadata.scorer);
        if (scoreMetadata.remarks) setRemarks(scoreMetadata.remarks);
        if (scoreMetadata.competitionType) setCompetitionType(scoreMetadata.competitionType);
        if (scoreMetadata.updatedAt) setLastUpdated(new Date(scoreMetadata.updatedAt));
      }

      if (teamData.scores && Array.isArray(teamData.scores)) {
        setCalculatedScores(teamData.scores);
      }

      const existingScores = { ...initialScores };
      teamData.scores.forEach(ps => {
        let targetId = currentPlayers.find(p => p.id === ps.playerId || p.id === ps.playerId?.toString())?.id;
        if (!targetId) {
          targetId = currentPlayers.find(p => p.name === ps.playerName)?.id;
        }

        if (targetId && existingScores[targetId]) {
          existingScores[targetId] = {
            time: ps.time || '',
            seniorJudge: ps.judgeScores?.seniorJudge !== undefined && ps.judgeScores?.seniorJudge !== null ? ps.judgeScores.seniorJudge.toString() : '',
            judge1: ps.judgeScores?.judge1 !== undefined && ps.judgeScores?.judge1 !== null ? ps.judgeScores.judge1.toString() : '',
            judge2: ps.judgeScores?.judge2 !== undefined && ps.judgeScores?.judge2 !== null ? ps.judgeScores.judge2.toString() : '',
            judge3: ps.judgeScores?.judge3 !== undefined && ps.judgeScores?.judge3 !== null ? ps.judgeScores.judge3.toString() : '',
            judge4: ps.judgeScores?.judge4 !== undefined && ps.judgeScores?.judge4 !== null ? ps.judgeScores.judge4.toString() : '',
            deduction: ps.deduction !== undefined && ps.deduction !== null ? ps.deduction.toString() : '',
            otherDeduction: ps.otherDeduction !== undefined && ps.otherDeduction !== null ? ps.otherDeduction.toString() : ''
          };
        }
      });

      setScores(existingScores);
      toast.success(scoreMetadata?.isLocked ? 'Found locked scoring session' : 'Found existing scoring session');
    } catch (error) {
      logger.error('Error loading existing scores:', error);
      toast.error('API call failed - starting fresh session');
      setScores(initialScores);
      setIsLocked(false);
      setExistingScoreId(null);
      setCalculatedScores([]);
    }
  }, []);

  // Define fetchScoringData before useEffects that use it
  const fetchScoringData = useCallback(async () => {
    try {
      setLoading(true);
      if (!selectedGender?.value || !selectedAgeGroup?.value) return;

      const judgesParams = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value };
      if (selectedCompetitionType?.value) judgesParams.competitionTypes = selectedCompetitionType.value;
      const judgesResponse = await scorerAPI.getJudges(judgesParams);
      const judgesData = judgesResponse.data.data || judgesResponse.data;
      const PANEL_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4'];
      const activeJudges = (Array.isArray(judgesData) ? judgesData : [])
        .filter(j => !j.isEmpty && j.name?.trim())
        .filter(j => PANEL_TYPES.includes(j.judgeType))
        .sort((a, b) => a.judgeNo - b.judgeNo);
      setJudges(activeJudges);

      const summaryParams = {};
      const summaryResponse = await scorerAPI.getAllJudgesSummary(summaryParams);
      const summaryData = summaryResponse.data.data?.summary || summaryResponse.data.summary || [];
      const ageGroupInfo = summaryData.find(item =>
        item.gender === selectedGender.value && item.ageGroup === selectedAgeGroup.value
      );
      const compTypeStarted = selectedCompetitionType ?
        ageGroupInfo?.competitionTypes?.[selectedCompetitionType.value]?.isStarted || false :
        ageGroupInfo?.isStarted || false;
      setAgeGroupStarted(compTypeStarted);

      if (selectedCompetitionType?.label) {
        const match = selectedCompetitionType.label.match(/^(Competition [I]+)/);
        setCompetitionType(match ? match[1] : 'Competition I');
      }

      const teamPlayers = (selectedTeam.players || [])
        .filter(pe => pe.player.gender === selectedGender.value && pe.ageGroup === selectedAgeGroup.value)
        .map(pe => ({
          id: pe.player._id,
          name: `${pe.player.firstName} ${pe.player.lastName}`,
          gender: pe.player.gender,
          ageGroup: pe.ageGroup,
          teamId: selectedTeam._id,
          teamName: selectedTeam.name
        }));
      setPlayers(teamPlayers);

      const initialScores = {};
      teamPlayers.forEach(p => {
        initialScores[p.id] = {
          time: '', seniorJudge: '', judge1: '', judge2: '', judge3: '', judge4: '', deduction: '', otherDeduction: ''
        };
      });
      setScores(initialScores);
      await loadExistingScores(selectedTeam._id, selectedGender.value, selectedAgeGroup.value, initialScores, teamPlayers);
    } catch (error) {
      logger.error('Error fetching scoring data:', error);
      toast.error('Failed to load scoring data');
    } finally {
      setLoading(false);
    }
  }, [selectedGender, selectedAgeGroup, selectedCompetitionType, selectedTeam, loadExistingScores]);

  useEffect(() => {
    if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
      navigate('/judge/dashboard');
      return;
    }
    fetchScoringData();
  }, [selectedTeam, selectedGender, selectedAgeGroup, navigate]);

  useEffect(() => {
    if (!judgeInfo) return;
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');

    const newSocket = io(socketUrl, {
      auth: { token },
      withCredentials: true
    });

    setSocket(newSocket);
    newSocket.on('connect', () => {
      setIsConnected(true);
      logger.info('Scorer socket connected successfully');

      const genderVal = selectedGender?.value || selectedGender || judgeInfo.gender;
      const ageGroupVal = selectedAgeGroup?.value || selectedAgeGroup || judgeInfo.ageGroup;
      const compTypeVal = selectedCompetitionType?.value || selectedCompetitionType || 'competition_1';

      if (genderVal && ageGroupVal && compTypeVal) {
        const roomId = `scoring_${genderVal}_${ageGroupVal}_${compTypeVal}`;
        newSocket.emit('join_scoring_room', { roomId });
        logger.info(`Joined scoring room: ${roomId}`);
      }
    });
    newSocket.on('disconnect', () => {
      setIsConnected(false);
      logger.info('Scorer socket disconnected');
    });
    newSocket.on('connect_error', (error) => {
      setIsConnected(false);
      logger.error('Scorer socket connection error:', error);
    });
    newSocket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
    return () => newSocket.disconnect();
  }, [judgeInfo, selectedCompetitionType, selectedGender, selectedAgeGroup]);

  useEffect(() => {
    if (!socket) return;
    const handleScoreUpdate = (data) => {
      if (isLocked) return;
      const playerExists = players.some(p => p.id === data.playerId);
      if (!playerExists) return;

      const fieldMap = {
        'Senior Judge': 'seniorJudge',
        'Judge 1': 'judge1',
        'Judge 2': 'judge2',
        'Judge 3': 'judge3',
        'Judge 4': 'judge4'
      };
      const fieldName = fieldMap[data.judgeType] || (data.judgeNo ? `judge${data.judgeNo}` : 'seniorJudge');

      setScores(prev => {
        const player = prev[data.playerId] || {};
        return {
          ...prev,
          [data.playerId]: {
            ...player,
            [fieldName]: data.score.toString()
          }
        };
      });
      setLastUpdated(new Date());
    };
    const handleScoresSaved = () => {
      fetchScoringData();
    };

    socket.on('score_updated', handleScoreUpdate);
    socket.on('scores_saved_notification', handleScoresSaved);

    return () => {
      socket.off('score_updated', handleScoreUpdate);
      socket.off('scores_saved_notification', handleScoresSaved);
    };
  }, [socket, players, isLocked, fetchScoringData]);

  const calculateAverageMarks = (playerScores) => {
    const executionScores = [parseFloat(playerScores.judge1) || 0, parseFloat(playerScores.judge2) || 0, parseFloat(playerScores.judge3) || 0, parseFloat(playerScores.judge4) || 0].filter(s => s > 0);
    if (executionScores.length === 0) return { average: 0, baseScoreApplied: false, executionAvg: 0, baseScore: 0 };
    let executionAverage = 0;
    if (executionScores.length <= 2) executionAverage = executionScores.reduce((s, v) => s + v, 0) / executionScores.length;
    else if (executionScores.length === 3) executionAverage = [...executionScores].sort((a, b) => a - b)[1];
    else {
      const sorted = [...executionScores].sort((a, b) => a - b);
      const trimmed = sorted.slice(1, -1);
      executionAverage = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    }
    const seniorJudge = parseFloat(playerScores.seniorJudge) || 0;
    if (seniorJudge === 0) return { average: parseFloat(executionAverage.toFixed(2)), baseScoreApplied: false, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: 0, tolerance: getTolerance(executionAverage) };
    const tolerance = getTolerance(executionAverage);
    if (Math.abs(executionAverage - seniorJudge) <= tolerance) {
      return { average: parseFloat(executionAverage.toFixed(2)), baseScoreApplied: false, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: 0, tolerance };
    }
    const baseScore = (executionAverage + seniorJudge) / 2;
    return { average: parseFloat(baseScore.toFixed(2)), baseScoreApplied: true, executionAvg: parseFloat(executionAverage.toFixed(2)), baseScore: parseFloat(baseScore.toFixed(2)), tolerance };
  };

  const getTolerance = (score) => {
    if (score >= 9) return 0.10;
    if (score >= 8) return 0.20;
    if (score >= 7) return 0.30;
    if (score >= 6) return 0.40;
    if (score >= 5) return 0.50;
    return 1.00;
  };

  const calculateFinalScore = (ps) => {
    const r = calculateAverageMarks(ps);
    return Math.max(0, r.average - (parseFloat(ps.deduction) || 0) - (parseFloat(ps.otherDeduction) || 0)).toFixed(2);
  };

  const handleScoreChange = (playerId, field, value) => {
    if (isLocked) {
      toast.error('Cannot edit scores - this entry is locked');
      return;
    }

    setScores(prev => {
      const updatedPlayer = { ...prev[playerId], [field]: value };

      if (field === 'time') {
        const timeStr = value.trim();
        let seconds = 0;
        if (timeStr.includes(':')) {
          const [m, s] = timeStr.split(':');
          seconds = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
        } else {
          seconds = parseInt(timeStr) || 0;
        }

        if (seconds > 0) {
          const overage = Math.max(0, seconds - 90);
          const deduction = getTimeDeduction(overage);
          updatedPlayer.deduction = deduction > 0 ? deduction.toFixed(2) : '';
        } else if (timeStr === '') {
          updatedPlayer.deduction = '';
        }
      }

      return { ...prev, [playerId]: updatedPlayer };
    });
    setLastUpdated(new Date());
  };

  const handleSaveScores = async () => {
    if (isLocked) {
      toast.error('Cannot save - this entry is already locked');
      return;
    }

    if (!timeKeeper?.trim()) {
      toast.error('Time Keeper name is required');
      return;
    }
    if (!scorer?.trim()) {
      toast.error('Scorer name is required');
      return;
    }

    const hasAnyScores = players.some(p => {
      const ps = scores[p.id];
      return ps && (ps.seniorJudge || ps.judge1 || ps.judge2 || ps.judge3 || ps.judge4);
    });
    if (!hasAnyScores) {
      toast.error('Please enter at least some scores before saving');
      return;
    }

    const playersWithoutTime = players.filter(p => {
      const ps = scores[p.id];
      return !ps?.time?.trim();
    });

    if (playersWithoutTime.length > 0) {
      const playerNames = playersWithoutTime.map(p => p.name).join(', ');
      toast.error(`Time is required for all players. Missing for: ${playerNames}`);
      return;
    }

    const allPlayersScored = players.every(p => {
      const ps = scores[p.id];
      if (!ps) return false;
      const hasJudge = (ps.seniorJudge && parseFloat(ps.seniorJudge) > 0) || (ps.judge1 && parseFloat(ps.judge1) > 0) || (ps.judge2 && parseFloat(ps.judge2) > 0) || (ps.judge3 && parseFloat(ps.judge3) > 0) || (ps.judge4 && parseFloat(ps.judge4) > 0);
      return hasJudge && ps.time?.trim();
    });
    const shouldLock = allPlayersScored;

    const dialogTitle = shouldLock ? 'Lock & Submit Scores' : 'Save Scores as Draft';
    const dialogMessage = shouldLock
      ? '⚠️ WARNING: Once scores are submitted and locked, they CANNOT be changed.\n\nAre you sure you want to proceed?'
      : 'Save scores as draft? You can edit them later before locking.';

    setConfirmDialogConfig({ title: dialogTitle, message: dialogMessage, shouldLock });
    setShowConfirmDialog(true);
  };

  const handleConfirmSave = async () => {
    const shouldLock = confirmDialogConfig.shouldLock;

    try {
      const competitionId = judgeInfo?.competition?._id || judgeInfo?.competition;
      const scoringData = {
        teamId: selectedTeam._id,
        teamName: selectedTeam.name,
        coachName: selectedTeam.coach?.name,
        coachEmail: selectedTeam.coach?.email,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionType,
        timeKeeper,
        scorer,
        remarks,
        isLocked: shouldLock,
        playerScores: players.map(p => {
          const r = calculateAverageMarks(scores[p.id]);
          return {
            playerId: p.id,
            playerName: p.name,
            time: scores[p.id].time,
            judgeScores: {
              seniorJudge: parseFloat(scores[p.id].seniorJudge) || 0,
              judge1: parseFloat(scores[p.id].judge1) || 0,
              judge2: parseFloat(scores[p.id].judge2) || 0,
              judge3: parseFloat(scores[p.id].judge3) || 0,
              judge4: parseFloat(scores[p.id].judge4) || 0
            },
            executionAverage: r.executionAvg,
            baseScore: r.baseScore,
            baseScoreApplied: r.baseScoreApplied,
            toleranceUsed: r.tolerance,
            averageMarks: r.average,
            deduction: parseFloat(scores[p.id].deduction) || 0,
            otherDeduction: parseFloat(scores[p.id].otherDeduction) || 0,
            finalScore: parseFloat(calculateFinalScore(scores[p.id]))
          };
        }),
        // Judges hold accounts now, so the panel record keeps the person's
        // address rather than the slot-derived username it used to stamp here.
        judgeDetails: judges.map(j => ({ judgeId: j._id, judgeName: j.name, judgeType: j.judgeType, email: j.email }))
      };

      if (competitionId) {
        scoringData.competition = competitionId;
      }

      const response = await scorerAPI.saveScores(scoringData);

      const responseData = response.data.data || response.data;
      const { scoreId, isLocked: responseLocked, playerScores: calculatedPlayerScores } = responseData;

      setCalculatedScores(calculatedPlayerScores || []);
      setIsLocked(responseLocked);
      setExistingScoreId(scoreId);

      toast.success(
        responseLocked
          ? '🎉 Scores saved and locked! Calculations complete.'
          : 'Scores saved as draft with automatic calculations.',
        { duration: 3000 }
      );

      if (socket && selectedGender?.value && selectedAgeGroup?.value && selectedCompetitionType?.value) {
        socket.emit('scores_saved', {
          teamId: selectedTeam._id,
          roomId: `scoring_${selectedGender.value}_${selectedAgeGroup.value}_${selectedCompetitionType.value}`,
          isLocked: responseLocked
        });
      }
    } catch (error) {
      logger.error('Error saving scores:', error);
      const errorMessage = error.response?.data?.message || 'Failed to save scores';
      toast.error(errorMessage);
      throw error;
    }
  };

  const darkInput = `w-full rounded-xl text-sm text-white placeholder-white/30 outline-none min-h-[44px] px-3 py-2.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`;
  const darkInputStyle = (disabled) => ({
    background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${ADMIN_COLORS.darkBorderMid}`
  });

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: ADMIN_COLORS.dark }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/10 rounded-full mx-auto mb-4 animate-spin"
            style={{ borderTopColor: ADMIN_COLORS.saffron }} />
          <p className="text-white/40 text-sm">Loading scoring page…</p>
        </div>
      </div>
    );
  }

  if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: ADMIN_COLORS.dark }}>
        <div className="text-center">
          <p className="text-white/50 mb-4">Invalid scoring session. Please go back and select a team.</p>
          <motion.button onClick={() => navigate('/judge/dashboard')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
            style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.purple}, ${ADMIN_COLORS.purpleDark})` }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            Back to Dashboard
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ background: ADMIN_COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <motion.header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.94)', backdropFilter: 'blur(20px)', borderColor: ADMIN_COLORS.darkBorderSubtle }}
        initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <motion.button onClick={() => navigate('/judge/dashboard')}
              className="flex items-center gap-2 text-sm font-semibold min-h-[44px] px-3 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: 'rgba(255,255,255,0.6)' }} whileHover={{ color: '#fff' }}>
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
            </motion.button>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <img src={BHALogo} alt="BHA" className="h-7 w-auto object-contain opacity-70" />
              <Trophy className="w-4 h-4" style={{ color: ADMIN_COLORS.saffron }} />
              <span className="text-white font-bold text-sm hidden sm:inline">Scorer Scoring</span>
              {isLocked && <Lock className="w-4 h-4" style={{ color: ADMIN_COLORS.red }} />}
            </div>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={isLocked ? { background: `${ADMIN_COLORS.red}20`, color: ADMIN_COLORS.red } : { background: `${ADMIN_COLORS.green}20`, color: ADMIN_COLORS.green }}>
            {isLocked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red }} />{isConnected ? 'Live' : 'Offline'}</>}
          </span>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        {isLocked && (
          <motion.div className="rounded-2xl border p-4 flex items-center justify-between gap-4"
            style={{ background: `${ADMIN_COLORS.red}10`, borderColor: `${ADMIN_COLORS.red}30` }}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: ADMIN_COLORS.red }} />
              <div>
                <p className="font-bold text-white text-sm">Scoring session is locked</p>
                <p className="text-xs mt-0.5 text-white/50">Scores saved and locked. Cannot be modified.</p>
              </div>
            </div>
          </motion.div>
        )}

        <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* 1. Scoring Session */}
            <div>
              <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: ADMIN_COLORS.saffron }}>Scoring Session</p>
              <h2 className="text-xl sm:text-2xl font-black text-white">{selectedGender.label} — {selectedAgeGroup.label}</h2>
              <div className="mt-2 space-y-1 text-sm text-white/50">
                <p>Team: <span className="text-white font-semibold">{selectedTeam.name}</span></p>
                <p>Coach: <span className="text-white font-semibold">{selectedTeam.coach?.name}</span></p>
                {selectedCompetitionType && <p>Competition: <span className="text-white font-semibold">{selectedCompetitionType.label}</span></p>}
              </div>
            </div>

            {/* 2. Judges Panel */}
            <div>
              <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: ADMIN_COLORS.saffron }}>Judges Panel</p>
              {judges.length > 0 ? (
                <div className="flex flex-row items-center gap-2 flex-nowrap overflow-x-auto">
                  {judges.map((jud) => {
                    const isSenior = jud.judgeType === 'Senior Judge';
                    return (
                      <div key={jud._id} className="rounded-xl border p-2 text-center min-w-[90px] flex-shrink-0"
                        style={{ background: isSenior ? `${ADMIN_COLORS.purple}12` : `${ADMIN_COLORS.blue}10`, borderColor: isSenior ? `${ADMIN_COLORS.purple}30` : `${ADMIN_COLORS.blue}25` }}>
                        <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold mb-1 truncate max-w-full"
                          style={{ background: isSenior ? `${ADMIN_COLORS.purple}25` : `${ADMIN_COLORS.blue}25`, color: isSenior ? ADMIN_COLORS.purpleLight : '#93C5FD' }}>
                          {jud.judgeType}
                        </span>
                        <p className="font-bold text-white text-xs truncate">{jud.name}</p>
                        <p className="text-[10px] text-white/40 truncate">{jud.email}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-white/30 text-sm py-4">No judges found for this category.</p>
              )}
            </div>

            {/* 3. Players */}
            <div className="text-left md:text-right flex-shrink-0">
              <p className="text-xs text-white/40 uppercase tracking-wide">Players</p>
              <p className="text-4xl font-black" style={{ color: ADMIN_COLORS.saffron }}>{players.length}</p>
            </div>
          </div>
        </div>

        {/* <div className="rounded-2xl border p-4" style={{ background: `${ADMIN_COLORS.blue}08`, borderColor: `${ADMIN_COLORS.blue}25` }}>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#93C5FD' }}>Scoring System</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-white/50">
            <p><span className="text-white/70 font-semibold">Execution Average:</span> From J1–J4. With 4 judges, highest and lowest excluded.</p>
            <p><span className="text-white/70 font-semibold">Base Score:</span> If diff exceeds tolerance, Base = (Exec + Senior) / 2</p>
            <p><span className="text-white/70 font-semibold">Tolerance:</span> 9.0+: ±0.10 · 8.0: ±0.20 · 7.0: ±0.30 · 6.0: ±0.40 · 5.0: ±0.50 · Below 5: ±1.00</p>
            <p><span className="text-white/70 font-semibold">Final Score:</span> Avg Marks − Time Deduction − Other Deduction</p>
          </div>
        </div> */}

        {players.length > 0 ? (
          <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <p className="text-xs font-bold tracking-widest uppercase mb-4 flex items-center gap-2" style={{ color: ADMIN_COLORS.saffron }}>
              <Clock className="w-3.5 h-3.5" /> Player Scoring {isLocked && <Eye className="w-3.5 h-3.5 text-white/30" />}
            </p>
            <ResponsiveScoringTable players={players} scores={scores} judges={judges} onScoreChange={handleScoreChange} isLocked={isLocked} />
          </div>
        ) : (
          <div className="rounded-2xl border p-8 text-center" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
            <p className="text-white/40">No players found for this category.</p>
          </div>
        )}

        <div className="rounded-2xl border p-6" style={{ background: ADMIN_COLORS.darkCard, borderColor: ADMIN_COLORS.darkBorderSubtle }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[{ label: 'Time Keeper', value: timeKeeper, setter: setTimeKeeper, placeholder: 'Enter time keeper name', required: true },
            { label: 'Scorer', value: scorer, setter: setScorer, placeholder: judgeInfo?.name || 'Enter scorer name', required: true },
            { label: 'Remarks', value: remarks, setter: setRemarks, placeholder: 'Enter any remarks', required: false }].map(({ label, value, setter, placeholder, required }) => (
              <div key={label}>
                <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: ADMIN_COLORS.saffronLight }}>
                  {label}
                  {required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <input type="text" value={value} onChange={(e) => setter(e.target.value)} disabled={isLocked} placeholder={placeholder} className={darkInput} style={darkInputStyle(isLocked)}
                  onFocus={(e) => { if (!isLocked) { e.target.style.borderColor = `${ADMIN_COLORS.saffron}50`; e.target.style.boxShadow = `0 0 0 3px ${ADMIN_COLORS.saffron}12`; } }}
                  onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }} />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            {!isLocked ? (
              <motion.button onClick={handleSaveScores}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white min-h-[48px]"
                style={{ background: `linear-gradient(135deg, ${ADMIN_COLORS.green}, #16A34A)` }}
                whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }} whileTap={{ scale: 0.97 }}>
                <Save className="w-4 h-4" /> Save & Lock Scores
              </motion.button>
            ) : (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <Lock className="w-4 h-4" /> Scores are saved and locked
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleConfirmSave}
        title={confirmDialogConfig.title}
        message={confirmDialogConfig.message}
        confirmText={confirmDialogConfig.shouldLock ? 'Lock & Submit' : 'Save Draft'}
        cancelText="Cancel"
        variant={confirmDialogConfig.shouldLock ? 'danger' : 'default'}
      />
    </div>
  );
};

export default ScorerScoring;