# Design Token Audit Tool

## Overview

The Design Token Audit tool provides a visual reference for all design tokens used in the Mallakhamb platform. It helps designers and developers review the design system, ensure consistency, and understand the intended use case for each token.

**Validates: Requirements 14.3, 14.5, 14.6, 14.7**

## Features

### 1. Color Palette Visualization
- **Brand Colors**: Primary brand colors (saffron, gold, cream)
- **Role Colors**: Colors for different user roles (admin, coach, player, judge)
- **Semantic Colors**: Colors with semantic meaning (success, error, warning, info)
- **Status Colors**: Colors for different status states
- **Surface Colors**: Background colors for different elevation levels
- **Border Colors**: Border colors for different emphasis levels
- **Text Colors**: Text colors with WCAG AA compliant contrast ratios
- **Extended Palette**: Additional colors for specific use cases

### 2. Interactive Color Swatches
- Click any color swatch to copy the hex value to clipboard
- Hover effects for better interactivity
- Visual feedback when color is copied

### 3. Use Case Documentation
Each color token includes:
- **Name**: Token identifier
- **Value**: Hex color code or RGBA value
- **Use Case**: Intended usage and context

### 4. Helper Function Demos
Visual demonstrations of:
- `getStatusColor()`: Dynamic status color selection
- `getRoleColor()`: Dynamic role color selection
- `getStatusBg()`: Status background colors with opacity
- `getRoleBg()`: Role background colors with opacity

### 5. Spacing Scale
Visual representation of all spacing values with:
- Token name (xs, sm, md, lg, xl, etc.)
- Pixel value
- Visual bar showing the actual size

### 6. Typography Scale
Comprehensive typography documentation:
- **Font Sizes**: All available font sizes with live examples
- **Font Weights**: All font weights with live examples
- **Line Heights**: Typography line height values

### 7. Other Design Tokens
- **Border Radius**: All border radius values with visual examples
- **Shadows**: All shadow values with visual demonstrations
- **Animation Easings**: Easing functions for animations
- **Breakpoints**: Responsive design breakpoints
- **Z-Index Scale**: Layering values for stacking contexts

## Usage

### As a Standalone Page

1. **Add to Router** (in `App.jsx` or your router configuration):

```jsx
import DesignTokenAuditPage from './pages/DesignTokenAuditPage';

// In your routes:
<Route path="/design-tokens" element={<DesignTokenAuditPage />} />
```

2. **Access in Browser**:
```
http://localhost:5173/design-tokens
```

### As a Component

```jsx
import { DesignTokenAudit } from '../components/design-system/audit';

function MyPage() {
  return (
    <div>
      <DesignTokenAudit />
    </div>
  );
}
```

### In Storybook

```jsx
// DesignTokenAudit.stories.jsx
import DesignTokenAudit from './DesignTokenAudit';

export default {
  title: 'Design System/Audit/DesignTokenAudit',
  component: DesignTokenAudit,
};

export const Default = () => <DesignTokenAudit />;
```

## Use Cases

### For Designers

1. **Design Review**: Review all colors and ensure consistency
2. **Color Selection**: Find the right color for a specific use case
3. **Accessibility Check**: Verify WCAG AA compliant colors
4. **Documentation**: Reference for design specifications

### For Developers

1. **Token Reference**: Quick lookup for token values
2. **Implementation Guide**: Understand intended use cases
3. **Copy Values**: Click to copy hex values for quick use
4. **Consistency Check**: Ensure using correct tokens

### For QA/Testing

1. **Visual Regression**: Compare against design specifications
2. **Accessibility Testing**: Verify contrast ratios
3. **Consistency Audit**: Check for hardcoded values

## Token Categories

### Colors

