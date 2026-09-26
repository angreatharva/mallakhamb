/**
 * Shared judge scoring UI
 *
 * Atoms, modals and helpers used by BOTH the scoring page (JudgeScoring) and
 * the panel review page (JudgePanelReview). Extracted so the two routes can be
 * separate files without duplicating this markup.
 */
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, CheckCircle, Save, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '@/styles/tokens';
import { AmbientOrbs } from '@/components/design-system/backgrounds';
import {
  panelScoresShape,
  editTargetShape,
  combinationChecklistShape,
  pointCeilingsShape,
} from '@/utils/scoring/scoringPropTypes';
import { PANEL_TYPES } from '@/utils/scoring/judgePanel';

export const SCORING_PATH = '/judge/scoring';
export const PANEL_REVIEW_PATH = '/judge/scoring/panel-review';

/**
 * Panel judge slots, in display order.
 *
 * Re-exported rather than declared: the list now also decides which rows
 * `utils/scoring/judgePanel.js` folds into a panel, and a second copy here
 * would let the display order and the panel SIZE disagree about what a seat is.
 */
export { PANEL_TYPES };

/** sessionStorage key holding the active scoring session across refreshes. */
export const ACTIVE_SESSION_KEY = 'judge_scoring_active_session';

/** Players arrive from several endpoints with inconsistent id fields. */
export const playerIdOf = (player) => player?.id || player?._id;

/**
 * Coerce a stored/emitted breakdown into the shape the UI renders, filling in
 * zeros for anything missing.
 */
export const normalizeBreakdown = (breakdown, fallbackScore) => {
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
  // false when only the section totals are known (see slipToBreakdown)
  const detailed = breakdown.detailed !== false;
  return { difficulty, combination, execution, bonus, detailed, _score: fallbackScore };
};

export const J = {
  purple: '#A855F7',
  purpleLight: '#C084FC',
  purpleDark: '#7C3AED',
  green: '#22C55E',
  greenDark: '#16A34A',
  amber: '#F59E0B',
};

export const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

