/**
 * Design Token Validation Utilities
 *
 * Provides runtime warnings in development mode for non-standard colors
 * and spacing values that don't match design tokens.
 *
 * Validates: Requirements 14.4
 */

import { DESIGN_TOKENS } from '../styles/tokens.js';

// Track which warnings have been shown to avoid spam
const shownWarnings = new Set();

/**
 * Check if we're in development mode
 * @returns {boolean} True if in development mode
 */
function isDevelopment() {
  const nodeEnv = globalThis?.process?.env?.NODE_ENV;
  return nodeEnv ? nodeEnv !== 'production' : import.meta.env.DEV;
}

/**
 * Get all valid color values from design tokens
 * @returns {Set<string>} Set of valid color hex codes (lowercase)
 */
function getValidColors() {
  const colors = new Set();

  function collectColors(obj) {
    for (const value of Object.values(obj)) {
      if (typeof value === 'string' && value.startsWith('#')) {
        colors.add(value.toLowerCase());
      } else if (typeof value === 'object' && value !== null) {
        collectColors(value);
      }
    }
  }

  collectColors(DESIGN_TOKENS.colors);
  return colors;
}

/**
 * Get all valid spacing values from design tokens
 * @returns {Set<string>} Set of valid spacing values
 */
function getValidSpacing() {
  return new Set(Object.values(DESIGN_TOKENS.spacing));
}

// Cache valid values
const VALID_COLORS = getValidColors();
const VALID_SPACING = getValidSpacing();

/**
 * Normalize color value for comparison
 * @param {string} color - Color value to normalize
 * @returns {string|null} Normalized color or null if invalid
 */
function normalizeColor(color) {
  if (!color || typeof color !== 'string') return null;

  const trimmed = color.trim().toLowerCase();

  // Hex colors
  if (trimmed.startsWith('#')) {
    return trimmed;
  }

  // RGB/RGBA colors - we can't easily compare these, so skip
  if (trimmed.startsWith('rgb')) {
    return null;
  }

  // HSL/HSLA colors - we can't easily compare these, so skip
  if (trimmed.startsWith('hsl')) {
    return null;
  }

  return trimmed;
}

/**
 * Warn about non-standard color usage in development mode
 * @param {string} color - The color value to check
 * @param {string} context - Context where the color is used (for better error messages)
 */
export function warnNonStandardColor(color, context = 'component') {
  if (!isDevelopment()) return;

  const normalized = normalizeColor(color);
  if (!normalized) return;

  // Check if it's a valid design token color
  if (VALID_COLORS.has(normalized)) return;

  // Create unique key for this warning
  const warningKey = `color:${normalized}:${context}`;
  if (shownWarnings.has(warningKey)) return;

  shownWarnings.add(warningKey);

  console.warn(
    `[Design System] Non-standard color "${color}" used in ${context}. ` +
      `Consider using a color from DESIGN_TOKENS.colors instead. ` +
      `See Web/src/styles/tokens.js for available colors.`
  );
}

/**
 * Warn about non-standard spacing usage in development mode
 * @param {string} spacing - The spacing value to check
 * @param {string} context - Context where the spacing is used (for better error messages)
 */
export function warnNonStandardSpacing(spacing, context = 'component') {
  if (!isDevelopment()) return;

  if (!spacing || typeof spacing !== 'string') return;

  const trimmed = spacing.trim();

  // Check if it's a valid design token spacing
  if (VALID_SPACING.has(trimmed)) return;

  // Create unique key for this warning
  const warningKey = `spacing:${trimmed}:${context}`;
  if (shownWarnings.has(warningKey)) return;

  shownWarnings.add(warningKey);

  console.warn(
    `[Design System] Non-standard spacing "${spacing}" used in ${context}. ` +
      `Consider using a spacing value from DESIGN_TOKENS.spacing instead. ` +
      `See Web/src/styles/tokens.js for available spacing values.`
  );
}

/**
 * Validate a style object and warn about non-standard values
 * @param {Object} styles - Style object to validate
 * @param {string} context - Context where the styles are used
 */
export function validateStyles(styles, context = 'component') {
  if (!isDevelopment() || !styles || typeof styles !== 'object') return;

  // Properties that typically contain colors
  const colorProperties = [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'fill',
    'stroke',
  ];

  // Properties that typically contain spacing
  const spacingProperties = [
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
    'rowGap',
    'columnGap',
    'width',
    'height',
    'minWidth',
    'minHeight',
    'maxWidth',
    'maxHeight',
  ];

  for (const [property, value] of Object.entries(styles)) {
    if (typeof value !== 'string') continue;

    // Check color properties
    if (colorProperties.includes(property)) {
      warnNonStandardColor(value, `${context}.${property}`);
    }

    // Check spacing properties
    if (spacingProperties.includes(property)) {
      // Only warn for px, rem, em values
      if (/\d+(px|rem|em)/.test(value)) {
        warnNonStandardSpacing(value, `${context}.${property}`);
      }
    }
  }
}

/**
 * Create a validated style object that warns about non-standard values
 * This is a helper for creating style objects with automatic validation
 *
 * @param {Object} styles - Style object
 * @param {string} context - Context identifier
 * @returns {Object} The same style object (validation happens as side effect)
 */
export function createValidatedStyles(styles, context = 'component') {
  validateStyles(styles, context);
  return styles;
}

/**
 * Clear all shown warnings (useful for testing)
 */
export function clearWarnings() {
  shownWarnings.clear();
}

export default {
  warnNonStandardColor,
  warnNonStandardSpacing,
  validateStyles,
  createValidatedStyles,
  clearWarnings,
};
