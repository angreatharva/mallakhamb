import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '@/contexts/CompetitionContext';
import { useAuth } from '@/contexts/AuthContext';
import { coachAPI, playerAPI } from '@/services/api';
import { judgeAPI } from '@/services/public/judge.api';
import { authAPI } from '@/services/auth/auth.api';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { secureStorage } from '@/utils/auth/secureStorage';
import { competitionsAtLevel, levelLabel } from '@/utils/competition/levels';
import { idOf } from '@/pages/judge/judgeCategoryOptions';
import {
  Trophy, MapPin, Calendar, Search, X, Check, ArrowRight, Zap, Clock, Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS, alpha } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { GradientText, FadeIn } from '@/components/design-system';
import { AmbientOrbs, ORB_INTENSITY } from '@/components/design-system/backgrounds';


const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

const statusConfig = {
  ongoing: { color: '#22C55E', label: 'Live', Icon: Zap },
  upcoming: { color: '#3B82F6', label: 'Upcoming', Icon: Clock },
  completed: { color: 'rgba(255,255,255,0.3)', label: 'Completed', Icon: Check },
};

// ─── Ambient orb ─────────────────────────────────────────────────────────────
// ─── Competition Card ─────────────────────────────────────────────────────────
const CompetitionCard = ({ competition, isSelected, onSelect, disabled, index }) => {
  const reduced = useReducedMotion();
  const status = statusConfig[competition.status] || statusConfig.completed;
  const StatusIcon = status.Icon;

  const CardIcon = Trophy;

  return (
    <motion.button
      onClick={() => onSelect(competition._id || competition.id)}
      disabled={disabled}
      className="w-full text-left rounded-2xl border relative overflow-hidden transition-all duration-200 group"
      style={{
        background: isSelected
          ? `linear-gradient(135deg, ${alpha(COLORS.saffron, 0x12)}, rgba(255,255,255,0.03))`
          : 'rgba(255,255,255,0.03)',
        borderColor: isSelected ? `${alpha(COLORS.saffron, 0x45)}` : COLORS.darkBorderSubtle,
        boxShadow: isSelected ? `0 0 0 1px ${alpha(COLORS.saffron, 0x20)}, 0 8px 32px ${alpha(COLORS.saffron, 0x10)}` : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: EASE_OUT }}
      whileHover={disabled ? {} : {
        borderColor: `${alpha(COLORS.saffron, 0x35)}`,
        background: `linear-gradient(135deg, ${alpha(COLORS.saffron, 0x08)}, rgba(255,255,255,0.03))`,
        y: -2,
      }}
      whileTap={disabled ? {} : { scale: 0.99 }}
      aria-pressed={isSelected}
    >
      {/* Selected shimmer */}
      {isSelected && (
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${alpha(COLORS.saffron, 0x60)}, transparent)` }} />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: isSelected ? `${alpha(COLORS.saffron, 0x20)}` : 'rgba(255,255,255,0.06)' }}>
              <CardIcon className="w-5 h-5" style={{ color: isSelected ? COLORS.saffron : 'rgba(255,255,255,0.4)' }} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-sm leading-tight">
                {competition.name} {competition.year || ''}
              </h3>
              
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {competition.place && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
                    <MapPin className="w-3 h-3" aria-hidden="true" />
                    {competition.place}
                  </span>
                )}
                {competition.level && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: `${alpha(COLORS.saffron, 0x12)}`, color: COLORS.saffronLight }}>
                    {levelLabel(competition.level)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status + check */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {competition.status && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${alpha(status.color, 0x15)}`, color: status.color, border: `1px solid ${alpha(status.color, 0x30)}` }}>
                {competition.status === 'ongoing' && (
                  <motion.span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: status.color }}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }} />
                )}
                {status.label}
              </span>
            )}
            {isSelected && (
              <motion.div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: COLORS.saffron }}
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />
              </motion.div>
            )}
          </div>
        </div>

        {competition.startDate && competition.endDate && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
            <Calendar className="w-3 h-3" aria-hidden="true" />
            {new Date(competition.startDate).toLocaleDateString()} –{' '}
            {new Date(competition.endDate).toLocaleDateString()}
          </div>
        )}

        {/* Description */}
        {competition.description && (
          <p className="mt-2 text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--fg-muted)' }}>
            {competition.description}
          </p>
        )}
      </div>
    </motion.button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CompetitionSelectionScreen = ({ userType, onCompetitionSelected }) => {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const {
    assignedCompetitions,
    selectedLevel,
    switchCompetition,
    isLoading,
    mergeAssignedAndSelectCompetition,
    fetchAssignedCompetitions,
  } = useCompetition();
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  // The automatic pass-through failed: show the list so it can be done by hand.
  const [autoFailed, setAutoFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [coachCompetitions, setCoachCompetitions] = useState([]);
  const [coachTeam, setCoachTeam] = useState(null);
  // True from the first render for a coach, so the screen never draws an
  // empty list before the coach's data has even been asked for.
  const [coachLoading, setCoachLoading] = useState(userType === 'coach');
  const [coachError, setCoachError] = useState(null);
  /*
   * Judges and teamless players read from their own endpoints rather than from
   * CompetitionContext — see `scopedCompetitions` below for why neither can use
   * the assigned list.
   */
  const [scopedCompetitions, setScopedCompetitions] = useState(null);
  const [scopedLoading, setScopedLoading] = useState(false);
  const [scopedError, setScopedError] = useState(null);
  useReducedMotion();

  /**
   * Does this player already belong to a squad?
   *
   * `team` comes back as either an id string or a populated object depending on
   * the endpoint, which is why this is not a plain truthiness check.
   */
  const playerHasTeam = Boolean(
    user?.team && (typeof user.team === 'string' ? user.team : (user.team._id || user.team.id))
  );

  /*
   * Send anyone who arrives without a level back to the chooser.
   *
   * Reachable by deep link, by a reload after storage was cleared, or by a
   * stale level left over from before a rename (normalizeLevel turns that into
   * null rather than filtering the list down to nothing). Without this the
   * screen would show every meet at every level, which is the behaviour this
   * flow exists to replace.
   */
  useEffect(() => {
    if (!selectedLevel && userType !== 'superadmin') {
      navigate(`/${userType}/select-level`, { replace: true });
    }
  }, [selectedLevel, userType, navigate]);

  // Coach-specific data fetching
  useEffect(() => {
    if (userType === 'coach') {
      fetchCoachData();
    }
  }, [userType]);

  /*
   * Judges and players choose from a list CompetitionContext cannot give them.
   *
   * A judge's meets are their panel seats, which live in a different collection
   * behind /judge/competitions — the context early-returns on userType 'judge'
   * and never fetches anything for them.
   *
   * A player with no team yet is choosing WHERE TO JOIN one, so the assigned
   * list (meets they are already rostered in) is empty by definition. A player
   * who has a team is choosing between the meets that team is entered in, which
   * is exactly the assigned list.
   */
  useEffect(() => {
    let cancelled = false;
    const needsScopedFetch = userType === 'judge' || (userType === 'player' && !playerHasTeam);

    if (!needsScopedFetch) {
      setScopedCompetitions(null);
      return undefined;
    }

    const load = async () => {
      setScopedLoading(true);
      setScopedError(null);
      try {
        const response = userType === 'judge'
          ? await judgeAPI.getAssignedCompetitions()
          : await playerAPI.getOpenCompetitions();
        const payload = response.data?.data ?? response.data ?? [];
        if (!cancelled) setScopedCompetitions(Array.isArray(payload) ? payload : []);
      } catch (err) {
        logger.error('[Competition Selection] Failed to load competitions', err);
        if (!cancelled) {
          setScopedCompetitions([]);
          setScopedError(err.response?.data?.message || err.message || 'Failed to load competitions');
        }
      } finally {
        if (!cancelled) setScopedLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userType, playerHasTeam]);

  const fetchCoachData = async () => {
    try {
      setCoachLoading(true);
      setCoachError(null);

      // Fetch coach's teams first
      const teamsResponse = await coachAPI.getTeams();
      const teams = Array.isArray(teamsResponse.data) 
        ? teamsResponse.data 
        : (teamsResponse.data?.data || []);
      
      if (teams.length === 0) {
        toast.error('Please create a team first before selecting a competition.');
        navigate('/coach/create-team');
        return;
      }
      
      // Set the first team
      const team = teams[0];
      setCoachTeam(team);
      setCoachError(null); // Clear any previous errors
      
      // Fetch open competitions
      const competitionsResponse = await coachAPI.getOpenCompetitions();
      const competitions = Array.isArray(competitionsResponse.data)
        ? competitionsResponse.data
        : (competitionsResponse.data?.data || []);
      
      setCoachCompetitions(competitions);
      
      if (competitions.length === 0) {
        logger.warn('[Competition Selection] No competitions available');
      }
    } catch (err) {
      logger.error(`[Competition Selection] Error loading coach data:`, err);
      const errorMessage = err.response?.data?.message ||
        err.message ||
        'Failed to load competitions';
      setCoachError(errorMessage);
      toast.error(errorMessage);
      setCoachCompetitions([]);
    } finally {
      setCoachLoading(false);
    }
  };

  // Use appropriate data based on user type
  const sourceCompetitions = userType === 'coach'
    ? coachCompetitions
    : (scopedCompetitions ?? assignedCompetitions);
  /*
   * Loading until THIS role's list is in. Judges and teamless players fetch
   * their own list, and reading the shared context's flag for them (it settles
   * early) drew an empty "Nothing at this level" for the length of the fetch.
   * Coaches also need the context's entered-meets list to know whether a meet
   * is one they are already in.
   */
  const fetchesOwnList = userType === 'judge' || (userType === 'player' && !playerHasTeam);
  const loading = userType === 'coach'
    ? (coachLoading || isLoading)
    : fetchesOwnList
      ? (scopedCompetitions === null || scopedLoading)
      : isLoading;
  const error = userType === 'coach' ? coachError : scopedError;

  /*
   * The whole point of the preceding screen: only meets at the chosen level.
   *
   * Applied to every role's list, whichever endpoint it came from, so there is
   * one place the narrowing happens and no role can quietly skip it.
   */
  const competitions = competitionsAtLevel(sourceCompetitions, selectedLevel);

  /*
   * One meet at this level and nothing to decide — go straight through, for
   * every role, without ever drawing the list (see `autoTarget` in the render).
   *
   * Gated on `selectedLevel` so it can never fire before the level step.
   * A player goes on to pick a squad for that meet on the next screen, as
   * before. A COACH only when their team is already entered there: for a coach,
   * choosing a meet they are not in registers the team for it, and that stays
   * a deliberate tap.
   */
  const onlyCompetition = competitions?.length === 1 ? competitions[0] : null;
  const coachAlreadyIn = (id) => (assignedCompetitions || [])
    .some((c) => String(c._id || c.id) === String(id));
  const autoTarget = !loading && selectedLevel && onlyCompetition
    && (userType !== 'coach' || coachAlreadyIn(onlyCompetition._id || onlyCompetition.id))
    ? onlyCompetition
    : null;
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoTarget || autoStartedRef.current) return;
    autoStartedRef.current = true;
    handleAutoSelect(autoTarget._id || autoTarget.id);
  }, [autoTarget]);

  /**
   * Scope the session to a meet, by whatever route this role uses.
   *
   * Every branch ends with a token carrying the competition claim, because
   * `x-competition-id` on every request is derived from that claim — a session
   * that updated only local state would go on reading the previous meet.
   *
   * @param {string} competitionId
   */
  const activateCompetition = async (competitionId) => {
    if (userType === 'judge') {
      /*
       * Judges have their own endpoint. `/auth/set-competition` throws for them
       * by design: it cannot see the `judgeassignments` collection, so it has no
       * way to check that the judge holds a seat at the meet. This one does.
       */
      const response = await judgeAPI.setCompetition(competitionId);
      const { token, competition } = response.data?.data || {};
      if (!token) throw new Error('No competition-scoped token returned');

      /*
       * Every other judge page reads the meet out of the stored `judge_user`,
       * so that copy has to move with the token — AND SO DOES THE SEAT.
       *
       * This used to spread `user` and change `competition` alone, which kept
       * `judgeType`, `judgeNo`, `gender` and `ageGroup` from the meet just
       * left. A judge does not hold the same seat everywhere: the panel plan
       * makes someone Scorer at one meet and Senior Judge at another, and
       * `JudgeDashboard.handleTeamSelect` routes on `judgeType` alone. So the
       * Scorer arrived at Delhi still labelled Senior Judge, was sent to the
       * evaluation roster instead of the score sheet, and nothing anywhere
       * reported a problem — the server had them correctly seated the whole
       * time.
       *
       * `JudgeDashboard.selectCompetition` re-derives all of this when it
       * switches meets. This is the same derivation for the other door into a
       * meet, and it fails soft: an assignments fetch that does not answer
       * leaves the seat null rather than confidently wrong.
       */
      const seats = await judgeAPI.getAssignments()
        .then((assignments) => assignments.data?.data || [])
        .catch(() => []);
      const atThisMeet = seats
        .filter((seat) => idOf(seat.competition) === competitionId)
        .map((seat) => ({ ...seat, competition: competitionId }));
      const primary = atThisMeet[0] || null;

      login({
        ...(user || {}),
        competition: competitionId,
        judgeType: primary?.judgeType ?? null,
        judgeNo: primary?.judgeNo ?? null,
        gender: primary?.gender ?? null,
        ageGroup: primary?.ageGroup ?? null,
        competitionTypes: primary?.competitionTypes || [],
        allAssignments: atThisMeet,
      }, token, 'judge');
      secureStorage.setItem('judge_competition_id', competitionId);
      if (competition) {
        secureStorage.setItem('judge_current_competition', JSON.stringify(competition));
      }

      /*
       * The category ladder below belongs to the meet just left. Leaving it in
       * place would restore a gender/age group/apparatus from a competition the
       * token is no longer scoped to — screen and token disagreeing about what
       * is being judged.
       */
      sessionStorage.setItem('judge_selected_competition', competitionId);
      for (const key of [
        'judge_category_selected',
        'judge_selected_comp_type',
        'judge_selected_gender',
        'judge_selected_age_group',
        'judge_selected_apparatus',
      ]) {
        sessionStorage.removeItem(key);
      }
      return;
    }

    if (userType === 'player') {
      /*
       * A teamless player is picking a meet they are not yet rostered in, so it
       * is not in `assignedCompetitions` and `switchCompetition` would reject it
       * as unassigned. Setting the context directly is allowed — only admins are
       * competition-scoped server-side, so this mints the claim without
       * asserting an assignment the player does not have yet.
       */
      const response = await authAPI.setCompetition(competitionId);
      const newToken = response.data?.data?.token || response.data?.token;
      if (newToken) secureStorage.setItem('player_token', newToken);

      const chosen = competitions.find((c) => (c._id || c.id) === competitionId);
      if (chosen) mergeAssignedAndSelectCompetition(chosen);
      return;
    }

    await switchCompetition(competitionId);
  };

  const handleAutoSelect = async (competitionId) => {
    try {
      setIsSelecting(true);
      await enterCompetition(competitionId, { quiet: true });
      if (onCompetitionSelected) onCompetitionSelected(competitionId);
      navigateToDashboard(competitionId);
    } catch (error) {
      logger.error('Failed to auto-select competition:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to select competition');
      // Fall back to the list, so the one meet can still be chosen by hand.
      setAutoFailed(true);
      setIsSelecting(false);
    }
  };

  const handleCompetitionSelect = async () => {
    if (!selectedCompetition) { 
      const itemType = 'competition';
      toast.error(`Please select a ${itemType}`); 
      return; 
    }
    
    try {
      setIsSelecting(true);
      logger.log('[Competition Selection] Starting competition selection process');
      await enterCompetition(selectedCompetition);

      if (onCompetitionSelected) onCompetitionSelected(selectedCompetition);

      logger.log('[Competition Selection] About to navigate to dashboard');
      await new Promise(resolve => setTimeout(resolve, 300));
      navigateToDashboard(selectedCompetition);
    } catch (error) {
      logger.error('Failed to select competition:', error);
      const errorMsg = error.response?.data?.message ||
        error.message ||
        `Failed to ${userType === 'coach' ? 'register team' : 'select competition'}`;
      toast.error(errorMsg);
      setIsSelecting(false);
    }
  };

  /**
   * Scope the session to one meet — for a coach, entering the team first when
   * it is not in yet. Shared by the tap on "Continue" and by the automatic
   * pass-through when a level has a single meet, so both do exactly the same.
   *
   * @param {string} competitionId
   * @param {{ quiet?: boolean }} [options] - no toast (the automatic path)
   */
  const enterCompetition = async (competitionId, { quiet = false } = {}) => {
    const selectedCompetition = competitionId;
      if (userType === 'coach') {
        // Coach-specific flow: register team for competition
        if (!coachTeam) {
          // Thrown, not returned: the caller must not go on to the dashboard.
          throw new Error('No team found. Please create a team first.');
        }
        
        /*
         * Entering is skipped when this team is already in.
         *
         * A coach with entries at several meets uses this screen to move
         * between them, not only to enter new ones — and `registerTeam` refuses
         * a duplicate with a 409, so re-selecting a meet they were already in
         * failed with "Team is already registered for this competition" and
         * left them on the chooser. The meet they asked for was right there and
         * the error read like something was broken.
         *
         * Checked against the assigned list first, and the 409 is still caught
         * below: the list can be a moment stale, and losing that race must not
         * turn a switch into an error either.
         */
        const alreadyEntered = (assignedCompetitions || [])
          .some((c) => String(c._id || c.id) === String(selectedCompetition));

        if (alreadyEntered) {
          logger.log('[Competition Selection] Already entered — switching, not registering');
        } else {
          logger.log('[Competition Selection] Registering team for competition');
          try {
            await coachAPI.registerTeamForCompetition(coachTeam._id || coachTeam.id, selectedCompetition);
          } catch (error) {
            const conflict = error.response?.status === 409
              || /already registered/i.test(error.response?.data?.message || '');
            if (!conflict) throw error;
            logger.log('[Competition Selection] Entry raced — already registered, switching instead');
          }
        }

        // Set competition context
        const token = secureStorage.getItem('coach_token');
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        logger.log('[Competition Selection] Setting competition context');
        const authResponse = await fetch(
          `${apiUrl}/auth/set-competition`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ competitionId: selectedCompetition }),
          }
        );

        if (!authResponse.ok) {
          const errorData = await authResponse.json();
          throw new Error(errorData.message || 'Failed to set competition context');
        }

        const authData = await authResponse.json();
        const newToken = authData.data?.token || authData.token;
        const competitionFromResponse = authData.data?.competition || authData.competition;
        if (newToken) {
          secureStorage.setItem('coach_token', newToken);
        }
        const competitionForContext =
          competitionFromResponse ||
          coachCompetitions.find((c) => (c._id || c.id) === selectedCompetition);
        if (competitionForContext && (competitionForContext._id || competitionForContext.id)) {
          mergeAssignedAndSelectCompetition(competitionForContext);
        }
        await fetchAssignedCompetitions();
        if (!quiet) {
          toast.success(
            alreadyEntered
              ? 'Switched to this competition.'
              : 'Team registered for competition successfully!'
          );
        }
      } else {
        // Admin, superadmin, judge and player all just scope the session.
        await activateCompetition(selectedCompetition);
      }
  };

  /**
   * Where this role goes once the session is scoped to a meet.
   *
   * @param {string} competitionId - The meet just chosen. Passed in rather than
   *   read from state because the auto-select path never sets that state.
   */
  const navigateToDashboard = (competitionId) => {
    const routes = {
      admin: '/admin/dashboard',
      superadmin: '/superadmin/dashboard',
      coach: '/coach/dashboard',
      // A player who is not on a squad yet picks one now, scoped to the meet
      // they just chose — `/players/teams/available` takes a competitionId and
      // without one lists teams across every open competition at once.
      player: playerHasTeam ? '/player/dashboard' : '/player/select-team',
      judge: '/judge/dashboard',
    };

    // Pass the selected competition ID as a URL parameter to ensure immediate loading
    const basePath = routes[userType] || '/';

    const pathWithCompetition = competitionId
      ? `${basePath}?competitionId=${competitionId}`
      : basePath;

    logger.log('[Competition Selection] Navigating to:', pathWithCompetition);
    navigate(pathWithCompetition);
  };

  const filteredCompetitions = competitions?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    
    return (
      c.name?.toLowerCase().includes(q) ||
      c.place?.toLowerCase().includes(q) ||
      c.level?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  });

  // ── Loading ──
  // A single meet goes straight through: the list is never drawn for it, not
  // even for the one render before the pass-through starts.
  const passingThrough = !!autoTarget && !autoFailed;
  if (loading || isSelecting || passingThrough) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: COLORS.dark }}>
        <div className="text-center">
          <motion.div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: `${alpha(COLORS.saffron, 0x18)}`, border: `1px solid ${alpha(COLORS.saffron, 0x30)}` }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Trophy className="w-8 h-8" style={{ color: COLORS.saffron }} />
          </motion.div>
          <p className="text-fg-muted text-sm">
            {passingThrough
              ? `Opening ${autoTarget.name || 'your competition'}…`
              : isSelecting ? 'Loading your dashboard...' : 'Loading competitions...'}
          </p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: COLORS.dark }}>
        <FadeIn className="text-center max-w-sm w-full">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <Trophy className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-3">Error</h2>
          <p className="text-red-200 text-sm leading-relaxed mb-8">
            {error}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => userType === 'coach' ? fetchCoachData() : window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm min-h-[44px] transition-all hover:brightness-110 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
            >
              Try Again
            </button>
            {userType === 'coach' && error.includes('create a team') && (
              <button
                onClick={() => navigate('/coach/create-team')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm min-h-[44px] transition-all hover:brightness-110 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
              >
                Create Team
              </button>
            )}
          </div>
        </FadeIn>
      </div>
    );
  }

  /*
   * ── Empty ──
   *
   * Empty AT THE CHOSEN LEVEL, which is a different thing from having no
   * competitions at all — and the difference is the whole reason this needs its
   * own copy. Somebody who picks "international" and is told "you are not
   * assigned to any competitions" would reasonably conclude their account is
   * broken. The way out is another level, so that is the primary action.
   */
  if (!competitions || competitions.length === 0) {
    const emptyReason = {
      coach: 'No open competitions at this level right now.',
      player: playerHasTeam
        ? 'Your team is not entered in any competition at this level.'
        : 'No open competitions at this level right now.',
      judge: 'You do not hold a panel seat at any competition at this level.',
    }[userType] || 'You are not assigned to any competition at this level.';

    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: COLORS.dark }}>
        <FadeIn className="text-center max-w-sm w-full">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.darkBorderSubtle}` }}>
            <Trophy className="w-10 h-10 text-white/20" />
          </div>
          <h2 className="text-2xl font-black text-white mb-3">
            Nothing at {levelLabel(selectedLevel)} Level
          </h2>
          <p className="text-fg-muted text-sm leading-relaxed mb-8">
            {emptyReason} Try another level, or check back later.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => navigate(`/${userType}/select-level`)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm min-h-[44px] transition-all hover:brightness-110 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})` }}
            >
              <Layers className="w-4 h-4" aria-hidden="true" /> Choose Another Level
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white/70 font-bold text-sm min-h-[44px] transition-all hover:text-white active:scale-95"
              style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.darkBorderSubtle}` }}
            >
              Go to Home
            </button>
          </div>
        </FadeIn>
      </div>
    );
  }

  // ── Main ──
  return (
    // `h-dvh`, not `min-h-dvh`: the screen owns exactly one viewport and the
    // COMPETITION LIST is the only part that scrolls. Growing the page instead
    // pushed "Register Team & Continue" past the fold — 24px past it with only
    // three competitions on a 695px-tall window, and further with every extra
    // card — so the primary action needed a scroll nobody knew to make.
    <div className="h-dvh relative overflow-hidden" style={{ background: COLORS.dark }}>
      {/* Ambient background */}
      <AmbientOrbs
        intensity={ORB_INTENSITY.warm}
        orbs={[
          { x: 15, y: 20, size: 400, color: COLORS.saffron, delay: 0 },
          { x: 85, y: 70, size: 300, color: COLORS.gold, delay: 2 },
        ]}
      />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }} />

      <div className="relative z-10 h-full flex flex-col items-center p-4 py-8 md:py-10 [@media(max-height:700px)]:py-4">
        {/*
          * Header, search and CTA are `shrink-0`; the card region is the one
          * item allowed to shrink, so it absorbs every overflow. `justify-center`
          * still centres the whole stack while it fits.
          */}
        <div className="w-full max-w-3xl flex-1 min-h-0 flex flex-col justify-center">
          {/*
            * Header. The height-based variants buy the card list back its room
            * on short viewports — a landscape phone (375px tall) spends half of
            * it on a badge and a subtitle, which left the list a 47px sliver
            * once the screen stopped growing.
            */}
          <FadeIn className="text-center mb-8 shrink-0 [@media(max-height:700px)]:mb-5 [@media(max-height:500px)]:mb-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase mb-5 border [@media(max-height:500px)]:hidden"
              style={{ background: `${alpha(COLORS.saffron, 0x12)}`, borderColor: `${alpha(COLORS.saffron, 0x35)}`, color: COLORS.saffronLight }}>
              <Trophy className="w-3 h-3" aria-hidden="true" />
              Competition Selection
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-tight [@media(max-height:500px)]:text-2xl [@media(max-height:500px)]:mb-1">
              Choose Your <GradientText>Arena</GradientText>
            </h1>
            <p className="text-fg-muted text-base max-w-md mx-auto [@media(max-height:500px)]:hidden">
              Select a competition to continue to your dashboard
            </p>

            {/*
              * The active level, and the way back to change it. Without this the
              * list looks like every meet the user has — so a level that hides
              * the one they were looking for reads as the meet having vanished.
              */}
            {selectedLevel && (
              <button
                onClick={() => navigate(`/${userType}/select-level`)}
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors min-h-[32px]"
                style={{
                  background: `${alpha(COLORS.saffron, 0x12)}`,
                  border: `1px solid ${alpha(COLORS.saffron, 0x30)}`,
                  color: COLORS.saffronLight,
                }}
              >
                <Layers className="w-3 h-3" aria-hidden="true" />
                {levelLabel(selectedLevel)} level
                <span className="text-fg-muted font-normal">· change</span>
              </button>
            )}
          </FadeIn>

          {/* Search */}
          {competitions.length > 3 && (
            <FadeIn delay={0.1} className="mb-6 shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'rgba(255,255,255,0.3)' }} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search by name, place, level, or status..." aria-label="Search competitions"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-10 py-3.5 rounded-xl text-sm transition-all min-h-[44px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${searchQuery ? `${alpha(COLORS.saffron, 0x40)}` : COLORS.darkBorderSubtle}`,
                    color: '#fff',
                    boxShadow: searchQuery ? `0 0 0 3px ${alpha(COLORS.saffron, 0x12)}` : 'none',
                  }}
                />
                <AnimatePresence>
                  {searchQuery && (
                    <motion.button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-fg-muted hover:text-fg transition-colors"
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </FadeIn>
          )}

          {/* Cards grid — the only scrolling region. `py-1 pr-1` keeps the
              hover lift and the selected card's glow off the clip edge. */}
          <div className="min-h-0 overflow-y-auto mb-6 py-1 pr-1">
            <AnimatePresence mode="wait">
              {filteredCompetitions && filteredCompetitions.length === 0 ? (
                <motion.div
                  key="empty"
                  className="text-center py-16"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  <p className="text-fg-muted text-sm">
                    No competitions found for &quot;{searchQuery}&quot;
                  </p>
                  <button onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs font-semibold transition-colors"
                    style={{ color: COLORS.saffronLight }}>
                    Clear search
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="grid"
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {filteredCompetitions?.map((competition, i) => (
                    <CompetitionCard
                      key={competition._id || competition.id}
                      competition={competition}
                      isSelected={selectedCompetition === (competition._id || competition.id)}
                      onSelect={setSelectedCompetition}
                      disabled={isSelecting}
                      index={i}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CTA */}
          <FadeIn delay={0.2} className="flex justify-center shrink-0">
            <motion.button
              onClick={handleCompetitionSelect}
              disabled={!selectedCompetition || isSelecting}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-sm min-h-[52px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: selectedCompetition
                  ? `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.saffronDark})`
                  : 'rgba(255,255,255,0.08)',
                border: `1px solid ${selectedCompetition ? 'transparent' : COLORS.darkBorderSubtle}`,
              }}
              whileHover={selectedCompetition && !isSelecting ? { scale: 1.02, brightness: 1.1 } : {}}
              whileTap={selectedCompetition && !isSelecting ? { scale: 0.97 } : {}}
            >
              <>
                {isSelecting ? (
                  <>
                    <div
                      className="animate-spin w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                    />
                    {userType === 'coach' ? 'Registering...' : 'Loading...'}
                  </>
                ) : (
                  <>
                    {userType === 'coach' ? 'Register Team & Continue' : 'Continue to Dashboard'}
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </>
            </motion.button>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};

export default CompetitionSelectionScreen;
