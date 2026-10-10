/**
 * ScorerScoring.jsx - Scoring interface for Scorers
 *
 * Reuses the AdminScoring UI but for scorer role access.
 * Scorers can view and save scores (Time Keeper, Scorer name, Remarks)
 * but cannot unlock scores (only superadmin has that permission).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Clock, Save, ArrowLeft, Lock, Eye, Trophy, AlertCircle, ListOrdered } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAdminAPI } from '@/services/user/admin.api';

const scorerAPI = createAdminAPI('/judge');
import { ResponsiveScoringTable } from '../../components/responsive/ResponsiveTable';
import { calculateAverageMarks, getTimeDeductionForTime } from '@/utils/scoring/copRules';
import { apparatusFor, apparatusKey, entryGender } from '@/utils/scoring/apparatus';
import { mirrorChiefSeat, panelSeats, soleApparatus } from '@/utils/scoring/judgePanel';
import { buildScorerRows } from './scorerRows';
import { seatTypesFor } from './useJudgePanelData';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ADMIN_COLORS, DATA_COLORS, FG, alpha } from '../../styles/tokens';
import { PoleMark } from '@/components/brand/Brand';
import ConfirmDialog from '@/components/auth/ConfirmDialog';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import AppearanceMenu from '@/components/layout/AppearanceMenu';

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

  /*
   * THE APPARATUS IS THE SCORER'S SEAT, AND IT WAS BEING DROPPED HERE.
   *
   * `JudgeDashboard` has always put `apparatus: selectedApparatus` into the
   * navigation state, but this line destructured four fields out of five, so
   * the sheet never knew which apparatus it was for. It listed every apparatus
   * each athlete is entered for — three rows per athlete for a squad entered on
   * all three — when a panel is seated for ONE of them and the Scorer sitting
   * with it can only record that one.
   *
   * Older sessions stored in `scorer_scoring_active_session` before the picker
   * existed have no apparatus, so this can still be undefined; everything below
   * falls back to the previous squad-derived behaviour when it is.
   */
  const { selectedTeam, selectedCompetitionType, gender, ageGroup, apparatus: seatApparatus } =
    activeSessionData || {};

  const [socket, setSocket] = useState(null);
  const [judges, setJudges] = useState([]);
  // Every seat on this panel, the Scorer and Time Keeper included — `judges`
  // above is the evaluation seats only, because its length picks the
  // averaging rule.
  const [panelStaff, setPanelStaff] = useState([]);
  // Time Keeper times that arrived before the sheet finished loading.
  const pendingTimesRef = useRef([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [timeKeeper, setTimeKeeper] = useState('');
  const [scorer, setScorer] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  /*
   * Two different reasons this sheet can be read-only, and they are not the
   * same thing. `isLocked` means THIS entry was saved and finalized; the
   * competition lock means the whole MEET has closed and nothing in it can
   * change again. `readOnly` is the union, and is what the inputs and the save
   * button read — each reason keeps its own banner so the Scorer is told which
   * one applies.
   */
  const { locked: competitionLocked } = useCompetitionLock();
  const readOnly = isLocked || competitionLocked;
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
      // The Scorer of THIS category — the account's first seat may be another
      // (e.g. Time Keeper, when one person holds both).
      const heldHere = seatTypesFor(judge, {
        gender, ageGroup, competitionType: selectedCompetitionType?.value, apparatus: seatApparatus,
      });
      if (!heldHere.includes('Scorer') && judge.judgeType !== 'Scorer') {
        toast.error('This page is only accessible to Scorers');
        navigate('/judge/dashboard');
      }
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps -- read once, on arrival

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
        /*
         * Locked for THIS apparatus, not for the squad.
         *
         * One document holds all three apparatus, so reading its `isLocked`
         * alone made the Pole panel's "Lock & Submit" hand the Rope and Hanging
         * sheets back read-only. `isLocked` is now only the admin's whole-sheet
         * freeze; `lockedApparatus` says which panels have finished.
         */
        const lockedSet = new Set((scoreMetadata.lockedApparatus || []).map(apparatusKey));
        // With no seat apparatus — a meet that declares none, so the sheet still
        // shows every apparatus — it is locked only once all of them are.
        const onScreen = seatApparatus
          ? [apparatusKey(seatApparatus)]
          : [...new Set((currentPlayers || []).map(p => apparatusKey(p.apparatus)))];
        const lockedHere = onScreen.length > 0 && onScreen.every(a => lockedSet.has(a));
        setIsLocked(!!scoreMetadata.isLocked || lockedHere);
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
        // Matched on athlete AND apparatus — a stored row belongs to exactly
        // one of this sheet's rows, and matching on the athlete alone would
        // pour a Rope result into the Pole row.
        const wanted = apparatusKey(ps.apparatus);
        let targetId = currentPlayers.find(
          p => String(p.playerId) === String(ps.playerId) && apparatusKey(p.apparatus) === wanted
        )?.id;
        if (!targetId) {
          targetId = currentPlayers.find(
            p => p.name === ps.playerName && apparatusKey(p.apparatus) === wanted
          )?.id;
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

      /*
       * ASK FOR ONE APPARATUS' PANEL, NOT THE CATEGORY'S SEATS.
       *
       * A category is seated per apparatus now, so leaving this off returns
       * every apparatus's panel concatenated — and `judges.length` below picks
       * the averaging method. See utils/scoring/judgePanel.js.
       *
       * The Scorer's own seat answers this directly — they sit with ONE panel —
       * so it is preferred over anything inferred from the squad. Deriving it
       * from the entries only works while a squad is entered for a single
       * apparatus; one spanning all three yields nothing, the filter comes off,
       * and the query returns three panels concatenated.
       */
      const teamApparatus = seatApparatus || soleApparatus(
        (selectedTeam.players || [])
          .filter(pe => entryGender(pe) === selectedGender.value && pe.ageGroup === selectedAgeGroup.value)
          .flatMap(pe => apparatusFor(pe, selectedCompetitionType?.value).map(a => ({ apparatus: a })))
      );

      const judgesParams = { gender: selectedGender.value, ageGroup: selectedAgeGroup.value };
      if (selectedCompetitionType?.value) judgesParams.competitionTypes = selectedCompetitionType.value;
      if (teamApparatus) judgesParams.apparatus = teamApparatus;
      const judgesResponse = await scorerAPI.getJudges(judgesParams);
      const judgesData = judgesResponse.data.data || judgesResponse.data;
      setJudges(panelSeats(judgesData, teamApparatus));
      setPanelStaff(Array.isArray(judgesData) ? judgesData : []);

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

      // One row per (athlete, apparatus), narrowed to this Scorer's seat.
      // See scorerRows.js for why both halves of that matter.
      const teamPlayers = buildScorerRows({
        team: selectedTeam,
        gender: selectedGender.value,
        ageGroup: selectedAgeGroup.value,
        competitionType: selectedCompetitionType?.value,
        apparatus: seatApparatus,
      });
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
      // The slip broadcasts the athlete and the apparatus it was scored on;
      // the row it belongs to is the pair.
      const rowId = `${data.playerId}::${apparatusKey(data.apparatus)}`;
      if (!players.some(p => p.id === rowId)) return;

      const fieldMap = {
        'Senior Judge': 'seniorJudge',
        'Judge 1': 'judge1',
        'Judge 2': 'judge2',
        'Judge 3': 'judge3',
        'Judge 4': 'judge4'
      };
      const fieldName = fieldMap[data.judgeType] || (data.judgeNo ? `judge${data.judgeNo}` : 'seniorJudge');

      setScores(prev => {
        const row = prev[rowId] || {};
        return { ...prev, [rowId]: { ...row, [fieldName]: data.score.toString() } };
      });
      setLastUpdated(new Date());
    };
    const handleScoresSaved = () => {
      fetchScoringData();
    };
    /*
     * The Time Keeper stopped the clock on an athlete: fill that row's Time.
     * Through handleScoreChange, exactly as if it had been typed, so the time
     * deduction is worked out the same way. A time for another team's sheet,
     * or a row this sheet does not have, is not ours.
     */
    const handleTimeRecorded = (data) => {
      if (readOnly || !data || data.ack) return;
      if (data.teamId && String(data.teamId) !== String(selectedTeam?._id)) return;
      // Still loading: the saved scores are about to replace every row, so
      // hold the time and apply it once they have (see the effect below).
      if (loading) {
        pendingTimesRef.current.push(data);
        return;
      }
      applyRecordedTime(data);
    };

    socket.on('score_updated', handleScoreUpdate);
    socket.on('scores_saved_notification', handleScoresSaved);
    socket.on('time_recorded', handleTimeRecorded);

    return () => {
      socket.off('score_updated', handleScoreUpdate);
      socket.off('scores_saved_notification', handleScoresSaved);
      socket.off('time_recorded', handleTimeRecorded);
    };
  }, [socket, players, isLocked, readOnly, loading, selectedTeam, fetchScoringData]); // eslint-disable-line react-hooks/exhaustive-deps -- handleScoreChange is recreated every render

  // Times that arrived while the sheet was loading, applied once it has.
  useEffect(() => {
    if (loading || pendingTimesRef.current.length === 0) return;
    const pending = pendingTimesRef.current;
    pendingTimesRef.current = [];
    pending.forEach(applyRecordedTime);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps -- applyRecordedTime is recreated every render

  /*
   * WHAT THE SHEET DRAWS IS NOT WHAT THE PANEL IS.
   *
   * A 4-judge panel is scored as a five: the Sr. Judge's mark fills the vacant
   * fourth evaluation slot, and drop-high-low then runs over four marks of
   * which one is the Chief's. The sheet used to draw four columns and print an
   * Average computed over five marks — the fifth appearing nowhere. It now
   * draws five, the last of them the Sr. Judge's own cell repeated.
   *
   * `judges` stays the SEATS that were staffed. It is what records the panel in
   * `judgeDetails`, and its length is what picks the averaging method — the
   * copy must never be counted there. See mirrorChiefSeat.
   */
  const sheetSeats = useMemo(() => mirrorChiefSeat(judges), [judges]);

  /*
   * Time Keeper and Scorer names, filled in rather than typed: the Time Keeper
   * seated on this panel, and the Scorer signed in here. Only into an empty
   * field once the sheet has loaded — a name saved with the sheet wins, and a
   * name the Scorer changes by hand is left alone.
   */
  const timeKeeperSeatName = useMemo(() => {
    const seats = panelStaff.filter(j => j.judgeType === 'Time Keeper' && j.name?.trim());
    const own = seats.find(j => seatApparatus && j.apparatus === seatApparatus);
    return (own || seats[0])?.name || '';
  }, [panelStaff, seatApparatus]);
  const scorerSelfName = judgeInfo?.name
    || [judgeInfo?.firstName, judgeInfo?.lastName].filter(Boolean).join(' ');

  useEffect(() => {
    if (loading || readOnly) return;
    if (timeKeeperSeatName) setTimeKeeper(prev => (prev?.trim() ? prev : timeKeeperSeatName));
    if (scorerSelfName) setScorer(prev => (prev?.trim() ? prev : scorerSelfName));
  }, [loading, readOnly, timeKeeperSeatName, scorerSelfName]);
  const seatedPanelSize = judges.length || undefined;

  /*
   * Panel averaging comes from copRules, the same module the judges' own pages
   * and the score table use. This file used to carry a private copy that took
   * the MEDIAN of three execution marks where copRules took the mean, so a
   * 4-judge panel produced one number in the table on this screen and a
   * different one in the payload this screen posted. The panel-size rules live
   * in one place now; see calculateAverageMarks there.
   */
  const panelAverage = (playerScores) => calculateAverageMarks(playerScores, seatedPanelSize);

  // The sheet is one team on one apparatus, both named at the top — the line
  // under each athlete's name repeated them on every row.
  const tableRows = useMemo(() => players.map(({ teamName: _teamName, ...row }) => row), [players]);

  const calculateFinalScore = (ps) => {
    const r = panelAverage(ps);
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
          // Short of 60 s or over 90 s — the same table both ways.
          const deduction = getTimeDeductionForTime(seconds);
          updatedPlayer.deduction = deduction > 0 ? deduction.toFixed(2) : '';
        } else if (timeStr === '') {
          updatedPlayer.deduction = '';
        }
      }

      return { ...prev, [playerId]: updatedPlayer };
    });
    setLastUpdated(new Date());
  };

  /** Put a Time Keeper's time into its athlete's row, as if it were typed. */
  const applyRecordedTime = (data) => {
    if (readOnly) return;
    const rowId = `${data.playerId}::${apparatusKey(data.apparatus)}`;
    const row = players.find(p => p.id === rowId);
    if (!row) return;
    handleScoreChange(rowId, 'time', String(data.seconds));
    if (data.timeKeeperName) setTimeKeeper(prev => (prev?.trim() ? prev : data.timeKeeperName));
    toast.success(`Time ${data.seconds} s recorded for ${row.name}`);
  };

  const handleSaveScores = async () => {
    if (isLocked) {
      toast.error('Cannot save - this entry is already locked');
      return;
    }

    if (competitionLocked) {
      toast.error('This competition has closed. Scores can no longer be changed.');
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
          const r = panelAverage(scores[p.id]);
          return {
            playerId: p.playerId,
            playerName: p.name,
            apparatus: p.apparatus,
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
      const {
        scoreId, isLocked: responseLocked, lockedApparatus, playerScores: calculatedPlayerScores,
      } = responseData;

      setCalculatedScores(calculatedPlayerScores || []);
      /*
       * A Scorer's lock is recorded against the apparatus, not the document, so
       * `responseLocked` stays false for it — reading that alone handed the
       * sheet straight back as editable after a successful "Lock & Submit".
       */
      const lockedSet = new Set((lockedApparatus || []).map(apparatusKey));
      const onScreen = seatApparatus
        ? [apparatusKey(seatApparatus)]
        : [...new Set(players.map(p => apparatusKey(p.apparatus)))];
      setIsLocked(!!responseLocked || (onScreen.length > 0 && onScreen.every(a => lockedSet.has(a))));
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

  const darkInput = `w-full rounded-xl text-base mouse:text-sm text-ink placeholder-ink/30 min-h-[44px] px-3 py-2.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`;
  const darkInputStyle = (disabled) => ({
    background: disabled ? 'rgb(var(--ink) / 0.02)' : 'rgb(var(--ink) / 0.04)',
    border: `1px solid ${ADMIN_COLORS.darkBorderMid}`
  });

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-ink/10 rounded-full mx-auto mb-4 animate-spin border-t-accent"/>
          <p className="text-fg-muted text-sm">Loading scoring page…</p>
        </div>
      </div>
    );
  }

  if (!selectedTeam || !selectedGender || !selectedAgeGroup) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg">
        <div className="text-center">
          <p className="text-fg-muted mb-4">Invalid scoring session. Please go back and select a team.</p>
          <button onClick={() => navigate('/judge/dashboard')} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent min-h-[44px]" style={{ background: 'rgb(var(--accent))' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b bg-bg border-line">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/judge/dashboard')} className="flex items-center gap-2 text-sm font-semibold min-h-[44px] px-3 rounded-lg hover:bg-ink/10 transition-colors text-ink/60 hover:text-ink">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
            </button>
            <div className="w-px h-5 bg-ink/10" />
            <div className="flex items-center gap-2">
              <PoleMark className="h-7 w-auto opacity-70" />
              <Trophy className="w-4 h-4 text-accent-fg"/>
              <span className="text-ink font-bold text-sm hidden sm:inline">Scorer Scoring</span>
              {isLocked && <Lock className="w-4 h-4 text-danger-fg"/>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/*
              * The Scorer sets the running order as well as recording the
              * marks — they are the person watching the floor, and the order
              * changes there (a withdrawal, an athlete not ready) long after
              * the lots were drawn. The server allows it (SEQUENCE_JUDGE_TYPES
              * is Senior Judge and Scorer); until now the only way in was the
              * dashboard, which meant leaving a half-filled sheet to reach it.
              *
              * /judge/sequence reads the category from the same sessionStorage
              * keys the dashboard wrote on the way here.
              */}
            <button onClick={() => navigate('/judge/sequence')} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold tap-safe mouse:min-h-[36px] transition-colors" style={{
                borderColor: `${alpha(ADMIN_COLORS.purple, 0x40)}`,
                color: DATA_COLORS.purpleSoft,
                background: `${alpha(ADMIN_COLORS.purple, 0x12)}`,
              }}>
              <ListOrdered className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Set Sequence</span>
            </button>
            <AppearanceMenu />
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={isLocked ? { background: `${alpha(ADMIN_COLORS.red, 0x20)}`, color: FG.danger } : { background: `${alpha(ADMIN_COLORS.green, 0x20)}`, color: FG.success }}>
              {isLocked ? <><Lock className="w-3.5 h-3.5" /> Locked</> : <><div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`} style={{ background: isConnected ? ADMIN_COLORS.green : ADMIN_COLORS.red }} />{isConnected ? 'Live' : 'Offline'}</>}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <CompetitionLockBanner />

        {isLocked && (
          <div className="rounded-2xl border p-4 flex items-center justify-between gap-4 bg-surface-sunken border-line">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-danger-fg"/>
              <div>
                <p className="font-bold text-ink text-sm">Scoring session is locked</p>
                <p className="text-xs mt-0.5 text-fg-muted">Scores saved and locked. Cannot be modified.</p>
              </div>
            </div>
          </div>
        )}

        {/* Scoring session — one compact strip: the category, the four facts
            the Scorer checks at a glance, and the player count. */}
        <div className="rounded-2xl border px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 bg-surface border-line">
          <div className="flex items-center justify-between gap-4 sm:block sm:flex-shrink-0">
            <div>
              <p className="type-tag text-accent-fg">Scoring Session</p>
              <h2 className="text-lg sm:text-xl font-black text-ink leading-tight">{selectedGender.label} — {selectedAgeGroup.label}</h2>
            </div>
            {/* Count on the right of the title on a phone… */}
            <p className="sm:hidden flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-accent-fg">{players.length}</span>
              <span className="text-[10px] uppercase tracking-widest text-fg-muted">Players</span>
            </p>
          </div>

          <div className="hidden sm:block w-px self-stretch bg-ink/10" aria-hidden="true" />

          <dl className="flex flex-wrap gap-x-6 gap-y-2 flex-1 min-w-0">
            {[
              ['Team', selectedTeam.name],
              ['Coach', selectedTeam.coach?.name],
              ['Competition', selectedCompetitionType?.label],
              ['Apparatus', seatApparatus],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-widest text-fg-muted">{label}</dt>
                <dd className="text-sm font-semibold text-ink truncate">{value}</dd>
              </div>
            ))}
          </dl>

          {/* …and at the far end on a wide screen. */}
          <p className="hidden sm:flex flex-col items-end flex-shrink-0 leading-none">
            <span className="text-3xl font-black text-accent-fg">{players.length}</span>
            <span className="text-[10px] uppercase tracking-widest text-fg-muted mt-1">Players</span>
          </p>
        </div>

        {/* <div className="rounded-2xl border p-4 bg-surface-sunken border-line">
          <p className="type-tag mb-2 text-fg-secondary">Scoring System</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-fg-muted">
            <p><span className="text-ink/70 font-semibold">Execution Average:</span> From J1–J4. With 4 judges, highest and lowest excluded.</p>
            <p><span className="text-ink/70 font-semibold">Base Score:</span> If diff exceeds tolerance, Base = (Exec + Senior) / 2</p>
            <p><span className="text-ink/70 font-semibold">Tolerance:</span> 9.0+: ±0.10 · 8.0: ±0.20 · 7.0: ±0.30 · 6.0: ±0.40 · 5.0: ±0.50 · Below 5: ±1.00</p>
            <p><span className="text-ink/70 font-semibold">Final Score:</span> Avg Marks − Time Deduction − Other Deduction</p>
          </div>
        </div> */}

        {players.length > 0 ? (
          <div className="rounded-2xl border p-6 bg-surface border-line">
            <p className="type-tag mb-4 flex items-center gap-2 text-accent-fg">
              <Clock className="w-3.5 h-3.5" /> Player Scoring {isLocked && <Eye className="w-3.5 h-3.5 text-ink/30" />}
            </p>
            {/* `judges` sizes the panel, `sheetSeats` draws it — they differ by
                the Chief's copy on a 4-judge panel, and the size is what picks
                the averaging rule. */}
            <ResponsiveScoringTable players={tableRows} scores={scores} judges={sheetSeats} panelSize={seatedPanelSize} onScoreChange={handleScoreChange} isLocked={readOnly} />
          </div>
        ) : (
          <div className="rounded-2xl border p-8 text-center bg-surface border-line">
            <p className="text-fg-muted">No players found for this category.</p>
          </div>
        )}

        <div className="rounded-2xl border p-6 bg-surface border-line">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[{ label: 'Time Keeper', value: timeKeeper, setter: setTimeKeeper, placeholder: 'Enter time keeper name', required: true },
            { label: 'Scorer', value: scorer, setter: setScorer, placeholder: judgeInfo?.name || 'Enter scorer name', required: true },
            { label: 'Remarks', value: remarks, setter: setRemarks, placeholder: 'Enter any remarks', required: false }].map(({ label, value, setter, placeholder, required }) => {
              // Tie each label to its field. Without `htmlFor` these read as
              // three unlabelled text boxes to a screen reader — and the page
              // already has text inputs of its own in the score table, so
              // "the box next to Time Keeper" is not something anything can
              // work out from the markup alone.
              const fieldId = `scorer-${label.toLowerCase().replace(/\s+/g, '-')}`;
              return (
              <div key={label}>
                <label htmlFor={fieldId} className="block type-tag mb-2 text-accent-fg">
                  {label}
                  {required && <span className="text-red-700 dark:text-red-500 ml-1">*</span>}
                </label>
                <input id={fieldId} type="text" value={value} onChange={(e) => setter(e.target.value)} disabled={readOnly} placeholder={placeholder} className={darkInput} style={darkInputStyle(readOnly)}
                  onFocus={(e) => { if (!readOnly) { e.target.style.borderColor = `${alpha(ADMIN_COLORS.saffron, 0x50)}`; e.target.style.boxShadow = `0 0 0 3px ${alpha(ADMIN_COLORS.saffron, 0x12)}`; } }}
                  onBlur={(e) => { e.target.style.borderColor = ADMIN_COLORS.darkBorderMid; e.target.style.boxShadow = 'none'; }} />
              </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            {!readOnly ? (
              <button onClick={handleSaveScores} className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-ink min-h-[48px]" style={{ background: 'rgb(var(--success-fill))', color: '#0A0A0A' }}>
                <Save className="w-4 h-4" /> Save & Lock Scores
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-fg-muted">
                <Lock className="w-4 h-4" />
                {isLocked ? 'Scores are saved and locked' : 'This competition has closed'}
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