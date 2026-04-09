/**
 * ESLint Rule: no-hardcoded-colors
 * Flags hardcoded color values and suggests using design tokens instead
 * 
 * This rule detects:
 * - Hex colors (#FFFFFF, #fff)
 * - RGB/RGBA colors (rgb(), rgba())
 * - HSL/HSLA colors (hsl(), hsla())
 * - Named colors (red, blue, etc.)
 * 
 * Validates: Requirements 14.1, 14.4
 */

const DESIGN_TOKENS = {
  colors: {
    brand: {
      saffron: '#FF6B00',
      saffronLight: '#FF8C38',
      saffronDark: '#CC5500',
      gold: '#F5A623',
      cream: '#FFF8F0',
    },
    roles: {
      admin: '#8B5CF6',
      superadmin: '#F5A623',
      coach: '#22C55E',
      player: '#FF6B00',
      judge: '#8B5CF6',
      public: '#3B82F6',
    },
    semantic: {
      success: '#22C55E',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6',
    },
    surfaces: {
      dark: '#0A0A0A',
      darkCard: '#111111',
      darkElevated: '#161616',
      darkPanel: '#1A1A1A',
    },
    text: {
      primary: '#FFFFFF',
    },
  },
};

// Common CSS named colors to detect
const NAMED_COLORS = [
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'navy',
  'teal', 'aqua', 'maroon', 'olive', 'silver', 'fuchsia', 'indigo',
];

/**
 * Find the closest matching design token for a given color
 * @param {string} color - The hardcoded color value
 * @returns {string|null} Suggested token path or null
 */
function findClosestToken(color) {
  const normalizedColor = color.toLowerCase().replace(/\s/g, '');
  
  // Direct hex match
  for (const [category, tokens] of Object.entries(DESIGN_TOKENS.colors)) {
    for (const [tokenName, tokenValue] of Object.entries(tokens)) {
      if (tokenValue.toLowerCase() === normalizedColor) {
        return `DESIGN_TOKENS.colors.${category}.${tokenName}`;
      }
    }
  }
  
  // Suggest based on color name or common patterns
  if (normalizedColor.includes('fff') || normalizedColor === 'white') {
    return 'DESIGN_TOKENS.colors.text.primary';
  }
  if (normalizedColor.includes('000') || normalizedColor === 'black') {
    return 'DESIGN_TOKENS.colors.surfaces.dark';
  }
  if (normalizedColor.includes('red') || normalizedColor.includes('f44') || normalizedColor.includes('ef4')) {
    return 'DESIGN_TOKENS.colors.semantic.error';
  }
  if (normalizedColor.includes('green') || normalizedColor.includes('22c')) {
    return 'DESIGN_TOKENS.colors.semantic.success';
  }
  if (normalizedColor.includes('blue') || normalizedColor.includes('3b8')) {
    return 'DESIGN_TOKENS.colors.semantic.info';
  }
  if (normalizedColor.includes('orange') || normalizedColor.includes('ff6') || normalizedColor.includes('f59')) {
    return 'DESIGN_TOKENS.colors.brand.saffron or DESIGN_TOKENS.colors.semantic.warning';
  }
  if (normalizedColor.includes('purple') || normalizedColor.includes('8b5') || normalizedColor.includes('a85')) {
    return 'DESIGN_TOKENS.colors.roles.admin';
  }
  if (normalizedColor.includes('gold') || normalizedColor.includes('f5a')) {
    return 'DESIGN_TOKENS.colors.brand.gold';
  }
  
  return null;
}

/**
 * Check if a string contains a color value
 * @param {string} value - The string to check
 * @returns {Object|null} Match info or null
 */
