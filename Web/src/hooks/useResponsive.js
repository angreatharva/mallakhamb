/**
 * React Hook for Responsive State Management
 * 
 * Provides reactive responsive state that updates when viewport changes.
 * Includes breakpoint detection, viewport categorization, and performance optimization.
 * 
 * Requirements: 1.1, 1.2, 8.1
 */

import { useState, useEffect, useCallback } from 'react';
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
} from '../utils/responsive.js';

/**
 * Custom hook for responsive state management
 * @param {Object} options - Configuration options
 * @param {number} options.debounceMs - Debounce delay for resize events (default: 250ms)
 * @param {boolean} options.updateCSSProperties - Whether to update CSS custom properties (default: true)
 * @returns {Object} Responsive state and utilities
 */
export const useResponsive = (options = {}) => {
  const { debounceMs = 250, updateCSSProperties = true } = options;
  
  // Initialize state
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
    category: typeof window !== 'undefined' ? getViewportCategory() : 'desktop',
  }));

  // Breakpoint states
  const [breakpoints, setBreakpoints] = useState(() => ({
    isMobile: typeof window !== 'undefined' ? isMobile() : false,
    isTablet: typeof window !== 'undefined' ? isTablet() : false,
    isDesktop: typeof window !== 'undefined' ? isDesktop() : true,
    isDesktopBaseline: typeof window !== 'undefined' ? isDesktopBaseline() : true,
    sm: typeof window !== 'undefined' ? isBreakpoint('sm') : true,
    md: typeof window !== 'undefined' ? isBreakpoint('md') : true,
    lg: typeof window !== 'undefined' ? isBreakpoint('lg') : true,
    xl: typeof window !== 'undefined' ? isBreakpoint('xl') : true,
    '2xl': typeof window !== 'undefined' ? isBreakpoint('2xl') : true,
  }));

  // Update responsive state
  const updateResponsiveState = useCallback(() => {
    if (typeof window === 'undefined') return;

    const newViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      category: getViewportCategory(),
    };

    const newBreakpoints = {
      isMobile: isMobile(),
      isTablet: isTablet(),
      isDesktop: isDesktop(),
      isDesktopBaseline: isDesktopBaseline(),
      sm: isBreakpoint('sm'),
      md: isBreakpoint('md'),
      lg: isBreakpoint('lg'),
      xl: isBreakpoint('xl'),
      '2xl': isBreakpoint('2xl'),
    };

    setViewport(newViewport);
    setBreakpoints(newBreakpoints);

    // Update CSS custom properties if enabled
    if (updateCSSProperties) {
      setResponsiveCSSProperties();
    }
  }, [updateCSSProperties]);

  // Debounced resize handler with performance monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId;
    
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateResponsiveState, debounceMs);
    };

    // Standard resize handler
    window.addEventListener('resize', handleResize);

    // Initial update
    updateResponsiveState();

    // Cleanup
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateResponsiveState, debounceMs]);

  // Utility functions
  const isBreakpointActive = useCallback((breakpoint) => {
    return breakpoints[breakpoint] || false;
  }, [breakpoints]);

  const getResponsiveValue = useCallback((values) => {
    if (typeof values === 'object' && values !== null) {
      // Return value based on current viewport category
      return values[viewport.category] || values.desktop || values.default;
    }
    return values;
  }, [viewport.category]);

  const matchesMediaQuery = useCallback((query) => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, []);

  return {
    // Viewport information
    viewport,
    
    // Breakpoint states
    ...breakpoints,
    
    // Utility functions
    isBreakpointActive,
    getResponsiveValue,
    matchesMediaQuery,
    
    // Constants for reference
    BREAKPOINTS,
    RESPONSIVE_RANGES,
  };
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
    console.warn(`Unknown breakpoint: ${breakpoint}`);
    return false;
  }

  return useMediaQuery(`(min-width: ${breakpointValue}px)`);
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