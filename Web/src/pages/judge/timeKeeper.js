/**
 * The Time Keeper's stopwatch.
 *
 * Shown in whole seconds only — 59, 60, 61 … 90, 91 — never minutes. The
 * recorded time is the same number the display showed when Stop was pressed
 * (elapsed time rounded DOWN), so the Time Keeper and the Scorer's sheet can
 * never disagree about it.
 *
 * Two audible marks: one beep when the display reaches 60 and two beeps at 90,
 * the point past which the time deduction starts (copRules getTimeDeduction).
 *
 * Elapsed time is measured against the clock, not by counting ticks, so a tab
 * that is throttled or briefly frozen still reads the right time when it wakes.
 *
 * @module pages/judge/timeKeeper
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Audible marks: at `at` seconds, `count` beeps. */
export const BEEP_MARKS = Object.freeze([
  Object.freeze({ at: 60, count: 1 }),
  Object.freeze({ at: 90, count: 2 }),
]);

/** Whole seconds shown for an elapsed time in milliseconds. */
export const wholeSeconds = (elapsedMs) => Math.max(0, Math.floor(elapsedMs / 1000));

/**
 * The marks passed when the display moves from `prev` to `next` seconds —
 * each fires once, even if a throttled tab jumps straight over it.
 *
 * @param {number} prev
 * @param {number} next
 * @returns {Array<{at:number,count:number}>}
 */
export const marksCrossed = (prev, next) =>
  BEEP_MARKS.filter((mark) => prev < mark.at && next >= mark.at);

/**
 * Play `count` short beeps through the Web Audio API — no sound file to load.
 * The AudioContext must have been created or resumed during a user gesture
 * (the Start press), or browsers keep it silent.
 *
 * @param {AudioContext|null} ctx
 * @param {number} count
 */
export function playBeeps(ctx, count) {
  if (!ctx) return;
  const BEEP = 0.18; // seconds of tone
  const GAP = 0.12; // seconds between beeps
  const start = ctx.currentTime + 0.01;
  for (let i = 0; i < count; i += 1) {
    const t = start + i * (BEEP + GAP);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + BEEP);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + BEEP + 0.02);
  }
}

/**
 * Stopwatch state: idle → running ⇄ paused → stopped → (reset) idle.
 *
 * @param {{ onMark?: (mark:{at:number,count:number}) => void, tickMs?: number }} [options]
 * @returns {{ seconds:number, status:'idle'|'running'|'paused'|'stopped',
 *   start:Function, pause:Function, resume:Function, stop:() => number, reset:Function }}
 */
export function useStopwatch({ onMark, tickMs = 100 } = {}) {
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  // Time banked before the current run, and when the current run began.
  const bankedRef = useRef(0);
  const runStartRef = useRef(null);
  const lastSecondsRef = useRef(0);
  const onMarkRef = useRef(onMark);
  onMarkRef.current = onMark;

  const elapsedMs = useCallback(
    () => bankedRef.current + (runStartRef.current === null ? 0 : Date.now() - runStartRef.current),
    []
  );

  const update = useCallback(() => {
    const next = wholeSeconds(elapsedMs());
    const prev = lastSecondsRef.current;
    if (next !== prev) {
      for (const mark of marksCrossed(prev, next)) onMarkRef.current?.(mark);
      lastSecondsRef.current = next;
      setSeconds(next);
    }
    return next;
  }, [elapsedMs]);

  useEffect(() => {
    if (status !== 'running') return undefined;
    const timer = setInterval(update, tickMs);
    return () => clearInterval(timer);
  }, [status, update, tickMs]);

  const start = useCallback(() => {
    bankedRef.current = 0;
    lastSecondsRef.current = 0;
    runStartRef.current = Date.now();
    setSeconds(0);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    if (runStartRef.current === null) return;
    bankedRef.current += Date.now() - runStartRef.current;
    runStartRef.current = null;
    update();
    setStatus('paused');
  }, [update]);

  const resume = useCallback(() => {
    if (runStartRef.current !== null) return;
    runStartRef.current = Date.now();
    setStatus('running');
  }, []);

  /** Stop and return the final time — exactly the seconds on the display. */
  const stop = useCallback(() => {
    if (runStartRef.current !== null) {
      bankedRef.current += Date.now() - runStartRef.current;
      runStartRef.current = null;
    }
    const final = update();
    setStatus('stopped');
    return final;
  }, [update]);

  const reset = useCallback(() => {
    bankedRef.current = 0;
    runStartRef.current = null;
    lastSecondsRef.current = 0;
    setSeconds(0);
    setStatus('idle');
  }, []);

  return { seconds, status, start, pause, resume, stop, reset };
}
