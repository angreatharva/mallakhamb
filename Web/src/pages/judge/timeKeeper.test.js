import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStopwatch, marksCrossed, wholeSeconds, deductionNote } from './timeKeeper';

describe('marksCrossed', () => {
  it('one beep at 60 and two at 90, each once', () => {
    expect(marksCrossed(59, 60)).toEqual([{ at: 60, count: 1 }]);
    expect(marksCrossed(60, 61)).toEqual([]);
    expect(marksCrossed(89, 90)).toEqual([{ at: 90, count: 2 }]);
  });

  it('still fires a mark a throttled tab jumped over', () => {
    expect(marksCrossed(58, 92)).toEqual([{ at: 60, count: 1 }, { at: 90, count: 2 }]);
  });
});

describe('wholeSeconds', () => {
  it('rounds down, as the display shows it', () => {
    expect(wholeSeconds(90_999)).toBe(90);
    expect(wholeSeconds(91_000)).toBe(91);
  });
});

describe('useStopwatch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  it('counts whole seconds past 60 without turning into minutes', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    advance(61_500);
    expect(result.current.seconds).toBe(61);
    expect(result.current.status).toBe('running');
  });

  it('beeps once at 60 and twice at 90', () => {
    const onMark = vi.fn();
    const { result } = renderHook(() => useStopwatch({ onMark }));
    act(() => result.current.start());
    advance(59_900);
    expect(onMark).not.toHaveBeenCalled();
    advance(200);
    expect(onMark).toHaveBeenLastCalledWith({ at: 60, count: 1 });
    advance(30_000);
    expect(onMark).toHaveBeenLastCalledWith({ at: 90, count: 2 });
    expect(onMark).toHaveBeenCalledTimes(2);
  });

  it('pause holds the time and resume carries on from it', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    advance(40_000);
    act(() => result.current.pause());
    advance(30_000);
    expect(result.current.seconds).toBe(40);
    expect(result.current.status).toBe('paused');
    act(() => result.current.resume());
    advance(5_000);
    expect(result.current.seconds).toBe(45);
  });

  it('stop returns exactly the seconds on the display', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    advance(92_700);
    let final;
    act(() => { final = result.current.stop(); });
    expect(final).toBe(92);
    expect(result.current.seconds).toBe(92);
    expect(result.current.status).toBe('stopped');
  });

  it('reset clears for the next athlete', () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    advance(10_000);
    act(() => { result.current.stop(); });
    act(() => result.current.reset());
    expect(result.current.seconds).toBe(0);
    expect(result.current.status).toBe('idle');
  });
});

describe('deductionNote', () => {
  it('says what a stopped time costs, and nothing inside 60–90', () => {
    expect(deductionNote(55)).toBe('Deduction 0.30 · 5 s short');
    expect(deductionNote(92)).toBe('Deduction 0.20 · 2 s over');
    expect(deductionNote(60)).toBe('');
    expect(deductionNote(90)).toBe('');
  });
});
