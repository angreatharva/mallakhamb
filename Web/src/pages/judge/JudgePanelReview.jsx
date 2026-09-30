/**
 * Judge Panel Review — /judge/scoring/panel-review
 *
 * Read-only view of every judge's submitted slip for the current player, plus
 * the Senior Judge's override and Final Submit controls.
 *
 * Deliberately does NOT render any part of the scoring form — no Final Score,
 * Difficulty, Execution, Originality, Combination, Score Summary or submit
 * button. Those live on /judge/scoring. The panel average is also withheld
 * here; the aggregate is only computed at Final Submit.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Scale, User, LogOut, ArrowLeft, AlertTriangle, Pencil, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import { useAuth } from '../../contexts/AuthContext';
import { useCompetition } from '../../contexts/CompetitionContext';
import { COLORS } from '@/styles/tokens';
import { useReducedMotion } from '@/hooks/useResponsive';
import { apparatusKey } from '@/utils/scoring/apparatus';
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
import {
  J, EASE_OUT, JudgeAmbience, LiveDot, MismatchModal, ToleranceModal, SrEditModal,
  SCORING_PATH, ACTIVE_SESSION_KEY, playerIdOf, normalizeBreakdown, scoringCacheKey,
} from './judgeShared';
import { useJudgeSession, useJudgeInfo, useJudgePanelData, resolveJudgeSeat } from './useJudgePanelData';

const JudgePanelReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { clearCompetitionContext } = useCompetition();
  const reduced = useReducedMotion();

  const session = useJudgeSession(location.state);
  const {
    selectedTeam,
    selectedPlayer,
    selectedCompetitionType,
    selectedApparatus,
    selectedGender,
    selectedAgeGroup,
    activeSessionData,
  } = session;

  const judgeInfo = useJudgeInfo();

  /**
   * The seat held for THIS category. A judge who is Senior Judge on one panel
   * and an evaluation judge on another gets the chief's controls only where
   * they actually are the chief.
   */
  const mySeat = resolveJudgeSeat(judgeInfo, {
    gender: selectedGender,
    ageGroup: selectedAgeGroup,
    competitionType: selectedCompetitionType,
    apparatus: selectedApparatus,
  });
  const myJudgeType = mySeat?.judgeType;
  const {
    panelScores,
    setPanelScores,
    judgeNameMap,
    finalized,
    setFinalized,
    socket,
    isConnected,
    panelScoresCount,
    effectivePanelSize,
    orderedPanelEntries,
    allPanelSubmitted,
    isSeniorJudge,
  // Re-read every 10 s: the socket is the fast path, this is what guarantees a
  // judge's edited slip replaces their old one here even if a broadcast is lost.
  } = useJudgePanelData({ judgeInfo, session, refreshMs: 10_000 });

  const [finalizing, setFinalizing] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [showToleranceModal, setShowToleranceModal] = useState(false);
  const [toleranceDismissed, setToleranceDismissed] = useState(false);
  const [showSrEditModal, setShowSrEditModal] = useState(false);
  const [srEditTarget, setSrEditTarget] = useState(null);

  const combinationChecklist = getCombinationChecklist(selectedApparatus);
  const panelMismatch = analyzePanelMismatches(panelScores, effectivePanelSize);
  const canFinalSubmit = !finalized && allPanelSubmitted && isSeniorJudge;

  // Two separate blocks, each with its own alert. A slip mismatch means the
  // panel recorded different routines; a tolerance breach means they recorded
  // the same routine and marked it too differently. Final Submit waits on both.
  const hasSlipMismatch = panelMismatch.difficultyMismatch || panelMismatch.combinationMismatch;

  // The Senior Judge's slip is the reference, so only two people need telling:
  // the Senior Judge (who resolves it) and any judge whose own slip differs
  // from theirs. A judge who already agrees with the Senior Judge is not part
  // of the disagreement and is left alone.
  const isMismatchedJudge = panelMismatch.disagreeingJudges.includes(myJudgeType);
  const shouldSeeMismatch = hasSlipMismatch && panelScoresCount > 0 && (isSeniorJudge || isMismatchedJudge);

  // Same rule for the tolerance alert: the chief, plus the execution judges
  // whose own total sits away from the chief's.
  const isToleranceJudge = panelMismatch.toleranceOffJudges.includes(myJudgeType);
  const shouldSeeTolerance = panelMismatch.hasToleranceBreach && (isSeniorJudge || isToleranceJudge);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Surface mismatches as soon as the panel data lands
  useEffect(() => {
    if (mismatchDismissed) return;
    if (shouldSeeMismatch) setShowMismatchModal(true);
  }, [shouldSeeMismatch, mismatchDismissed]);

  // The tolerance alert queues behind the mismatch one: when a panel trips both
  // (which is common — judges who disagree about the routine also disagree
  // about the mark), stacking two dialogs would hide one behind the other.
  //
  // Gated on `mismatchDismissed` rather than on `showMismatchModal`: both
  // effects run in the same commit, so the mismatch modal's own `setState` has
  // not landed yet when this one reads it, and both dialogs would open at once.
  useEffect(() => {
    if (toleranceDismissed) return;
    if (shouldSeeMismatch && !mismatchDismissed) return;
    if (shouldSeeTolerance) setShowToleranceModal(true);
  }, [shouldSeeTolerance, toleranceDismissed, shouldSeeMismatch, mismatchDismissed]);

  // Once the Senior Judge finalizes, every judge on this page — not just the
  // one who clicked Final Submit — should bounce back to the team roster.
  // `finalized` flips true here either locally (the Senior Judge's own
  // finalizePanelScore call) or via the `scores_saved_notification` socket
  // event every other judge receives, so one effect covers both.
  useEffect(() => {
    if (!finalized) return;
    const t = setTimeout(() => goBackToTeam(), 800);
    return () => clearTimeout(t);
  }, [finalized]);

  const goBackToScoring = () => {
    if (finalized) {
      toast.error('Cannot edit — panel score is already finalized');
      return;
    }
    // Drop any unsaved marks left by an earlier, abandoned edit, so the slip
    // opens on the score actually submitted — which may since have changed.
    try {
      const key = scoringCacheKey(selectedTeam, selectedPlayer, judgeInfo);
      if (key) localStorage.removeItem(key);
    } catch {
      // storage unavailable — the slip still loads the submitted score
    }
    navigate(SCORING_PATH, { state: { ...activeSessionData, resumeEditing: true } });
  };

  const goBackToTeam = () => {
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

  const handleLogout = async () => {
    clearCompetitionContext?.();
    await logout(navigate);
    toast.success('Logged out successfully');
  };

  // SR judge: save an override for another judge's score
  const handleSrEditSave = async (targetJudgeType, editedScores, newTotal) => {
    try {
      const breakdown = {
        difficulty: editedScores.difficulty,
        combination: { total: editedScores.combination.total, checked: editedScores.combination.checked },
        execution: parseFloat(editedScores.execution || 0),
        originality: parseFloat(editedScores.bonus || 0),
        bonus: parseFloat(editedScores.bonus || 0),
      };
      const scoreData = {
        playerId: playerIdOf(selectedPlayer),
        playerName: selectedPlayer.name,
        judgeType: targetJudgeType,
        judgeNo: judgeInfo.judgeNo,
        score: parseFloat(newTotal),
        teamId: selectedTeam._id,
        gender: selectedGender || mySeat?.gender,
        ageGroup: selectedAgeGroup || mySeat?.ageGroup,
        competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        apparatus: selectedApparatus,
        breakdown,
        overrideBySenior: true,
      };
      await judgeAPI.saveScore(scoreData);
      if (socket?.connected) {
        socket.emit('score_update', {
          ...scoreData,
          roomId: `scoring_${selectedGender || mySeat?.gender}_${selectedAgeGroup || mySeat?.ageGroup}_${selectedCompetitionType}`,
        });
      }
      setPanelScores((prev) => ({
        ...prev,
        [targetJudgeType]: {
          judgeType: targetJudgeType,
          score: parseFloat(newTotal),
          breakdown: {
            difficulty: editedScores.difficulty,
            combination: editedScores.combination,
            execution: parseFloat(editedScores.execution || 0),
            bonus: parseFloat(editedScores.bonus || 0),
          },
          timestamp: new Date().toISOString(),
        },
      }));
      toast.success(`Score updated for ${targetJudgeType}: ${newTotal}`);
      setShowSrEditModal(false);
      setSrEditTarget(null);
      // Let both alerts re-evaluate against the corrected slip — an override
      // that closes a difficulty gap can still leave the marks outside
      // tolerance, and the Senior Judge needs telling that it did.
      setMismatchDismissed(false);
      setToleranceDismissed(false);
    } catch (error) {
      logger.error('SR edit save failed:', error);
      toast.error('Failed to save score override');
    }
  };

  const finalizePanelScore = async () => {
    if (!canFinalSubmit) return;
    if (panelMismatch.hasBlockingMismatch) {
      toast.error('Resolve Difficulty and Combination mismatches before final submit');
      setMismatchDismissed(false);
      setShowMismatchModal(true);
      return;
    }
    // COP §3.4 — the panel is not finished while the execution average and the
    // chief's mark are further apart than the tolerance allows.
    if (panelMismatch.hasToleranceBreach) {
      toast.error('Resolve the tolerance breach before final submit');
      setToleranceDismissed(false);
      setShowToleranceModal(true);
      return;
    }
    setFinalizing(true);
    try {
      const fields = panelScoresToJudgeFields(panelScores);
      const calc = calculateAverageMarks(fields, effectivePanelSize);
      const payload = {
        teamId: selectedTeam._id,
        gender: selectedGender || mySeat?.gender,
        ageGroup: selectedAgeGroup || mySeat?.ageGroup,
        competitionType: selectedCompetitionType,
        competitionId: judgeInfo.competition?._id || judgeInfo.competition,
        isFinalSubmit: true,
        judgeType: myJudgeType,
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
          breakdown: panelScores[myJudgeType]?.breakdown || {},
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
      await judgeAPI.saveScore(payload);
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
        socket.emit('scores_saved', {
          roomId: `scoring_${selectedGender || mySeat?.gender}_${selectedAgeGroup || mySeat?.ageGroup}_${selectedCompetitionType}`,
          playerId: playerIdOf(selectedPlayer),
          scores: { finalScore: calc.average, panelSize: effectivePanelSize },
        });
      }
      setFinalized(true);
      toast.success(`Final score ${calc.average.toFixed(2)} locked for ${selectedPlayer.name}`);
      // Navigation back to the team page is handled by the `finalized` effect
      // above, so every judge (not just this one) redirects the same way.
    } catch (error) {
      logger.error('Failed to finalize panel score:', error);
      toast.error(error.response?.data?.error?.message || 'Failed to finalize score');
    } finally {
      setFinalizing(false);
    }
  };

  if (!judgeInfo || !selectedPlayer) return null;

  return (
    <div className="min-h-dvh relative pb-24 lg:pb-0" style={{ background: COLORS.dark, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <JudgeAmbience />

      {/*  Header  */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 sm:h-14 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button onClick={() => { if (!finalized) goBackToScoring(); else goBackToTeam(); }}
                className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                aria-label={finalized ? 'Back to team' : 'Back to scoring'}>
                <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
              </button>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}>
                <Scale className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-tight truncate max-w-[140px] sm:max-w-[200px]">{judgeInfo.name}</p>
                <p className="text-xs truncate" style={{ color: J.purpleLight }}>{myJudgeType}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 sm:hidden">
              <LiveDot connected={isConnected} compact />
              <button onClick={handleLogout}
                className="w-9 h-9 tap-safe rounded-xl flex items-center justify-center border hover:bg-red-500/10"
                style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#EF4444' }}
                aria-label="Logout">
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Reviewing-for banner */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-xl border min-w-0 w-full sm:w-auto sm:max-w-xs"
            style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }}>
            <User className="w-4 h-4 flex-shrink-0" style={{ color: J.green }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{selectedPlayer.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>{selectedTeam?.name}</p>
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="space-y-5 pb-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Panel Review</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
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

          {/* Panel mismatch — inline summary strip (mismatch modal is the primary alert).
              Shown to the same people as the modal: the Senior Judge and the judges
              whose slips differ from theirs. */}
          {shouldSeeMismatch && (
            <motion.button
              type="button"
              onClick={() => { setMismatchDismissed(false); setShowMismatchModal(true); }}
              className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border text-left"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}
              whileHover={{ background: 'rgba(239,68,68,0.13)' }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} />
                <span className="text-sm font-bold text-white">
                  {[
                    (isSeniorJudge ? panelMismatch.difficultyMismatch : panelMismatch.judgeMismatchDetails?.[myJudgeType]?.difficulty) && 'Difficulty',
                    (isSeniorJudge ? panelMismatch.combinationMismatch : panelMismatch.judgeMismatchDetails?.[myJudgeType]?.combination) && 'Combination',
                  ].filter(Boolean).join(' · ')} mismatch detected
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>View Details</span>
            </motion.button>
          )}

          {/* Tolerance — its own strip, in its own colour, because it is a
              separate block on Final Submit and resolved a different way. */}
          {shouldSeeTolerance && (
            <motion.button
              type="button"
              onClick={() => { setToleranceDismissed(false); setShowToleranceModal(true); }}
              className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border text-left"
              style={{ background: 'rgba(245,158,11,0.09)', borderColor: 'rgba(245,158,11,0.35)' }}
              whileHover={{ background: 'rgba(245,158,11,0.14)' }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: J.amber }} />
                <span className="text-sm font-bold text-white">
                  Tolerance exceeded — gap {Number(panelMismatch.toleranceInfo?.difference ?? 0).toFixed(2)} over ±{Number(panelMismatch.toleranceInfo?.tolerance ?? 0).toFixed(2)}
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.18)', color: J.amber }}>View Details</span>
            </motion.button>
          )}

          {/* Detailed per-judge slips — SR judge sees all cards, others only their own */}
          {!isSeniorJudge && !orderedPanelEntries.some(([jt]) => jt === myJudgeType) && panelScoresCount > 0 && (
            <div className="rounded-xl border p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>You haven&apos;t submitted yet — other judges&apos; scores are visible only to the Senior Judge.</p>
            </div>
          )}
          {!isSeniorJudge && orderedPanelEntries.some(([jt]) => jt === myJudgeType) && panelScoresCount > 1 && (
            <div className="rounded-xl border p-3 flex items-center gap-2" style={{ background: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.15)' }}>
              <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(192,132,252,0.6)' }} />
              <p className="text-xs" style={{ color: 'rgba(192,132,252,0.6)' }}>
                {panelScoresCount - 1} other judge{panelScoresCount - 1 > 1 ? 's have' : ' has'} submitted. Scores are visible to the Senior Judge only.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {(isSeniorJudge ? orderedPanelEntries : orderedPanelEntries.filter(([jt]) => jt === myJudgeType)).map(([judge, data]) => {
              const b = normalizeBreakdown(data.breakdown, data.score);
              const isYou = judge === myJudgeType;
              const checkedMap = b.combination.checked || {};
              // Slips loaded from the server carry only the section total, so
              // listing "failed" items there would be a guess, not a fact.
              const failedItems = b.detailed
                ? combinationChecklist.filter((item) => !checkedMap[item.id])
                : null;
              const judgeName = judgeNameMap[judge];
              return (
                <div key={judge} className="rounded-2xl border p-4 space-y-3"
                  style={{
                    background: isYou ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
                    borderColor: isYou ? J.purple : 'rgba(255,255,255,0.1)',
                  }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {judge}
                        {isYou && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">You</span>
                        )}
                      </div>
                      {judgeName && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--fg-muted)' }}>{judgeName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-2xl font-black" style={{ color: isYou ? J.purpleLight : '#fff' }}>
                        {Number(data.score).toFixed(2)}
                      </div>
                      {isSeniorJudge && !isYou && !finalized && (
                        <motion.button
                          type="button"
                          onClick={() => { setSrEditTarget({ judgeType: judge, score: data.score, breakdown: b }); setShowSrEditModal(true); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0"
                          style={{ borderColor: 'rgba(168,85,247,0.4)', color: '#C084FC', background: 'rgba(168,85,247,0.08)' }}
                          whileHover={{ background: 'rgba(168,85,247,0.2)' }}
                          whileTap={{ scale: 0.9 }}
                          title={`Edit ${judge} score`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>Difficulty</p>
                    <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {b.detailed && (
                        <>
                          <span>A: {b.difficulty.aClass ?? 0}</span>
                          <span>B: {b.difficulty.bClass ?? 0}</span>
                          <span>C: {b.difficulty.cClass ?? 0}</span>
                        </>
                      )}
                      <span className="font-bold text-white">{b.detailed ? '= ' : ''}{(b.difficulty.total ?? 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold tracking-widest uppercase" style={{ color: J.purpleLight }}>
                      Combination · {(b.combination.total ?? 0).toFixed(2)} / 1.60
                    </p>
                    {failedItems === null ? null : failedItems.length === 0 ? (
                      <p className="text-xs" style={{ color: J.green }}>All requirements met</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {failedItems.map((item) => (
                          <li key={item.id} className="text-xs" style={{ color: 'var(--fg-muted)' }}>
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
            <p className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>
              Waiting for judges to submit…
            </p>
          )}

          {/* No panel average is shown here — the aggregate is deliberately
              withheld from the panel until Final Submit. */}

          <div className="flex flex-col sm:flex-row gap-3">
            {canFinalSubmit && (
              <motion.button
                type="button"
                onClick={finalizePanelScore}
                disabled={finalizing || panelMismatch.hasBlockingIssue}
                className="flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl text-white font-bold min-h-[52px]"
                style={{
                  background: panelMismatch.hasBlockingIssue
                    ? 'rgba(255,255,255,0.1)'
                    : `linear-gradient(135deg, ${J.green}, ${J.greenDark})`,
                  opacity: finalizing || panelMismatch.hasBlockingIssue ? 0.6 : 1,
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
              <p className="flex-1 text-center text-xs self-center" style={{ color: 'var(--fg-muted)' }}>
                Final Submit unlocks when all {effectivePanelSize || 'panel'} judges have submitted
                {panelMismatch.hasBlockingIssue ? ' and the alerts above are resolved' : ''}
              </p>
            )}
            {/* Why the button next to this is greyed out. Without it a Senior
                Judge with a full panel sees a dead button and no reason. */}
            {canFinalSubmit && panelMismatch.hasBlockingIssue && (
              <p className="flex-1 text-center text-xs self-center" style={{ color: J.amber }}>
                Final Submit is locked —{' '}
                {panelMismatch.hasBlockingMismatch && panelMismatch.hasToleranceBreach
                  ? 'resolve the slip mismatch and the tolerance breach'
                  : panelMismatch.hasBlockingMismatch
                    ? 'resolve the Difficulty / Combination mismatch'
                    : 'resolve the tolerance breach'}
              </p>
            )}
            {!isSeniorJudge && !finalized && (
              <p className="flex-1 text-center text-xs self-center" style={{ color: 'var(--fg-muted)' }}>
                Waiting for Senior Judge to Final Submit and lock scores
              </p>
            )}
            <button
              type="button"
              onClick={goBackToTeam}
              className="flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl text-white font-bold transition-all duration-300 min-h-[52px]"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Return to Team
            </button>
          </div>
        </motion.div>
      </main>

      {/* Modals */}
      <MismatchModal
        isOpen={showMismatchModal}
        onClose={() => { setShowMismatchModal(false); setMismatchDismissed(true); }}
        panelMismatch={panelMismatch}
        panelScores={panelScores}
        isSeniorJudge={isSeniorJudge}
        myJudgeType={myJudgeType}
        judgeNameMap={judgeNameMap}
      />
      <ToleranceModal
        isOpen={showToleranceModal}
        onClose={() => { setShowToleranceModal(false); setToleranceDismissed(true); }}
        panelMismatch={panelMismatch}
        panelScores={panelScores}
        isSeniorJudge={isSeniorJudge}
        myJudgeType={myJudgeType}
        judgeNameMap={judgeNameMap}
      />
      <SrEditModal
        isOpen={showSrEditModal}
        onClose={() => { setShowSrEditModal(false); setSrEditTarget(null); }}
        onSave={handleSrEditSave}
        editTarget={srEditTarget}
        combinationChecklist={combinationChecklist}
        selectedApparatus={selectedApparatus}
        POINT_CEILINGS={POINT_CEILINGS}
        resolveDifficultyValue={resolveDifficultyValue}
        getDifficultyRequirement={getDifficultyRequirement}
        computeCombinationTotal={computeCombinationTotal}
        selectedCompetitionType={selectedCompetitionType}
      />
    </div>
  );
};

export default JudgePanelReview;
