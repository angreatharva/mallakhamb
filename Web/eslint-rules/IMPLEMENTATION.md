# ESLint Rules Implementation Summary

## Overview

This implementation provides custom ESLint rules that enforce the use of design tokens from `Web/src/styles/tokens.js` instead of hardcoded values. The rules help maintain consistency across the codebase and make it easier to update the design system.

## Implemented Rules

### 1. no-hardcoded-colors

**Purpose**: Flags hardcoded color values and suggests using design tokens instead.

**Detection Capabilities**:
- Hex colors: `#FFFFFF`, `#fff`, `#FF6B00AA`
- RGB/RGBA colors: `rgb(255, 255, 255)`, `rgba(255, 107, 0, 0.5)`
- HSL/HSLA colors: `hsl(0, 100%, 50%)`, `hsla(0, 100%, 50%, 0.5)`
- Named colors: `red`, `blue`, `white`, `black`, etc.

**Smart Suggestions**:
- Direct hex match: Suggests exact token path
- Color pattern matching: Suggests similar tokens based on color characteristics
- Fallback: Points to DESIGN_TOKENS.colors for manual lookup

**Allowed Contexts** (no warnings):
- Design tokens file (`tokens.js`, `tokens.ts`)
- Test files (`.test.js`, `.spec.js`)
- Storybook stories (`.stories.js`)

### 2. no-hardcoded-spacing

**Purpose**: Flags hardcoded spacing values and suggests using design tokens instead.

**Detection Capabilities**:
- Pixel values: `10px`, `20px`, `100px`
- Rem values: `1rem`, `2rem`, `0.5rem`
- Em values: `1em`, `2em`, `0.5em`

**Smart Suggestions**:
- Direct match: Suggests exact token path
- Closest match: Finds nearest spacing value (within 4px tolerance)
- Rem conversion: Converts rem to px (assuming 16px base) for comparison

**Allowed Contexts** (no warnings):
- Design tokens file (`tokens.js`, `tokens.ts`)
- Test files (`.test.js`, `.spec.js`)
- Storybook stories (`.stories.js`)
- Tailwind config (`tailwind.config.js`)

## Development Mode Warnings

In addition to ESLint rules, the implementation provides runtime warnings in development mode through `Web/src/utils/designTokenWarnings.js`.

**Features**:
- `warnNonStandardColor()`: Warns about non-standard color usage
- `warnNonStandardSpacing()`: Warns about non-standard spacing usage
- `validateStyles()`: Validates entire style objects
- `createValidatedStyles()`: Helper for creating validated style objects

**Benefits**:
- Catches dynamic values that ESLint can't detect
- Provides immediate feedback during development
- Only shows each unique warning once (no spam)
- Zero runtime overhead in production

## Configuration

The rules are integrated into `Web/eslint.config.js`:

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

**Rule Severity**:
- Currently set to `'warn'` for gradual adoption
- Can be upgraded to `'error'` once codebase is migrated
- Can be disabled per-file or per-line if needed

## Testing

### ESLint Rule Tests

Tests are located in:
- `Web/eslint-rules/no-hardcoded-colors.test.js`
- `Web/eslint-rules/no-hardcoded-spacing.test.js`

**Test Coverage**:
- Valid cases (using design tokens)
- Invalid cases (hardcoded values)
- Allowed contexts (tokens file, test files, stories)
- JSX attribute detection
- Smart suggestion generation

### Runtime Warning Tests

Tests are located in:
- `Web/src/utils/designTokenWarnings.test.js`

**Test Coverage**:
- Color validation
- Spacing validation
- Style object validation
- Warning deduplication
- Context tracking

## Usage Examples

### ESLint Rules

```javascript
// ❌ Bad - triggers warning
const styles = {
  color: '#FF6B00',
  padding: '16px',
};

// ✅ Good - no warning
import { DESIGN_TOKENS } from '../styles/tokens';

const styles = {
  color: DESIGN_TOKENS.colors.brand.saffron,
  padding: DESIGN_TOKENS.spacing.md,
};
```

### Runtime Warnings