function detectColorValue(value) {
  if (!value || typeof value !== 'string') return null;
  
  // Hex colors: #RGB, #RRGGBB, #RGBA, #RRGGBBAA
  const hexMatch = value.match(/#([0-9a-fA-F]{3,8})\b/);
  if (hexMatch) {
    return { type: 'hex', value: hexMatch[0], full: value };
  }
  
  // RGB/RGBA colors
  const rgbMatch = value.match(/rgba?\s*\([^)]+\)/i);
  if (rgbMatch) {
    return { type: 'rgb', value: rgbMatch[0], full: value };
  }
  
  // HSL/HSLA colors
  const hslMatch = value.match(/hsla?\s*\([^)]+\)/i);
  if (hslMatch) {
    return { type: 'hsl', value: hslMatch[0], full: value };
  }
  
  // Named colors (only if it's the entire value or part of a CSS property)
  const lowerValue = value.toLowerCase().trim();
  for (const namedColor of NAMED_COLORS) {
    if (lowerValue === namedColor || lowerValue.startsWith(namedColor + ' ') || lowerValue.endsWith(' ' + namedColor)) {
      return { type: 'named', value: namedColor, full: value };
    }
  }
  
  return null;
}

/**
 * Check if the node is in an allowed context (e.g., design tokens file)
 * @param {Object} context - ESLint context
 * @returns {boolean} True if in allowed context
 */
function isAllowedContext(context) {
  const filename = context.getFilename();
  
  // Allow in design tokens file
  if (filename.includes('tokens.js') || filename.includes('tokens.ts')) {
    return true;
  }
  
  // Allow in test files
  if (filename.includes('.test.') || filename.includes('.spec.')) {
    return true;
  }
  
  // Allow in Storybook stories
  if (filename.includes('.stories.')) {
    return true;
  }
  
  return false;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded color values, use design tokens instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      hardcodedColor: 'Hardcoded color "{{color}}" detected. Use design tokens instead.{{suggestion}}',
    },
    schema: [],
  },
  
  create(context) {
    // Skip if in allowed context
    if (isAllowedContext(context)) {
      return {};
    }
    
    return {
      // Check string literals
      Literal(node) {
        if (typeof node.value !== 'string') return;
        
        const colorMatch = detectColorValue(node.value);
        if (!colorMatch) return;
        
        const suggestion = findClosestToken(colorMatch.value);
        const suggestionText = suggestion 
          ? ` Consider using: ${suggestion}` 
          : ' Check DESIGN_TOKENS.colors for available tokens.';
        
        context.report({
          node,
          messageId: 'hardcodedColor',
          data: {
            color: colorMatch.value,
            suggestion: suggestionText,
          },
        });
      },
      
      // Check template literals
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const colorMatch = detectColorValue(quasi.value.raw);
          if (!colorMatch) continue;
          
          const suggestion = findClosestToken(colorMatch.value);
          const suggestionText = suggestion 
            ? ` Consider using: ${suggestion}` 
            : ' Check DESIGN_TOKENS.colors for available tokens.';
          
          context.report({
            node,
            messageId: 'hardcodedColor',
            data: {
              color: colorMatch.value,
              suggestion: suggestionText,
            },
          });
        }
      },
      
      // Check JSX attribute values
      JSXAttribute(node) {
        if (!node.value) return;
        
        let valueToCheck = null;
        
        if (node.value.type === 'Literal') {
          valueToCheck = node.value.value;
        } else if (node.value.type === 'JSXExpressionContainer' && 
                   node.value.expression.type === 'Literal') {
          valueToCheck = node.value.expression.value;
        }
        
        if (!valueToCheck || typeof valueToCheck !== 'string') return;
        
        const colorMatch = detectColorValue(valueToCheck);
        if (!colorMatch) return;
        
        const suggestion = findClosestToken(colorMatch.value);
        const suggestionText = suggestion 
          ? ` Consider using: ${suggestion}` 
          : ' Check DESIGN_TOKENS.colors for available tokens.';
        
        context.report({
          node: node.value,
          messageId: 'hardcodedColor',
          data: {
            color: colorMatch.value,
            suggestion: suggestionText,
          },
        });
      },
    };
  },
};
