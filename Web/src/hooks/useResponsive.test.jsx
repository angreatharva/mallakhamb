/**
 * The shared viewport store behind useResponsive (plan Phase 10): one resize
 * listener however many components ask, the right value on the first render,
 * and a re-render only when the measurement actually changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useResponsive, __resetResponsiveStoreForTests } from './useResponsive';

const setWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
};
const settle = () => act(() => {
  window.dispatchEvent(new Event('resize'));
  vi.advanceTimersByTime(150); // the ~100ms trailing debounce
  vi.advanceTimersToNextFrame(); // the measurement runs on the next animation frame
});

describe('useResponsive — one shared viewport store', () => {
  let addSpy;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    setWidth(1366);
    __resetResponsiveStoreForTests();
    addSpy = vi.spyOn(window, 'addEventListener');
  });
  afterEach(() => {
    addSpy.mockRestore();
    vi.useRealTimers();
  });

  it('adds one resize listener for any number of consumers', () => {
    const Probe = () => { useResponsive(); return null; };
    render(<><Probe /><Probe /><Probe /><Probe /><Probe /></>);
    expect(addSpy.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1);
  });

  it('has the right answer on the first render, then follows a resize once it settles', () => {
    const seen = [];
    const Probe = () => { const { isMobile, isDesktop } = useResponsive(); seen.push({ isMobile, isDesktop }); return null; };
    render(<Probe />);
    expect(seen).toEqual([{ isMobile: false, isDesktop: true }]); // no extra render after mount
    setWidth(390);
    settle();
    expect(seen.at(-1)).toEqual({ isMobile: true, isDesktop: false });
  });

  it('is not stale after a resize that happened while nothing was subscribed', () => {
    const seen = [];
    const Probe = () => { const { isMobile } = useResponsive(); seen.push(isMobile); return null; };
    const first = render(<Probe />);
    expect(seen.at(-1)).toBe(false);
    first.unmount(); // the last subscriber leaves: the resize listener comes off
    setWidth(390); // a phone rotates on a screen with no responsive component
    act(() => { window.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(150); });
    seen.length = 0;
    render(<Probe />);
    expect(seen[0]).toBe(true); // right on the very first render, not one resize later
  });

  it('does not re-render when a resize leaves the measurement unchanged', () => {
    let renders = 0;
    const Probe = () => { useResponsive(); renders += 1; return null; };
    render(<Probe />);
    settle(); // same width
    expect(renders).toBe(1);
  });
});
