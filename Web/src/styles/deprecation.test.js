/**
 * Tests for deprecation warnings
 * **Validates: Requirements 9.2**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Deprecation Warnings', () => {
  let consoleWarnSpy;
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;

    // Set to development mode
    process.env.NODE_ENV = 'development';

    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('COLORS export', () => {
    it('should show deprecation warning when COLORS is accessed', async () => {
      // Clear the module cache to ensure fresh import
      vi.resetModules();

      // Import and access COLORS
      const { COLORS } = await import('./tokens.js');
      const color = COLORS.saffron;

      // Verify warning was shown
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('COLORS'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('DESIGN_TOKENS.colors'));

      // Verify the value is still correct
      expect(color).toBe('#FF6B00');
    });

    it('should only show warning once per session', async () => {
      vi.resetModules();

      const { COLORS } = await import('./tokens.js');

      // Access multiple times
      const color1 = COLORS.saffron;
      const color2 = COLORS.gold;
      const color3 = COLORS.cream;

      // Should only warn once
      const colorWarnings = consoleWarnSpy.mock.calls.filter((call) => call[0].includes('COLORS'));
      expect(colorWarnings.length).toBe(1);
    });
  });

  describe('ADMIN_COLORS export', () => {
    it('should show deprecation warning when ADMIN_COLORS is accessed', async () => {
      vi.resetModules();

      const { ADMIN_COLORS } = await import('./tokens.js');
      const color = ADMIN_COLORS.purple;

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('ADMIN_COLORS'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('DESIGN_TOKENS.colors'));

      expect(color).toBe('#8B5CF6');
    });

    it('should only show warning once per session', async () => {
      vi.resetModules();

      const { ADMIN_COLORS } = await import('./tokens.js');

      // Access multiple times
      const color1 = ADMIN_COLORS.purple;
      const color2 = ADMIN_COLORS.green;
      const color3 = ADMIN_COLORS.red;

      // Should only warn once
      const adminColorWarnings = consoleWarnSpy.mock.calls.filter((call) =>
        call[0].includes('ADMIN_COLORS')
      );
      expect(adminColorWarnings.length).toBe(1);
    });
  });

  describe('Animation easing exports', () => {
    it('should provide EASE_OUT with correct value', async () => {
      vi.resetModules();

      const { EASE_OUT } = await import('./tokens.js');

      expect(EASE_OUT).toEqual([0.22, 1, 0.36, 1]);
    });

    it('should provide EASE_SPRING with correct value', async () => {
      vi.resetModules();

      const { EASE_SPRING } = await import('./tokens.js');

      expect(EASE_SPRING).toEqual([0.68, -0.55, 0.265, 1.55]);
    });

    it('should provide ADMIN_EASE_OUT with correct value', async () => {
      vi.resetModules();

      const { ADMIN_EASE_OUT } = await import('./tokens.js');

      expect(ADMIN_EASE_OUT).toEqual([0.22, 1, 0.36, 1]);
    });

    it('should provide ADMIN_SPRING with correct value', async () => {
      vi.resetModules();

      const { ADMIN_SPRING } = await import('./tokens.js');

      expect(ADMIN_SPRING).toEqual([0.68, -0.55, 0.265, 1.55]);
    });
  });

  describe('Production mode', () => {
    it('should not show warnings in production mode', async () => {
      // Set to production mode
      process.env.NODE_ENV = 'production';

      vi.resetModules();

      const { COLORS, ADMIN_COLORS } = await import('./tokens.js');

      // Access deprecated exports
      const color1 = COLORS.saffron;
      const color2 = ADMIN_COLORS.purple;

      // No warnings should be shown in production
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // But values should still work
      expect(color1).toBe('#FF6B00');
      expect(color2).toBe('#8B5CF6');
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain all COLORS properties', async () => {
      vi.resetModules();

      const { COLORS } = await import('./tokens.js');

      expect(COLORS).toHaveProperty('saffron');
      expect(COLORS).toHaveProperty('saffronLight');
      expect(COLORS).toHaveProperty('saffronDark');
      expect(COLORS).toHaveProperty('gold');
      expect(COLORS).toHaveProperty('cream');
      expect(COLORS).toHaveProperty('dark');
      expect(COLORS).toHaveProperty('darkCard');
      expect(COLORS).toHaveProperty('darkElevated');
      expect(COLORS).toHaveProperty('darkBorder');
      expect(COLORS).toHaveProperty('darkBorderSubtle');
      expect(COLORS).toHaveProperty('textSecondary');
      expect(COLORS).toHaveProperty('textMuted');
    });

    it('should maintain all ADMIN_COLORS properties', async () => {
      vi.resetModules();

      const { ADMIN_COLORS } = await import('./tokens.js');

      // Should have all COLORS properties
      expect(ADMIN_COLORS).toHaveProperty('saffron');
      expect(ADMIN_COLORS).toHaveProperty('gold');

      // Plus additional admin-specific properties
      expect(ADMIN_COLORS).toHaveProperty('darkPanel');
      expect(ADMIN_COLORS).toHaveProperty('darkBorderMid');
      expect(ADMIN_COLORS).toHaveProperty('purple');
      expect(ADMIN_COLORS).toHaveProperty('purpleLight');
      expect(ADMIN_COLORS).toHaveProperty('purpleDark');
      expect(ADMIN_COLORS).toHaveProperty('green');
      expect(ADMIN_COLORS).toHaveProperty('red');
      expect(ADMIN_COLORS).toHaveProperty('blue');
    });
  });
});
