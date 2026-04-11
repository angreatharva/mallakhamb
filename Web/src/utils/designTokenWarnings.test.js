/**
 * Tests for design token validation utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  warnNonStandardColor,
  warnNonStandardSpacing,
  validateStyles,
  clearWarnings,
} from './designTokenWarnings.js';

describe('designTokenWarnings', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Set to development mode for tests
    process.env.NODE_ENV = 'development';
    // Clear warnings before each test
    clearWarnings();
    // Mock console.warn
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  describe('warnNonStandardColor', () => {
    it('should warn about non-standard hex colors', () => {
      warnNonStandardColor('#123456', 'TestComponent');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Non-standard color "#123456"')
      );
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('TestComponent'));
    });

    it('should not warn about standard colors from design tokens', () => {
      warnNonStandardColor('#FF6B00', 'TestComponent'); // saffron

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should only warn once per unique color-context combination', () => {
      warnNonStandardColor('#123456', 'TestComponent');
      warnNonStandardColor('#123456', 'TestComponent');

      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('should warn separately for different contexts', () => {
      warnNonStandardColor('#123456', 'ComponentA');
      warnNonStandardColor('#123456', 'ComponentB');

      expect(console.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('warnNonStandardSpacing', () => {
    it('should warn about non-standard spacing values', () => {
      warnNonStandardSpacing('15px', 'TestComponent');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Non-standard spacing "15px"')
      );
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('TestComponent'));
    });

    it('should not warn about standard spacing from design tokens', () => {
      warnNonStandardSpacing('16px', 'TestComponent'); // md

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should only warn once per unique spacing-context combination', () => {
      warnNonStandardSpacing('15px', 'TestComponent');
      warnNonStandardSpacing('15px', 'TestComponent');

      expect(console.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateStyles', () => {
    it('should validate color properties', () => {
      const styles = {
        color: '#123456',
        backgroundColor: '#654321',
      };

      validateStyles(styles, 'TestComponent');

      expect(console.warn).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('#123456'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('#654321'));
    });

    it('should validate spacing properties', () => {
      const styles = {
        padding: '15px',
        margin: '20px',
      };

      validateStyles(styles, 'TestComponent');

      expect(console.warn).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('15px'));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('20px'));
    });

    it('should not warn about standard values', () => {
      const styles = {
        color: '#FF6B00', // saffron
        padding: '16px', // md
      };

      validateStyles(styles, 'TestComponent');

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should handle mixed valid and invalid values', () => {
      const styles = {
        color: '#FF6B00', // valid
        backgroundColor: '#123456', // invalid
        padding: '16px', // valid
        margin: '15px', // invalid
      };

      validateStyles(styles, 'TestComponent');

      expect(console.warn).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearWarnings', () => {
    it('should reset warning tracking', () => {
      warnNonStandardColor('#123456', 'TestComponent');
      expect(console.warn).toHaveBeenCalledTimes(1);

      clearWarnings();
      console.warn.mockClear();

      warnNonStandardColor('#123456', 'TestComponent');
      expect(console.warn).toHaveBeenCalledTimes(1);
    });
  });
});