// ─── Mismatch Modal ───────────────────────────────────────────────────────────
//
// Difficulty and Combination only. A tolerance breach is a different failure —
// the panel agrees on the routine and disagrees on how well it was done — and
// gets its own dialog below, so a judge is never shown one alert that mixes
// "you recorded a different element mix" with "your execution mark is an
// outlier".
export const MismatchModal = ({ isOpen, onClose, panelMismatch, panelScores, isSeniorJudge, myJudgeType, judgeNameMap }) => {
  if (!isOpen) return null;
  const red = '#EF4444';
  // Always list judges as Senior Judge, Judge 1, Judge 2, … regardless of the
  // order their slips happened to arrive in.
  const orderedEntries = PANEL_TYPES
    .filter((jt) => panelScores?.[jt])
    .map((jt) => [jt, panelScores[jt]]);
  // Highlighted as "off": the judges whose SLIP differs from the chief's. A
  // judge who only sits outside tolerance recorded the same routine and does
  // not belong in this dialog — they are named in the tolerance one.
  const offJudges = panelMismatch.disagreeingJudges || [];
  const seniorEntry = panelScores?.['Senior Judge'];
  const myEntry = myJudgeType ? panelScores?.[myJudgeType] : null;
  const myMismatch = myJudgeType ? panelMismatch.judgeMismatchDetails?.[myJudgeType] : null;
  // Senior Judge sees every category any judge disagrees on (their job is to
  // resolve the whole panel); a non-Senior judge only sees the category(ies)
  // their own slip actually diverges from the Senior's.
  const showCombinationMismatch = isSeniorJudge ? panelMismatch.combinationMismatch : !!myMismatch?.combination;
  const showDifficultyMismatch = isSeniorJudge ? panelMismatch.difficultyMismatch : !!myMismatch?.difficulty;

  // Non-senior judges are shown the Senior Judge's reference value against
  // their own — never the rest of the panel, which stays Senior-only.
  const ReferenceRow = ({ label, seniorValue, myValue }) => (
    <div className="mt-2 flex flex-wrap gap-2">
      <span className="text-xs px-2 py-1 rounded-lg"
        style={{ background: 'rgba(34,197,94,0.15)', color: J.green }}>
        SR (reference) {label}: {seniorValue}
      </span>
      <span className="text-xs px-2 py-1 rounded-lg"
        style={{ background: 'rgba(239,68,68,0.15)', color: red }}>
        You {label}: {myValue}
      </span>
    </div>
  );
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay z-[9998]"
          style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl border overflow-hidden modal-panel"
            style={{ background: '#0E0E0E', borderColor: 'rgba(239,68,68,0.4)' }}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  <AlertTriangle className="w-5 h-5" style={{ color: red }} />
                </div>
                <div>
                  <p className="text-white font-black text-base">Score Mismatch Detected</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {isSeniorJudge ? 'Panel review required (Senior Judge)' : 'Your score may need correction'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
              {showCombinationMismatch && (
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.25)' }}
                >
                  <p className="text-sm font-bold text-white mb-1">⛔ Combination Mismatch</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {panelMismatch.combinationSelectionMismatch
                      ? 'Checklist selections differ between judges. The exact items checked must match across all judges.'
                      : `Totals: ${panelMismatch.combinationValues.map(v => Number(v).toFixed(2)).join(', ')}`}
                  </p>
                  {!isSeniorJudge && seniorEntry && myEntry && (
                    <ReferenceRow
                      label="total"
                      seniorValue={Number(seniorEntry.breakdown?.combination?.total ?? 0).toFixed(2)}
                      myValue={Number(myEntry.breakdown?.combination?.total ?? 0).toFixed(2)}
                    />
                  )}
                  {isSeniorJudge && panelMismatch.combinationValues.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {orderedEntries.map(([jt, data]) => (
                        <span
                          key={jt}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={offJudges.includes(jt)
                            ? { background: 'rgba(239,68,68,0.15)', color: red }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
                        >
                          {jt === 'Senior Judge' ? 'SR' : jt.replace('Judge ', 'J')}
                          {judgeNameMap?.[jt] ? ` · ${judgeNameMap[jt]}` : ''}: {Number(data.breakdown?.combination?.total ?? 0).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showDifficultyMismatch && (
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.25)' }}
                >
                  <p className="text-sm font-bold text-white mb-1">⛔ Difficulty Mismatch</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {`Totals: ${panelMismatch.difficultyValues.map(v => Number(v).toFixed(2)).join(', ')}`}
                  </p>
                  {!isSeniorJudge && seniorEntry && myEntry && (
                    <ReferenceRow
                      label="total"
                      seniorValue={Number(seniorEntry.breakdown?.difficulty?.total ?? 0).toFixed(2)}
                      myValue={Number(myEntry.breakdown?.difficulty?.total ?? 0).toFixed(2)}
                    />
                  )}
                  {isSeniorJudge && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {orderedEntries.map(([jt, data]) => (
                        <span
                          key={jt}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={offJudges.includes(jt)
                            ? { background: 'rgba(239,68,68,0.15)', color: red }
                            : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
                        >
                          {jt === 'Senior Judge' ? 'SR' : jt.replace('Judge ', 'J')}
                          {judgeNameMap?.[jt] ? ` · ${judgeNameMap[jt]}` : ''}:{' '}
                          {Number(data.breakdown?.difficulty?.total ?? 0).toFixed(2)}
                          {data.breakdown?.detailed !== false &&
                            ` (A${data.breakdown?.difficulty?.aClass ?? 0}/B${data.breakdown?.difficulty?.bClass ?? 0}/C${data.breakdown?.difficulty?.cClass ?? 0})`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isSeniorJudge && (
                <div
                  className="rounded-xl border p-3 text-xs"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}
                >
                  The Senior Judge&apos;s slip is the reference. Re-check your marks against it, or contact the Senior Judge to resolve this before final submission.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <motion.button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #A855F7, #7C3AED)' }}
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.97 }}
              >
                Understood — Dismiss
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Tolerance Modal ──────────────────────────────────────────────────────────
//
// COP §3.4: the execution average and the Senior Judge's mark must agree to
// within the tolerance for that score band. When they do not, the panel is not
// finished — this dialog says so, and Final Submit stays locked until the gap
// closes (see JudgePanelReview.finalizePanelScore).
//
// Deliberately shaped like MismatchModal so the two read as the same kind of
// alert, and coloured amber rather than red so a judge can tell which one they
// are looking at without reading the heading.
export const ToleranceModal = ({ isOpen, onClose, panelMismatch, panelScores, isSeniorJudge, myJudgeType, judgeNameMap }) => {
  if (!isOpen) return null;
  const amber = '#F59E0B';
  const info = panelMismatch?.toleranceInfo || {};
  const num = (v) => Number(v ?? 0).toFixed(2);
  const orderedEntries = PANEL_TYPES
    .filter((jt) => panelScores?.[jt])
    .map((jt) => [jt, panelScores[jt]]);
  // The judges whose own total differs from the Senior Judge's — the marks
  // that could be moving the execution average away from the chief's.
  const offJudges = panelMismatch?.toleranceOffJudges || [];
  const myScore = myJudgeType ? panelScores?.[myJudgeType]?.score : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay z-[9998]"
          style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl border overflow-hidden modal-panel"
            style={{ background: '#0E0E0E', borderColor: 'rgba(245,158,11,0.45)' }}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)' }}
                >
                  <AlertTriangle className="w-5 h-5" style={{ color: amber }} />
                </div>
                <div>
                  <p className="text-white font-black text-base">Tolerance Limit Exceeded</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {isSeniorJudge ? 'Panel review required (Senior Judge)' : 'Your execution mark may need correction'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
              <div
                className="rounded-xl border p-4"
                style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.3)' }}
              >
                <p className="text-sm font-bold mb-1" style={{ color: amber }}>⚠️ Execution average is outside tolerance</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  |Exec avg {num(info.executionAvg)} − Senior {num(info.seniorScore)}| = {num(info.difference)},
                  {' '}which exceeds the ±{num(info.tolerance)} allowed at this score (COP §3.4).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(34,197,94,0.15)', color: J.green }}>
                    SR (reference): {num(info.seniorScore)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.18)', color: amber }}>
                    Execution average: {num(info.executionAvg)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
                    Allowed gap: ±{num(info.tolerance)}
                  </span>
                </div>
              </div>

              {/* Who is off the chief's mark. Senior-only, like every other
                  cross-panel figure on this screen. */}
              {isSeniorJudge && orderedEntries.length > 0 && (
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Panel totals
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {orderedEntries.map(([jt, data]) => (
                      <span
                        key={jt}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={offJudges.includes(jt)
                          ? { background: 'rgba(245,158,11,0.18)', color: amber }
                          : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}
                      >
                        {jt === 'Senior Judge' ? 'SR' : jt.replace('Judge ', 'J')}
                        {judgeNameMap?.[jt] ? ` · ${judgeNameMap[jt]}` : ''}: {Number(data.score).toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!isSeniorJudge && myJudgeType !== 'Senior Judge' && myScore != null && (
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.25)' }}
                >
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Your total ({Number(myScore).toFixed(2)}) may be contributing to this gap.
                    Re-check your execution mark against the routine you saw.
                  </p>
                </div>
              )}

              <div
                className="rounded-xl border p-3 text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}
              >
                {isSeniorJudge
                  ? `Final Submit stays locked until the gap is within tolerance. Adjust a judge's slip with the pencil on their card, or have them resubmit. Left unresolved, COP §3.4 would score this on the base score ${num(info.baseScore)} — (execution average + Senior) ÷ 2.`
                  : `Final Submit is locked for the Senior Judge until this is resolved. Re-check your marks, or contact the Senior Judge.`}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <motion.button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.97 }}
              >
                Understood — Dismiss
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── SR Judge Edit Modal ───────────────────────────────────────────────────────

export const SrEditModal = ({ isOpen, onClose, onSave, editTarget, combinationChecklist, selectedApparatus, POINT_CEILINGS, resolveDifficultyValue, getDifficultyRequirement, computeCombinationTotal, selectedCompetitionType }) => {
  const [editScores, setEditScores] = useState(null);

  useEffect(() => {
    if (isOpen && editTarget) {
      const b = editTarget.breakdown || {};
      setEditScores({
        difficulty: {
          aClass: b.difficulty?.aClass ?? 0,
          bClass: b.difficulty?.bClass ?? 0,
          cClass: b.difficulty?.cClass ?? 0,
          total: b.difficulty?.total ?? 0,
        },
        combination: {
          checked: { ...(combinationChecklist.reduce((acc, item) => ({ ...acc, [item.id]: false }), {})), ...(b.combination?.checked || {}) },
          total: b.combination?.total ?? 0,
        },
        execution: b.execution ?? 0,
        bonus: b.bonus ?? 0,
      });
    }
  }, [isOpen, editTarget]);

  if (!isOpen || !editTarget || !editScores) return null;

  const req = getDifficultyRequirement(selectedCompetitionType);

  const handleDiff = (cls, val) => {
    const n = parseInt(val) || 0;
    const d = { ...editScores.difficulty, [cls]: n };
    const resolved = resolveDifficultyValue({ A: d.aClass, B: d.bClass, C: d.cClass }, req);
    d.total = Math.min(resolved.total, POINT_CEILINGS.difficulty);
    setEditScores({ ...editScores, difficulty: d });
  };

  const handleComb = (itemId) => {
    const checked = { ...editScores.combination.checked, [itemId]: !editScores.combination.checked[itemId] };
    const total = computeCombinationTotal(selectedApparatus, checked);
    setEditScores({ ...editScores, combination: { checked, total } });
  };

  const calcTotal = () => (
    editScores.difficulty.total + editScores.combination.total +
    parseFloat(editScores.execution || 0) + parseFloat(editScores.bonus || 0)
  ).toFixed(2);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay z-[9997]"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-xl rounded-2xl border overflow-hidden modal-panel"
            style={{ background: '#0D0D0D', borderColor: 'rgba(168,85,247,0.4)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
              style={{ background: 'rgba(168,85,247,0.10)', borderColor: 'rgba(168,85,247,0.2)' }}
            >
              <div>
                <p className="text-white font-black text-base">Edit Score — {editTarget.judgeType}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(192,132,252,0.7)' }}>Senior Judge override</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total</p>
                  <p className="text-2xl font-black" style={{ color: '#A855F7' }}>{calcTotal()}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Difficulty */}
              <div className="rounded-xl border p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">Difficulty</h4>
                  <span className="text-lg font-black" style={{ color: '#F59E0B' }}>{editScores.difficulty.total.toFixed(2)} / 3.80</span>
                </div>
                {[['aClass', 'A', '0.20'], ['bClass', 'B', '0.40'], ['cClass', 'C', '0.60']].map(([key, lbl]) => (
                  <div key={key} className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase" style={{ color: '#C084FC' }}>{lbl} - Class</label>
                    <div className="flex items-center gap-0 rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
                      <button type="button" onClick={() => handleDiff(key, Math.max(0, editScores.difficulty[key] - 1))}
                        className="flex items-center justify-center text-xl font-black select-none"
                        style={{ width: 36, height: 40, color: '#C084FC', background: 'rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>−</button>
                      <span className="w-10 text-center text-lg font-black text-white">{editScores.difficulty[key]}</span>
                      <button type="button" onClick={() => handleDiff(key, editScores.difficulty[key] + 1)}
                        className="flex items-center justify-center text-xl font-black select-none"
                        style={{ width: 36, height: 40, color: '#C084FC', background: 'rgba(255,255,255,0.04)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Combination */}
              <div className="rounded-xl border p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-sm">Combination</h4>
                  <span className="text-lg font-black" style={{ color: '#A855F7' }}>{editScores.combination.total.toFixed(2)} / 1.60</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {combinationChecklist.map(item => {
                    const checked = editScores.combination.checked[item.id];
                    return (
                      <label key={item.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer"
                        style={{ background: checked ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', borderColor: checked ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.07)' }}
                      >
                        <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: checked ? '#22C55E' : 'rgba(255,255,255,0.2)', background: checked ? '#22C55E' : 'transparent' }}>
                          {checked && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => handleComb(item.id)} className="sr-only" />
                        <span className="text-xs" style={{ color: checked ? '#fff' : 'rgba(255,255,255,0.5)' }}>{item.rule}</span>
                        {!checked && <span className="ml-auto text-xs font-bold" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.penalty.toFixed(2)}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Execution */}
              <div className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-sm">Execution</h4>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC' }}>Max 4.40</span>
                </div>
                <input type="number" step="0.05" min="0" max="4.40"
                  value={editScores.execution}
                  onChange={e => {
                    const raw = parseFloat(e.target.value) || 0;
                    const v = Math.round(raw * 20) / 20;
                    setEditScores({ ...editScores, execution: Math.max(0, Math.min(4.40, v)) });
                  }}
                  className="w-full px-4 py-3 rounded-xl border text-2xl font-black text-center text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
                />
              </div>

              {/* Originality */}
              <div className="rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-white text-sm">Originality</h4>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#C084FC' }}>0.20</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['None', 0], ['+0.20', 0.20]].map(([label, val]) => {
                    const active = Math.abs((editScores.bonus || 0) - val) < 1e-6;
                    return (
                      <button key={label} type="button"
                        onClick={() => setEditScores({ ...editScores, bonus: val })}
                        className="py-3 rounded-xl border font-bold text-sm transition-all duration-200"
                        style={{ background: active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)', borderColor: active ? '#A855F7' : 'rgba(255,255,255,0.08)', color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t flex gap-3 flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
              >Cancel</button>
              <motion.button
                onClick={() => onSave(editTarget.judgeType, editScores, calcTotal())}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}
                whileHover={{ filter: 'brightness(1.1)' }}
                whileTap={{ scale: 0.97 }}
              >
                <Save className="w-4 h-4" /> Save Override
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};



/**
 * The purple wash every judge screen sits on.
 *
 * Was a local `Orb` that each of the five judge pages placed three copies of,
 * unclipped, directly in the page root — the x=95 orb hung past the right edge
 * and dragged the document with it, so every judge screen scrolled sideways at
 * 375px AND at 1440px. `AmbientOrbs` owns the clip and the per-viewport
 * scaling; the three positions below are the ones those pages already used, so
 * the desktop look is unchanged.
 */
export const JudgeAmbience = () => (
  <AmbientOrbs
    orbs={[
      { x: 5, y: 10, size: 400, color: J.purple, delay: 0, duration: 8, blur: 120 },
      { x: 95, y: 60, size: 300, color: COLORS.saffron, delay: 3, duration: 10, blur: 100 },
      { x: 50, y: 95, size: 250, color: J.purpleDark, delay: 1.5, duration: 7, blur: 90 },
    ]}
  />
);

export const LiveDot = ({ connected, compact = false }) => (
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

/* -------------------------------------------------------------------------- */
/* Prop contracts (LOW-W2)                                                    */
/*                                                                            */
/* These components pass nested `breakdown` objects between the slip form,     */
/* Panel Review and the two modals with no contract. Declaring it is worth     */
/* more here than anywhere else in the app: the numbers become a competitor's  */
/* persisted score, and a missing `combination.total` renders as 0.00 rather   */
/* than throwing. The canonical shape is what normalizeBreakdown produces.     */
/* -------------------------------------------------------------------------- */

MismatchModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  panelMismatch: PropTypes.object,
  panelScores: panelScoresShape,
  isSeniorJudge: PropTypes.bool,
  myJudgeType: PropTypes.string,
  judgeNameMap: PropTypes.objectOf(PropTypes.string),
};

ToleranceModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  panelMismatch: PropTypes.object,
  panelScores: panelScoresShape,
  isSeniorJudge: PropTypes.bool,
  myJudgeType: PropTypes.string,
  judgeNameMap: PropTypes.objectOf(PropTypes.string),
};

SrEditModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  editTarget: editTargetShape,
  combinationChecklist: combinationChecklistShape,
  selectedApparatus: PropTypes.string,
  pointCeilings: pointCeilingsShape,
  // Passed in rather than imported so the modal stays presentational.
  POINT_CEILINGS: pointCeilingsShape,
  resolveDifficultyValue: PropTypes.func,
  getDifficultyRequirement: PropTypes.func,
  computeCombinationTotal: PropTypes.func,
  selectedCompetitionType: PropTypes.string,
};

LiveDot.propTypes = {
  connected: PropTypes.bool,
  compact: PropTypes.bool,
};
