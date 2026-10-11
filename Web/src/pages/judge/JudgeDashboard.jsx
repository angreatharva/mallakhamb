import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Scale, Users, Trophy, CheckCircle, Search, ChevronRight, X, Filter, ListOrdered, UserCircle,
  CalendarDays, Loader2, ClipboardList, Timer
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import { judgeLotsAPI } from '@/services/ordering/lots.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { resolveJudgeSeat, seatTypesFor } from './useJudgePanelData';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { FG, alpha } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { FadeIn } from '@/components/admin/AdminKit';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { J, JudgeAmbience, JudgeHeader } from './judgeShared';
import { apparatusInUse, entryGender, isRegisteredFor, offeredApparatus } from '@/utils/scoring/apparatus';
import { levelLabel } from '@/utils/competition/levels';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  COMPETITION_TYPES,
  idOf,
  competitionsForJudge,
  gendersForJudge,
  ageGroupsForJudge,
  competitionTypesForJudge,
  apparatusOptionsForJudge,
} from './judgeCategoryOptions';
import {
  indexPerformanceOrder,
  applyRunningOrder,
  eventMatchesCategory,
} from '@/utils/ordering/performanceOrder';

/** Judge roles that may set the panel's running order (server: SEQUENCE_JUDGE_TYPES). */
const SEQUENCE_JUDGE_TYPES = ['Senior Judge', 'Scorer'];

/**
 * The two seats one person may hold on the same panel
 * (Server/src/config/judge-seats.js maySeatTogether). Holding both in a
 * category is what raises the role popup.
 */
const RECORDER_ROLES = ['Scorer', 'Time Keeper'];
const holdsBothRecorderSeats = (seatTypes) => RECORDER_ROLES.every((role) => seatTypes.includes(role));

const SelectBtn = ({ selected, onClick, children, accent = J.purple }) => {
  const reduced = useReducedMotion();
  return (
    <button onClick={onClick} className="w-full p-3.5 rounded-xl border text-left transition-colors duration-200 min-h-[52px] flex items-center justify-between gap-3" style={{
        background: selected ? `${alpha(accent, 0x14)}` : 'rgb(var(--ink) / 0.03)',
        borderColor: selected ? `${alpha(accent, 0x50)}` : 'rgb(var(--ink) / 0.07)',
        color: selected ? FG.ink : 'rgb(var(--ink) / 0.6)',
      }}>
      <span className="text-sm font-semibold">{children}</span>
      {selected && <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: accent }} aria-hidden="true" />}
    </button>
  );
};

