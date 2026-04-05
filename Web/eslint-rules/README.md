# Custom ESLint Rules for Design System

This directory contains custom ESLint rules that enforce the use of design tokens from `Web/src/styles/tokens.js` instead of hardcoded values.

## Rules

### `no-hardcoded-colors`

Flags hardcoded color values and suggests using design tokens instead.

**Detects:**
- Hex colors: `#FFFFFF`, `#fff`, `#FF6B00AA`
- RGB/RGBA colors: `rgb(255, 255, 255)`, `rgba(255, 107, 0, 0.5)`
- HSL/HSLA colors: `hsl(0, 100%, 50%)`, `hsla(0, 100%, 50%, 0.5)`
- Named colors: `red`, `blue`, `white`, `black`, etc.

**Examples:**

```javascript
// ❌ Bad - hardcoded colors
const styles = {
  color: '#FF6B00',
  backgroundColor: 'rgb(255, 107, 0)',
  borderColor: 'red',
};

// ✅ Good - using design tokens
import { DESIGN_TOKENS } from '../styles/tokens';

const styles = {
  color: DESIGN_TOKENS.colors.brand.saffron,
  backgroundColor: DESIGN_TOKENS.colors.brand.saffron,
  borderColor: DESIGN_TOKENS.colors.semantic.error,
};
```

**Allowed contexts:**
- Design tokens file (`tokens.js`, `tokens.ts`)
- Test files (`.test.js`, `.spec.js`)
- Storybook stories (`.stories.js`)

### `no-hardcoded-spacing`

Flags hardcoded spacing values and suggests using design tokens instead.

**Detects:**
- Pixel values: `10px`, `20px`, `100px`
- Rem values: `1rem`, `2rem`, `0.5rem`
- Em values: `1em`, `2em`, `0.5em`

**Examples:**

```javascript
// ❌ Bad - hardcoded spacing
const styles = {
  padding: '16px',
  margin: '24px',
  gap: '8px',
};

// ✅ Good - using design tokens
import { DESIGN_TOKENS } from '../styles/tokens';

const styles = {
  padding: DESIGN_TOKENS.spacing.md,
  margin: DESIGN_TOKENS.spacing.lg,
  gap: DESIGN_TOKENS.spacing.sm,
};
```

**Allowed contexts:**
- Design tokens file (`tokens.js`, `tokens.ts`)
- Test files (`.test.js`, `.spec.js`)
- Storybook stories (`.stories.js`)
- Tailwind config (`tailwind.config.js`)

## Configuration

The rules are configured in `Web/eslint.config.js`:

```javascript
import customRules from './eslint-rules/index.js'

export default defineConfig([
  {
    plugins: {
      'design-system': {
        rules: customRules,
      },
    },
    rules: {
      'design-system/no-hardcoded-colors': 'warn',
      'design-system/no-hardcoded-spacing': 'warn',
    },
  },
])
```

## Running the Linter

```bash
# Run ESLint on all files
npm run lint

# Run ESLint with auto-fix (where possible)
npm run lint -- --fix
```

## Development Mode Warnings

In addition to ESLint rules, the design system provides runtime warnings in development mode for non-standard colors and spacing values.

**Usage:**

```javascript
import { warnNonStandardColor, warnNonStandardSpacing, validateStyles } from '../utils/designTokenWarnings';

// Warn about a specific color
warnNonStandardColor('#FF0000', 'MyComponent');

// Warn about a specific spacing value
warnNonStandardSpacing('15px', 'MyComponent');

// Validate an entire style object
const styles = {
  color: '#FF0000',
  padding: '15px',
};
validateStyles(styles, 'MyComponent');
```

These warnings will only appear in development mode and will not spam the console (each unique warning is shown only once).

## Disabling Rules

If you need to disable a rule for a specific line or file:

```javascript
// Disable for a single line
const color = '#FF6B00'; // eslint-disable-line design-system/no-hardcoded-colors

// Disable for the next line
// eslint-disable-next-line design-system/no-hardcoded-colors
const color = '#FF6B00';

// Disable for an entire file
/* eslint-disable design-system/no-hardcoded-colors */
```

**Note:** Only disable rules when absolutely necessary (e.g., for third-party library integration or specific edge cases).

## Available Design Tokens

### Colors

```javascript
DESIGN_TOKENS.colors.brand.saffron        // #FF6B00
DESIGN_TOKENS.colors.brand.gold           // #F5A623
DESIGN_TOKENS.colors.roles.admin          // #8B5CF6 (purple)
DESIGN_TOKENS.colors.roles.coach          // #22C55E (green)
DESIGN_TOKENS.colors.semantic.success     // #22C55E
DESIGN_TOKENS.colors.semantic.error       // #EF4444
DESIGN_TOKENS.colors.surfaces.dark        // #0A0A0A
DESIGN_TOKENS.colors.text.primary         // #FFFFFF
```

See `Web/src/styles/tokens.js` for the complete list.

### Spacing

```javascript
DESIGN_TOKENS.spacing.xs    // 4px
DESIGN_TOKENS.spacing.sm    // 8px
DESIGN_TOKENS.spacing.md    // 16px
DESIGN_TOKENS.spacing.lg    // 24px
DESIGN_TOKENS.spacing.xl    // 32px
DESIGN_TOKENS.spacing['2xl'] // 48px
DESIGN_TOKENS.spacing['3xl'] // 64px
DESIGN_TOKENS.spacing['4xl'] // 96px
```

## Contributing

When adding new design tokens:

1. Add the token to `Web/src/styles/tokens.js`
2. Update the token maps in the ESLint rules if needed:
   - `Web/eslint-rules/no-hardcoded-colors.js` - Update `DESIGN_TOKENS` and `findClosestToken()`
   - `Web/eslint-rules/no-hardcoded-spacing.js` - Update `DESIGN_TOKENS` and `SPACING_MAP`
3. Update this README with the new tokens
4. Run the linter to ensure no regressions

## Troubleshooting

### Rule not working

1. Make sure you've restarted your editor/IDE after updating ESLint config
2. Check that the file is not in an allowed context (test files, stories, etc.)
3. Verify the ESLint config is loading the custom rules correctly

### Too many warnings

1. Consider running the linter on specific directories first: `npm run lint -- src/components`
2. Use `--fix` flag to auto-fix simple issues
3. Gradually migrate files to use design tokens

### False positives

If a rule is flagging valid code:
1. Check if the file should be in an allowed context
2. Consider adding the file pattern to the `isAllowedContext()` function
3. Use inline comments to disable the rule for specific cases

## References

- [ESLint Custom Rules Documentation](https://eslint.org/docs/latest/extend/custom-rules)
- [Design System Documentation](../src/components/design-system/README.md)
- [Migration Guide](../src/components/design-system/MIGRATION.md)
