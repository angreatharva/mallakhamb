/**
 * Judge scoring session + panel data
 *
 * Shared by the scoring page (JudgeScoring) and the panel review page
 * (JudgePanelReview). Both need the same session context, the same judge
 * identity, and the same live panel feed — only what they render differs.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import axios from 'axios';
import apiConfig from '@/config/api.config';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { ACTIVE_SESSION_KEY, PANEL_TYPES, playerIdOf, normalizeBreakdown } from './judgeShared';

/**
 * A stored judgeSlip keeps only the four section totals — the A/B/C element
 * counts and the combination checklist are not persisted per judge. Rebuild
 * the breakdown shape the cards render from those totals.
 *
 * `detailed: false` marks that the element counts and per-item checklist are
 * unknown, so callers don't render zeros as if they were judged values.
 */
export function slipToBreakdown(slip) {
  if (slip.breakdown) return slip.breakdown;
  return {
    difficulty: { aClass: 0, bClass: 0, cClass: 0, total: Number(slip.difficultyScore) || 0 },
    combination: { checked: {}, total: Number(slip.combinationScore) || 0 },
    execution: Number(slip.executionScore) || 0,
    bonus: Number(slip.bonusScore) || 0,
    detailed: false,
  };
}

/**
 * Resolve the active scoring session from router state, falling back to
 * sessionStorage so a refresh (or a direct hit on the panel-review URL) still
 * knows which player is being scored.
 *
 * @param {object|null} locationState - react-router location.state
 * @returns {object} session fields, or nulls when there is no session
 */
export function useJudgeSession(locationState) {
  const navigate = useNavigate();
  const sessionRef = useRef(null);

  const activeSessionData = useMemo(() => {
    let incoming = null;
    if (
      locationState &&
      locationState.player &&
      (locationState.team || locationState.selectedTeam) &&
      locationState.competitionType
    ) {
      sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(locationState));
      incoming = locationState;
    } else {
      const saved = sessionStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) {
        try {
          incoming = JSON.parse(saved);
        } catch {
          incoming = null;
        }
      }
    }

    // Moving between the scoring and panel-review routes hands us a fresh
    // object describing the *same* session. Returning it would change the
    // identity of selectedPlayer/selectedTeam, rebuild the fetch callback and
    // refire its effect. Hold the previous object whenever nothing changed.
    const prev = sessionRef.current;
    const sameSession =
      prev && incoming &&
      prev.player?._id === incoming.player?._id &&
      prev.team?._id === incoming.team?._id &&
      prev.competitionType === incoming.competitionType &&
      prev.apparatus === incoming.apparatus;
    if (sameSession) return prev;

    sessionRef.current = incoming;
    return incoming;
  }, [locationState]);

  useEffect(() => {
    if (
      !activeSessionData ||
      !activeSessionData.player ||
      !activeSessionData.team ||
      !activeSessionData.competitionType
    ) {
      toast.error('Missing player selection. Redirecting to dashboard.');
      navigate('/judge/dashboard');
    }
  }, [activeSessionData, navigate]);

  return {
    activeSessionData,
    selectedTeam: activeSessionData?.team,
    selectedPlayer: activeSessionData?.player,
    selectedCompetitionType: activeSessionData?.competitionType,
    selectedApparatus: activeSessionData?.apparatus || 'Pole Mallakhamb',
    selectedGender: activeSessionData?.gender,
    selectedAgeGroup: activeSessionData?.ageGroup,
  };
}

/**
 * Read the logged-in judge from storage, bouncing to login if it is missing
 * or unreadable.
 */
export function useJudgeInfo() {
  const navigate = useNavigate();
  const [judgeInfo, setJudgeInfo] = useState(null);

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) {
      toast.error('Please login first');
      navigate('/judge/login');
      return;
    }
    try {
      setJudgeInfo(JSON.parse(storedJudge));
    } catch {
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  return judgeInfo;
}

/**
 * Load and live-track every judge's slip for the player being scored.
 *
 * @param {object} args
 * @param {object|null} args.judgeInfo
 * @param {object} args.session - the object returned by useJudgeSession
 * @returns {object} panel state, the socket, and a refetch handle
 */