#### Brand Colors
- `saffron` (#FF6B00): Primary brand color, CTAs, highlights
- `saffronLight` (#FF8C38): Hover states, lighter accents
- `saffronDark` (#CC5500): Active states, darker accents
- `gold` (#F5A623): Secondary brand color, premium features
- `cream` (#FFF8F0): Light backgrounds, subtle highlights

#### Role Colors (WCAG AA Compliant)
- `admin` (#8B5CF6): Admin user interface theming
- `superadmin` (#F5A623): Super admin interface theming
- `coach` (#22C55E): Coach interface theming
- `player` (#FF6B00): Player interface theming
- `judge` (#8B5CF6): Judge interface theming
- `public` (#3B82F6): Public-facing pages

#### Semantic Colors
- `success` (#22C55E): Success messages, completed states
- `error` (#EF4444): Error messages, failed states
- `warning` (#F59E0B): Warning messages, caution states
- `info` (#3B82F6): Informational messages, neutral states

#### Status Colors
- `completed` (#22C55E): Completed tasks, successful operations
- `pending` (#F5A623): Pending tasks, in-progress operations
- `failed` (#EF4444): Failed tasks, error states
- `started` (#3B82F6): Started tasks, active operations

#### Surface Colors
- `dark` (#0A0A0A): Main background color
- `darkCard` (#111111): Card backgrounds, elevated surfaces
- `darkElevated` (#161616): Elevated panels, modals
- `darkPanel` (#1A1A1A): Admin panels, sidebar backgrounds

#### Border Colors
- `saffron` (rgba(255,107,0,0.15)): Primary borders, highlighted elements
- `subtle` (rgba(255,255,255,0.06)): Subtle borders, dividers
- `mid` (rgba(255,255,255,0.10)): Medium emphasis borders
- `bright` (rgba(255,107,0,0.38)): High emphasis borders, focus states

#### Text Colors (WCAG AA Compliant)
- `primary` (#FFFFFF): Primary text, headings
- `secondary` (rgba(255,255,255,0.65)): Secondary text, descriptions (4.5:1 contrast)
- `muted` (rgba(255,255,255,0.45)): Muted text, placeholders (3:1 contrast)
- `disabled` (rgba(255,255,255,0.30)): Disabled text, inactive elements

### Spacing

- `xs` (4px): Minimal spacing, tight layouts
- `sm` (8px): Small spacing, compact elements
- `md` (16px): Medium spacing, default gaps
- `lg` (24px): Large spacing, section padding
- `xl` (32px): Extra large spacing, major sections
- `2xl` (48px): 2x extra large spacing
- `3xl` (64px): 3x extra large spacing
- `4xl` (96px): 4x extra large spacing

### Typography

#### Font Sizes
- `xs` (11px): Tiny text, captions
- `sm` (13px): Small text, labels
- `base` (16px): Body text, default size
- `lg` (18px): Large text, subheadings
- `xl` (20px): Extra large text
- `2xl` (24px): Headings
- `3xl` (30px): Large headings
- `4xl` (36px): Hero headings
- `5xl` (48px): Display headings

#### Font Weights
- `normal` (400): Regular text
- `medium` (500): Medium emphasis
- `semibold` (600): Strong emphasis
- `bold` (700): Bold text, headings
- `black` (900): Extra bold, display text

### Other Tokens

#### Border Radius
- `sm` (4px): Subtle rounding
- `md` (8px): Default rounding
- `lg` (12px): Large rounding
- `xl` (16px): Extra large rounding
- `2xl` (24px): Very large rounding
- `full` (9999px): Fully rounded (pills, circles)

#### Shadows
- `sm`: Subtle shadow for slight elevation
- `md`: Default shadow for cards
- `lg`: Large shadow for modals
- `xl`: Extra large shadow for popovers
- `2xl`: Maximum shadow for emphasis
- `saffron`: Brand-colored shadow

## Accessibility

All colors in the design system meet WCAG AA contrast requirements:

- **Normal Text** (< 18pt): 4.5:1 contrast ratio
- **Large Text** (≥ 18pt): 3:1 contrast ratio
- **Focus Indicators**: 3:1 contrast ratio

The audit tool helps verify these requirements by displaying all colors with their intended use cases.

## Development Workflow

### Adding New Tokens

1. Add the token to `Web/src/styles/tokens.js`
2. The audit tool will automatically display it
3. Add use case documentation in the `useCases` object
4. Review in the audit tool to ensure consistency

### Reviewing Changes

1. Open the audit tool in your browser
2. Navigate through the tabs (Colors, Spacing, Typography, Other)
3. Verify new tokens appear correctly
4. Check use case documentation is clear
5. Test color copying functionality

### Design Review Process

1. **Initial Review**: Designer reviews all tokens in audit tool
2. **Feedback**: Designer provides feedback on consistency
3. **Updates**: Developer updates tokens based on feedback
4. **Final Review**: Designer approves changes in audit tool

## Integration with Linting

The audit tool complements the ESLint rules:

- **no-hardcoded-colors**: Flags hardcoded color values
- **no-hardcoded-spacing**: Flags hardcoded spacing values

Use the audit tool to find the correct token when the linter flags a hardcoded value.

## Browser Support

The audit tool works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

Features used:
- CSS Grid for layouts
- Flexbox for alignment
- Clipboard API for copy functionality
- CSS custom properties for theming

## Performance

The audit tool is optimized for performance:
- Static rendering (no animations by default)
- Efficient grid layouts
- Minimal re-renders
- Lazy loading of sections (via tabs)

## Future Enhancements

Potential improvements for future versions:

1. **Export Functionality**: Export tokens as JSON, CSS, or SCSS
2. **Search/Filter**: Search for specific tokens
3. **Contrast Checker**: Built-in WCAG contrast ratio calculator
4. **Usage Examples**: Code snippets showing token usage
5. **Dark/Light Mode**: Toggle between themes
6. **Comparison View**: Compare old vs new token values
7. **History**: Track token changes over time

## Related Documentation

- [Design System README](../README.md)
- [Migration Guide](../MIGRATION.md)
- [Token Documentation](../../../styles/tokens.js)
- [ESLint Rules](../../../../eslint-rules/README.md)

## Support

For questions or issues with the audit tool:

1. Check this documentation
2. Review the design system README
3. Check the migration guide
4. Contact the design system team

## License

Part of the Mallakhamb platform design system.
