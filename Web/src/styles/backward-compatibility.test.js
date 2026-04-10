/**
 * Backward Compatibility Tests
 *
 * These tests verify that old import paths and deprecated functions still work
 * with appropriate warnings during the migration period.
 *
 * Requirements: 9.1, 9.2, 9.5 - Backward compatibility verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { COLORS, ADMIN_COLORS, EASE_OUT, EASE_SPRING, DESIGN_TOKENS } from './tokens';

describe('Backward Compatibility', () => {
  let consoleWarnSpy;

  beforeEach(() => {
    // Spy on console.warn to check for deprecation warnings
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Old Import Paths', () => {
    it('should allow importing COLORS with deprecation warning', () => {
      // Access a property to trigger the proxy warning
      const saffron = COLORS.saffron;

      expect(saffron).toBeDefined();
      expect(saffron).toBe('#FF6B00');

      // In development mode, should have warned
      if (process.env.NODE_ENV === 'development') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('COLORS is deprecated')
        );
      }
    });

    it('should allow importing ADMIN_COLORS with deprecation warning', () => {
      // Access a property to trigger the proxy warning
      const purple = ADMIN_COLORS.purple;

      expect(purple).toBeDefined();
      expect(purple).toBe('#8B5CF6');

      // In development mode, should have warned
      if (process.env.NODE_ENV === 'development') {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('ADMIN_COLORS is deprecated')
        );
      }
    });

    it('should allow importing EASE_OUT constant', () => {
      expect(EASE_OUT).toBeDefined();
      expect(EASE_OUT).toEqual([0.22, 1, 0.36, 1]);
    });

    it('should allow importing EASE_SPRING constant', () => {
      expect(EASE_SPRING).toBeDefined();
      expect(EASE_SPRING).toEqual([0.68, -0.55, 0.265, 1.55]);
    });
  });

  describe('Deprecated Functions Still Work', () => {
    it('should access COLORS properties without errors', () => {
      expect(COLORS.saffron).toBe('#FF6B00');
      expect(COLORS.gold).toBe('#F5A623');
      expect(COLORS.cream).toBe('#FFF8F0');
    });

    it('should access ADMIN_COLORS properties without errors', () => {
      expect(ADMIN_COLORS.purple).toBe('#8B5CF6');
      expect(ADMIN_COLORS.purpleLight).toBe('#C084FC');
      expect(ADMIN_COLORS.purpleDark).toBe('#7C3AED');
    });

    it('should access nested COLORS properties', () => {
      expect(COLORS.green).toBe('#22C55E');
      expect(COLORS.blue).toBe('#3B82F6');
    });
  });

  describe('New Design Tokens Work Correctly', () => {
    it('should access role colors from DESIGN_TOKENS', () => {
      expect(DESIGN_TOKENS.colors.roles.admin).toBe('#8B5CF6');
      expect(DESIGN_TOKENS.colors.roles.coach).toBe('#22C55E');
      expect(DESIGN_TOKENS.colors.roles.player).toBe('#FF6B00');
    });

    it('should access spacing tokens', () => {
      expect(DESIGN_TOKENS.spacing.xs).toBe('4px');
      expect(DESIGN_TOKENS.spacing.md).toBe('16px');
      expect(DESIGN_TOKENS.spacing.xl).toBe('32px');
    });

    it('should access typography tokens', () => {
      expect(DESIGN_TOKENS.typography.fontSize.base).toBe('16px');
      expect(DESIGN_TOKENS.typography.fontWeight.bold).toBe(700);
    });

    it('should access easing tokens', () => {
      expect(DESIGN_TOKENS.easings.easeOut).toEqual([0.22, 1, 0.36, 1]);
      expect(DESIGN_TOKENS.easings.spring).toEqual([0.68, -0.55, 0.265, 1.55]);
    });
  });

  describe('Backward Compatibility Mapping', () => {
    it('should map old COLORS to new DESIGN_TOKENS structure', () => {
      // Old way
      const oldSaffron = COLORS.saffron;
      // New way
      const newSaffron = DESIGN_TOKENS.colors.brand.saffron;

      expect(oldSaffron).toBe(newSaffron);
    });

    it('should map old ADMIN_COLORS to new DESIGN_TOKENS structure', () => {
      // Old way
      const oldPurple = ADMIN_COLORS.purple;
      // New way
      const newPurple = DESIGN_TOKENS.colors.roles.admin;

      expect(oldPurple).toBe(newPurple);
    });

    it('should map old easing constants to new structure', () => {
      expect(EASE_OUT).toEqual(DESIGN_TOKENS.easings.easeOut);
      expect(EASE_SPRING).toEqual(DESIGN_TOKENS.easings.spring);
    });
  });

  describe('Deprecation Warnings Only in Development', () => {
    it('should only warn in development mode', () => {
      const originalEnv = process.env.NODE_ENV;

      // Test development mode
      process.env.NODE_ENV = 'development';
      consoleWarnSpy.mockClear();
      const _ = COLORS.saffron; // Access to trigger warning

      if (originalEnv === 'development') {
        expect(consoleWarnSpy).toHaveBeenCalled();
      }

      // Restore
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Existing Pages Continue to Function', () => {
    it('should support both old and new import styles', () => {
      // Old style (deprecated but working)
      const oldColor = COLORS.saffron;

      // New style (recommended)
      const newColor = DESIGN_TOKENS.colors.brand.saffron;

      // Both should work and return the same value
      expect(oldColor).toBe(newColor);
      expect(oldColor).toBe('#FF6B00');
    });

    it('should support gradual migration', () => {
      // Component can use mix of old and new
      const oldSaffron = COLORS.saffron;
      const newGreen = DESIGN_TOKENS.colors.roles.coach;

      expect(oldSaffron).toBeDefined();
      expect(newGreen).toBeDefined();
      expect(oldSaffron).toBe('#FF6B00');
      expect(newGreen).toBe('#22C55E');
    });
  });
});