export function useJudgePanelData({ judgeInfo, session }) {
  const {
    selectedTeam,
    selectedPlayer,
    selectedCompetitionType,
    selectedApparatus,
    selectedGender,
    selectedAgeGroup,
  } = session;

  const navigate = useNavigate();
  const [panelScores, setPanelScores] = useState({});
  const [panelSize, setPanelSize] = useState(null); // 3 | 4 | 5 from assigned judges
  const [judgeNameMap, setJudgeNameMap] = useState({});
  const [finalized, setFinalized] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const joinedRoomRef = useRef(null);

  // Resolve panel size + judge names from the judges assigned to this category
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
        const judgesData = res.data?.data || [];
        const panelJudges = (Array.isArray(judgesData) ? judgesData : [])
          .filter((j) => !j.isEmpty && j.name?.trim())
          .filter((j) => PANEL_TYPES.includes(j.judgeType));
        const count = panelJudges.length;
        if (count >= 3 && count <= 5) setPanelSize(count);
        else if (count > 5) setPanelSize(5);
        else setPanelSize(null);

        const nameMap = {};
        panelJudges.forEach((j) => { nameMap[j.judgeType] = j.name; });
        setJudgeNameMap(nameMap);
      } catch (err) {
        logger.warn('Could not load panel size from judges list', err);
      }
    };
    loadPanelSize();
  }, [judgeInfo, selectedCompetitionType, selectedApparatus, selectedGender, selectedAgeGroup]);

  // Fetch already-submitted slips for this player on mount/refresh.
  //
  // Uses the judge-authenticated /judge/scores/team, NOT /public/scores. The
  // public endpoint is built for the results page: it only returns locked
  // documents and drops every player that isn't finalized, so a panel that is
  // still being scored comes back empty — which is exactly the state this page
  // exists to show.
  const fetchExistingScores = useCallback(async () => {
    if (!judgeInfo || !selectedPlayer || !selectedTeam) return;
    try {
      const token = secureStorage.getItem('judge_token');
      const competitionId = judgeInfo.competition?._id || judgeInfo.competition;

      const res = await axios.get(`${apiConfig.getBaseUrl()}/judge/scores/team`, {
        params: {
          competitionId,
          gender: selectedGender || judgeInfo.gender,
          ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
          competitionType: selectedCompetitionType,
          apparatus: selectedApparatus,
        },
        headers: { ...apiConfig.getHeaders(), Authorization: `Bearer ${token}` },
        withCredentials: true,
      });

      const teams = res.data?.data || [];
      if (!Array.isArray(teams) || teams.length === 0) return;

      // The endpoint returns every registered team, so pick ours explicitly
      // rather than trusting ordering.
      const teamId = String(selectedTeam._id || selectedTeam.id);
      const team = teams.find((t) => String(t._id) === teamId);
      if (!team) return;

      const playerId = playerIdOf(selectedPlayer);
      const targetPs = (team.scores || []).find(
        (ps) => String(ps.playerId) === String(playerId)
      );
      if (!targetPs) return;
      const scoreDoc = { isLocked: team.scoreMetadata?.isLocked === true };

      const loadedPanelScores = {};

      if (Array.isArray(targetPs.judgeSlips) && targetPs.judgeSlips.length > 0) {
        // The server writes the chief's slip as SR_JUDGE (see the judgeRoleMap
        // in admin.controller.saveScores). SJ is accepted too for older rows.
        const roleMap = {
          SR_JUDGE: 'Senior Judge',
          SJ: 'Senior Judge',
          J1: 'Judge 1',
          J2: 'Judge 2',
          J3: 'Judge 3',
          J4: 'Judge 4',
        };
        targetPs.judgeSlips.forEach((slip) => {
          const jType = roleMap[slip.judgeRole] || slip.judgeRole;
          if (PANEL_TYPES.includes(jType) && Number(slip.total) > 0) {
            loadedPanelScores[jType] = {
              judgeType: jType,
              score: slip.total,
              breakdown: normalizeBreakdown(slipToBreakdown(slip), slip.total),
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

      setPanelScores((prev) => ({ ...loadedPanelScores, ...prev }));

      if (targetPs.isFinalized || scoreDoc.isLocked) {
        setFinalized(true);
      }
    } catch (err) {
      logger.warn('Could not load existing player scores:', err);
    }
  }, [judgeInfo, selectedPlayer, selectedTeam, selectedGender, selectedAgeGroup, selectedCompetitionType, selectedApparatus]);

  useEffect(() => {
    if (judgeInfo && selectedPlayer) fetchExistingScores();
  }, [judgeInfo, selectedPlayer, fetchExistingScores]);

  // Live panel feed
  useEffect(() => {
    if (!judgeInfo || !selectedCompetitionType) return;
    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');

    const newSocket = io(socketUrl, { auth: { token }, withCredentials: true });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
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
      if (currentPlayerId && String(data.playerId) === currentPlayerId && PANEL_TYPES.includes(data.judgeType)) {
        setPanelScores((prev) => ({
          ...prev,
          [data.judgeType]: {
            judgeType: data.judgeType,
            score: data.score,
            breakdown: normalizeBreakdown(data.breakdown, data.score),
            timestamp: data.timestamp || new Date().toISOString(),
          },
        }));
        if (data.isFinalSubmit || data.isLocked) setFinalized(true);
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

  const panelScoresCount = Object.keys(panelScores).filter((jt) => PANEL_TYPES.includes(jt)).length;
  const effectivePanelSize = panelSize || panelScoresCount || 0;
  const orderedPanelEntries = PANEL_TYPES
    .filter((jt) => panelScores[jt])
    .map((jt) => [jt, panelScores[jt]]);

  return {
    panelScores,
    setPanelScores,
    panelSize,
    judgeNameMap,
    finalized,
    setFinalized,
    socket,
    isConnected,
    refetchScores: fetchExistingScores,
    panelScoresCount,
    effectivePanelSize,
    orderedPanelEntries,
    allPanelSubmitted: effectivePanelSize > 0 && panelScoresCount >= effectivePanelSize,
    isSeniorJudge: judgeInfo?.judgeType === 'Senior Judge',
  };
}
