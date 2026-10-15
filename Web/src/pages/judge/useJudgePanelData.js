/**
 * Judge scoring session + panel data
 *
 * Shared by the scoring page (JudgeScoring) and the panel review page
 * (JudgePanelReview). Both need the same session context, the same judge
 * identity, and the same live panel feed — only what they render differs.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiConfig from '@/config/api.config';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { judgeAPI } from '@/services/public/judge.api';
import { apparatusKey, apparatusToJudge } from '@/utils/scoring/apparatus';
import { panelSeats } from '@/utils/scoring/judgePanel';
import { ACTIVE_SESSION_KEY, PANEL_TYPES, playerIdOf, normalizeBreakdown } from './judgeShared';

/**
 * HIGH-W3: a 401 here means the session is gone, not that the panel is empty.
 *
 * These loaders used to swallow every error into a `logger.warn`, so an expired
 * token rendered Panel Review as though no judge had submitted — the Senior
 * Judge would see no slips and either re-enter marks or wait. The API client's
 * response interceptor already attempts a silent refresh and dispatches
 * AUTH_EXPIRED when that fails; this makes sure the user is told rather than
 * shown a plausible-looking lie.
 *
 * @param {unknown} err - Error from a judgeAPI call
 * @returns {boolean} true when the error was an auth failure
 */
function isAuthFailure(err) {
  const status = err?.response?.status;
  return status === 401 || status === 403;
}

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

  /*
   * The apparatus being judged, which decides the combination checklist the
   * slip renders and which score this athlete's marks belong to.
   *
   * This used to be `activeSessionData?.apparatus || 'Pole Mallakhamb'`, and
   * the fallback was doing all the work: no competition in the seeded data
   * declares an `apparatusConfig`, so the dashboard never offered a picker,
   * nothing ever set `apparatus`, and every athlete — Rope athletes included —
   * was judged on the ten-item Pole checklist. The athlete's own registration
   * is consulted first now, and the Pole default is reached only when nobody
   * has said anything at all.
   */
  const selectedApparatus = apparatusToJudge(
    activeSessionData?.apparatus,
    activeSessionData?.player,
    activeSessionData?.competitionType
  );

  return {
    activeSessionData,
    selectedTeam: activeSessionData?.team,
    selectedPlayer: activeSessionData?.player,
    selectedCompetitionType: activeSessionData?.competitionType,
    selectedApparatus,
    selectedGender: activeSessionData?.gender,
    selectedAgeGroup: activeSessionData?.ageGroup,
  };
}

/**
 * Which seat does this judge hold for the category on screen?
 *
 * A judge account can sit on several panels — Senior Judge in Under-14 Male,
 * Judge 2 in Under-16 Female — so "my role" is a property of the category
 * being scored, not of the account. The server resolves it the same way and
 * ignores whatever the client asserts (see admin.controller saveScores), so
 * this exists to keep the UI honest: which slip is mine, which controls I get,
 * what my badge says.
 *
 * Falls back to the account's primary seat, which is the only seat for the
 * overwhelming majority of judges.
 *
 * @param {object|null} judgeInfo - The stored judge, with `allAssignments`
 * @param {object} category - { gender, ageGroup, competitionType, apparatus }
 * @returns {object|null}
 */
/** Does this seat cover the category? */
const seatCovers = (seat, category) => {
  if (category.gender && seat.gender !== category.gender) return false;
  if (category.ageGroup && seat.ageGroup !== category.ageGroup) return false;
  if (category.competitionType) {
    const types = Array.isArray(seat.competitionTypes) ? seat.competitionTypes : [];
    // An empty list means "every category in this gender/age group" — a
    // Scorer is routinely created without competition types.
    if (types.length > 0 && !types.includes(category.competitionType)) return false;
  }
  if (category.apparatus && seat.apparatus && seat.apparatus !== category.apparatus) return false;
  return true;
};

const allSeats = (judgeInfo) =>
  (judgeInfo?.allAssignments?.length ? judgeInfo.allAssignments : [judgeInfo]).filter(Boolean);

export function resolveJudgeSeat(judgeInfo, category = {}) {
  if (!judgeInfo) return null;
  const seats = allSeats(judgeInfo);
  return seats.find((seat) => seatCovers(seat, category)) || seats[0] || null;
}

/**
 * EVERY seat type this judge holds for the category, not just the first.
 *
 * One person may be both Scorer and Time Keeper on a panel (the only pair that
 * may share — Server/src/config/judge-seats.js), and resolveJudgeSeat can only
 * name one of them. Routing needs both: such a person gets the Scorer's sheet
 * with the stopwatch on it.
 *
 * @param {object|null} judgeInfo
 * @param {object} category
 * @returns {string[]}
 */
export function seatTypesFor(judgeInfo, category = {}) {
  if (!judgeInfo) return [];
  return [...new Set(allSeats(judgeInfo).filter((seat) => seatCovers(seat, category)).map((s) => s.judgeType))];
}

