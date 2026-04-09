/**
 * ESLint Rule: no-hardcoded-spacing
 * Flags hardcoded spacing values and suggests using design tokens instead
 * 
 * This rule detects:
 * - Pixel values (10px, 20px, etc.)
 * - Rem values (1rem, 2rem, etc.)
 * - Em values (1em, 2em, etc.)
 * 
 * Validates: Requirements 14.2, 14.4
 */

const DESIGN_TOKENS = {
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
    '4xl': '96px',
  },
};

// Convert spacing values to pixels for comparison
const SPACING_MAP = {
  '4px': 'xs',
  '8px': 'sm',
  '16px': 'md',
  '24px': 'lg',
  '32px': 'xl',
  '48px': '2xl',
  '64px': '3xl',
  '96px': '4xl',
  // Common rem equivalents (assuming 16px base)
  '0.25rem': 'xs',
  '0.5rem': 'sm',
  '1rem': 'md',
  '1.5rem': 'lg',
  '2rem': 'xl',
  '3rem': '2xl',
  '4rem': '3xl',
  '6rem': '4xl',
};

// CSS properties that typically use spacing values
const SPACING_PROPERTIES = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap',
  'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
];

/**
 * Find the closest matching spacing token for a given value
 * @param {string} value - The hardcoded spacing value
 * @returns {string|null} Suggested token path or null
 */
function findClosestSpacingToken(value) {
  const normalizedValue = value.toLowerCase().trim();
  
  // Direct match
  if (SPACING_MAP[normalizedValue]) {
    return `DESIGN_TOKENS.spacing.${SPACING_MAP[normalizedValue]}`;
  }
  
  // Try to find closest match for pixel values
  const pxMatch = normalizedValue.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch) {
    const pixels = parseFloat(pxMatch[1]);
    const spacingValues = [4, 8, 16, 24, 32, 48, 64, 96];
    
    // Find closest spacing value
    let closest = spacingValues[0];
    let minDiff = Math.abs(pixels - closest);
    
    for (const spacing of spacingValues) {
      const diff = Math.abs(pixels - spacing);
      if (diff < minDiff) {
        minDiff = diff;
        closest = spacing;
      }
    }
    
    // Only suggest if reasonably close (within 4px)
    if (minDiff <= 4) {
      const tokenName = SPACING_MAP[`${closest}px`];
      return `DESIGN_TOKENS.spacing.${tokenName} (${closest}px)`;
    }
  }
  
  // Try to find closest match for rem values
  const remMatch = normalizedValue.match(/^(\d+(?:\.\d+)?)rem$/);
  if (remMatch) {
    const rems = parseFloat(remMatch[1]);
    const pixels = rems * 16; // Assuming 16px base
    const spacingValues = [4, 8, 16, 24, 32, 48, 64, 96];
    
    let closest = spacingValues[0];
    let minDiff = Math.abs(pixels - closest);
    
    for (const spacing of spacingValues) {
      const diff = Math.abs(pixels - spacing);
      if (diff < minDiff) {
        minDiff = diff;
        closest = spacing;
      }
    }
    
    if (minDiff <= 4) {
      const tokenName = SPACING_MAP[`${closest}px`];
      return `DESIGN_TOKENS.spacing.${tokenName} (${closest}px)`;
    }
  }
  
  return null;
}

/**
 * Check if a string contains a spacing value
 * @param {string} value - The string to check
 * @param {string} propertyName - The CSS property name (if available)
 * @returns {Object|null} Match info or null
 */
