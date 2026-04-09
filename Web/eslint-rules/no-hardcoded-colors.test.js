/**
 * Tests for no-hardcoded-colors ESLint rule
 * 
 * Note: These tests verify the rule structure and basic functionality.
 * For comprehensive ESLint rule testing, run: npx eslint --rule 'no-hardcoded-colors: error' <file>
 */

import { describe, it, expect } from 'vitest';
import rule from './no-hardcoded-colors.js';

describe('no-hardcoded-colors', () => {
  it('should have correct meta information', () => {
    expect(rule.meta).toBeDefined();
    expect(rule.meta.type).toBe('suggestion');
    expect(rule.meta.docs).toBeDefined();
    expect(rule.meta.docs.description).toContain('hardcoded color');
    expect(rule.meta.messages).toBeDefined();
    expect(rule.meta.messages.hardcodedColor).toBeDefined();
  });

  it('should have a create function', () => {
    expect(rule.create).toBeDefined();
    expect(typeof rule.create).toBe('function');
  });

  it('should return visitor methods', () => {
    const context = {
      getFilename: () => 'test.js',
      report: () => {},
    };
    
    const visitor = rule.create(context);
    expect(visitor).toBeDefined();
    expect(typeof visitor).toBe('object');
  });

  it('should skip files in allowed contexts', () => {
    const tokensContext = {
      getFilename: () => 'tokens.js',
      report: () => {},
    };
    
    const visitor = rule.create(tokensContext);
    // Should return empty object for allowed contexts
    expect(Object.keys(visitor).length).toBe(0);
  });
});
