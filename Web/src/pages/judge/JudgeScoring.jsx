import { useState, useEffect, useRef, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Scale, User, LogOut, CheckCircle, Send, ArrowLeft, BookOpen, X, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS, DATA_COLORS, FG, alpha } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { useCompetitionLock } from '@/hooks/useCompetitionLock';
import CompetitionLockBanner from '@/components/competition/CompetitionLockBanner';
import { apparatusKey } from '@/utils/scoring/apparatus';
import {
  getCombinationChecklist,
  getDifficultyRequirement,
  computeCombinationTotal,
  resolveDifficultyValue,
  roundExecution,
  POINT_CEILINGS,
} from '@/utils/scoring/copRules';
import ScorerScoring from './ScorerScoring'; // Import scorer component
import TimeKeeperScoring from './TimeKeeperScoring';
import {
  J, EASE_OUT, JudgeAmbience, LiveDot, PANEL_REVIEW_PATH, ACTIVE_SESSION_KEY,
  playerIdOf, normalizeBreakdown, DecimalInput, scoringCacheKey, DifficultyPicker, DIFFICULTY_CLASSES,
} from './judgeShared';
import { useJudgeSession, useJudgeInfo, useJudgePanelData, resolveJudgeSeat } from './useJudgePanelData';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';

// ─── COP PDF Modal ────────────────────────────────────────────────────────────
const CopPdfModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col"
          data-appearance="dark"
          role="dialog"
          aria-modal="true"
          aria-label="Code of Points"
          style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <BodyScrollLock />
          {/* Modal header */}
          <div
            className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0 border-b"
            style={{ background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.25)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}
              >
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-sm leading-tight">Code of Points</p>
                <p className="text-xs" style={{ color: 'rgba(192,132,252,0.8)' }}>COP Mallakhamb — Rules &amp; Scoring Guide</p>
              </div>
            </div>
            <motion.button
              onClick={onClose}
              className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center border transition-all duration-200 hover:bg-red-500/10"
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: FG.danger }}
              whileTap={{ scale: 0.9 }}
              aria-label="Close COP PDF"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
          {/* PDF iframe */}
          <div className="flex-1 min-h-0">
            <iframe
              src="/docs/COP-Mallakhamb.pdf"
              title="COP Mallakhamb Rules"
              className="w-full h-full"
              style={{ border: 'none' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ScoreInput = ({ label, value, onChange, hint }) => {
  const [focused, setFocused] = useState(false);
  // The label was visible but not linked, so the mark field had no name for a
  // screen reader ("edit text" — for Execution or Originality alike).
  const inputId = useId();
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={inputId} className="text-xs font-bold tracking-widest uppercase" style={{ color: DATA_COLORS.purpleSoft }}>{label}</label>
        {hint && <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{hint}</span>}
      </div>
      <motion.div
        className="relative rounded-xl border overflow-hidden"
        animate={{
          borderColor: focused ? J.purple : 'rgb(var(--ink) / 0.08)',
          boxShadow: focused ? `0 0 0 3px ${alpha(J.purple, 0x20)}` : 'none',
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
        <DecimalInput
          id={inputId}
          value={value}
          onValueChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full px-4 py-3 text-2xl font-black text-center bg-transparent no-spinners"
          style={{ color: FG.ink, background: 'rgb(var(--ink) / 0.04)', fontSize: '1.5rem' }}
        />
      </motion.div>
    </div>
  );
};

const ScoreRow = ({ label, value, max, color = J.purple }) => (
  <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgb(var(--ink) / 0.05)' }}>
    <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>{label}</span>
    <span className="text-sm font-black" style={{ color }}>
      {typeof value === 'number' ? value.toFixed(2) : value}
      <span className="text-xs font-normal ml-1" style={{ color: 'var(--fg-muted)' }}>/ {max}</span>
    </span>
  </div>
);

const CheckRow = ({ checked, onChange, label, penalty }) => (
  <label className="flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 min-h-[52px]"
    style={{
      background: checked ? 'rgba(34,197,94,0.08)' : 'rgb(var(--ink) / 0.03)',
      borderColor: checked ? 'rgba(34,197,94,0.3)' : 'rgb(var(--ink) / 0.07)',
    }}>
    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
      style={{ borderColor: checked ? J.green : 'rgb(var(--ink) / 0.2)', background: checked ? J.green : 'transparent' }}>
      {checked && <CheckCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
    </div>
    <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
    <span className="text-sm font-medium" style={{ color: checked ? FG.ink : 'rgb(var(--ink) / 0.5)' }}>{label}</span>
    {!checked && <span className="ml-auto text-xs font-bold" style={{ color: 'var(--fg-muted)' }}>{penalty.toFixed(2)}</span>}
  </label>
);

/**
 * Ticks every combination requirement at once, or clears them all when every
 * one is already ticked. Mixed while only some are, so a routine that met
 * nearly everything is one tap to select all and one to untick the misses.
 */
const SelectAllRow = ({ metCount, itemCount, onChange, className = '' }) => {
  const all = itemCount > 0 && metCount === itemCount;
  const some = metCount > 0 && !all;
  const inputRef = useRef(null);
  // `indeterminate` has no HTML attribute; it can only be set on the element.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = some;
  }, [some]);
  return (
    <label className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 min-h-[52px] ${className}`}
      style={{
        background: all ? 'rgba(34,197,94,0.08)' : 'rgba(168,85,247,0.08)',
        borderColor: all ? 'rgba(34,197,94,0.3)' : 'rgba(168,85,247,0.3)',
      }}>
      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{ borderColor: all || some ? J.green : 'rgb(var(--ink) / 0.2)', background: all ? J.green : 'transparent' }}>
        {all && <CheckCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
        {some && <Minus className="w-3.5 h-3.5" style={{ color: FG.success }} aria-hidden="true" />}
      </div>
      <input ref={inputRef} type="checkbox" checked={all} onChange={onChange} className="sr-only" />
      <span className="text-sm font-bold text-white">Select all</span>
      <span className="ml-auto text-xs font-bold" style={{ color: 'var(--fg-muted)' }}>{metCount} / {itemCount}</span>
    </label>
  );
};

/**
 * The judge's own scoring slip.
 *
 * HIGH-W1: a Scorer must never reach this component. The Scorer/judge branch
 * now lives in the `JudgeScoring` dispatcher at the bottom of this file, above
 * every hook call. Do not reintroduce an early return here — the ~17 hooks
 * below it would then run conditionally, and React throws "Rendered more hooks
 * than during the previous render" the moment the branch flips on an existing
 * instance.
 */
const JudgeSlip = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  const reduced = useReducedMotion();

  /*
   * The page header's real height, so the phone layout's pinned block (Live
   * Final Score + the Difficulty / Combination / Exec & Orig tabs) sits right
   * under it. It was pinned at a fixed 57px — the one-row desktop header —
   * but on a phone the header is two rows (judge + athlete banner), so it
   * covered the score card and only the tabs stayed in view. Measured, and
   * re-measured on resize, so a wrapped name or larger text still fits.
   */
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(57);

  // Session, judge identity and the live panel feed are shared with the
  // Panel Review page — see useJudgePanelData.
  const session = useJudgeSession(location.state);
  const {
    activeSessionData,
    selectedTeam,
    selectedPlayer,
    selectedCompetitionType,
    selectedApparatus,
    selectedGender,
    selectedAgeGroup,
  } = session;

  const judgeInfo = useJudgeInfo();
  const {
    panelScores, setPanelScores, finalized, socket, isConnected, loaded: panelLoaded,
  } = useJudgePanelData({ judgeInfo, session });

  /**
   * The seat this judge holds for the category being scored. A judge working
   * two panels is a different role in each, so the slip, the panel lookup and
   * the badge all have to follow the category — not the account's first seat.
   */
  const mySeat = resolveJudgeSeat(judgeInfo, {
    gender: selectedGender,
    ageGroup: selectedAgeGroup,
    competitionType: selectedCompetitionType,
    apparatus: selectedApparatus,
  });
  const myJudgeType = mySeat?.judgeType;


  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showCopModal, setShowCopModal] = useState(false);
  /*
   * The meet closed at 23:59 UTC on its end date, so the server will refuse
   * this slip with a 423 whatever the sheet does. Read here so the sheet says
   * so up front instead of after a judge has marked a whole routine — the same
   * reason `finalized` is checked before submitting rather than after.
   */
  const { locked: competitionLocked } = useCompetitionLock();
  // True while the judge is deliberately re-editing an already-submitted slip,
  // so the restore effect below does not pull them straight back to review.
  const editingRef = useRef(location.state?.resumeEditing === true);
  // Guards the one-shot restore of an already-submitted slip.
  const restoredRef = useRef(false);
  /*
   * Re-editing opens on the slip the judge SUBMITTED, and that is read from the
   * server after the page mounts. Until it lands the form would show zeros —
   * and anything the judge changed in the meantime was then overwritten by the
   * late load, putting the old score back. So the sheet waits for it.
   */
  const [slipReady, setSlipReady] = useState(() => location.state?.resumeEditing !== true);

  // Active mobile tab state
  const [activeMobileTab, setActiveMobileTab] = useState('difficulty'); // 'difficulty' | 'combination' | 'exec_orig'
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diffX = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 40;
    const tabs = ['difficulty', 'combination', 'exec_orig'];
    const currentIndex = tabs.indexOf(activeMobileTab);

    if (diffX > minSwipeDistance) {
      // Swiped left -> next tab
      if (currentIndex < tabs.length - 1) {
        setActiveMobileTab(tabs[currentIndex + 1]);
      }
    } else if (diffX < -minSwipeDistance) {
      // Swiped right -> prev tab
      if (currentIndex > 0) {
        setActiveMobileTab(tabs[currentIndex - 1]);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const goBackAfterScoring = () => {
    // Clear cached scores when leaving the scoring page
    const cacheKey = getScoringCacheKey();
    if (cacheKey) {
      try {
        localStorage.removeItem(cacheKey);
      } catch (e) {
        logger.warn('Failed to clear cached scores on navigation', e);
      }
    }
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
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

  // Generate a unique key for this scoring session
  const getScoringCacheKey = () => scoringCacheKey(selectedTeam, selectedPlayer, judgeInfo);

  // Load initial scores from cache or create new
  const getInitialScores = () => {
    const cacheKey = getScoringCacheKey();
    if (cacheKey) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Validate cached data structure
          if (parsed.difficulty && parsed.combination && typeof parsed.execution === 'number') {
            return parsed;
          }
        }
      } catch (e) {
        logger.warn('Failed to load cached scores', e);
      }
    }
    return {
      difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
      combination: buildInitialCombination(),
      execution: 0,
      bonus: 0
    };
  };

  const [scores, setScores] = useState(getInitialScores);

  /*
   * Restore the autosaved marks after a refresh.
   *
   * The cache key names the judge, and useJudgeInfo reads the judge in an
   * effect — so on the first render it is still null, getInitialScores looks
   * under `…_unknown`, finds nothing, and the marks the judge had entered were
   * never read back. Load them once, as soon as the real key exists.
   */
  const cacheRestoredRef = useRef(false);
  useEffect(() => {
    if (cacheRestoredRef.current || !judgeInfo) return;
    const cacheKey = getScoringCacheKey();
    if (!cacheKey) return;
    cacheRestoredRef.current = true;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (parsed.difficulty && parsed.combination && typeof parsed.execution === 'number') {
        setScores(parsed);
        // Re-editing: these are this edit's unsaved changes (Panel Review
        // clears the key on the way in), so the submitted slip must not
        // replace them when it loads.
        if (editingRef.current) {
          restoredRef.current = true;
          setSlipReady(true);
        }
      }
    } catch (e) {
      logger.warn('Failed to restore cached scores', e);
    }
  }, [judgeInfo]);

  // Auto-save scores to localStorage whenever they change. Not before the judge
  // is known: the key would be `…_unknown`, a slot nothing ever reads back.
  useEffect(() => {
    const cacheKey = getScoringCacheKey();
    if (judgeInfo && cacheKey && !submitted && !finalized) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(scores));
      } catch (e) {
        logger.warn('Failed to cache scores', e);
      }
    }
  }, [scores, submitted, finalized]);

  /*
   * Warn before a refresh or tab close throws away an unsubmitted slip.
   *
   * Browsers do not let a page draw its own dialog here — returning from
   * `beforeunload` is the only hook, and the browser shows its standard
   * "Reload site? Changes may not be saved" prompt. iOS Safari ignores it
   * entirely, which is why the marks are also autosaved and restored above.
   */
  const hasUnsubmittedMarks =
    !submitted && !finalized && (
      scores.difficulty.total > 0 ||
      Object.values(scores.combination.checked || {}).some(Boolean) ||
      parseFloat(scores.execution || 0) > 0 ||
      parseFloat(scores.bonus || 0) > 0
    );
  useEffect(() => {
    if (!hasUnsubmittedMarks) return undefined;
    const warn = (e) => {
      e.preventDefault();
      // Chrome/Edge still need returnValue set to show the prompt.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsubmittedMarks]);

  // Clear cached scores when score is submitted or finalized
  useEffect(() => {
    if (submitted || finalized) {
      const cacheKey = getScoringCacheKey();
      if (cacheKey) {
        try {
          localStorage.removeItem(cacheKey);
        } catch (e) {
          logger.warn('Failed to clear cached scores', e);
        }
      }
    }
  }, [submitted, finalized]);

  // Restore an already-submitted slip once the panel feed lands, so the form
  // shows what this judge sent. Normally this also hands off straight to
  // Panel Review; while the judge is deliberately re-editing (resumeEditing),
  // the scores are still restored — the cache was cleared on submit, so this
  // panel feed is the only place the prior values still exist — but we stay
  // on this page instead of redirecting and leave submitted/editable as-is.
  useEffect(() => {
    if (!judgeInfo || restoredRef.current) return;
    const myScore = panelScores[myJudgeType];
    if (!myScore) return;
    restoredRef.current = true;
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
    setSlipReady(true);
    if (editingRef.current) return;
    setSubmitted(true);
    // Replace rather than push so Back still leaves the page.
    navigate(PANEL_REVIEW_PATH, { replace: true, state: activeSessionData });
  }, [panelScores, judgeInfo, navigate, activeSessionData]);

  // The read settled without a slip of ours (or failed): nothing to wait for.
  useEffect(() => {
    if (panelLoaded) setSlipReady(true);
  }, [panelLoaded]);

  // Covers the judge who is re-editing their slip (resumeEditing) at the
  // moment the Senior Judge finalizes elsewhere — the panel score is now
  // locked, so bounce back to the team page like everyone else.
  useEffect(() => {
    if (!finalized) return;
    const t = setTimeout(() => goBackAfterScoring(), 800);
    return () => clearTimeout(t);
  }, [finalized]);

  const resetScores = () => {
    const newScores = {
      difficulty: { aClass: 0, bClass: 0, cClass: 0, total: 0 },
      combination: buildInitialCombination(),
      execution: 0, bonus: 0
    };
    setScores(newScores);
    // Clear cached scores when reset
    const cacheKey = getScoringCacheKey();
    if (cacheKey) {
      try {
        localStorage.removeItem(cacheKey);
      } catch (e) {
        logger.warn('Failed to clear cached scores on reset', e);
      }
    }
  };

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

  const combinationMet = combinationChecklist.filter((item) => scores.combination.checked[item.id]).length;

  // Select all: tick every requirement, or clear them when all are ticked.
  const handleCombinationAll = () => {
    const tick = combinationMet < combinationChecklist.length;
    const checked = { ...scores.combination.checked };
    combinationChecklist.forEach((item) => { checked[item.id] = tick; });
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
    if (competitionLocked) {
      toast.error('This competition has closed. Scores can no longer be changed.');
      return;
    }
    setSubmitting(true);
    try {
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
        judgeType: myJudgeType, judgeNo: mySeat?.judgeNo, score: parseFloat(finalScore),
        teamId: selectedTeam._id,
        gender: selectedGender || judgeInfo.gender,
        ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
        competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        apparatus: selectedApparatus,
        breakdown
      };
      // HIGH-W3: through judgeAPI so a 401 gets a silent refresh rather than
      // surfacing as a failed submission mid-performance.
      await judgeAPI.saveScore(scoreData);
      try {
        // Keyed by athlete AND apparatus: an athlete entered for three of them
        // is judged three times, and marking the athlete alone would grey out
        // the other two before anyone had scored them.
        const sKey = `judge_submitted_players_${selectedTeam._id}`;
        const prev = JSON.parse(sessionStorage.getItem(sKey) || '{}');
        prev[`${playerIdOf(selectedPlayer)}::${apparatusKey(selectedApparatus)}`] = true;
        sessionStorage.setItem(sKey, JSON.stringify(prev));
      } catch {
        // best-effort cache of "already scored" markers
      }
      if (socket?.connected) {
        socket.emit('score_update', {
          ...scoreData,
          roomId: `scoring_${selectedGender || mySeat?.gender}_${selectedAgeGroup || mySeat?.ageGroup}_${selectedCompetitionType}`
        });
      }

      setPanelScores(prev => ({
        ...prev,
        [myJudgeType]: {
          judgeType: myJudgeType,
          score: finalScore,
          breakdown: normalizeBreakdown(breakdown, finalScore),
          timestamp: new Date().toISOString()
        }
      }));

      toast.success(`Score ${finalScore} submitted for ${selectedPlayer.name}`);
      setSubmitted(true);
      editingRef.current = false;
      navigate(PANEL_REVIEW_PATH);
      
      // Clear cached scores after successful submission
      const cacheKey = getScoringCacheKey();
      if (cacheKey) {
        try {
          localStorage.removeItem(cacheKey);
        } catch (e) {
          logger.warn('Failed to clear cached scores after submission', e);
        }
      }
    } catch (error) {
      logger.error('Failed to save score:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save score. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  // Measure once the header exists, then follow its size.
  // (A hook, so it sits above the early return below.)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const update = () => setHeaderHeight(Math.round(el.getBoundingClientRect().height) || 57);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [judgeInfo, selectedPlayer]);

  if (!judgeInfo || !selectedPlayer) return null;

  const finalScore = parseFloat(calcFinal());
  return (
    <div className="min-h-dvh relative pb-24 lg:pb-0" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <JudgeAmbience />

      {/*  Header  */}
      <header ref={headerRef} className="sticky top-0 z-40 border-b"
        style={{ background: 'rgb(var(--bg) / 0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 sm:h-14 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button onClick={goBackAfterScoring}
                className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                aria-label="Back to team">
                <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
              </button>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
                <Scale className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight truncate max-w-[140px] sm:max-w-[200px]">{judgeInfo.name}</p>
                <p className="text-xs truncate" style={{ color: DATA_COLORS.purpleSoft }}>{myJudgeType}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 sm:hidden">
              <LiveDot connected={isConnected} compact />
              <button onClick={handleLogout}
                className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center border hover:bg-red-500/10"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: FG.danger }}
                aria-label="Logout">
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Scoring-for banner */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-xl border min-w-0 w-full sm:w-auto sm:max-w-xs"
            style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }}>
            <User className="w-4 h-4 flex-shrink-0" style={{ color: FG.success }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{selectedPlayer.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{selectedTeam?.name}</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            <LiveDot connected={isConnected} />
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 min-h-[36px] hover:bg-red-500/10"
              style={{ borderColor: 'rgba(239,68,68,0.3)', color: FG.danger }}
              aria-label="Logout">
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-5" id="main-content">
        {/* Before the sheet, not beside the button: the point is that the judge
            sees it BEFORE marking a routine. Submit is disabled to match. */}
        <CompetitionLockBanner className="mb-4" />

        {!slipReady && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgb(var(--bg) / 0.85)' }} role="status" aria-live="polite">
            <p className="text-sm font-bold text-white">Loading your submitted score…</p>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}>
          
                {/* ─── MOBILE VIEW (lg:hidden) ─── */}
                <div className="block lg:hidden space-y-3 pb-20">
                  {/* 1. Fixed Top Score Header */}
                  <div className="sticky z-30 pt-2 pb-3 -mx-3 px-3 backdrop-blur-xl border-b"
                    data-testid="mobile-score-bar"
                    style={{ top: headerHeight, background: 'rgb(var(--bg) / 0.95)', borderColor: 'rgba(168,85,247,0.2)' }}>
                    <div className="rounded-2xl p-3 flex items-center justify-between relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(124,58,237,0.18))', border: '1px solid rgba(168,85,247,0.35)' }}>
                      <div className="min-w-0 pr-2">
                        <p className="text-[10px] font-extrabold tracking-widest uppercase" style={{ color: DATA_COLORS.purpleSoft }}>Live Final Score</p>
                        <p className="text-xs text-white/60 truncate mt-0.5">{selectedPlayer?.name} • <span className="text-fg-muted">{selectedApparatus || 'Pole'}</span></p>
                      </div>
                      <motion.div className="flex items-baseline gap-1 flex-shrink-0"
                        key={calcFinal()}
                        initial={{ scale: 0.95, opacity: 0.8 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.15 }}>
                        <span className="text-4xl font-black text-white leading-none">{calcFinal()}</span>
                        <span className="text-xs text-fg-muted font-semibold">/ 10.00</span>
                      </motion.div>
                    </div>

                    {/* 2. 3-Tab Bar */}
                    <div className="grid grid-cols-3 gap-1 mt-2 p-1 rounded-xl border bg-bg/40"
                      style={{ borderColor: 'rgb(var(--ink) / 0.08)' }}>
                      <button
                        type="button"
                        onClick={() => setActiveMobileTab('difficulty')}
                        className={`py-2 px-1 min-h-[44px] rounded-lg text-xs font-black transition-all duration-200 text-center truncate ${
                          activeMobileTab === 'difficulty' ? 'bg-purple-600/30 text-white border border-purple-500/40 shadow-sm' : 'text-fg-muted hover:text-white/80'
                        }`}
                      >
                        Difficulty
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMobileTab('combination')}
                        className={`py-2 px-1 min-h-[44px] rounded-lg text-xs font-black transition-all duration-200 text-center truncate ${
                          activeMobileTab === 'combination' ? 'bg-purple-600/30 text-white border border-purple-500/40 shadow-sm' : 'text-fg-muted hover:text-white/80'
                        }`}
                      >
                        Combination
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMobileTab('exec_orig')}
                        className={`py-2 px-1 min-h-[44px] rounded-lg text-xs font-black transition-all duration-200 text-center truncate ${
                          activeMobileTab === 'exec_orig' ? 'bg-purple-600/30 text-white border border-purple-500/40 shadow-sm' : 'text-fg-muted hover:text-white/80'
                        }`}
                      >
                        Exec & Orig
                      </button>
                    </div>
                  </div>

                  {/* 3. Tab Content Area with Touch / Swipe Support */}
                  <div
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="min-h-[300px] pt-1"
                  >
                                {activeMobileTab === 'difficulty' && (
                        <motion.div
                          key="tab-difficulty"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="rounded-2xl border p-4 space-y-4"
                          style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-black text-white text-base">Difficulty Elements</h3>
                              <p className="text-xs text-fg-muted mt-0.5">Select counts for Class A, B, and C elements</p>
                            </div>
                            <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 3.80</span>
                          </div>

                          <div className="space-y-5 pt-1">
                            {DIFFICULTY_CLASSES.map(([key, cls, value]) => (
                              <DifficultyPicker key={key} cls={cls} value={value} count={scores.difficulty[key]}
                                onChange={v => handleDifficulty(key, v)} />
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-white/5">
                            <span className="text-xs font-bold text-fg-muted">Difficulty Subtotal</span>
                            <span className="text-xl font-black" style={{ color: Math.abs(scores.difficulty.total - 3.80) < 0.01 ? FG.success : FG.warning }}>
                              {scores.difficulty.total.toFixed(2)} <span className="text-xs font-normal text-fg-muted">/ 3.80</span>
                            </span>
                          </div>

                          <motion.button
                            onClick={() => setShowCopModal(true)}
                            className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl border text-xs font-bold transition-all duration-200 mt-2"
                            style={{ borderColor: 'rgba(168,85,247,0.3)', color: DATA_COLORS.purpleSoft, background: 'rgba(168,85,247,0.06)' }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> View COP Rules Reference
                          </motion.button>
                        </motion.div>
                      )}

                      {activeMobileTab === 'combination' && (
                        <motion.div
                          key="tab-combination"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="rounded-2xl border p-4 space-y-4"
                          style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h3 className="font-black text-white text-base">Combination Requirements</h3>
                              <p className="text-xs text-fg-muted mt-0.5 truncate">{selectedApparatus || 'Pole Mallakhamb'}</p>
                            </div>
                            <span className="text-xs px-2.5 py-1 rounded-full font-bold flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 1.60</span>
                          </div>

                          <div className="space-y-2 pt-1">
                            <SelectAllRow metCount={combinationMet} itemCount={combinationChecklist.length}
                              onChange={handleCombinationAll} />
                            {combinationChecklist.map((item) => (
                              <CheckRow key={item.id} checked={scores.combination.checked[item.id]}
                                onChange={() => handleCombination(item.id)} label={item.rule} penalty={item.penalty} />
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-white/5">
                            <span className="text-xs font-bold text-fg-muted">Combination Subtotal</span>
                            <span className="text-xl font-black" style={{ color: DATA_COLORS.purple }}>
                              {scores.combination.total.toFixed(2)} <span className="text-xs font-normal text-fg-muted">/ 1.60</span>
                            </span>
                          </div>

                          <motion.button
                            onClick={() => setShowCopModal(true)}
                            className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl border text-xs font-bold transition-all duration-200 mt-2"
                            style={{ borderColor: 'rgba(168,85,247,0.3)', color: DATA_COLORS.purpleSoft, background: 'rgba(168,85,247,0.06)' }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> View COP Rules Reference
                          </motion.button>
                        </motion.div>
                      )}

                      {activeMobileTab === 'exec_orig' && (
                        <motion.div
                          key="tab-exec_orig"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-4"
                        >
                          {/* Execution Card */}
                          <div className="rounded-2xl border p-4 space-y-3"
                            style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                            <div className="flex items-center justify-between">
                              <h3 className="font-black text-white text-base">Execution Score</h3>
                              <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 4.40</span>
                            </div>
                            <ScoreInput label="" value={scores.execution}
                              onChange={raw => setScores({ ...scores, execution: roundExecution(raw) })} />
                          </div>

                          {/* Originality Card */}
                          <div className="rounded-2xl border p-4 space-y-3"
                            style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                            <div className="flex items-center justify-between">
                              <h3 className="font-black text-white text-base">Originality Bonus</h3>
                              <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 0.20</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {[['None', 0], ['+0.20', POINT_CEILINGS.bonus]].map(([label, val]) => {
                                const active = Math.abs((scores.bonus || 0) - val) < 1e-6;
                                return (
                                  <button key={label} type="button"
                                    onClick={() => setScores({ ...scores, bonus: val })}
                                    className="py-3 rounded-xl border font-bold text-sm transition-all duration-200 min-h-[46px]"
                                    style={{
                                      background: active ? 'rgba(168,85,247,0.15)' : 'rgb(var(--ink) / 0.03)',
                                      borderColor: active ? J.purple : 'rgb(var(--ink) / 0.08)',
                                      color: active ? FG.ink : 'rgb(var(--ink) / 0.5)',
                                    }}>
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Summary Card */}
                          <div className="rounded-2xl border p-4 space-y-1"
                            style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                            <h3 className="font-black text-white text-sm mb-2">Overall Score Breakdown</h3>
                            <ScoreRow label="1. Difficulty" value={scores.difficulty.total} max="3.80" />
                            <ScoreRow label="2. Combination" value={scores.combination.total} max="1.60" />
                            <ScoreRow label="3. Execution" value={parseFloat(scores.execution || 0)} max="4.40" />
                            <ScoreRow label="4. Originality" value={parseFloat(scores.bonus || 0)} max="0.20" />
                          </div>

                          <motion.button
                            onClick={() => setShowCopModal(true)}
                            className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] rounded-xl border text-xs font-bold transition-all duration-200"
                            style={{ borderColor: 'rgba(168,85,247,0.3)', color: DATA_COLORS.purpleSoft, background: 'rgba(168,85,247,0.06)' }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> View COP Rules Reference
                          </motion.button>
                        </motion.div>
                      )}
                              </div>
                </div>

                {/* ─── DESKTOP VIEW (hidden on mobile, lg:grid) ─── */}
                <div key="scoring-desktop" className="hidden lg:grid grid-cols-[1.6fr_1fr] gap-5 min-h-[calc(100dvh-80px)]">
                  {/* Left Column: Scoring Controls */}
                  <div className="flex flex-col gap-4 order-1">
                    {/* Score hero */}
                    <motion.div className="rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #A855F720, #7C3AED20)', border: '1px solid rgba(168,85,247,0.3)' }}
                      animate={{ boxShadow: finalScore > 0 ? `0 0 60px rgba(168,85,247,0.2)` : 'none' }}>
                      <div className="absolute inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.15), transparent 60%)' }} />
                      <p className="text-xs font-bold tracking-widest uppercase mb-2 relative z-10" style={{ color: DATA_COLORS.purpleSoft }}>Final Score</p>
                      <motion.p className="text-7xl font-black relative z-10"
                        key={calcFinal()}
                        initial={{ scale: 0.9, opacity: 0.5 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        style={{ color: FG.ink }}>
                        {calcFinal()}
                      </motion.p>
                      <p className="text-sm relative z-10 mt-1" style={{ color: 'var(--fg-muted)' }}>out of 10.00</p>
                    </motion.div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl border p-4"
                        style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-black text-white text-sm">Execution</h3>
                          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 4.40</span>
                        </div>
                        <ScoreInput label="" value={scores.execution}
                          onChange={raw => setScores({ ...scores, execution: roundExecution(raw) })} />
                      </div>

                      <div className="rounded-2xl border p-4"
                        style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-black text-white text-sm">Originality</h3>
                          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>0.20</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[['None', 0], ['+0.20', POINT_CEILINGS.bonus]].map(([label, val]) => {
                            const active = Math.abs((scores.bonus || 0) - val) < 1e-6;
                            return (
                              <button key={label} type="button"
                                onClick={() => setScores({ ...scores, bonus: val })}
                                className="py-3 rounded-xl border font-bold text-sm transition-all duration-200 min-h-[44px]"
                                style={{
                                  background: active ? 'rgba(168,85,247,0.15)' : 'rgb(var(--ink) / 0.03)',
                                  borderColor: active ? J.purple : 'rgb(var(--ink) / 0.08)',
                                  color: active ? FG.ink : 'rgb(var(--ink) / 0.5)',
                                }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4 flex-1"
                      style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="min-w-0">
                          <h3 className="font-black text-white text-sm">Combination</h3>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--fg-muted)' }}>{selectedApparatus || 'Pole Mallakhamb'}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 1.60</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <SelectAllRow metCount={combinationMet} itemCount={combinationChecklist.length}
                          onChange={handleCombinationAll} className="col-span-2" />
                        {combinationChecklist.map((item) => (
                          <CheckRow key={item.id} checked={scores.combination.checked[item.id]}
                            onChange={() => handleCombination(item.id)} label={item.rule} penalty={item.penalty} />
                        ))}
                      </div>
                      <div className="flex justify-end pt-2">
                        <span className="text-lg font-black" style={{ color: DATA_COLORS.purple }}>
                          {scores.combination.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'var(--fg-muted)' }}>/ 1.60</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Summary & Submit (desktop difficulty) */}
                  <div className="flex flex-col gap-4 order-2">
                    <div className="rounded-2xl border p-4 space-y-3"
                      style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-black text-white text-sm">Difficulty</h3>
                        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: DATA_COLORS.purpleSoft }}>Max 3.80</span>
                      </div>
                      <div className="space-y-4">
                        {DIFFICULTY_CLASSES.map(([key, cls, value]) => (
                          <DifficultyPicker key={key} cls={cls} value={value} count={scores.difficulty[key]}
                            onChange={v => handleDifficulty(key, v)} />
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <span className="text-lg font-black" style={{ color: Math.abs(scores.difficulty.total - 3.80) < 0.01 ? FG.success : FG.warning }}>
                          {scores.difficulty.total.toFixed(2)} <span className="text-xs font-normal" style={{ color: 'var(--fg-muted)' }}>/ 3.80</span>
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4 space-y-1"
                      style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.06)' }}>
                      <h3 className="font-black text-white text-sm mb-2">Score Summary</h3>
                      <ScoreRow label="1. Difficulty" value={scores.difficulty.total} max="3.80" />
                      <ScoreRow label="2. Combination" value={scores.combination.total} max="1.60" />
                      <ScoreRow label="3. Execution" value={parseFloat(scores.execution || 0)} max="4.40" />
                      <ScoreRow label="4. Originality" value={parseFloat(scores.bonus || 0)} max="0.20" />
                    </div>

                    {/* Desktop submit */}
                    <div className="flex flex-col gap-3">
                      <motion.button
                        onClick={submitScore}
                        disabled={submitting || !isConnected || submitted || competitionLocked}
                        className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-3 min-h-[56px] relative overflow-hidden"
                        style={{
                          background: submitted ? `linear-gradient(135deg, ${J.green}, ${J.greenDark})` : `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})`, color: submitted ? '#0A0A0A' : '#FFFFFF',
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
                              initial={{ scale: 0.8, opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                        <p className="text-center text-xs" style={{ color: FG.danger }}>
                          Not connected to server. Scores cannot be submitted.
                        </p>
                      )}
                      <motion.button
                        onClick={() => setShowCopModal(true)}
                        className="flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200"
                        style={{ borderColor: 'rgba(168,85,247,0.3)', color: DATA_COLORS.purpleSoft, background: 'rgba(168,85,247,0.06)' }}
                        whileHover={{ background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.5)' }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> COP Rules
                      </motion.button>
                    </div>
                  </div>
                </div>

            {/* Mobile sticky submit bar */}
              <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 p-3 border-t"
                style={{
                  background: 'rgb(var(--bg) / 0.96)',
                  backdropFilter: 'blur(16px)',
                  borderColor: 'rgba(168,85,247,0.2)',
                  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
                }}>
                <div className="max-w-[1400px] mx-auto flex items-center gap-3">
                  <div className="flex-shrink-0 text-center px-2">
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: DATA_COLORS.purpleSoft }}>Total</p>
                    <p className="text-xl font-black text-white leading-none">{calcFinal()}</p>
                  </div>
                  <motion.button
                    onClick={submitScore}
                    disabled={submitting || !isConnected || submitted || competitionLocked}
                    className="flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 min-h-[52px]"
                    style={{
                      background: submitted ? `linear-gradient(135deg, ${J.green}, ${J.greenDark})` : `linear-gradient(135deg, ${J.purple}, ${J.purpleDark})`, color: submitted ? '#0A0A0A' : '#FFFFFF',
                      opacity: (!isConnected || submitting || competitionLocked) ? 0.6 : 1,
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
                  <p className="text-center text-[10px] mt-1.5" style={{ color: FG.danger }}>
                    Offline — cannot submit
                  </p>
                )}
              </div>


        </motion.div>
      </main>

      {/* Modals */}
      <CopPdfModal isOpen={showCopModal} onClose={() => setShowCopModal(false)} />
    </div>
  );
};

/**
 * Hook-free dispatcher for /judge/scoring (fixes HIGH-W1).
 *
 * Picks the Scorer view or the judge slip BEFORE any of the hooks inside
 * `JudgeSlip` run. `useLocation` is the only hook here and is called
 * unconditionally on every render, so this component's own hook sequence is
 * always identical. Flipping `isScorer` swaps which CHILD is rendered, and
 * React unmounts one and mounts the other — a clean remount rather than a
 * hook-order violation on a single instance.
 */
const JudgeScoring = () => {
  const location = useLocation();

  // Read straight through rather than via useMemo. The previous `useMemo(..., [])`
  // cached a value read once at mount, so if `secureStorage.getItem` later
  // evicted an entry it could not decrypt, `isScorer` could change between
  // renders of the same instance — the exact trigger described in AUDIT.md
  // HIGH-W1. Reading on every render keeps the branch consistent with storage.
  let storedJudgeUser = null;
  try {
    const raw = secureStorage.getItem('judge_user');
    storedJudgeUser = raw ? JSON.parse(raw) : null;
  } catch {
    storedJudgeUser = null;
  }

  // The Time Keeper is routed by the seat held in the chosen category (the
  // dashboard sets `isTimeKeeper`); a stored primary seat covers a refresh
  // that lost the navigation state.
  // The navigation state is the dashboard's per-category answer and wins — for
  // a person seated as both Scorer and Time Keeper it carries the role they
  // chose in the dashboard's role popup. The stored primary seat only covers a
  // refresh that lost the state.
  const primary = storedJudgeUser?.judgeType;
  const isScorer = location.state?.isScorer
    || (!location.state?.isTimeKeeper && primary === 'Scorer');
  const isTimeKeeper = !isScorer
    && (location.state?.isTimeKeeper || primary === 'Time Keeper');

  if (isTimeKeeper) return <TimeKeeperScoring />;
  return isScorer ? <ScorerScoring /> : <JudgeSlip />;
};

export default JudgeScoring;

