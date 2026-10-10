/**
 * Shared judge scoring UI
 *
 * Atoms, modals and helpers used by BOTH the scoring page (JudgeScoring) and
 * the panel review page (JudgePanelReview). Extracted so the two routes can be
 * separate files without duplicating this markup.
 */
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, CheckCircle, LogOut, Save, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { FG, alpha } from '@/styles/tokens';
import {
  panelScoresShape,
  editTargetShape,
  combinationChecklistShape,
  pointCeilingsShape,
} from '@/utils/scoring/scoringPropTypes';
import { PANEL_TYPES } from '@/utils/scoring/judgePanel';
import { roundExecution } from '@/utils/scoring/copRules';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';

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
 * localStorage key for a judge's unsubmitted slip marks. Shared by the slip,
 * which autosaves under it, and Panel Review, which clears it before the judge
 * goes back to edit — so the edit opens on the SUBMITTED slip, not on the
 * leftovers of an edit that was abandoned earlier.
 */
export const scoringCacheKey = (team, player, judgeInfo) => (
  team && player
    ? `judge_scores_${team._id}_${playerIdOf(player)}_${judgeInfo?.judgeType || 'unknown'}`
    : null
);

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

/*
 * The judge screens' colours, as tokens (design-language PLAN W4): the names
 * stay so the screens read the same, the values follow the look pack. The
 * "purple" was the judge role accent; it is the accent now, whatever the role
 * colour of the look.
 */
export const J = {
  purple: 'rgb(var(--accent))',
  purpleLight: 'rgb(var(--accent-fg))',
  purpleDark: 'rgb(var(--accent))',
  green: 'rgb(var(--success-fg))',
  greenDark: 'rgb(var(--success-fg))',
  amber: 'rgb(var(--warning-fg))',
};

export const EASE_OUT = [0.25, 0.46, 0.45, 0.94];

// ─── Difficulty Picker ────────────────────────────────────────────────────────
//
// One element class (A 0.20, B 0.40, C 0.60): a 1–10 grid to set the count in
// a single tap, and a vertical − / count / + stepper beside it for anything
// the grid does not cover (0, or more than 10). Tapping the number already
// chosen keeps it — it used to clear back to 0, and a second tap (or a
// double-tap on a phone) wiped the count the judge had just picked. Clearing
// is the − stepper's job.
//
// Accessible names are kept stable for the e2e flows: the stepper buttons are
// "Increase A - Class - 0.20" / "Decrease …" (Web/e2e/support/scoring-flows.js)
// and each number is "A - Class - 0.20: 4".

const PICKER_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const DifficultyPicker = ({ cls, value, count, onChange, compact = false }) => {
  const name = `${cls} - Class - ${value.toFixed(2)}`;
  const n = Number(count) || 0;
  // Compact (the Senior Judge's edit dialog) only with a mouse. On touch it is the slip's own size: at h-9 the
  // count between − and + shrank to ~20px, the two 15px tap extensions overlapped there, and a tap just below
  // − landed on + (drawn later, so on top).
  const cell = compact ? 'h-11 text-base mouse:h-9 mouse:text-sm' : 'h-11 text-base';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="type-tag text-fg-secondary">
          {cls} - {value.toFixed(2)}
        </span>
        <span className="text-xs tabular-nums text-fg-muted">
          {n} × {value.toFixed(2)} = {(n * value).toFixed(2)}
        </span>
      </div>
      <div className="flex items-stretch gap-2 sm:gap-3">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 flex-1 min-w-0" role="group" aria-label={`${name} count`}>
          {PICKER_NUMBERS.map((num) => {
            const selected = n === num;
            return (
              <button
                key={num}
                type="button"
                aria-label={`${name}: ${num}`}
                aria-pressed={selected}
                onClick={() => { if (!selected) onChange(num); }}
                className={`${cell} rounded-xl border font-black tabular-nums select-none transition-[background-color,border-color,color,transform] duration-150 active:scale-95`}
                style={{
                  background: selected ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.03)',
                  borderColor: selected ? J.purple : 'rgb(var(--ink) / 0.12)',
                  color: selected ? 'rgb(var(--on-accent))' : 'var(--fg)',
                  boxShadow: selected ? `0 0 0 3px ${alpha(J.purple, 0x25)}` : 'none',
                  touchAction: 'manipulation',
                }}
              >
                {num}
              </button>
            );
          })}
        </div>

        {/* − on top, the count, + below — as drawn */}
        <div className={`${compact ? 'w-14 mouse:w-12' : 'w-14'} flex-shrink-0 flex flex-col rounded-xl border overflow-hidden`}
          style={{ borderColor: 'rgb(var(--ink) / 0.12)', background: 'rgb(var(--ink) / 0.04)' }}>
          <button type="button" aria-label={`Decrease ${name}`} disabled={n <= 0}
            onClick={() => onChange(Math.max(0, n - 1))}
            className="relative flex-1 flex items-center justify-center text-lg font-black select-none disabled:cursor-not-allowed active:bg-ink/10 before:content-[''] before:absolute before:inset-x-0 before:top-0 before:-bottom-[16px]"
            style={{ color: n <= 0 ? 'rgb(var(--ink) / 0.15)' : 'rgb(var(--accent-fg))', borderBottom: '1px solid rgb(var(--ink) / 0.08)', touchAction: 'manipulation' }}>
            −
          </button>
          <span className="flex items-center justify-center py-1 text-xl font-black tabular-nums text-ink select-none">
            {n}
          </span>
          <button type="button" aria-label={`Increase ${name}`}
            onClick={() => onChange(n + 1)}
            className="relative flex-1 flex items-center justify-center text-lg font-black select-none active:bg-ink/10 before:content-[''] before:absolute before:inset-x-0 before:bottom-0 before:-top-[16px]"
            style={{ color: 'rgb(var(--accent-fg))', borderTop: '1px solid rgb(var(--ink) / 0.08)', touchAction: 'manipulation' }}>
            +
          </button>
        </div>
      </div>
    </div>
  );
};

