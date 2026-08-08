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
  J, EASE_OUT, Orb, LiveDot, MismatchModal, SrEditModal,
  SCORING_PATH, ACTIVE_SESSION_KEY, playerIdOf, normalizeBreakdown,
} from './judgeShared';
import { useJudgeSession, useJudgeInfo, useJudgePanelData } from './useJudgePanelData';

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
  } = useJudgePanelData({ judgeInfo, session });

  const [finalizing, setFinalizing] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [showSrEditModal, setShowSrEditModal] = useState(false);
  const [srEditTarget, setSrEditTarget] = useState(null);

  const combinationChecklist = getCombinationChecklist(selectedApparatus);
  const panelMismatch = analyzePanelMismatches(panelScores, effectivePanelSize);
  const canFinalSubmit = !finalized && allPanelSubmitted && isSeniorJudge;

  const hasMismatch =
    panelMismatch.difficultyMismatch ||
    panelMismatch.combinationMismatch ||
    (panelMismatch.toleranceMismatch && effectivePanelSize >= 4);

  // The Senior Judge's slip is the reference, so only two people need telling:
  // the Senior Judge (who resolves it) and any judge whose own slip differs
  // from theirs. A judge who already agrees with the Senior Judge is not part
  // of the disagreement and is left alone.
  const isMismatchedJudge = panelMismatch.judgesNeedingReview.includes(judgeInfo?.judgeType);
  const shouldSeeMismatch = hasMismatch && panelScoresCount > 0 && (isSeniorJudge || isMismatchedJudge);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Surface mismatches as soon as the panel data lands
  useEffect(() => {
    if (mismatchDismissed) return;
    if (shouldSeeMismatch) setShowMismatchModal(true);
  }, [shouldSeeMismatch, mismatchDismissed]);

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
        gender: selectedGender || judgeInfo.gender,
        ageGroup: selectedAgeGroup || judgeInfo.ageGroup,
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
          roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`,
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
      setMismatchDismissed(false); // allow mismatch modal to re-check
    } catch (error) {
      logger.error('SR edit save failed:', error);
      toast.error('Failed to save score override');
    }
  };

  const finalizePanelScore = async () => {
    if (!canFinalSubmit) return;
    if (panelMismatch.hasBlockingMismatch) {
      toast.error('Resolve Difficulty and Combination mismatches before final submit');
      return;
    }
    setFinalizing(true);
    try {
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
      await judgeAPI.saveScore(payload);
      try {
        const sKey = `judge_submitted_players_${selectedTeam._id}`;
        const prev = JSON.parse(sessionStorage.getItem(sKey) || '{}');
        prev[playerIdOf(selectedPlayer)] = true;
        sessionStorage.setItem(sKey, JSON.stringify(prev));
      } catch {
        // best-effort cache of "already scored" markers
      }
      if (socket?.connected) {
        socket.emit('scores_saved', {
          roomId: `scoring_${judgeInfo.gender}_${judgeInfo.ageGroup}_${selectedCompetitionType}`,
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
      <Orb x={5} y={10} size={400} color={J.purple} delay={0} duration={8} blur={120} />
      <Orb x={95} y={60} size={300} color={COLORS.saffron} delay={3} duration={10} blur={100} />
      <Orb x={50} y={95} size={250} color={J.purpleDark} delay={1.5} duration={7} blur={90} />

      {/*  Header  */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', borderColor: 'rgba(168,85,247,0.15)' }}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-2.5 sm:h-14 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button onClick={() => { if (!finalized) goBackToScoring(); else goBackToTeam(); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                aria-label={finalized ? 'Back to team' : 'Back to scoring'}>
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

          {/* Reviewing-for banner */}
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
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
                    (isSeniorJudge ? panelMismatch.difficultyMismatch : panelMismatch.judgeMismatchDetails?.[judgeInfo?.judgeType]?.difficulty) && 'Difficulty',
                    (isSeniorJudge ? panelMismatch.combinationMismatch : panelMismatch.judgeMismatchDetails?.[judgeInfo?.judgeType]?.combination) && 'Combination',
                    panelMismatch.toleranceMismatch && 'Tolerance',
                  ].filter(Boolean).join(' · ')} mismatch detected
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>View Details</span>
            </motion.button>
          )}

          {/* Detailed per-judge slips — SR judge sees all cards, others only their own */}
          {!isSeniorJudge && !orderedPanelEntries.some(([jt]) => jt === judgeInfo?.judgeType) && panelScoresCount > 0 && (
            <div className="rounded-xl border p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>You haven&apos;t submitted yet — other judges&apos; scores are visible only to the Senior Judge.</p>
            </div>
          )}
          {!isSeniorJudge && orderedPanelEntries.some(([jt]) => jt === judgeInfo?.judgeType) && panelScoresCount > 1 && (
            <div className="rounded-xl border p-3 flex items-center gap-2" style={{ background: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.15)' }}>
              <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(192,132,252,0.6)' }} />
              <p className="text-xs" style={{ color: 'rgba(192,132,252,0.6)' }}>
                {panelScoresCount - 1} other judge{panelScoresCount - 1 > 1 ? 's have' : ' has'} submitted. Scores are visible to the Senior Judge only.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {(isSeniorJudge ? orderedPanelEntries : orderedPanelEntries.filter(([jt]) => jt === judgeInfo?.judgeType)).map(([judge, data]) => {
              const b = normalizeBreakdown(data.breakdown, data.score);
              const isYou = judge === judgeInfo?.judgeType;
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
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{judgeName}</p>
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

          {/* No panel average is shown here — the aggregate is deliberately
              withheld from the panel until Final Submit. */}

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
        myJudgeType={judgeInfo?.judgeType}
        effectivePanelSize={effectivePanelSize}
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
