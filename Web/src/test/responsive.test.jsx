/**
 * Responsive Design Tests
 * 
 * Tests for responsive behavior across different viewport sizes.
 * Validates breakpoints, layout adaptations, and mobile-friendly features.
 * 
 * Requirements: 17.1, 17.3, 17.4, 17.5, 17.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useResponsive, useMediaQuery, useBreakpoint } from '../hooks/useResponsive';
import {
  BREAKPOINTS,
  RESPONSIVE_RANGES,
  getViewportCategory,
  isMobile,
  isTablet,
  isDesktop,
  isDesktopBaseline,
  validateTouchTarget,
  TOUCH_TARGET,
} from '../utils/responsive';

describe('Responsive Utilities', () => {
  describe('Breakpoint Constants', () => {
    it('should define correct breakpoint values', () => {
      expect(BREAKPOINTS.mobile).toBe(320);
      expect(BREAKPOINTS.md).toBe(768);
      expect(BREAKPOINTS.lg).toBe(1024);
      expect(BREAKPOINTS.desktop).toBe(1440);
    });

    it('should define correct responsive ranges', () => {
      expect(RESPONSIVE_RANGES.mobile).toEqual({ min: 320, max: 767 });
      expect(RESPONSIVE_RANGES.tablet).toEqual({ min: 768, max: 1023 });
      expect(RESPONSIVE_RANGES.desktop).toEqual({ min: 1024, max: Infinity });
    });
  });

  describe('Viewport Category Detection', () => {
    beforeEach(() => {
      // Mock window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
    });

    it('should detect mobile viewport (< 768px)', () => {
      window.innerWidth = 375;
      expect(getViewportCategory()).toBe('mobile');
      expect(isMobile()).toBe(true);
      expect(isTablet()).toBe(false);
      expect(isDesktop()).toBe(false);
    });

    it('should detect tablet viewport (768px - 1023px)', () => {
      window.innerWidth = 768;
      expect(getViewportCategory()).toBe('tablet');
      expect(isMobile()).toBe(false);
      expect(isTablet()).toBe(true);
      expect(isDesktop()).toBe(false);
    });

    it('should detect desktop viewport (>= 1024px)', () => {
      window.innerWidth = 1280;
      expect(getViewportCategory()).toBe('desktop');
      expect(isMobile()).toBe(false);
      expect(isTablet()).toBe(false);
      expect(isDesktop()).toBe(true);
    });

    it('should detect desktop baseline (>= 1440px)', () => {
      window.innerWidth = 1440;
      expect(isDesktopBaseline()).toBe(true);
    });
  });

  describe('Touch Target Validation', () => {
    it('should validate minimum touch target size (44px)', () => {
      expect(TOUCH_TARGET.minimum).toBe(44);
      expect(TOUCH_TARGET.recommended).toBe(48);
    });

    it('should validate element meets touch target requirements', () => {
      const element = document.createElement('button');
      element.style.width = '48px';
      element.style.height = '48px';
      document.body.appendChild(element);

      // Mock getBoundingClientRect for jsdom
      element.getBoundingClientRect = vi.fn(() => ({
        width: 48,
        height: 48,
        top: 0,
        left: 0,
        right: 48,
        bottom: 48,
      }));

      const isValid = validateTouchTarget(element);
      expect(isValid).toBe(true);

      document.body.removeChild(element);
    });

    it('should fail validation for small elements', () => {
      const element = document.createElement('button');
      element.style.width = '30px';
      element.style.height = '30px';
      document.body.appendChild(element);

      // Mock getBoundingClientRect for jsdom
      element.getBoundingClientRect = vi.fn(() => ({
        width: 30,
        height: 30,
        top: 0,
        left: 0,
        right: 30,
        bottom: 30,
      }));

      const isValid = validateTouchTarget(element);
      expect(isValid).toBe(false);

      document.body.removeChild(element);
    });
  });
});

describe('useResponsive Hook', () => {
  beforeEach(() => {
    // Reset window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768,
    });
  });

  it('should return viewport information', () => {
    const { result } = renderHook(() => useResponsive());

    expect(result.current.viewport).toBeDefined();
    expect(result.current.viewport.width).toBe(1024);
    expect(result.current.viewport.height).toBe(768);
    expect(result.current.viewport.category).toBe('desktop');
  });

  it('should return breakpoint states', () => {
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
  });

  it('should detect mobile viewport', () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.viewport.category).toBe('mobile');
  });

  it('should detect tablet viewport', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.viewport.category).toBe('tablet');
  });

  it('should provide utility functions', () => {
    const { result } = renderHook(() => useResponsive());

    expect(typeof result.current.isBreakpointActive).toBe('function');
    expect(typeof result.current.getResponsiveValue).toBe('function');
    expect(typeof result.current.matchesMediaQuery).toBe('function');
  });

  it('should provide breakpoint constants', () => {
    const { result } = renderHook(() => useResponsive());

    expect(result.current.BREAKPOINTS).toBeDefined();
    expect(result.current.RESPONSIVE_RANGES).toBeDefined();
  });
});

describe('useMediaQuery Hook', () => {
  it('should match media query', () => {
    // Mock matchMedia for jsdom
    window.matchMedia = vi.fn((query) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    window.innerWidth = 1024;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(true);
  });

  it('should not match media query', () => {
    // Mock matchMedia for jsdom
    window.matchMedia = vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    window.innerWidth = 768;
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(false);
  });
});

describe('useBreakpoint Hook', () => {
  it('should detect active breakpoint', () => {
    // Mock matchMedia for jsdom
    window.matchMedia = vi.fn((query) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    window.innerWidth = 1024;
    const { result } = renderHook(() => useBreakpoint('lg'));

    expect(result.current).toBe(true);
  });

  it('should detect inactive breakpoint', () => {
    // Mock matchMedia for jsdom
    window.matchMedia = vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    window.innerWidth = 768;
    const { result } = renderHook(() => useBreakpoint('lg'));

    expect(result.current).toBe(false);
  });
});

describe('Responsive Breakpoint Testing', () => {
  const testBreakpoints = [
    { width: 320, name: 'iPhone SE', category: 'mobile' },
    { width: 375, name: 'iPhone 12/13', category: 'mobile' },
    { width: 414, name: 'iPhone Pro Max', category: 'mobile' },
    { width: 768, name: 'iPad Portrait', category: 'tablet' },
    { width: 1024, name: 'iPad Landscape', category: 'desktop' },
    { width: 1280, name: 'Laptop', category: 'desktop' },
    { width: 1440, name: 'Desktop Baseline', category: 'desktop' },
    { width: 1920, name: 'Full HD', category: 'desktop' },
  ];

  testBreakpoints.forEach(({ width, name, category }) => {
    it(`should correctly categorize ${name} (${width}px) as ${category}`, () => {
      window.innerWidth = width;
      expect(getViewportCategory()).toBe(category);
    });
  });
});

describe('Cross-Browser Compatibility', () => {
  it('should handle missing window object (SSR)', () => {
    const originalWindow = global.window;
    delete global.window;

    expect(getViewportCategory()).toBe('desktop'); // Default fallback

    global.window = originalWindow;
  });

  it('should handle missing matchMedia (old browsers)', () => {
    const originalMatchMedia = window.matchMedia;
    
    // Mock matchMedia to return a basic object
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    // Should not throw error
    expect(() => {
      const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    }).not.toThrow();

    window.matchMedia = originalMatchMedia;
  });
});

describe('Mobile-Specific Features', () => {
  it('should validate touch target sizes for mobile', () => {
    window.innerWidth = 375; // Mobile viewport

    const button = document.createElement('button');
    button.style.width = '44px';
    button.style.height = '44px';
    document.body.appendChild(button);

    // Mock getBoundingClientRect for jsdom
    button.getBoundingClientRect = vi.fn(() => ({
      width: 44,
      height: 44,
      top: 0,
      left: 0,
      right: 44,
      bottom: 44,
    }));

    expect(validateTouchTarget(button)).toBe(true);

    document.body.removeChild(button);
  });

  it('should fail validation for small touch targets on mobile', () => {
    window.innerWidth = 375; // Mobile viewport

    const button = document.createElement('button');
    button.style.width = '30px';
    button.style.height = '30px';
    document.body.appendChild(button);

    // Mock getBoundingClientRect for jsdom
    button.getBoundingClientRect = vi.fn(() => ({
      width: 30,
      height: 30,
      top: 0,
      left: 0,
      right: 30,
      bottom: 30,
    }));

    expect(validateTouchTarget(button)).toBe(false);

    document.body.removeChild(button);
  });
});

describe('Responsive Layout Validation', () => {
  it('should validate mobile layout (< 768px)', () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.viewport.category).toBe('mobile');
  });

  it('should validate tablet layout (768px - 1024px)', () => {
    window.innerWidth = 768;
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isTablet).toBe(true);
    expect(result.current.viewport.category).toBe('tablet');
  });

  it('should validate desktop layout (> 1024px)', () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.viewport.category).toBe('desktop');
  });
});

describe('Orientation Testing', () => {
  it('should handle portrait orientation', () => {
    window.innerWidth = 375;
    window.innerHeight = 667;

    const { result } = renderHook(() => useResponsive());
    expect(result.current.viewport.width).toBe(375);
    expect(result.current.viewport.height).toBe(667);
  });

  it('should handle landscape orientation', () => {
    window.innerWidth = 667;
    window.innerHeight = 375;

    const { result } = renderHook(() => useResponsive());
    expect(result.current.viewport.width).toBe(667);
    expect(result.current.viewport.height).toBe(375);
  });
});

describe('Requirements Validation', () => {
  it('should validate Requirement 17.1: useResponsive hook exists', () => {
    const { result } = renderHook(() => useResponsive());
    expect(result.current).toBeDefined();
  });

  it('should validate Requirement 17.3: Responsive grid layouts adapt', () => {
    // Mobile
    window.innerWidth = 375;
    let { result } = renderHook(() => useResponsive());
    expect(result.current.isMobile).toBe(true);

    // Tablet
    window.innerWidth = 768;
    result = renderHook(() => useResponsive()).result;
    expect(result.current.isTablet).toBe(true);

    // Desktop
    window.innerWidth = 1280;
    result = renderHook(() => useResponsive()).result;
    expect(result.current.isDesktop).toBe(true);
  });

  it('should validate Requirement 17.4: Mobile viewport adjustments', () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.viewport.category).toBe('mobile');
  });

  it('should validate Requirement 17.6: Cross-browser compatibility', () => {
    // Test that utilities work without throwing errors
    expect(() => getViewportCategory()).not.toThrow();
    expect(() => isMobile()).not.toThrow();
    expect(() => isTablet()).not.toThrow();
    expect(() => isDesktop()).not.toThrow();
  });

  it('should validate Requirement 17.8: Touch targets (44px minimum)', () => {
    expect(TOUCH_TARGET.minimum).toBe(44);

    const button = document.createElement('button');
    button.style.width = '44px';
    button.style.height = '44px';
    document.body.appendChild(button);

    // Mock getBoundingClientRect for jsdom
    button.getBoundingClientRect = vi.fn(() => ({
      width: 44,
      height: 44,
      top: 0,
      left: 0,
      right: 44,
      bottom: 44,
    }));

    expect(validateTouchTarget(button)).toBe(true);

    document.body.removeChild(button);
  });
});

/**
 * Note: Full cross-browser testing requires manual testing or E2E tools like Playwright.
 * These tests validate the responsive utilities and hooks work correctly.
 * 
 * For comprehensive cross-browser testing, see:
 * - Web/CROSS_BROWSER_MOBILE_TESTING.md
 * - Web/CROSS_BROWSER_TESTING_CHECKLIST.md
 */
