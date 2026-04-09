import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  let matchMediaMock;
  let listeners;

  beforeEach(() => {
    // Reset listeners array
    listeners = [];

    // Create a mock matchMedia function
    matchMediaMock = vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((event, handler) => {
        listeners.push({ event, handler });
      }),
      removeEventListener: vi.fn((event, handler) => {
        listeners = listeners.filter(
          (l) => l.event !== event || l.handler !== handler
        );
      }),
    }));

    // Replace window.matchMedia with mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State Detection', () => {
    it('should return false when user does not prefer reduced motion', () => {
      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);
    });

    it('should return true when user prefers reduced motion', () => {
      matchMediaMock.mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);
    });

    it('should check the correct media query', () => {
      renderHook(() => useReducedMotion());

      expect(matchMediaMock).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
  });

  describe('User Preference Changes', () => {
    it('should update when user preference changes from false to true', () => {
      const addEventListener = vi.fn((event, handler) => {
        listeners.push({ event, handler });
      });

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener,
        removeEventListener: vi.fn(),
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);

      // Simulate user changing preference to reduced motion
      act(() => {
        const changeHandler = listeners.find((l) => l.event === 'change')?.handler;
        if (changeHandler) {
          changeHandler({ matches: true });
        }
      });

      expect(result.current).toBe(true);
    });

    it('should update when user preference changes from true to false', () => {
      const addEventListener = vi.fn((event, handler) => {
        listeners.push({ event, handler });
      });

      matchMediaMock.mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener,
        removeEventListener: vi.fn(),
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);

      // Simulate user changing preference to allow motion
      act(() => {
        const changeHandler = listeners.find((l) => l.event === 'change')?.handler;
        if (changeHandler) {
          changeHandler({ matches: false });
        }
      });

      expect(result.current).toBe(false);
    });

    it('should register event listener for media query changes', () => {
      const addEventListener = vi.fn();

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener,
        removeEventListener: vi.fn(),
      });

      renderHook(() => useReducedMotion());

      expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount', () => {
      const removeEventListener = vi.fn();
      const addEventListener = vi.fn();

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener,
        removeEventListener,
      });

      const { unmount } = renderHook(() => useReducedMotion());

      unmount();

      expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should remove the same handler that was added', () => {
      let addedHandler;
      const addEventListener = vi.fn((event, handler) => {
        addedHandler = handler;
      });
      const removeEventListener = vi.fn();

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener,
        removeEventListener,
      });

      const { unmount } = renderHook(() => useReducedMotion());

      unmount();

      expect(removeEventListener).toHaveBeenCalledWith('change', addedHandler);
    });
  });

  describe('Multiple Instances', () => {
    it('should return consistent values across multiple hook instances', () => {
      matchMediaMock.mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const { result: result1 } = renderHook(() => useReducedMotion());
      const { result: result2 } = renderHook(() => useReducedMotion());

      expect(result1.current).toBe(result2.current);
      expect(result1.current).toBe(true);
    });
  });
});