/** The meet stored at login, which is the only place `apparatusConfig` arrives. */
const storedCompetition = () => {
  const raw = secureStorage.getItem('judge_current_competition');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const JudgeDashboard = () => {
  const navigate = useNavigate();
  const { logout, login } = useAuth();
  const { clearCompetitionContext } = useCompetition();

  const [judgeInfo, setJudgeInfo] = useState(null);
  /**
   * The meet being judged.
   *
   * A judge seated at two meets got neither a question nor a hint that a second
   * one existed: login picked `competitionIds[0]`, returned only that meet's
   * seats as `allAssignments`, and the picker was built from those — so the
   * other meet was simply invisible. It is the first rung of the ladder now,
   * and choosing it re-scopes the session token (see selectCompetition).
   */
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(
    () => sessionStorage.getItem('judge_selected_competition') || ''
  );
  const [activeCompetition, setActiveCompetition] = useState(storedCompetition);
  const [switchingCompetition, setSwitchingCompetition] = useState(false);
  const [selectedCompetitionType, setSelectedCompetitionType] = useState(() => sessionStorage.getItem('judge_selected_comp_type') || '');
  const [selectedGender, setSelectedGender] = useState(() => sessionStorage.getItem('judge_selected_gender') || '');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState(() => sessionStorage.getItem('judge_selected_age_group') || '');
  /*
   * No apparatus chosen yet, which is NOT the same as Pole.
   *
   * Empty means "this panel judges whatever each athlete is entered for" — the
   * normal state of a category until the judge narrows it, and the only honest
   * value before anybody has picked. This defaulted to 'Pole Mallakhamb', and
   * the default was then handed to the roster in navigation state, which
   * filtered its athletes by it: every women's category in a Rope meet read as
   * "No eligible players", because none of them are on Pole. JudgeTeamPlayers
   * already treats empty as "all" for exactly this reason; the default here was
   * the half that kept overriding it.
   */
  const [selectedApparatus, setSelectedApparatus] = useState(() => sessionStorage.getItem('judge_selected_apparatus') || '');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Lookup maps from the category's running order. Empty until it loads, at
  // which point every team without a stored position falls back to name order —
  // which is what this list used to be, so nothing regresses when no lots have
  // been drawn.
  const [orderIndex, setOrderIndex] = useState(() => ({ teams: new Map(), players: new Map() }));
  
  /**
   * The category picker starts CLOSED and is opened only once we know this
   * judge has seats to pick between (below).
   *
   * It used to open on mount and be suppressed afterwards for a judge with no
   * seats — but suppressing a mounted `AnimatePresence` child only starts an
   * exit animation, and until that finishes the modal is still a full-screen
   * `z-50` overlay. Verified in a browser: it was invisible and still
   * swallowing clicks on the empty state underneath.
   */
  const [showModal, setShowModal] = useState(false);
  const autoOpenedPickerRef = useRef(false);
  /*
   * Which role this person is working as, when the category seats them as BOTH
   * Scorer and Time Keeper (the one pair of seats one person may hold). Asked
   * right after the category, in a popup of its own, and kept for the session
   * so a refresh does not ask again. Cleared whenever the category changes.
   */
  const [chosenRole, setChosenRole] = useState(() => sessionStorage.getItem('judge_selected_role') || '');
  const [showRoleModal, setShowRoleModal] = useState(false);

  /**
   * The seats this judge holds, fetched rather than read from storage.
   *
   * The stored session only carries the seats that existed at login and only
   * for the active meet; an organiser seating someone mid-event is exactly the
   * case where a stale list is worst.
   */
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    judgeAPI.getAssignments()
      .then((response) => {
        if (!cancelled) setAssignments(response.data?.data || []);
      })
      .catch((error) => {
        // Not fatal: the category picker still works off the stored session.
        logger.warn('Could not load panel assignments', error);
      })
      .finally(() => {
        if (!cancelled) setAssignmentsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Open the picker once, for a judge who has somewhere to be. Waits for the
  // fetch so an unseated judge never sees it; falls back to the stored session
  // so a failed fetch does not lock a seated judge out of choosing.
  useEffect(() => {
    if (autoOpenedPickerRef.current || assignmentsLoading) return;
    const seatCount = assignments.length || (judgeInfo?.allAssignments?.length ?? 0);
    if (seatCount === 0 || sessionStorage.getItem('judge_category_selected')) return;
    autoOpenedPickerRef.current = true;
    setShowModal(true);
  }, [assignmentsLoading, assignments, judgeInfo]);

  // The category is chosen and seats this person as Scorer AND Time Keeper,
  // but no role is on record (first time, or a session that lost it): ask.
  useEffect(() => {
    if (!judgeInfo || showModal || !selectedCompetitionType) return;
    if (!sessionStorage.getItem('judge_category_selected')) return;
    const both = holdsBothRecorderSeats(seatTypesFor(judgeInfo, {
      gender: selectedGender || judgeInfo.gender,
      ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
      competitionType: selectedCompetitionType,
      apparatus: selectedApparatus,
    }));
    if (both && !RECORDER_ROLES.includes(chosenRole)) setShowRoleModal(true);
  }, [judgeInfo, showModal, selectedCompetitionType, selectedGender, selectedAgeGroup, selectedApparatus, chosenRole]);

  const competitionTypes = COMPETITION_TYPES;

  useEffect(() => {
    const storedJudge = secureStorage.getItem('judge_user');
    if (!storedJudge) { toast.error('Please login first'); navigate('/judge/login'); return; }
    try {
      const judge = JSON.parse(storedJudge);
      logger.log('Judge info loaded:', {
        judgeType: judge.judgeType,
        gender: judge.gender,
        ageGroup: judge.ageGroup,
        competitionTypes: judge.competitionTypes,
        competition: judge.competition,
        allAssignments: judge.allAssignments
      });
      setJudgeInfo(judge);

      // The meet the session is currently scoped to. Every rung below is
      // filtered by it, so it has to be settled before the picker opens.
      setSelectedCompetitionId((current) => current
        || idOf(judge.competition)
        || secureStorage.getItem('judge_competition_id')
        || '');
    } catch (error) {
      logger.error('Error loading judge info:', error);
      secureStorage.removeItem('judge_user');
      secureStorage.removeItem('judge_token');
      toast.error('Invalid session. Please login again.');
      navigate('/judge/login');
    }
  }, [navigate]);

  /**
   * Every seat this judge holds, across every meet.
   *
   * The fetch is authoritative; the login copy is the fallback for when it
   * failed, and it only ever covered one meet — so a judge on the fallback gets
   * the picker they had before rather than nothing.
   */
  const seats = useMemo(() => {
    if (assignments.length > 0) return assignments;
    if (judgeInfo?.allAssignments?.length) return judgeInfo.allAssignments;
    return judgeInfo ? [judgeInfo] : [];
  }, [assignments, judgeInfo]);

  // The ladder. Each rung offers only what the rungs above it leave reachable,
  // so a choice can never be made that the judge holds no seat for.
  const availableCompetitions = useMemo(() => competitionsForJudge(seats), [seats]);
  const availableGenders = useMemo(
    () => gendersForJudge(seats, { competitionId: selectedCompetitionId }),
    [seats, selectedCompetitionId]
  );
  const availableAgeGroups = useMemo(
    () => ageGroupsForJudge(seats, { competitionId: selectedCompetitionId, gender: selectedGender }),
    [seats, selectedCompetitionId, selectedGender]
  );
  const availableCompetitionTypes = useMemo(
    () => competitionTypesForJudge(seats, {
      competitionId: selectedCompetitionId,
      gender: selectedGender,
      ageGroup: selectedAgeGroup,
    }),
    [seats, selectedCompetitionId, selectedGender, selectedAgeGroup]
  );

  /*
   * What this judge is scoring right now — a specific apparatus, always.
   *
   * The meet's `apparatusConfig` decides what is on offer, falling back to
   * whatever the entered athletes are registered for (and to a legacy
   * apparatus-scoped seat ahead of both). It is NOT a permission: panels are
   * seated for a whole category, so this only decides which combination
   * checklist the slip renders and which of an athlete's scores the marks
   * belong to — somebody entered for three apparatus earns three scores.
   *
   * `apparatusConfig` is read from the stored competition, NOT from
   * `judgeInfo.competition`: that field is an id string, so the old lookup
   * (`judgeInfo.competition?.apparatusConfig?.[type]`) was `undefined` on every
   * render and this whole question came down to the registrations alone.
   */
  const availableApparatus = useMemo(() => {
    if (!judgeInfo) return [];
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;

    // What the meet runs for THIS gender in this type; a meet saved before the
    // gender split answers with its per-type list.
    const configured =
      (selectedCompetitionType && activeCompetition && gender
        ? offeredApparatus(activeCompetition, selectedCompetitionType, gender)
        : []);
    const registered = apparatusInUse(
      teams.flatMap((team) => (team.players || []).filter(
        (e) => e.player && entryGender(e) === gender && e.ageGroup === ageGroup
      )),
      selectedCompetitionType
    );

    return apparatusOptionsForJudge(
      seats,
      { competitionId: selectedCompetitionId, gender, ageGroup, competitionType: selectedCompetitionType },
      { configured, registered }
    );
  }, [
    judgeInfo, seats, teams, activeCompetition,
    selectedCompetitionId, selectedGender, selectedAgeGroup, selectedCompetitionType,
  ]);

  /**
   * Move to another meet.
   *
   * The token has to be re-issued, not just the local state: `x-competition-id`
   * on every request is derived from the token's claim, so a judge who picked
   * the second meet while holding the first meet's token would go on reading
   * the first. The response also carries the competition in full, which is the
   * only way `apparatusConfig` reaches this screen — the assignments list does
   * not project it.
   *
   * The stored `judge_user` is rewritten too, because every other judge page
   * reads the competition from there.
   */
  const selectCompetition = useCallback(async (competitionId) => {
    const nextId = String(competitionId || '');
    if (!nextId || nextId === selectedCompetitionId || switchingCompetition) return;

    const previousId = selectedCompetitionId;
    setSelectedCompetitionId(nextId);
    setSelectedGender('');
    setSelectedAgeGroup('');
    setSelectedCompetitionType('');
    setSelectedApparatus('');
    setTeams([]);
    setOrderIndex({ teams: new Map(), players: new Map() });
    setSwitchingCompetition(true);

    try {
      const response = await judgeAPI.setCompetition(nextId);
      const { token, competition } = response.data?.data || {};
      if (!token) throw new Error('No competition-scoped token returned');

      const seatsAtMeet = seats
        .filter((seat) => idOf(seat.competition) === nextId)
        // Flattened back to an id, so the stored shape matches what login
        // writes and `resolveJudgeSeat` keeps reading the same thing.
        .map((seat) => ({ ...seat, competition: nextId }));
      const primary = seatsAtMeet[0] || null;

      const nextJudge = {
        ...judgeInfo,
        competition: nextId,
        judgeType: primary?.judgeType || null,
        judgeNo: primary?.judgeNo ?? null,
        gender: primary?.gender || null,
        ageGroup: primary?.ageGroup || null,
        competitionTypes: primary?.competitionTypes || [],
        allAssignments: seatsAtMeet,
      };

      login(nextJudge, token, 'judge');
      setJudgeInfo(nextJudge);
      secureStorage.setItem('judge_competition_id', nextId);
      if (competition) {
        secureStorage.setItem('judge_current_competition', JSON.stringify(competition));
      }
      setActiveCompetition(competition || null);

      /*
       * Persisted HERE, not on confirm, and the category dropped with it.
       *
       * The token now belongs to the new meet; leaving the stored selection on
       * the old one means a reload restores a category from a meet the session
       * is no longer scoped to — screen and token disagreeing about which meet
       * is being judged, which is the state this whole rung exists to prevent.
       * Clearing `judge_category_selected` re-opens the picker on that reload,
       * because a category at the new meet genuinely has not been chosen yet.
       */
      sessionStorage.setItem('judge_selected_competition', nextId);
      sessionStorage.removeItem('judge_category_selected');
      sessionStorage.removeItem('judge_selected_role');
      setChosenRole('');
      sessionStorage.removeItem('judge_selected_comp_type');
      sessionStorage.removeItem('judge_selected_gender');
      sessionStorage.removeItem('judge_selected_age_group');
      sessionStorage.removeItem('judge_selected_apparatus');
    } catch (error) {
      logger.error('Could not switch competition', error);
      toast.error(error.response?.data?.message || 'Could not switch to that competition');
      // Back to the meet the token still belongs to, rather than leaving the
      // screen claiming one meet while every request reads another.
      setSelectedCompetitionId(previousId);
    } finally {
      setSwitchingCompetition(false);
    }
  }, [selectedCompetitionId, switchingCompetition, seats, judgeInfo, login]);

  /**
   * Keep the ladder consistent: drop anything the rungs above no longer allow,
   * and answer any rung that has only one possible answer.
   *
   * This replaces the auto-selection that ran once, off the login session — it
   * could not react to a gender change, which is how Under 16 stayed selected
   * for a Male category.
   */
  useEffect(() => {
    if (!judgeInfo || assignmentsLoading) return;

    // The meet first, since every rung below is filtered by it. A stored id
    // that is not among this judge's seats — a seat withdrawn, or a session
    // reused — would otherwise leave every list below empty with no way back.
    const knownMeet = availableCompetitions.some((c) => String(c._id) === String(selectedCompetitionId));
    if (availableCompetitions.length > 0 && !knownMeet) {
      setSelectedCompetitionId(String(availableCompetitions[0]._id));
      return;
    }

    if (selectedGender && !availableGenders.includes(selectedGender)) setSelectedGender('');
    else if (!selectedGender && availableGenders.length === 1) setSelectedGender(availableGenders[0]);

    if (selectedAgeGroup && !availableAgeGroups.includes(selectedAgeGroup)) setSelectedAgeGroup('');
    else if (!selectedAgeGroup && availableAgeGroups.length === 1) setSelectedAgeGroup(availableAgeGroups[0]);

    if (selectedCompetitionType && !availableCompetitionTypes.includes(selectedCompetitionType)) {
      setSelectedCompetitionType('');
    } else if (!selectedCompetitionType && availableCompetitionTypes.length === 1) {
      setSelectedCompetitionType(availableCompetitionTypes[0]);
    }

    // Apparatus is a required answer now, so a category offering exactly one
    // is answered rather than asked — the same courtesy every rung above gets.
    if (selectedApparatus && availableApparatus.length > 0
      && !availableApparatus.includes(selectedApparatus)) {
      setSelectedApparatus('');
    } else if (!selectedApparatus && availableApparatus.length === 1) {
      setSelectedApparatus(availableApparatus[0]);
    }
  }, [
    judgeInfo, assignmentsLoading,
    availableCompetitions, selectedCompetitionId,
    availableGenders, selectedGender,
    availableAgeGroups, selectedAgeGroup,
    availableCompetitionTypes, selectedCompetitionType,
    availableApparatus, selectedApparatus,
  ]);

  /**
   * The category this judge is currently working in — and the one definition of
   * "enough has been chosen to ask the server anything". Also the socket room key.
   */
  const categoryParams = useMemo(() => {
    if (!judgeInfo || !selectedCompetitionType) return null;
    const competitionId = selectedCompetitionId || idOf(judgeInfo.competition);
    /*
     * The CHOSEN gender and age group, falling back to the login session only
     * when there are no seats to choose from at all — i.e. the assignments
     * fetch failed and there is nothing better to go on.
     *
     * This used to fall back unconditionally, which was harmless only because
     * nothing ever cleared a selection. Changing gender now clears the age
     * group (it has to — boys and girls run different brackets), and an
     * unconditional fallback would quietly refill it with the previous
     * category's bracket and fetch that instead.
     */
    const gender = selectedGender || (availableGenders.length === 0 ? judgeInfo.gender : '');
    const ageGroup = selectedAgeGroup || (availableAgeGroups.length === 0 ? judgeInfo.ageGroup : '');
    if (!competitionId || !gender || !ageGroup) return null;
    return { competitionId, gender, ageGroup, competitionType: selectedCompetitionType };
  }, [
    judgeInfo, selectedCompetitionId, selectedCompetitionType,
    selectedGender, selectedAgeGroup, availableGenders, availableAgeGroups,
  ]);

  const fetchTeams = useCallback(async () => {
    // Not while the token is being re-scoped: the reply would describe a meet
    // this screen is already leaving.
    if (!categoryParams || switchingCompetition) return;
    try {
      setLoading(true);
      logger.log('Fetching teams with params:', categoryParams);

      const response = await judgeAPI.getSubmittedTeams(categoryParams);

      logger.log('Teams fetched successfully:', { count: response.data.data?.length || 0 });
      setTeams(response.data.data || []);

      if (response.data.data?.length === 0) {
        logger.warn('No teams found for filters', categoryParams);
      }
    } catch (error) {
      logger.error('Error fetching teams:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load teams';
      toast.error(errorMessage);
      setTeams([]);
    } finally { setLoading(false); }
  }, [categoryParams, switchingCompetition]);

  /*
   * Fetched WHILE THE PICKER IS OPEN, which it deliberately was not before.
   *
   * The apparatus the picker offers is derived, in part, from what the athletes
   * in the category are registered for — and that comes from this list. Gating
   * the fetch on the picker being closed made those two facts unreachable at
   * the same time, so the apparatus question never appeared on a fresh session:
   * the modal opened with no teams, offered nothing, and let Continue through.
   * The only way to see it was to confirm a category and re-open the picker.
   */
  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  /**
   * Load the running order set by the panel's Senior Judge / Scorer, or drawn
   * by an admin.
   *
   * A failure here is deliberately quiet: the order is presentation, and
   * blocking or alarming a judge because it could not be read would be worse
   * than showing the previous alphabetical list.
   */
  const fetchOrder = useCallback(async () => {
    if (!categoryParams) return;
    try {
      const response = await judgeLotsAPI.getOrder(categoryParams);
      setOrderIndex(indexPerformanceOrder(response.data?.data));
    } catch (error) {
      logger.warn('Could not load running order; falling back to name order', error);
    }
  }, [categoryParams]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Live re-sort. The Senior Judge dragging a team on /judge/sequence, or an
  // admin drawing lots, has to land here without the judge reloading —
  // otherwise two people on the same panel disagree about who performs next.
  useEffect(() => {
    if (!categoryParams) return;

    const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');
    const token = secureStorage.getItem('judge_token');
    const socket = io(socketUrl, { auth: { token }, withCredentials: true });

    const roomId = `scoring_${categoryParams.gender}_${categoryParams.ageGroup}_${categoryParams.competitionType}`;
    socket.on('connect', () => socket.emit('join_scoring_room', { roomId }));

    socket.on('performance_order_updated', (event) => {
      if (!eventMatchesCategory(event, categoryParams)) return;
      // The event carries the whole order, so it is applied directly rather
      // than triggering a refetch — one fewer round trip per drag, and every
      // judge in the room gets the same payload.
      setOrderIndex(indexPerformanceOrder(event));
      toast.success(
        event.reason === 'lots_drawn' ? 'Lots drawn — order updated' : 'Running order updated'
      );
    });

    return () => socket.disconnect();
  }, [categoryParams]);

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  const getFilteredPlayersForTeam = (team) => {
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
    
    return team.players
      .filter(e => {
        if (!e.player || entryGender(e) !== gender || e.ageGroup !== ageGroup) return false;
        // isRegisteredFor reads every shape `apparatus` has been stored in; the
        // inline object lookup this replaced silently matched everything when a
        // coach had written a bare name.
        return isRegisteredFor(e, selectedCompetitionType, selectedApparatus);
      });
  };

  const handleTeamSelect = (team) => {
    const gender = selectedGender || judgeInfo.gender;
    const ageGroup = selectedAgeGroup || judgeInfo.ageGroup;
    
    logger.log('handleTeamSelect called:', {
      teamId: team._id,
      teamName: team.name,
      judgeType: judgeInfo?.judgeType,
      gender,
      ageGroup,
      selectedCompetitionType
    });
    
    const competitionTypeObj = {
      value: selectedCompetitionType,
      label: competitionTypes.find(ct => ct.value === selectedCompetitionType)?.label || selectedCompetitionType
    };

    // Both scorers and regular judges go to /judge/scoring
    // The JudgeScoring component will handle the role-based UI
    //
    // The Time Keeper goes straight there too, with the team, like the Scorer.
    // Decided by the seats held in THIS category — a person can keep time on
    // one panel and judge on another. Someone who is BOTH Scorer and Time
    // Keeper here goes wherever the role popup sent them.
    const heldHere = seatTypesFor(judgeInfo, {
      gender, ageGroup, competitionType: selectedCompetitionType, apparatus: selectedApparatus,
    });
    // Both seats here: the role chosen in the popup decides — and without one
    // there is nothing to open yet.
    const bothHere = holdsBothRecorderSeats(heldHere);
    if (bothHere && !RECORDER_ROLES.includes(chosenRole)) {
      setShowRoleModal(true);
      return;
    }
    const isScorerHere = bothHere
      ? chosenRole === 'Scorer'
      : heldHere.includes('Scorer') || (heldHere.length === 0 && judgeInfo?.judgeType === 'Scorer');
    const isTimeKeeperHere = bothHere
      ? chosenRole === 'Time Keeper'
      : !isScorerHere && (heldHere.includes('Time Keeper')
        || (heldHere.length === 0 && judgeInfo?.judgeType === 'Time Keeper'));

    if (isTimeKeeperHere) {
      navigate('/judge/scoring', {
        state: {
          selectedTeam: team,
          selectedCompetitionType: competitionTypeObj,
          apparatus: selectedApparatus,
          gender,
          ageGroup,
          isTimeKeeper: true,
        },
      });
    } else if (isScorerHere) {
      logger.log('Navigating to scorer scoring page');
      // Scorer: Navigate to scoring with team-level state
      navigate(`/judge/scoring`, {
        state: {
          selectedTeam: team,
          selectedCompetitionType: competitionTypeObj,
          apparatus: selectedApparatus,
          gender: gender,
          ageGroup: ageGroup,
          isScorer: true, // Flag to indicate scorer mode
        },
      });
    } else {
      logger.log('Navigating to team players page:', `/judge/team/${team._id}`);
      // Regular Judge: Navigate to team players first
      navigate(`/judge/team/${team._id}`, {
        state: {
          team,
          competitionType: selectedCompetitionType,
          apparatus: selectedApparatus,
          gender: gender,
          ageGroup: ageGroup,
        },
      });
    }
  };

  const handleConfirmSelection = () => {
    // Straight from categoryParams: Continue is only live once that resolves,
    // so these are the values the screen is actually about to work with rather
    // than a second, possibly divergent, reading of the same state.
    if (!categoryParams) return;
    sessionStorage.setItem('judge_category_selected', 'true');
    sessionStorage.setItem('judge_selected_competition', categoryParams.competitionId);
    sessionStorage.setItem('judge_selected_comp_type', categoryParams.competitionType);
    sessionStorage.setItem('judge_selected_gender', categoryParams.gender);
    sessionStorage.setItem('judge_selected_age_group', categoryParams.ageGroup);
    if (selectedApparatus) {
      sessionStorage.setItem('judge_selected_apparatus', selectedApparatus);
    } else {
      sessionStorage.removeItem('judge_selected_apparatus');
    }
    setShowModal(false);

    // A new category means a new answer: ask again when it seats this person
    // as both Scorer and Time Keeper, and forget the old one either way.
    setChosenRole('');
    sessionStorage.removeItem('judge_selected_role');
    if (holdsBothRecorderSeats(seatTypesFor(judgeInfo, {
      gender: categoryParams.gender,
      ageGroup: categoryParams.ageGroup,
      competitionType: categoryParams.competitionType,
      apparatus: selectedApparatus,
    }))) {
      setShowRoleModal(true);
    }
  };

  const chooseRole = (role) => {
    setChosenRole(role);
    sessionStorage.setItem('judge_selected_role', role);
    setShowRoleModal(false);
  };

  if (!judgeInfo) return null;

  // An empty list is not an unanswered question — a meet that declares no
  // apparatus and a category nobody has entered both produce one, and the
  // judge has to be able to get past it.
  const needsApparatus = availableApparatus.length > 0;
  const isApparatusSelected = !needsApparatus || !!selectedApparatus;
  const isCompetitionSelected = availableCompetitions.length <= 1 || !!selectedCompetitionId;
  const isGenderSelected = availableGenders.length <= 1 || !!selectedGender;
  const isAgeGroupSelected = availableAgeGroups.length <= 1 || !!selectedAgeGroup;
  // `categoryParams` is the real test — it resolves only when the meet, gender,
  // age group and competition type are all settled. The named checks below it
  // say WHICH rung is unanswered, which is what the disabled button is for.
  const isSelectionComplete = !!categoryParams && isCompetitionSelected && isApparatusSelected
    && isGenderSelected && isAgeGroupSelected && !switchingCompetition;

  /**
   * The seat held for the category currently selected on this screen. A judge
   * can chair one panel and merely score on another, so "am I the Senior
   * Judge" is only answerable once a category is chosen.
   */
  const mySeat = resolveJudgeSeat(judgeInfo, {
    gender: selectedGender || judgeInfo.gender,
    ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
    competitionType: selectedCompetitionType,
    apparatus: selectedApparatus,
  });
  /*
   * Every seat held in this category. Scorer + Time Keeper together is the one
   * case with a question to ask — the role popup — and until it is answered
   * the dashboard waits rather than guessing which screen they meant.
   */
  const seatsHere = seatTypesFor(judgeInfo, {
    gender: selectedGender || judgeInfo.gender,
    ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
    competitionType: selectedCompetitionType,
    apparatus: selectedApparatus,
  });
  const needsRoleChoice = !!selectedCompetitionType && holdsBothRecorderSeats(seatsHere);
  const roleChosen = needsRoleChoice && RECORDER_ROLES.includes(chosenRole);
  const myJudgeType = needsRoleChoice ? (roleChosen ? chosenRole : null) : mySeat?.judgeType;

  const canSequence = SEQUENCE_JUDGE_TYPES.includes(myJudgeType);
  // The category is settled but the role is not (e.g. after a refresh that lost
  // it): the team list waits behind the role popup.
  const awaitingRole = needsRoleChoice && !roleChosen;

  // Anyone can register as a judge; being seated on a panel is a separate act
  // by an organiser. Until that happens there is no category to pick and no
  // team to score, so the picker is suppressed in favour of an explanation.
  const hasSeats = assignmentsLoading || assignments.length > 0
    || (judgeInfo.allAssignments?.length ?? 0) > 0;

  // Running order first, then the search filter — filtering first would be
  // equivalent here but sorting the full list keeps the positions shown next to
  // each team meaningful while a search is active.
  const filteredTeams = applyRunningOrder(teams, orderIndex.teams, {
    key: (team) => String(team._id),
    name: (team) => team.name,
  }).filter(team =>
    team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (team.coach?.name && team.coach.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const getCompLabel = (val) => competitionTypes.find(c => c.value === val)?.label || val;

  /** A meet's name, falling back to its id when the assignment carried no document. */
  const competitionName = (id) =>
    availableCompetitions.find((c) => String(c._id) === String(id))?.name || 'Selected meet';

  return (
    <div className="min-h-dvh relative flex flex-col bg-bg text-fg">
      <JudgeAmbience />

      <JudgeHeader
        title={judgeInfo.name}
        subtitle={myJudgeType}
        onLogout={handleLogout}
        actions={(
          <button onClick={() => navigate('/judge/profile')}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            aria-label="Your profile">
            <span className="ui-btn__label" style={{ display: 'contents' }}>
              <UserCircle aria-hidden="true" />
              <span className="hidden sm:inline">Profile</span>
            </span>
          </button>
        )}
      />

      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-4 py-8 flex flex-col" id="main-content">

        {/* The meet this session is scoped to may have closed. `activeCompetition`
            is passed rather than left to storage: this screen is what WRITES
            `judge_current_competition`, so its own state is the fresher copy —
            it is already correct for the meet the judge just switched to. */}
        <CompetitionLockBanner competition={activeCompetition} className="mb-6" />

        {/* Top Section */}
        <FadeIn delay={0}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-fg-muted text-xs tracking-widest uppercase mb-1">Welcome back</p>
              <h1 className="text-2xl font-black text-ink">{judgeInfo.name}</h1>
            </div>
            
            {!showModal && selectedCompetitionType && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Only the Senior Judge and the Scorer set the running order.
                    The other judges see the result but get no entry point. */}
                {canSequence && (
                  <button
                    onClick={() => navigate('/judge/sequence')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-raised border border-line-strong text-accent-fg dark:text-accent-fg text-sm font-bold transition-colors min-h-[44px]">
                    <ListOrdered className="w-4 h-4" />
                    Set Sequence
                  </button>
                )}
                {needsRoleChoice && (
                  <button
                    onClick={() => setShowRoleModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-raised border border-line-strong text-accent-fg text-sm font-bold transition-colors min-h-[44px]">
                    {chosenRole === 'Time Keeper' ? <Timer className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                    Change Role
                  </button>
                )}
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-raised border border-line-strong text-accent-fg text-sm font-bold transition-colors min-h-[44px]">
                  <Filter className="w-4 h-4" />
                  Change Category
                </button>
              </div>
            )}
          </div>

          {!showModal && selectedCompetitionType && (
            <div className="rounded-2xl border p-4 flex flex-col sm:flex-row gap-4 mb-6"
              style={{ background: 'rgb(var(--accent) / 0.08)', borderColor: 'rgb(var(--accent) / 0.25)' }}>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 flex-shrink-0 text-fg-secondary" aria-hidden="true" />
                <span className="type-tag text-fg-secondary">Current Assignment</span>
              </div>
              <div className="flex flex-wrap gap-4 sm:ml-auto">
                {[
                  // Only worth the space when there is more than one meet to be
                  // confused between.
                  ...(availableCompetitions.length > 1
                    ? [{ label: 'Meet', value: competitionName(selectedCompetitionId) }]
                    : []),
                  { label: 'Gender', value: selectedGender || judgeInfo.gender },
                  { label: 'Age Group', value: selectedAgeGroup || judgeInfo.ageGroup },
                  { label: 'Competition', value: getCompLabel(selectedCompetitionType) },
                  // '—' rather than "All apparatus": the meet declared none and
                  // nobody has entered, so there was nothing to choose.
                  { label: 'Apparatus', value: selectedApparatus || '—' },
                  // Only when there was a choice to make — otherwise the seat
                  // is the role and says nothing new.
                  ...(needsRoleChoice && roleChosen ? [{ label: 'Role', value: chosenRole }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest text-fg-muted">{label}</span>
                    <span className="text-sm font-bold text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </FadeIn>

        {/* Every panel this judge sits on */}

        {/* Registered, but on no panel yet */}
        {!hasSeats && (
          <FadeIn delay={0.1}>
            <div className="text-center py-16 flex flex-col items-center rounded-2xl border border-ink/5 bg-ink/5">
              <Scale className="w-12 h-12 mb-4 text-ink/20" />
              <p className="text-lg font-bold text-ink/70">No panel assignments yet</p>
              <p className="text-sm text-fg-muted mt-2 max-w-sm">
                Your account is ready. An organiser adds you to a competition panel — the
                categories you are judging will appear here once they do. Sign in again after
                that to start scoring.
              </p>
              <button
                onClick={() => navigate('/judge/profile')}
                className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface-raised border border-line-strong text-accent-fg text-sm font-bold transition-colors min-h-[44px]">
                <UserCircle className="w-4 h-4" />
                View your profile
              </button>
            </div>
          </FadeIn>
        )}

        {/* Search & Team List — waits for the role when there is one to choose */}
        {!showModal && selectedCompetitionType && !awaitingRole && (
          <FadeIn delay={0.1} className="flex-1 flex flex-col">
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-muted" />
              <input 
                type="text" 
                placeholder="Search teams by name..." aria-label="Search teams" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-ink/5 border border-ink/10 rounded-2xl py-4 pl-12 pr-4 text-base text-ink placeholder-ink/40 focus:border-line-strong transition-colors shadow-lg"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-3 flex-1">
                <div className="animate-spin w-6 h-6 rounded-full border-2 border-t-transparent"
                  style={{ borderColor: J.purple, borderTopColor: 'transparent' }} />
                <span className="text-sm text-fg-muted">Loading teams...</span>
              </div>
            ) : filteredTeams.length > 0 ? (
              <div className="space-y-4 pb-12">
                {filteredTeams.map((team, orderIdx) => {
                  const teamPlayers = getFilteredPlayersForTeam(team);
                  const scoredCount = teamPlayers.filter((e) => e.isFinalized).length;

                  return (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => handleTeamSelect(team)}
                      className="w-full rounded-2xl border overflow-hidden transition-all duration-300 text-left hover:bg-ink/5"
                      style={{ 
                        background: 'rgb(var(--ink) / 0.02)',
                        borderColor: 'rgb(var(--ink) / 0.08)'
                      }}
                    >
                      <div className="flex items-center justify-between p-5 gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          {/* Running position, with the drawn lot underneath.
                              These diverge the moment anyone re-sequences, so
                              both are shown rather than one standing in for the
                              other. */}
                          <span className="flex flex-col items-center justify-center w-10 flex-shrink-0">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black"
                              style={{ background: 'rgb(var(--accent) / 0.18)', color: 'rgb(var(--accent-fg))' }}>
                              {orderIdx + 1}
                            </span>
                            {team.lotNo != null && (
                              <span className="text-[9px] mt-0.5 font-bold tracking-wider uppercase text-fg-muted">
                                Lot {team.lotNo}
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                          <p className="font-bold text-lg text-ink truncate">{team.name}</p>
                          <p className="text-sm mt-1 text-fg-muted">
                            Coach: {team.coach?.name || 'N/A'}
                          </p>
                          {scoredCount > 0 && (
                            <p className="text-xs mt-1.5 text-success-fg">
                              {scoredCount} of {teamPlayers.length} scored
                            </p>
                          )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-xs px-3 py-1.5 rounded-lg bg-ink/10 text-ink/70 font-semibold">
                            {teamPlayers.length} {teamPlayers.length === 1 ? 'Player' : 'Players'}
                          </span>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-ink/5 text-fg-muted">
                            <ChevronRight className="w-5 h-5" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 flex flex-col items-center flex-1 justify-center rounded-2xl border border-ink/5 bg-ink/5">
                <Users className="w-12 h-12 mb-4 text-ink/20" />
                <p className="text-lg font-bold text-ink/70">No teams found</p>
                <p className="text-sm text-fg-muted mt-2 max-w-sm text-center">
                  {searchQuery 
                    ? "No teams match your search query." 
                    : "There are no teams submitted for this competition category yet."}
                </p>
              </div>
            )}
          </FadeIn>
        )}
      </main>

      {/* Selection Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="modal-overlay z-50 bg-black/90 backdrop-blur-md overflow-y-auto">
              <BodyScrollLock />
            
            <div className="bg-surface border border-line-strong rounded-3xl w-full max-w-xl shadow-2xl relative modal-panel">
              
              {/* If we already made a selection once, we can cancel changing it */}
              {selectedCompetitionType && isSelectionComplete && (
                <button 
                  onClick={() => setShowModal(false)}
                  className="absolute top-6 right-6 w-8 h-8 tap-safe rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-fg-muted hover:text-ink transition-colors" aria-label="Close">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              <div className="p-8 space-y-8">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center mx-auto mb-4 border border-line-strong">
                    <Filter className="w-6 h-6 text-accent-fg" />
                  </div>
                  <h2 className="type-display-m text-fg">Select Judging Category</h2>
                  <p className="text-fg-muted text-sm mt-2">Choose the competition context you are judging for right now.</p>
                </div>

                {/* Competition — the meet, not the competition type. Only asked
                    when this judge is seated at more than one. */}
                {availableCompetitions.length > 1 && (
                  <div>
                    <p className="type-tag text-accent-fg mb-3 ml-1">Competition</p>
                    <div className="grid grid-cols-1 gap-3">
                      {availableCompetitions.map(comp => (
                        <SelectBtn
                          key={comp._id}
                          selected={String(selectedCompetitionId) === String(comp._id)}
                          onClick={() => selectCompetition(comp._id)}>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 flex-shrink-0 text-fg-muted" aria-hidden="true" />
                            <div>
                              <p>{comp.name || 'Untitled competition'}</p>
                              {(comp.place || comp.level) && (
                                <p className="text-[10px] font-normal text-fg-muted uppercase tracking-widest mt-0.5">
                                  {[comp.place, comp.level && levelLabel(comp.level)].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </SelectBtn>
                      ))}
                    </div>
                    {switchingCompetition && (
                      <p className="flex items-center gap-2 text-xs text-fg-muted mt-3 ml-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        Switching competition…
                      </p>
                    )}
                  </div>
                )}

                {/* Fixed or Selectable Assignments */}
                <div className="space-y-4">
                  {/* Gender Selection or Display */}
                  {availableGenders.length > 1 ? (
                    <div>
                      <p className="type-tag text-accent-fg mb-3 ml-1">Gender</p>
                      <div className="grid grid-cols-2 gap-3">
                        {availableGenders.map(g => (
                          <SelectBtn key={g} selected={selectedGender === g} onClick={() => setSelectedGender(g)}>
                            <span>{g}</span>
                          </SelectBtn>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-ink/10 bg-ink/5 p-4 text-center">
                      <p className="type-tag text-fg-muted mb-1">Assigned Gender</p>
                      <p className="font-bold text-ink">{availableGenders[0] || judgeInfo.gender || '—'}</p>
                    </div>
                  )}

                  {/* Age Group — the list belongs to the CHOSEN GENDER, not to
                      the judge's seats as a whole. Boys and girls run different
                      brackets, so a merged list offered Under 16 to a Male
                      category and Above 18 to a Female one. */}
                  {availableAgeGroups.length > 1 ? (
                    <div>
                      <p className="type-tag text-accent-fg mb-3 ml-1">
                        Age Group{selectedGender ? ` · ${selectedGender}` : ''}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {availableAgeGroups.map(ag => (
                          <SelectBtn key={ag} selected={selectedAgeGroup === ag} onClick={() => setSelectedAgeGroup(ag)}>
                            <span>{ag}</span>
                          </SelectBtn>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-ink/10 bg-ink/5 p-4 text-center">
                      <p className="type-tag text-fg-muted mb-1">Assigned Age Group</p>
                      <p className="font-bold text-ink">
                        {availableAgeGroups[0]
                          || (selectedGender ? 'No panel in this gender' : judgeInfo.ageGroup)
                          || '—'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Competition Type */}
                <div>
                  <p className="type-tag text-accent-fg mb-3 ml-1">Competition Type</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {competitionTypes
                      .filter(ct => availableCompetitionTypes.includes(ct.value))
                      .map(ct => (
                        <SelectBtn key={ct.value} selected={selectedCompetitionType === ct.value}
                          onClick={() => {
                            setSelectedCompetitionType(ct.value);
                            setSelectedApparatus(''); // Reset apparatus when competition changes
                          }}>
                          <div>
                            <p>{ct.label}</p>
                            <p className="text-[10px] font-normal text-fg-muted uppercase tracking-widest mt-0.5">{ct.sub}</p>
                          </div>
                        </SelectBtn>
                      ))}
                  </div>
                </div>

                {/* Apparatus (If needed) */}
                <AnimatePresence mode="wait">
                  {needsApparatus && (
                    <div className="overflow-hidden">
                      <div className="pt-2">
                        <p className="type-tag text-accent-fg mb-3 ml-1">Apparatus</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {availableApparatus.map(app => (
                            <SelectBtn key={app} selected={selectedApparatus === app} onClick={() => setSelectedApparatus(app)}>
                              <span>{app}</span>
                            </SelectBtn>
                          ))}
                        </div>
                        {loading && (
                          <p className="flex items-center gap-2 text-xs text-fg-muted mt-3 ml-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            Checking what the entered athletes are registered for…
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </AnimatePresence>

                {/* Confirm Button */}
                <div className="pt-4 border-t border-ink/10">
                  <button 
                    onClick={handleConfirmSelection}
                    disabled={!isSelectionComplete}
                    className="w-full py-4 rounded-xl font-bold text-ink transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: isSelectionComplete ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.1)', color: isSelectionComplete ? 'rgb(var(--on-accent))' : undefined }}>
                    {isSelectionComplete ? (
                      <>Continue to Dashboard <ChevronRight className="w-5 h-5" /></>
                    ) : (
                      'Please complete selection'
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Role Modal — Scorer or Time Keeper, for someone seated as both here */}
      <AnimatePresence>
        {showRoleModal && !showModal && needsRoleChoice && (
          <div className="modal-overlay z-50 bg-black/90 backdrop-blur-md overflow-y-auto">
              <BodyScrollLock />
            <div className="bg-surface border border-line-strong rounded-3xl w-full max-w-xl shadow-2xl relative modal-panel" role="dialog" aria-modal="true" aria-labelledby="role-modal-title">

              {/* Closable only once a role is on record */}
              {roleChosen && (
                <button
                  onClick={() => setShowRoleModal(false)}
                  aria-label="Close"
                  className="absolute top-6 right-6 w-8 h-8 tap-safe rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-fg-muted hover:text-ink transition-colors">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              <div className="p-8 space-y-8">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-surface-raised flex items-center justify-center mx-auto mb-4 border border-line-strong">
                    <ClipboardList className="w-6 h-6 text-accent-fg" />
                  </div>
                  <h2 id="role-modal-title" className="text-2xl font-black text-ink">Select Your Role</h2>
                  <p className="text-fg-muted text-sm mt-2">
                    You are both Scorer and Time Keeper for {selectedGender || judgeInfo.gender} · {selectedAgeGroup || judgeInfo.ageGroup} · {getCompLabel(selectedCompetitionType)}{selectedApparatus ? ` · ${selectedApparatus}` : ''}. Choose which one you are working as.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {[
                    { role: 'Scorer', Icon: ClipboardList, desc: 'Fill the score sheet, set the running order, save and lock.' },
                    { role: 'Time Keeper', Icon: Timer, desc: 'Time each performance; the time goes to the Scorer’s sheet.' },
                  ].map(({ role, Icon, desc }) => (
                    <SelectBtn key={role} selected={chosenRole === role} onClick={() => chooseRole(role)}>
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 flex-shrink-0 text-accent-fg" aria-hidden="true" />
                        <div>
                          <p className="font-bold text-ink">{role}</p>
                          <p className="text-xs text-fg-muted mt-0.5">{desc}</p>
                        </div>
                      </div>
                    </SelectBtn>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default JudgeDashboard;