DifficultyPicker.propTypes = {
  cls: PropTypes.oneOf(['A', 'B', 'C']).isRequired,
  value: PropTypes.number.isRequired,
  count: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  compact: PropTypes.bool,
};

/** The three classes, in the order drawn: [stateKey, class letter, value]. */
export const DIFFICULTY_CLASSES = Object.freeze([
  ['aClass', 'A', 0.20],
  ['bClass', 'B', 0.40],
  ['cClass', 'C', 0.60],
]);

// ─── Decimal Input ────────────────────────────────────────────────────────────
//
// A mark field that never shows a leading "0". A `type="number"` input bound
// to a numeric 0 renders "0", and typing 3 then reads "03" — React will not
// rewrite it because "03" equals 3. So the field keeps the text the judge is
// typing, strips leading zeros ("03" → "3", "0.5" stays), shows the
// placeholder instead of a literal 0, and reports the parsed number upward.
// The parent may round or clamp it; when that changes the number, the text
// is re-synced to what the parent kept.
const toDraft = (v) => (Number(v) ? String(Number(v)) : '');

export const DecimalInput = ({ value, onValueChange, onBlur, placeholder = '0.00', ...rest }) => {
  const [draft, setDraft] = useState(() => toDraft(value));

  useEffect(() => {
    setDraft((d) => (Math.abs((parseFloat(d) || 0) - (Number(value) || 0)) < 1e-9 ? d : toDraft(value)));
  }, [value]);

  const handleChange = (e) => {
    const text = e.target.value.replace(/,/g, '.');
    if (!/^\d*\.?\d*$/.test(text)) return;
    const cleaned = text.replace(/^0+(?=\d)/, '');
    setDraft(cleaned);
    onValueChange(parseFloat(cleaned) || 0);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      onChange={handleChange}
      // Rounding can leave the number unchanged ("3.02" → 3.00), in which case
      // the effect above never fires — snap the text to the kept value here.
      onBlur={(e) => { setDraft(toDraft(value)); onBlur?.(e); }}
      placeholder={placeholder}
      {...rest}
    />
  );
};

DecimalInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  onValueChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func,
  placeholder: PropTypes.string,
};

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
  // Highlighted as "off", per section: a judge is red under Difficulty only
  // when THEIR difficulty differs from the chief's, and under Combination only
  // when their combination does. SR 2.40 / J1 2.40 / J2 3.20 → only J2 is red.
  // A judge who only sits outside tolerance recorded the same routine and does
  // not belong in this dialog — they are named in the tolerance one.
  const isOff = (jt, section) => !!panelMismatch.judgeMismatchDetails?.[jt]?.[section];
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
      <span className="text-xs px-2 py-1 rounded-lg bg-success-tint text-success-fg">
        SR (reference) {label}: {seniorValue}
      </span>
      <span className="text-xs px-2 py-1 rounded-lg"
        style={{ background: 'rgba(239,68,68,0.15)', color: FG.danger }}>
        You {label}: {myValue}
      </span>
    </div>
  );
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay z-[9998]" style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
            <BodyScrollLock />
          <div className="w-full max-w-lg rounded-2xl border overflow-hidden modal-panel" style={{ background: 'rgb(var(--surface))', borderColor: 'rgba(239,68,68,0.4)' }} onClick={e => e.stopPropagation()}>
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
                  <AlertTriangle className="w-5 h-5 text-danger-fg"/>
                </div>
                <div>
                  <p className="text-ink font-black text-base">Score Mismatch Detected</p>
                  <p className="text-xs mt-0.5 text-fg-muted">
                    {isSeniorJudge ? 'Panel review required (Senior Judge)' : 'Your score may need correction'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 tap-safe rounded-lg flex items-center justify-center hover:bg-ink/5 transition-colors text-fg-muted"
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
                  <p className="text-sm font-bold text-ink mb-1">⛔ Combination Mismatch</p>
                  <p className="text-xs text-fg-muted">
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
                          style={isOff(jt, 'combination')
                            ? { background: 'rgba(239,68,68,0.15)', color: FG.danger }
                            : { background: 'rgb(var(--ink) / 0.06)', color: 'rgb(var(--ink) / 0.7)' }}
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
                  <p className="text-sm font-bold text-ink mb-1">⛔ Difficulty Mismatch</p>
                  <p className="text-xs text-fg-muted">
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
                          style={isOff(jt, 'difficulty')
                            ? { background: 'rgba(239,68,68,0.15)', color: FG.danger }
                            : { background: 'rgb(var(--ink) / 0.06)', color: 'rgb(var(--ink) / 0.7)' }}
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
                  style={{ background: 'rgb(var(--ink) / 0.03)', borderColor: 'rgb(var(--ink) / 0.08)', color: 'var(--fg-muted)' }}
                >
                  The Senior Judge&apos;s slip is the reference. Re-check your marks against it, or contact the Senior Judge to resolve this before final submission.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-line">
              <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm text-ink" style={{ background: 'rgb(var(--accent))' }}>
                {/* The Senior Judge resolves a mismatch by calling the off judges
                    over; everyone else just acknowledges it. */}
                {isSeniorJudge ? 'Understood — Call Judges' : 'Understood — Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── Tolerance Modal ──────────────────────────────────────────────────────────
//
// COP §3.4: the execution average and the Senior Judge's mark must agree to
// within the tolerance for that score band. When they do not, this dialog says
// so (see JudgePanelReview.finalizePanelScore).
//
// Deliberately shaped like MismatchModal so the two read as the same kind of
// alert, and coloured amber rather than red so a judge can tell which one they
// are looking at without reading the heading.
//
// The Senior Judge may also close the panel as it stands: COP §3.4 scores a
// breach on the base score, (execution average + Senior) ÷ 2. Once they tap
// Understood, Panel Review's button reads "Final Submit with Base Score".
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
        <div className="modal-overlay z-[9998]" style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
            <BodyScrollLock />
          <div className="w-full max-w-lg rounded-2xl border overflow-hidden modal-panel" style={{ background: 'rgb(var(--surface))', borderColor: 'rgba(245,158,11,0.45)' }} onClick={e => e.stopPropagation()}>
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
                  <AlertTriangle className="w-5 h-5 text-warning-fg"/>
                </div>
                <div>
                  <p className="text-ink font-black text-base">Tolerance Limit Exceeded</p>
                  <p className="text-xs mt-0.5 text-fg-muted">
                    {isSeniorJudge ? 'Panel review required (Senior Judge)' : 'Your execution mark may need correction'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 tap-safe rounded-lg flex items-center justify-center hover:bg-ink/5 transition-colors text-fg-muted"
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
                <p className="text-sm font-bold mb-1 text-warning-fg">⚠️ Execution average is outside tolerance</p>
                <p className="text-xs text-fg-muted">
                  |Exec avg {num(info.executionAvg)} − Senior {num(info.seniorScore)}| = {num(info.difference)},
                  {' '}which exceeds the ±{num(info.tolerance)} allowed at this score (COP §3.4).
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 rounded-lg bg-success-tint text-success-fg">
                    SR (reference): {num(info.seniorScore)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.18)', color: FG.warning }}>
                    Execution average: {num(info.executionAvg)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgb(var(--ink) / 0.06)', color: 'rgb(var(--ink) / 0.7)' }}>
                    Allowed gap: ±{num(info.tolerance)}
                  </span>
                </div>
              </div>

              {/* Who is off the chief's mark. Senior-only, like every other
                  cross-panel figure on this screen. */}
              {isSeniorJudge && orderedEntries.length > 0 && (
                <div
                  className="rounded-xl border p-4"
                  style={{ background: 'rgb(var(--ink) / 0.02)', borderColor: 'rgb(var(--ink) / 0.08)' }}
                >
                  <p className="type-tag mb-2 text-fg-muted">
                    Panel totals
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {orderedEntries.map(([jt, data]) => (
                      <span
                        key={jt}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={offJudges.includes(jt)
                          ? { background: 'rgba(245,158,11,0.18)', color: FG.warning }
                          : { background: 'rgb(var(--ink) / 0.06)', color: 'rgb(var(--ink) / 0.7)' }}
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
                  <p className="text-xs text-fg-muted">
                    Your total ({Number(myScore).toFixed(2)}) may be contributing to this gap.
                    Re-check your execution mark against the routine you saw.
                  </p>
                </div>
              )}

              <div
                className="rounded-xl border p-3 text-xs"
                style={{ background: 'rgb(var(--ink) / 0.03)', borderColor: 'rgb(var(--ink) / 0.08)', color: 'var(--fg-muted)' }}
              >
                {isSeniorJudge
                  ? `Adjust a judge's slip with the pencil on their card, or have them resubmit. Or close the panel as it stands: COP §3.4 scores it on the base score ${num(info.baseScore)} — (execution average ${num(info.executionAvg)} + Senior ${num(info.seniorScore)}) ÷ 2. After Understood, the button below reads "Final Submit with Base Score".`
                  : `The Senior Judge will resolve this or final submit on the base score. Re-check your marks, or contact the Senior Judge.`}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-line">
              <button type="button" onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm text-ink" style={{ background: 'rgb(var(--warning-fill))' }}>
                Understood — Dismiss
              </button>
            </div>
          </div>
        </div>
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
        <div className="modal-overlay z-[9997]" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }} onClick={onClose}>
            <BodyScrollLock />
          <div className="w-full max-w-xl rounded-2xl border overflow-hidden modal-panel" style={{ background: 'rgb(var(--surface))', borderColor: 'rgb(var(--accent) / 0.4)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
              style={{ background: 'rgb(var(--accent) / 0.10)', borderColor: 'rgb(var(--accent) / 0.2)' }}
            >
              <div>
                <p className="text-ink font-black text-base">Edit Score — {editTarget.judgeType}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(192,132,252,0.7)' }}>Senior Judge override</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-fg-muted">Total</p>
                  <p className="text-2xl font-black text-fg-secondary">{calcTotal()}</p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 tap-safe rounded-lg flex items-center justify-center hover:bg-ink/5 text-fg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-3 sm:p-5 space-y-4">
              {/* Difficulty */}
              <div className="rounded-xl border p-3 sm:p-4 space-y-3 bg-surface-sunken border-line">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-ink text-sm">Difficulty</h4>
                  <span className="text-lg font-black text-warning-fg">{editScores.difficulty.total.toFixed(2)} / 3.80</span>
                </div>
                {DIFFICULTY_CLASSES.map(([key, cls, value]) => (
                  <DifficultyPicker key={key} cls={cls} value={value} count={editScores.difficulty[key]}
                    onChange={(v) => handleDiff(key, v)} compact />
                ))}
              </div>

              {/* Combination */}
              <div className="rounded-xl border p-4 space-y-2 bg-surface-sunken border-line">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-ink text-sm">Combination</h4>
                  <span className="text-lg font-black text-fg-secondary">{editScores.combination.total.toFixed(2)} / 1.60</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {combinationChecklist.map(item => {
                    const checked = editScores.combination.checked[item.id];
                    return (
                      <label key={item.id}
                        className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer"
                        style={{ background: checked ? 'rgba(34,197,94,0.08)' : 'rgb(var(--ink) / 0.03)', borderColor: checked ? 'rgba(34,197,94,0.3)' : 'rgb(var(--ink) / 0.07)' }}
                      >
                        <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: checked ? '#22C55E' : 'rgb(var(--ink) / 0.2)', background: checked ? '#22C55E' : 'transparent' }}>
                          {checked && <CheckCircle className="w-3 h-3 text-ink" />}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => handleComb(item.id)} className="sr-only" />
                        <span className="text-xs" style={{ color: checked ? FG.ink : 'rgb(var(--ink) / 0.5)' }}>{item.rule}</span>
                        {!checked && <span className="ml-auto text-xs font-bold text-fg-muted">{item.penalty.toFixed(2)}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Execution */}
              <div className="rounded-xl border p-4 bg-surface-sunken border-line">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-ink text-sm">Execution</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-raised text-fg">Max 4.40</span>
                </div>
                <DecimalInput
                  value={editScores.execution}
                  onValueChange={raw => setEditScores({ ...editScores, execution: roundExecution(raw) })}
                  aria-label="Execution"
                  className="w-full px-4 py-3 rounded-xl border text-2xl font-black text-center text-ink"
                  style={{ background: 'rgb(var(--ink) / 0.04)', borderColor: 'rgb(var(--ink) / 0.08)' }}
                />
              </div>

              {/* Originality */}
              <div className="rounded-xl border p-4 bg-surface-sunken border-line">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-ink text-sm">Originality</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-raised text-fg">0.20</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['None', 0], ['+0.20', 0.20]].map(([label, val]) => {
                    const active = Math.abs((editScores.bonus || 0) - val) < 1e-6;
                    return (
                      <button key={label} type="button"
                        onClick={() => setEditScores({ ...editScores, bonus: val })}
                        aria-pressed={active}
                        className="py-3 rounded-xl border font-bold text-sm transition-all duration-200"
                        style={{ background: active ? 'rgb(var(--accent) / 0.15)' : 'rgb(var(--ink) / 0.03)', borderColor: active ? 'rgb(var(--accent))' : 'rgb(var(--ink) / 0.08)', color: active ? FG.ink : 'rgb(var(--ink) / 0.5)' }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t flex gap-3 flex-shrink-0 border-line">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all hover:bg-ink/5"
                style={{ borderColor: 'rgb(var(--ink) / 0.1)', color: 'var(--fg-muted)' }}
              >Cancel</button>
              <button onClick={() => onSave(editTarget.judgeType, editScores, calcTotal())} className="flex-1 py-3 rounded-xl font-bold text-sm text-ink flex items-center justify-center gap-2" style={{ background: 'rgb(var(--success-fill))' }}>
                <Save className="w-4 h-4" /> Save Override
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};



/** Working screens carry no ambient decoration (plan §5.7): kept as a no-op so callers need not change. */
export const JudgeAmbience = () => null;

/** The live connection, as text with a status colour (never colour alone). */
export const LiveDot = ({ connected, compact = false }) => (
  <span className={`ui-tag ui-status type-tag ${connected ? 'ui-status--success' : 'ui-status--danger'} ${connected ? 'live-dot--on' : ''}`}
    aria-label={compact ? (connected ? 'Live' : 'Offline') : undefined}>
    {!compact && (connected ? 'Live' : 'Offline')}
  </span>
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
/**
 * Log out, as every judge header draws it: icon-only for the phone header, labelled ("Logout" from sm up)
 * elsewhere. Six hand copies before this; the labelled one in the slip and panel review was 36px on a touch
 * screen from 640 to 1023 — tap-safe now, like the rest.
 */
export const JudgeLogoutButton = ({ onLogout, compact = false }) => (
  <button onClick={onLogout} type="button"
    className={compact ? 'ui-btn ui-btn--line ui-icon-btn' : 'ui-btn ui-btn--line ui-btn--sm'}
    aria-label="Logout">
    <span className="ui-btn__label" style={{ display: 'contents' }}>
      <LogOut aria-hidden="true" />
      {!compact && <span className="hidden sm:inline">Logout</span>}
    </span>
  </button>
);

JudgeLogoutButton.propTypes = { onLogout: PropTypes.func.isRequired, compact: PropTypes.bool };
