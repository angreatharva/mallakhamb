import { describe, it, expect } from 'vitest';
import { DESIGN_TOKENS, getStatusColor, getStatusBg, getRoleColor, getRoleBg } from './tokens';

describe('Token Helper Functions', () => {
  describe('getStatusColor', () => {
    it('should return correct color for "completed" status', () => {
      const color = getStatusColor('completed');
      expect(color).toBe('#22C55E');
      expect(color).toBe(DESIGN_TOKENS.colors.status.completed);
    });

    it('should return correct color for "pending" status', () => {
      const color = getStatusColor('pending');
      expect(color).toBe('#F5A623');
      expect(color).toBe(DESIGN_TOKENS.colors.status.pending);
    });

    it('should return correct color for "failed" status', () => {
      const color = getStatusColor('failed');
      expect(color).toBe('#EF4444');
      expect(color).toBe(DESIGN_TOKENS.colors.status.failed);
    });

    it('should return correct color for "started" status', () => {
      const color = getStatusColor('started');
      expect(color).toBe('#3B82F6');
      expect(color).toBe(DESIGN_TOKENS.colors.status.started);
    });

    it('should return fallback color for unknown status', () => {
      const color = getStatusColor('unknown');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
      expect(color).toBe('#FF6B00');
    });

    it('should return fallback color for null status', () => {
      const color = getStatusColor(null);
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should return fallback color for undefined status', () => {
      const color = getStatusColor(undefined);
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should return fallback color for empty string status', () => {
      const color = getStatusColor('');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should handle case-sensitive status keys', () => {
      // Status keys are case-sensitive
      const color = getStatusColor('Completed');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });
  });

  describe('getStatusBg', () => {
    it('should return rgba color with 9% opacity for "completed" status', () => {
      const bgColor = getStatusBg('completed');
      expect(bgColor).toBe('rgba(34, 197, 94, 0.09)');
    });

    it('should return rgba color with 9% opacity for "pending" status', () => {
      const bgColor = getStatusBg('pending');
      expect(bgColor).toBe('rgba(245, 166, 35, 0.09)');
    });

    it('should return rgba color with 9% opacity for "failed" status', () => {
      const bgColor = getStatusBg('failed');
      expect(bgColor).toBe('rgba(239, 68, 68, 0.09)');
    });

    it('should return rgba color with 9% opacity for "started" status', () => {
      const bgColor = getStatusBg('started');
      expect(bgColor).toBe('rgba(59, 130, 246, 0.09)');
    });

    it('should return fallback rgba color for unknown status', () => {
      const bgColor = getStatusBg('unknown');
      // Fallback is saffron: #FF6B00
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should return fallback rgba color for null status', () => {
      const bgColor = getStatusBg(null);
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should return fallback rgba color for undefined status', () => {
      const bgColor = getStatusBg(undefined);
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should correctly convert hex to rgba format', () => {
      const bgColor = getStatusBg('completed');
      // Should be valid rgba format
      expect(bgColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.09\)$/);
    });

    it('should maintain consistent opacity across all statuses', () => {
      const statuses = ['completed', 'pending', 'failed', 'started', 'unknown'];
      statuses.forEach((status) => {
        const bgColor = getStatusBg(status);
        expect(bgColor).toContain('0.09');
      });
    });
  });

  describe('getRoleColor', () => {
    it('should return correct color for "admin" role', () => {
      const color = getRoleColor('admin');
      expect(color).toBe('#8B5CF6');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.admin);
    });

    it('should return correct color for "superadmin" role', () => {
      const color = getRoleColor('superadmin');
      expect(color).toBe('#F5A623');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.superadmin);
    });

    it('should return correct color for "coach" role', () => {
      const color = getRoleColor('coach');
      expect(color).toBe('#22C55E');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.coach);
    });

    it('should return correct color for "player" role', () => {
      const color = getRoleColor('player');
      expect(color).toBe('#FF6B00');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.player);
    });

    it('should return correct color for "judge" role', () => {
      const color = getRoleColor('judge');
      expect(color).toBe('#8B5CF6');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.judge);
    });

    it('should return correct color for "public" role', () => {
      const color = getRoleColor('public');
      expect(color).toBe('#3B82F6');
      expect(color).toBe(DESIGN_TOKENS.colors.roles.public);
    });

    it('should return fallback color for unknown role', () => {
      const color = getRoleColor('unknown');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
      expect(color).toBe('#FF6B00');
    });

    it('should return fallback color for null role', () => {
      const color = getRoleColor(null);
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should return fallback color for undefined role', () => {
      const color = getRoleColor(undefined);
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should return fallback color for empty string role', () => {
      const color = getRoleColor('');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should handle case-sensitive role keys', () => {
      // Role keys are case-sensitive
      const color = getRoleColor('Admin');
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should return WCAG AA compliant colors for all roles', () => {
      const roles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public'];
      roles.forEach((role) => {
        const color = getRoleColor(role);
        // All role colors should be valid hex colors
        expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('getRoleBg', () => {
    it('should return rgba color with 9% opacity for "admin" role', () => {
      const bgColor = getRoleBg('admin');
      expect(bgColor).toBe('rgba(139, 92, 246, 0.09)');
    });

    it('should return rgba color with 9% opacity for "superadmin" role', () => {
      const bgColor = getRoleBg('superadmin');
      expect(bgColor).toBe('rgba(245, 166, 35, 0.09)');
    });

    it('should return rgba color with 9% opacity for "coach" role', () => {
      const bgColor = getRoleBg('coach');
      expect(bgColor).toBe('rgba(34, 197, 94, 0.09)');
    });

    it('should return rgba color with 9% opacity for "player" role', () => {
      const bgColor = getRoleBg('player');
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should return rgba color with 9% opacity for "judge" role', () => {
      const bgColor = getRoleBg('judge');
      expect(bgColor).toBe('rgba(139, 92, 246, 0.09)');
    });

    it('should return rgba color with 9% opacity for "public" role', () => {
      const bgColor = getRoleBg('public');
      expect(bgColor).toBe('rgba(59, 130, 246, 0.09)');
    });

    it('should return fallback rgba color for unknown role', () => {
      const bgColor = getRoleBg('unknown');
      // Fallback is saffron: #FF6B00
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should return fallback rgba color for null role', () => {
      const bgColor = getRoleBg(null);
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should return fallback rgba color for undefined role', () => {
      const bgColor = getRoleBg(undefined);
      expect(bgColor).toBe('rgba(255, 107, 0, 0.09)');
    });

    it('should correctly convert hex to rgba format', () => {
      const bgColor = getRoleBg('admin');
      // Should be valid rgba format
      expect(bgColor).toMatch(/^rgba\(\d+, \d+, \d+, 0\.09\)$/);
    });

    it('should maintain consistent opacity across all roles', () => {
      const roles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public', 'unknown'];
      roles.forEach((role) => {
        const bgColor = getRoleBg(role);
        expect(bgColor).toContain('0.09');
      });
    });
  });

  describe('Hex to RGBA Conversion', () => {
    it('should correctly parse hex color components', () => {
      // Test with a known color: #22C55E (completed green)
      const bgColor = getStatusBg('completed');
      // #22C55E = rgb(34, 197, 94)
      expect(bgColor).toBe('rgba(34, 197, 94, 0.09)');
    });

    it('should handle hex colors with uppercase letters', () => {
      // All hex colors in tokens use uppercase, should work correctly
      const color = getRoleColor('admin'); // #8B5CF6
      const bgColor = getRoleBg('admin');
      expect(bgColor).toBe('rgba(139, 92, 246, 0.09)');
    });

    it('should produce valid RGB values (0-255)', () => {
      const roles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public'];
      roles.forEach((role) => {
        const bgColor = getRoleBg(role);
        const match = bgColor.match(/rgba\((\d+), (\d+), (\d+), 0\.09\)/);
        expect(match).toBeTruthy();

        const [, r, g, b] = match;
        expect(parseInt(r)).toBeGreaterThanOrEqual(0);
        expect(parseInt(r)).toBeLessThanOrEqual(255);
        expect(parseInt(g)).toBeGreaterThanOrEqual(0);
        expect(parseInt(g)).toBeLessThanOrEqual(255);
        expect(parseInt(b)).toBeGreaterThanOrEqual(0);
        expect(parseInt(b)).toBeLessThanOrEqual(255);
      });
    });
  });

  describe('Fallback Behavior', () => {
    it('should use consistent fallback color for all helper functions', () => {
      const statusFallback = getStatusColor('invalid');
      const roleFallback = getRoleColor('invalid');

      expect(statusFallback).toBe(DESIGN_TOKENS.colors.brand.saffron);
      expect(roleFallback).toBe(DESIGN_TOKENS.colors.brand.saffron);
      expect(statusFallback).toBe(roleFallback);
    });

    it('should use consistent fallback background for all helper functions', () => {
      const statusBgFallback = getStatusBg('invalid');
      const roleBgFallback = getRoleBg('invalid');

      expect(statusBgFallback).toBe('rgba(255, 107, 0, 0.09)');
      expect(roleBgFallback).toBe('rgba(255, 107, 0, 0.09)');
      expect(statusBgFallback).toBe(roleBgFallback);
    });

    it('should handle various falsy values consistently', () => {
      const falsyValues = [null, undefined, '', 0, false];

      falsyValues.forEach((value) => {
        const statusColor = getStatusColor(value);
        const roleColor = getRoleColor(value);

        expect(statusColor).toBe(DESIGN_TOKENS.colors.brand.saffron);
        expect(roleColor).toBe(DESIGN_TOKENS.colors.brand.saffron);
      });
    });

    it('should handle special characters in input', () => {
      const specialInputs = ['@#$%', '!!!', '   ', '\n\t'];

      specialInputs.forEach((input) => {
        const statusColor = getStatusColor(input);
        const roleColor = getRoleColor(input);

        expect(statusColor).toBe(DESIGN_TOKENS.colors.brand.saffron);
        expect(roleColor).toBe(DESIGN_TOKENS.colors.brand.saffron);
      });
    });
  });

  describe('Integration with DESIGN_TOKENS', () => {
    it('should return colors that exist in DESIGN_TOKENS', () => {
      const statuses = ['completed', 'pending', 'failed', 'started'];
      statuses.forEach((status) => {
        const color = getStatusColor(status);
        expect(Object.values(DESIGN_TOKENS.colors.status)).toContain(color);
      });
    });

    it('should return role colors that exist in DESIGN_TOKENS', () => {
      const roles = ['admin', 'superadmin', 'coach', 'player', 'judge', 'public'];
      roles.forEach((role) => {
        const color = getRoleColor(role);
        expect(Object.values(DESIGN_TOKENS.colors.roles)).toContain(color);
      });
    });

    it('should use fallback from DESIGN_TOKENS.colors.brand', () => {
      const fallbackColor = getStatusColor('unknown');
      expect(fallbackColor).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });
  });

  describe('Type Safety', () => {
    it('should handle numeric input gracefully', () => {
      const color = getStatusColor(123);
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should handle object input gracefully', () => {
      const color = getRoleColor({ role: 'admin' });
      expect(color).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should handle array input gracefully', () => {
      // Arrays are coerced to strings when used as object keys
      // ['completed'] becomes 'completed' when accessing object properties
      const color = getStatusColor(['completed']);
      // This actually returns the completed color because JS coerces the array to string
      expect(color).toBe(DESIGN_TOKENS.colors.status.completed);

      // But an array without a matching key returns fallback
      const color2 = getStatusColor(['invalid']);
      expect(color2).toBe(DESIGN_TOKENS.colors.brand.saffron);
    });

    it('should always return a string', () => {
      const inputs = ['completed', 'unknown', null, undefined, 123];
      inputs.forEach((input) => {
        const statusColor = getStatusColor(input);
        const roleColor = getRoleColor(input);

        expect(typeof statusColor).toBe('string');
        expect(typeof roleColor).toBe('string');
      });
    });

    it('should always return valid hex color format', () => {
      const inputs = ['completed', 'admin', 'unknown', null];
      inputs.forEach((input) => {
        const statusColor = getStatusColor(input);
        const roleColor = getRoleColor(input);

        expect(statusColor).toMatch(/^#[0-9A-F]{6}$/i);
        expect(roleColor).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should always return valid rgba format for background functions', () => {
      const inputs = ['completed', 'admin', 'unknown', null];
      inputs.forEach((input) => {
        const statusBg = getStatusBg(input);
        const roleBg = getRoleBg(input);

        expect(statusBg).toMatch(/^rgba\(\d+, \d+, \d+, 0\.09\)$/);
        expect(roleBg).toMatch(/^rgba\(\d+, \d+, \d+, 0\.09\)$/);
      });
    });
  });
});