/**
 * The panel role this judge holds for the category on screen.
 * @param {object|null} judgeInfo
 * @param {object} category
 * @returns {string|null}
 */
export function judgeRoleFor(judgeInfo, category = {}) {
  return resolveJudgeSeat(judgeInfo, category)?.judgeType || judgeInfo?.judgeType || null;
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
 * @param {number} [args.refreshMs] - re-read the panel from the server this
 *   often (Panel Review). The live socket is the fast path, but a missed
 *   broadcast would otherwise leave a judge's OLD slip on screen for good.
 * @returns {object} panel state, the socket, and a refetch handle
 */
export function useJudgePanelData({ judgeInfo, session, refreshMs = 0 }) {
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
  // True once the first read of the stored slips has settled, found or not.
  const [loaded, setLoaded] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const joinedRoomRef = useRef(null);

  // Resolve panel size + judge names from the judges assigned to this category
  useEffect(() => {
    if (!judgeInfo || !selectedCompetitionType) return;
    const loadPanelSize = async () => {
      try {
        const competitionId = judgeInfo.competition?._id || judgeInfo.competition;
        // HIGH-W3: routed through judgeAPI (the `api` instance) so a 401 gets a
        // silent refresh and, failing that, an AUTH_EXPIRED redirect — instead
        // of being swallowed below and leaving the panel silently empty.
        const res = await judgeAPI.getJudges({
          competitionId,
          gender: selectedGender || judgeInfo.gender,
          ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
          competitionTypes: selectedCompetitionType,
          apparatus: selectedApparatus,
        });
        const judgesData = res.data?.data || [];
        /*
         * One seat per role, even though the query already named an apparatus.
         *
         * The server answers an apparatus filter with that apparatus's seats
         * PLUS any legacy category-wide ones (`{ $in: [apparatus, null, ''] }`),
         * which is correct — an old seat really does judge this apparatus — but
         * a meet part-way through being re-seated returns BOTH for a role, and
         * the count below is the panel size.
         */
        const panelJudges = panelSeats(judgesData, selectedApparatus);
        const count = panelJudges.length;
        if (count >= 3 && count <= 5) setPanelSize(count);
        else if (count > 5) setPanelSize(5);
        else setPanelSize(null);

        const nameMap = {};
        panelJudges.forEach((j) => { nameMap[j.judgeType] = j.name; });
        setJudgeNameMap(nameMap);
      } catch (err) {
        if (isAuthFailure(err)) {
          // The interceptor has already tried a silent refresh and dispatched
          // AUTH_EXPIRED. Say so rather than leaving a silently wrong panel size.
          toast.error('Your session expired. Please sign in again.');
        }
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
      const competitionId = judgeInfo.competition?._id || judgeInfo.competition;

      const res = await judgeAPI.getTeamScores({
        competitionId,
        gender: selectedGender || judgeInfo.gender,
        ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
        competitionType: selectedCompetitionType,
        apparatus: selectedApparatus,
      });

      const teams = res.data?.data || [];
      if (!Array.isArray(teams) || teams.length === 0) return;

      // The endpoint returns every registered team, so pick ours explicitly
      // rather than trusting ordering.
      const teamId = String(selectedTeam._id || selectedTeam.id);
      const team = teams.find((t) => String(t._id) === teamId);
      if (!team) return;

      /*
       * The athlete's score FOR THIS APPARATUS. An athlete entered for Pole,
       * Hanging and Rope has three rows here, and matching on the player alone
       * would load whichever happened to come first — showing the Rope panel
       * the Pole marks, and then overwriting them on submit.
       */
      const playerId = playerIdOf(selectedPlayer);
      const wanted = apparatusKey(selectedApparatus);
      const targetPs = (team.scores || []).find(
        (ps) => String(ps.playerId) === String(playerId) && apparatusKey(ps.apparatus) === wanted
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

      /*
       * The server wins for every slip it holds. This used to be the other way
       * round ({ ...loaded, ...prev }), so a slip already on screen could never
       * be replaced by a re-read — a judge who edited their score stayed at the
       * old one on everyone else's Panel Review unless the live broadcast got
       * through. Slips the server does not have yet (a mark that arrived over
       * the socket a moment ago) are kept.
       */
      setPanelScores((prev) => ({ ...prev, ...loadedPanelScores }));

      if (targetPs.isFinalized || scoreDoc.isLocked) {
        setFinalized(true);
      }
    } catch (err) {
      if (isAuthFailure(err)) {
        // Critical: without this the Senior Judge sees an empty panel and may
        // re-enter marks or wait for slips that were never going to load.
        toast.error('Your session expired — panel data could not be loaded. Please sign in again.');
      }
      logger.warn('Could not load existing player scores:', err);
    } finally {
      setLoaded(true);
    }
  }, [judgeInfo, selectedPlayer, selectedTeam, selectedGender, selectedAgeGroup, selectedCompetitionType, selectedApparatus]);

  useEffect(() => {
    if (judgeInfo && selectedPlayer) fetchExistingScores();
  }, [judgeInfo, selectedPlayer, fetchExistingScores]);

  // Latest fetch, for handlers created once per socket connection.
  const fetchRef = useRef(fetchExistingScores);
  fetchRef.current = fetchExistingScores;

  // Periodic re-read (Panel Review only), plus one whenever the tab comes
  // back into view — a phone that slept through a broadcast catches up then.
  useEffect(() => {
    if (!refreshMs || finalized || !judgeInfo || !selectedPlayer) return undefined;
    const timer = setInterval(() => fetchRef.current(), refreshMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshMs, finalized, judgeInfo, selectedPlayer]);

  /*
   * The apparatus on screen, readable from the socket handlers below.
   *
   * Those handlers are created once per connection and the apparatus can change
   * without one — so a plain closure over `selectedApparatus` would go stale and
   * start filtering against the apparatus the judge was on when they connected.
   */
  const selectedApparatusRef = useRef(selectedApparatus);
  selectedApparatusRef.current = selectedApparatus;

  // Live panel feed
  useEffect(() => {
    if (!judgeInfo || !selectedCompetitionType) return;
    const socketUrl = apiConfig.getSocketUrl();
    const token = secureStorage.getItem('judge_token');

    const newSocket = io(socketUrl, { auth: { token }, withCredentials: true });
    setSocket(newSocket);

    let everConnected = false;
    newSocket.on('connect', () => {
      setIsConnected(true);
      // A RE-connect: anything broadcast while the socket was down is lost,
      // so read the panel again rather than trust what is on screen.
      if (everConnected) fetchRef.current();
      everConnected = true;
      const roomId = `scoring_${selectedGender || judgeInfo.gender}_${selectedAgeGroup || judgeInfo.ageGroup}_${selectedCompetitionType}`;
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
    // NOTE: there is deliberately no 'score_update_error' listener here.
    // socket.manager surfaces every handler failure on the generic 'error'
    // event above; the server has never emitted 'score_update_error', so a
    // listener for it was dead code that looked live — the same trap as the
    // cross-tab `storage` listener in HIGH-W4. Verified end to end in
    // Server/tests/integration/socket/scoring-socket.test.js.
    /*
     * The room is per (gender, ageGroup, competitionType) and carries EVERY
     * apparatus panel in that category, so a mark has to match the athlete AND
     * the apparatus on screen. Matching the athlete alone put the Rope Judge 2's
     * slip into the Pole panel's review for anyone entered for both.
     *
     * `apparatusKey` on both sides, not `===`: a mark saved before the field was
     * relayed arrives with no apparatus and resolves to Pole, which is the same
     * fallback the score itself was stored under.
     *
     * Read through the ref rather than the closure. `selectedApparatus` is not
     * in this effect's dependency array and must not be — adding it would tear
     * down the socket and re-join the room every time the judge switches
     * apparatus, mid-meet.
     */
    const isForThisPerformance = (data) =>
      apparatusKey(data.apparatus) === apparatusKey(selectedApparatusRef.current);

    newSocket.on('score_updated', (data) => {
      const currentPlayerId = String(playerIdOf(selectedPlayer) || '');
      if (currentPlayerId && String(data.playerId) === currentPlayerId
        && isForThisPerformance(data) && PANEL_TYPES.includes(data.judgeType)) {
        setPanelScores((prev) => {
          // No breakdown in the event (a sheet-level save that carries only
          // totals): keep the slip already on screen when its total is
          // unchanged, rather than blanking its sections to zero.
          const shown = prev[data.judgeType];
          const keepShown = !data.breakdown && shown
            && Number(shown.score) === Number(data.score);
          return {
            ...prev,
            [data.judgeType]: {
              judgeType: data.judgeType,
              score: data.score,
              breakdown: keepShown ? shown.breakdown : normalizeBreakdown(data.breakdown, data.score),
              timestamp: data.timestamp || new Date().toISOString(),
            },
          };
        });
        if (data.isFinalSubmit || data.isLocked) setFinalized(true);
      }
    });
    newSocket.on('scores_saved_notification', (data) => {
      const currentPlayerId = String(playerIdOf(selectedPlayer) || '');
      // Apparatus-matched for the same reason, and it matters more here: this
      // one locks the slip, so a Rope finalization was closing the Pole panel.
      if (currentPlayerId && String(data.playerId) === currentPlayerId && isForThisPerformance(data)) {
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
    loaded,
    panelScoresCount,
    effectivePanelSize,
    orderedPanelEntries,
    allPanelSubmitted: effectivePanelSize > 0 && panelScoresCount >= effectivePanelSize,
    // Senior Judge OF THIS CATEGORY. A judge who chairs one panel and merely
    // scores on another must not get the chief's controls on the second.
    isSeniorJudge: resolveJudgeSeat(judgeInfo, {
      gender: selectedGender,
      ageGroup: selectedAgeGroup,
      competitionType: selectedCompetitionType,
      apparatus: selectedApparatus,
    })?.judgeType === 'Senior Judge',
  };
}