```javascript
import { validateStyles } from '../utils/designTokenWarnings';

// Validate a style object
const styles = {
  color: '#FF0000', // Will warn in development
  padding: '15px',  // Will warn in development
};

validateStyles(styles, 'MyComponent');
```

## Migration Strategy

1. **Phase 1**: Rules set to `'warn'` (current)
   - Developers see warnings but builds don't fail
   - Gradual awareness and adoption

2. **Phase 2**: Fix high-priority files
   - Start with new components
   - Fix files as they're modified
   - Use `npm run lint -- --fix` where possible

3. **Phase 3**: Upgrade to `'error'`
   - Once majority of codebase is migrated
   - Prevents new hardcoded values
   - Enforces design system usage

## Performance Considerations

**ESLint Rules**:
- Run during linting phase (not runtime)
- Minimal performance impact
- Can be run in CI/CD pipeline

**Runtime Warnings**:
- Only active in development mode
- Zero overhead in production
- Warnings are deduplicated to prevent spam

## Maintenance

### Adding New Design Tokens

When adding new tokens to `Web/src/styles/tokens.js`:

1. Update the token maps in ESLint rules:
   - `Web/eslint-rules/no-hardcoded-colors.js` - Update `DESIGN_TOKENS` constant
   - `Web/eslint-rules/no-hardcoded-spacing.js` - Update `DESIGN_TOKENS` and `SPACING_MAP`

2. Update suggestion logic if needed:
   - `findClosestToken()` in `no-hardcoded-colors.js`
   - `findClosestSpacingToken()` in `no-hardcoded-spacing.js`

3. Runtime warnings automatically pick up new tokens (no changes needed)

### Updating Allowed Contexts

To add new file patterns to allowed contexts:

1. Edit `isAllowedContext()` function in each rule
2. Add new filename patterns to the checks
3. Update documentation

## Troubleshooting

### Rule Not Working

1. Restart your editor/IDE after updating ESLint config
2. Check that the file is not in an allowed context
3. Verify ESLint config is loading custom rules correctly
4. Run `npm run lint` to see if warnings appear

### Too Many Warnings

1. Run linter on specific directories: `npm run lint -- src/components`
2. Use `--fix` flag to auto-fix simple issues
3. Gradually migrate files to use design tokens
4. Consider disabling rules for legacy files temporarily

### False Positives

1. Check if the file should be in an allowed context
2. Add file pattern to `isAllowedContext()` if appropriate
3. Use inline comments to disable rule for specific cases:
   ```javascript
   // eslint-disable-next-line design-system/no-hardcoded-colors
   const color = '#FF6B00';
   ```

## Benefits

1. **Consistency**: Enforces design system usage across the codebase
2. **Maintainability**: Makes it easier to update colors and spacing globally
3. **Developer Experience**: Provides helpful suggestions for correct tokens
4. **Gradual Adoption**: Warnings allow for incremental migration
5. **Flexibility**: Can be disabled per-file or per-line when needed
6. **Comprehensive**: Catches both static (ESLint) and dynamic (runtime) violations

## Requirements Validation

This implementation validates the following requirements:

- **Requirement 14.1**: ✅ ESLint rule to flag hardcoded color values
- **Requirement 14.2**: ✅ ESLint rule to flag hardcoded spacing values
- **Requirement 14.4**: ✅ Warnings in development mode for non-standard colors

## Future Enhancements

Potential improvements for future iterations:

1. **Auto-fix Support**: Implement automatic fixes for simple cases
2. **Visual Audit Tool**: Create tool to display all colors used in application (Requirement 14.3)
3. **Color Palette Visualization**: Generate visual documentation of design tokens (Requirement 14.5)
4. **Token Usage Analytics**: Track which tokens are most/least used
5. **Migration Dashboard**: Show progress of design token adoption
6. **IDE Integration**: Provide autocomplete for design tokens in IDEs

## References

- [ESLint Custom Rules Documentation](https://eslint.org/docs/latest/extend/custom-rules)
- [Design Tokens Specification](../src/styles/tokens.js)
- [Design System Documentation](../src/components/design-system/README.md)
- [Migration Guide](../src/components/design-system/MIGRATION.md)
