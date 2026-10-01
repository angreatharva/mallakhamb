/**
 * React Hook for Responsive State Management
 *
 * Provides reactive responsive state that updates when viewport changes.
 * Includes breakpoint detection, viewport categorization, and performance optimization.
 *
 * Requirements: 1.1, 1.2, 8.1
 *
 * ONE shared viewport store (plan Phase 10). Every `useResponsive()` used to add
 * its own `resize` listener and debounce timer, re-render once right after mount
 * (an "initial update" effect), and rewrite the document's responsive CSS custom
 * properties on every resize — twenty components meant twenty listeners and
 * twenty identical writes. Now:
 *   - a single listener, attached while anyone is subscribed;
 *   - a ~100ms trailing debounce, measured on the next animation frame;
 *   - the CSS properties written once, and only when the category changes;
 *   - `useSyncExternalStore`, so the first render already has the right value
 *     and a consumer re-renders only when the measurement actually changed.
 * The hook's return shape is unchanged.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  BREAKPOINTS,
  RESPONSIVE_RANGES,
  getViewportCategory,
  isBreakpoint,
  isMobile,
  isTablet,
  isDesktop,
  isDesktopBaseline,
  setResponsiveCSSProperties,
} from '@/utils/ui/responsive.js';
import { logger } from '@/infrastructure/logger.js';

const RESIZE_SETTLE_MS = 100;
const SERVER_SNAPSHOT = Object.freeze({
  viewport: { width: 1440, height: 900, category: 'desktop' },
  breakpoints: {
    isMobile: false, isTablet: false, isDesktop: true, isDesktopBaseline: true,
    sm: true, md: true, lg: true, xl: true, '2xl': true,
  },
});

const measure = () => ({
  viewport: { width: window.innerWidth, height: window.innerHeight, category: getViewportCategory() },
  breakpoints: {
    isMobile: isMobile(),
    isTablet: isTablet(),
    isDesktop: isDesktop(),
    isDesktopBaseline: isDesktopBaseline(),
    sm: isBreakpoint('sm'),
    md: isBreakpoint('md'),
    lg: isBreakpoint('lg'),
    xl: isBreakpoint('xl'),
    '2xl': isBreakpoint('2xl'),
  },
});

const sameKeys = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

const store = {
  snapshot: null,
  listeners: new Set(),
  timer: 0,
  frame: 0,
};

const read = () => {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  if (!store.snapshot) {
    store.snapshot = measure();
    setResponsiveCSSProperties();
  }
  return store.snapshot;
};

// Keep object identity for whatever did not change, so a consumer's memoised values stay stable.
const refresh = () => {
  const next = measure();
  const prev = read();
  const viewport = sameKeys(next.viewport, prev.viewport) ? prev.viewport : next.viewport;
  const breakpoints = sameKeys(next.breakpoints, prev.breakpoints) ? prev.breakpoints : next.breakpoints;
  if (viewport === prev.viewport && breakpoints === prev.breakpoints) return;
  if (viewport.category !== prev.viewport.category) setResponsiveCSSProperties();
  store.snapshot = { viewport, breakpoints };
  store.listeners.forEach((listener) => listener());
};

const onResize = () => {
  clearTimeout(store.timer);
  store.timer = setTimeout(() => {
    cancelAnimationFrame(store.frame);
    store.frame = requestAnimationFrame(refresh);
  }, RESIZE_SETTLE_MS);
};

const subscribe = (listener) => {
  store.listeners.add(listener);
  if (store.listeners.size === 1) window.addEventListener('resize', onResize);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      window.removeEventListener('resize', onResize);
      clearTimeout(store.timer);
      cancelAnimationFrame(store.frame);
    }
  };
};

/**
 * Custom hook for responsive state management.
 * The `debounceMs` / `updateCSSProperties` options of the per-instance version are gone with it: the store is
 * shared, settles in ~100ms, and keeps the CSS custom properties current. No caller ever passed either.
 * @returns {Object} Responsive state and utilities
 */
export const useResponsive = () => {
  const { viewport, breakpoints } = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);

  const isBreakpointActive = useCallback((breakpoint) => breakpoints[breakpoint] || false, [breakpoints]);

  const getResponsiveValue = useCallback((values) => {
    if (typeof values === 'object' && values !== null) {
      return values[viewport.category] || values.desktop || values.default;
    }
    return values;
  }, [viewport.category]);

  const matchesMediaQuery = useCallback((query) => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, []);

  return useMemo(() => ({
    viewport,
    ...breakpoints,
    isBreakpointActive,
    getResponsiveValue,
    matchesMediaQuery,
    BREAKPOINTS,
    RESPONSIVE_RANGES,
  }), [viewport, breakpoints, isBreakpointActive, getResponsiveValue, matchesMediaQuery]);
};

/** Test-only: forget the shared measurement so the next read measures afresh. */
export const __resetResponsiveStoreForTests = () => {
  store.snapshot = null;
  clearTimeout(store.timer);
  cancelAnimationFrame(store.frame);
};

/**
 * Hook for media query matching with reactive updates
 * @param {string} query - CSS media query string
 * @returns {boolean} Whether the media query matches
 */
export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (!query || typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!query || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    const handleChange = (e) => setMatches(e.matches);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Add listener
    mediaQuery.addEventListener('change', handleChange);

    // Cleanup
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
};

/**
 * Hook for detecting specific breakpoints
 * @param {string} breakpoint - Breakpoint name from BREAKPOINTS
 * @returns {boolean} Whether the breakpoint is active
 */
export const useBreakpoint = (breakpoint) => {
  const breakpointValue = BREAKPOINTS[breakpoint];
  
  if (!breakpointValue) {
    logger.warn(`Unknown breakpoint: ${breakpoint}`);
  }

  return useMediaQuery(breakpointValue ? `(min-width: ${breakpointValue}px)` : '');
};

/**
 * Hook for mobile-first responsive values
 * @param {Object} values - Object with breakpoint keys and values
 * @returns {any} Current value based on active breakpoints
 */
export const useResponsiveValue = (values) => {
  const { getResponsiveValue } = useResponsive();
  return getResponsiveValue(values);
};

/**
 * Hook for touch target validation
 * @param {React.RefObject} ref - Ref to the element to validate
 * @returns {Object} Validation state and utilities
 */
export const useTouchTargetValidation = (ref) => {
  const [isValid, setIsValid] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const validate = useCallback(() => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const newDimensions = { width: rect.width, height: rect.height };
    const valid = rect.height >= 44 && rect.width >= 44;

    setDimensions(newDimensions);
    setIsValid(valid);
  }, [ref]);

  useEffect(() => {
    validate();

    // Re-validate on resize
    const handleResize = () => setTimeout(validate, 100);
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [validate]);

  return {
    isValid,
    dimensions,
    validate,
    minSize: 44,
  };
};

/**
 * Hook for respecting the user's prefers-reduced-motion setting.
 * Reactive — updates if the user changes the OS setting at runtime.
 * @returns {boolean} true if the user prefers reduced motion
 */
export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
};