function detectSpacingValue(value, propertyName = '') {
  if (!value || typeof value !== 'string') return null;
  
  // Pixel values
  const pxMatch = value.match(/\b(\d+(?:\.\d+)?px)\b/);
  if (pxMatch) {
    const pixels = parseFloat(pxMatch[1]);
    // Ignore very small values (likely borders) and very large values (likely widths/heights)
    // unless they're in spacing-related properties
    const isSpacingProperty = SPACING_PROPERTIES.some(prop => 
      propertyName.toLowerCase().includes(prop)
    );
    
    if (isSpacingProperty || (pixels >= 4 && pixels <= 100)) {
      return { type: 'px', value: pxMatch[1], full: value };
    }
  }
  
  // Rem values
  const remMatch = value.match(/\b(\d+(?:\.\d+)?rem)\b/);
  if (remMatch) {
    return { type: 'rem', value: remMatch[1], full: value };
  }
  
  // Em values
  const emMatch = value.match(/\b(\d+(?:\.\d+)?em)\b/);
  if (emMatch) {
    return { type: 'em', value: emMatch[1], full: value };
  }
  
  return null;
}

/**
 * Check if the node is in an allowed context
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
  
  // Allow in Tailwind config
  if (filename.includes('tailwind.config')) {
    return true;
  }
  
  return false;
}

/**
 * Get property name from object property node
 * @param {Object} node - AST node
 * @returns {string} Property name
 */
function getPropertyName(node) {
  if (node.key) {
    if (node.key.type === 'Identifier') {
      return node.key.name;
    }
    if (node.key.type === 'Literal') {
      return String(node.key.value);
    }
  }
  return '';
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow hardcoded spacing values, use design tokens instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      hardcodedSpacing: 'Hardcoded spacing "{{spacing}}" detected. Use design tokens instead.{{suggestion}}',
    },
    schema: [],
  },
  
  create(context) {
    // Skip if in allowed context
    if (isAllowedContext(context)) {
      return {};
    }
    
    return {
      // Check string literals in object properties (style objects)
      'Property > Literal'(node) {
        if (typeof node.value !== 'string') return;
        
        const propertyName = getPropertyName(node.parent);
        const spacingMatch = detectSpacingValue(node.value, propertyName);
        if (!spacingMatch) return;
        
        const suggestion = findClosestSpacingToken(spacingMatch.value);
        const suggestionText = suggestion 
          ? ` Consider using: ${suggestion}` 
          : ' Check DESIGN_TOKENS.spacing for available tokens.';
        
        context.report({
          node,
          messageId: 'hardcodedSpacing',
          data: {
            spacing: spacingMatch.value,
            suggestion: suggestionText,
          },
        });
      },
      
      // Check template literals
      TemplateLiteral(node) {
        for (const quasi of node.quasis) {
          const spacingMatch = detectSpacingValue(quasi.value.raw);
          if (!spacingMatch) continue;
          
          const suggestion = findClosestSpacingToken(spacingMatch.value);
          const suggestionText = suggestion 
            ? ` Consider using: ${suggestion}` 
            : ' Check DESIGN_TOKENS.spacing for available tokens.';
          
          context.report({
            node,
            messageId: 'hardcodedSpacing',
            data: {
              spacing: spacingMatch.value,
              suggestion: suggestionText,
            },
          });
        }
      },
      
      // Check JSX attribute values (e.g., style prop)
      JSXAttribute(node) {
        if (!node.value) return;
        
        let valueToCheck = null;
        let propertyName = node.name?.name || '';
        
        if (node.value.type === 'Literal') {
          valueToCheck = node.value.value;
        } else if (node.value.type === 'JSXExpressionContainer' && 
                   node.value.expression.type === 'Literal') {
          valueToCheck = node.value.expression.value;
        }
        
        if (!valueToCheck || typeof valueToCheck !== 'string') return;
        
        const spacingMatch = detectSpacingValue(valueToCheck, propertyName);
        if (!spacingMatch) return;
        
        const suggestion = findClosestSpacingToken(spacingMatch.value);
        const suggestionText = suggestion 
          ? ` Consider using: ${suggestion}` 
          : ' Check DESIGN_TOKENS.spacing for available tokens.';
        
        context.report({
          node: node.value,
          messageId: 'hardcodedSpacing',
          data: {
            spacing: spacingMatch.value,
            suggestion: suggestionText,
          },
        });
      },
    };
  },
};
