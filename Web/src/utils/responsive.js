/**
 * Responsive Development Utilities
 * 
 * Provides utilities for responsive design development including
 * breakpoint detection, viewport helpers, and responsive state management.
 * 
 * Requirements: 1.1, 1.2, 8.1
 */

// Enhanced breakpoint definitions matching Tailwind CSS configuration
export const BREAKPOINTS = {
  mobile: 320,
  mobileLarge: 480,
  sm: 640,
  md: 768,
  tablet: 768,
  lg: 1024,
  xl: 1280,
  desktop: 1440, // Specific desktop baseline from requirements
  '2xl': 1536,
  desktopLarge: 1920,
};

// Enhanced responsive ranges for easier categorization
export const RESPONSIVE_RANGES = {
  mobile: { min: 320, max: 767 },
  tablet: { min: 768, max: 1023 },
  desktop: { min: 1024, max: Infinity },
  desktopBaseline: { min: 1440, max: Infinity }, // Requirements baseline
};

// Breakpoint helpers for common responsive patterns
export const BREAKPOINT_HELPERS = {
  // Mobile-first breakpoint queries
  mobile: `(min-width: ${BREAKPOINTS.mobile}px)`,
  mobileLarge: `(min-width: ${BREAKPOINTS.mobileLarge}px)`,
  tablet: `(min-width: ${BREAKPOINTS.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINTS.desktop}px)`,
  
  // Max-width queries for mobile-first approach
  mobileOnly: `(max-width: ${BREAKPOINTS.tablet - 1}px)`,
  tabletOnly: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`,
  desktopOnly: `(min-width: ${BREAKPOINTS.lg}px)`,
  
  // Orientation queries
  landscape: '(orientation: landscape)',
  portrait: '(orientation: portrait)',
  
  // Touch device detection
  touchDevice: '(hover: none) and (pointer: coarse)',
  hoverDevice: '(hover: hover) and (pointer: fine)',
  
  // High DPI displays
  retina: '(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)',
};

/**
 * Get current viewport category based on window width
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export const getViewportCategory = () => {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  
  if (width < RESPONSIVE_RANGES.tablet.min) return 'mobile';
  if (width < RESPONSIVE_RANGES.desktop.min) return 'tablet';
  return 'desktop';
};

/**
 * Check if current viewport matches a specific breakpoint
 * @param {string} breakpoint - Breakpoint name from BREAKPOINTS
 * @returns {boolean}
 */
export const isBreakpoint = (breakpoint) => {
  if (typeof window === 'undefined') return false;
  
  const width = window.innerWidth;
  const breakpointValue = BREAKPOINTS[breakpoint];
  
  if (!breakpointValue) return false;
  
  return width >= breakpointValue;
};

/**
 * Check if viewport is mobile (< 768px)
 * @returns {boolean}
 */
export const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < BREAKPOINTS.md;
};

/**
 * Check if viewport is tablet (768px - 1023px)
 * @returns {boolean}
 */
export const isTablet = () => {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
};

/**
 * Check if viewport is desktop (>= 1024px)
 * @returns {boolean}
 */
export const isDesktop = () => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= BREAKPOINTS.lg;
};

/**
 * Check if viewport meets desktop baseline requirements (>= 1440px)
 * @returns {boolean}
 */
export const isDesktopBaseline = () => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= BREAKPOINTS.desktop;
};

/**
 * Enhanced utility to get responsive class names based on current viewport
 * @param {Object} classes - Object with mobile, tablet, desktop class names
 * @param {string} fallback - Fallback class name if no match
 * @returns {string}
 */
export const getResponsiveClasses = (classes = {}, fallback = '') => {
  const category = getViewportCategory();
  return classes[category] || fallback;
};

/**
 * Get responsive grid configuration for current viewport
 * @param {string} gridType - Grid type from RESPONSIVE_GRIDS
 * @returns {Object}
 */
export const getResponsiveGrid = (gridType) => {
  const category = getViewportCategory();
  const grid = RESPONSIVE_GRIDS[gridType];
  
  if (!grid) return RESPONSIVE_GRIDS.autoFit[category];
  
  // Check for desktop-wide configuration
  if (category === 'desktop' && isDesktopBaseline() && grid.desktopWide) {
    return grid.desktopWide;
  }
  
  return grid[category] || grid.desktop;
};

/**
 * Get responsive layout configuration for current viewport
 * @param {string} layoutType - Layout type from RESPONSIVE_LAYOUTS
 * @returns {Object}
 */
export const getResponsiveLayout = (layoutType) => {
  const category = getViewportCategory();
  const layout = RESPONSIVE_LAYOUTS[layoutType];
  
  if (!layout) return RESPONSIVE_LAYOUTS.container[category];
  
  // Check for desktop-wide configuration
  if (category === 'desktop' && isDesktopBaseline() && layout.desktopWide) {
    return layout.desktopWide;
  }
  
  return layout[category] || layout.desktop;
};

/**
 * Enhanced breakpoint detection with additional helpers
 * @param {string} breakpoint - Breakpoint name or helper query
 * @returns {boolean}
 */
export const matchesBreakpoint = (breakpoint) => {
  if (typeof window === 'undefined') return false;
  
  // Check if it's a helper query
  if (BREAKPOINT_HELPERS[breakpoint]) {
    return window.matchMedia(BREAKPOINT_HELPERS[breakpoint]).matches;
  }
  
  // Check if it's a standard breakpoint
  return isBreakpoint(breakpoint);
};

/**
 * Check if device supports touch interactions
 * @returns {boolean}
 */
export const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(BREAKPOINT_HELPERS.touchDevice).matches;
};

/**
 * Check if device supports hover interactions
 * @returns {boolean}
 */
export const isHoverDevice = () => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia(BREAKPOINT_HELPERS.hoverDevice).matches;
};

/**
 * Get optimal touch target size based on device capabilities
 * @returns {number}
 */
export const getOptimalTouchTargetSize = () => {
  if (isTouchDevice()) {
    return TOUCH_TARGET.recommended;
  }
  return TOUCH_TARGET.minimum;
};

/**
 * Enhanced touch target validation with device-specific requirements
 * @param {HTMLElement} element - DOM element to validate
 * @param {boolean} strict - Whether to use strict validation
 * @returns {Object}
 */
export const validateTouchTargetEnhanced = (element, strict = false) => {
  if (!element) return { isValid: false, reason: 'Element not found' };
  
  const rect = element.getBoundingClientRect();
  const requiredSize = strict ? TOUCH_TARGET.recommended : TOUCH_TARGET.minimum;
  const isValid = rect.height >= requiredSize && rect.width >= requiredSize;
  
  return {
    isValid,
    dimensions: { width: rect.width, height: rect.height },
    requiredSize,
    reason: isValid ? 'Valid' : `Too small: ${rect.width}x${rect.height} < ${requiredSize}px`,
  };
};

/**
 * Touch target size validation
 * Ensures interactive elements meet minimum 44px requirement
 */
export const TOUCH_TARGET = {
  minimum: 44,
  recommended: 48,
};

/**
 * Validate if an element meets touch target requirements
 * @param {HTMLElement} element - DOM element to validate
 * @returns {boolean}
 */
export const validateTouchTarget = (element) => {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  return rect.height >= TOUCH_TARGET.minimum && rect.width >= TOUCH_TARGET.minimum;
};

/**
 * Enhanced responsive spacing utilities
 */
export const RESPONSIVE_SPACING = {
  mobile: {
    container: '1rem',
    section: '2rem',
    component: '1rem',
    small: '0.5rem',
    gap: '0.75rem',
    padding: '1rem',
  },
  tablet: {
    container: '1.5rem',
    section: '3rem',
    component: '1.25rem',
    small: '0.75rem',
    gap: '1rem',
    padding: '1.5rem',
  },
  desktop: {
    container: '2rem',
    section: '4rem',
    component: '1.5rem',
    small: '1rem',
    gap: '1.5rem',
    padding: '2rem',
  },
};

/**
 * Enhanced responsive grid configurations
 */
export const RESPONSIVE_GRIDS = {
  // Auto-fit grid that adapts to content
  autoFit: {
    mobile: { columns: 1, gap: '0.75rem' },
    tablet: { columns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' },
    desktop: { columns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' },
  },
  
  // Card grid for dashboard layouts
  cards: {
    mobile: { columns: 1, gap: '1rem' },
    tablet: { columns: 2, gap: '1.25rem' },
    desktop: { columns: 4, gap: '1.5rem' },
    desktopWide: { columns: 4, gap: '1.5rem' },
  },
  
  // Form grid for input layouts
  form: {
    mobile: { columns: 1, gap: '1rem' },
    tablet: { columns: 2, gap: '1.25rem' },
    desktop: { columns: 2, gap: '1.5rem' },
  },
  
  // Table grid for data display
  table: {
    mobile: { columns: 1, gap: '0.5rem' },
    tablet: { columns: 'auto', gap: '1rem' },
    desktop: { columns: 'auto', gap: '1.5rem' },
  },
};

/**
 * Responsive layout component configurations
 */
export const RESPONSIVE_LAYOUTS = {
  // Container layouts
  container: {
    mobile: { maxWidth: '100%', padding: '1rem' },
    tablet: { maxWidth: '768px', padding: '1.5rem' },
    desktop: { maxWidth: '1200px', padding: '2rem' },
    desktopWide: { maxWidth: '1440px', padding: '2rem' },
  },
  
  // Section layouts
  section: {
    mobile: { padding: '2rem 1rem' },
    tablet: { padding: '3rem 1.5rem' },
    desktop: { padding: '4rem 2rem' },
  },
  
  // Navigation layouts
  navigation: {
    mobile: { type: 'overlay', width: '280px' },
    tablet: { type: 'condensed', width: '100%' },
    desktop: { type: 'full', width: '100%' },
  },
};

/**
 * Get spacing value for current viewport
 * @param {string} type - Spacing type (container, section, component, small)
 * @returns {string}
 */
export const getResponsiveSpacing = (type) => {
  const category = getViewportCategory();
  return RESPONSIVE_SPACING[category]?.[type] || RESPONSIVE_SPACING.desktop[type];
};

/**
 * Responsive typography scale
 */
export const RESPONSIVE_TYPOGRAPHY = {
  mobile: {
    hero: '2.5rem',
    h1: '2rem',
    h2: '1.75rem',
    h3: '1.5rem',
    h4: '1.25rem',
    body: '1rem',
    small: '0.875rem',
  },
  tablet: {
    hero: '3rem',
    h1: '2.25rem',
    h2: '2rem',
    h3: '1.75rem',
    h4: '1.5rem',
    body: '1.125rem',
    small: '1rem',
  },
  desktop: {
    hero: '4rem',
    h1: '2.5rem',
    h2: '2.25rem',
    h3: '2rem',
    h4: '1.75rem',
    body: '1.125rem',
    small: '1rem',
  },
};

/**
 * Get typography size for current viewport
 * @param {string} type - Typography type (hero, h1, h2, etc.)
 * @returns {string}
 */
export const getResponsiveTypography = (type) => {
  const category = getViewportCategory();
  return RESPONSIVE_TYPOGRAPHY[category]?.[type] || RESPONSIVE_TYPOGRAPHY.desktop[type];
};

/**
 * Debounced resize handler for performance
 * @param {Function} callback - Function to call on resize
 * @param {number} delay - Debounce delay in milliseconds
 * @returns {Function} - Cleanup function
 */
export const useResponsiveResize = (callback, delay = 250) => {
  let timeoutId;
  
  const debouncedCallback = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(callback, delay);
  };
  
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', debouncedCallback);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCallback);
    };
  }
  
  return () => {};
};

/**
 * CSS custom properties for responsive values
 * Can be used to set CSS variables based on viewport
 */
export const setResponsiveCSSProperties = () => {
  if (typeof document === 'undefined') return;
  
  const category = getViewportCategory();
  const root = document.documentElement;
  
  // Set spacing variables
  Object.entries(RESPONSIVE_SPACING[category]).forEach(([key, value]) => {
    root.style.setProperty(`--spacing-${key}`, value);
  });
  
  // Set typography variables
  Object.entries(RESPONSIVE_TYPOGRAPHY[category]).forEach(([key, value]) => {
    root.style.setProperty(`--text-${key}`, value);
  });
  
  // Set viewport category
  root.style.setProperty('--viewport-category', category);
};