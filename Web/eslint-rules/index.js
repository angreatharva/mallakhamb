/**
 * Custom ESLint Rules for Design System
 * 
 * This module exports custom ESLint rules that enforce the use of design tokens
 * from Web/src/styles/tokens.js instead of hardcoded values.
 * 
 * Rules:
 * - no-hardcoded-colors: Flags hardcoded color values (hex, rgb, rgba, hsl, hsla, named colors)
 * - no-hardcoded-spacing: Flags hardcoded spacing values (px, rem, em)
 * 
 * Validates: Requirements 14.1, 14.2, 14.4
 */

import noHardcodedColors from './no-hardcoded-colors.js';
import noHardcodedSpacing from './no-hardcoded-spacing.js';

export default {
  'no-hardcoded-colors': noHardcodedColors,
  'no-hardcoded-spacing': noHardcodedSpacing,
};
