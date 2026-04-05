# Mallakhamb Design System

A unified, accessible, and themeable design system for the Mallakhamb competition management platform.

## Philosophy

The Mallakhamb Design System is built on four core principles:

### 1. Consistency
Every component uses the same design tokens, ensuring visual consistency across all user roles and pages. Colors, spacing, typography, and animations follow a unified system.

### 2. Accessibility
All components meet WCAG AA standards with:
- Minimum 4.5:1 contrast ratio for normal text
- Minimum 3:1 contrast ratio for large text and focus indicators
- Minimum 44px touch targets for interactive elements
- Full keyboard navigation support
- Screen reader compatibility
- Respect for `prefers-reduced-motion` settings

### 3. Theming
Components automatically adapt to the current user role (Admin, SuperAdmin, Coach, Player, Judge) through the theme provider system, eliminating the need for role-specific styling code.

### 4. Developer Experience
Simple, predictable APIs with sensible defaults. Components work out of the box but can be customized when needed. Tree-shakeable exports keep bundle sizes small.

## Token Structure and Usage

### Design Tokens

All design tokens are centralized in `Web/src/styles/tokens.js` and exported as `DESIGN_TOKENS`.

#### Colors

```javascript
import { DESIGN_TOKENS } from '../styles/tokens';

// Brand colors
DESIGN_TOKENS.colors.brand.saffron      // #FF6B00
DESIGN_TOKENS.colors.brand.gold         // #F5A623
DESIGN_TOKENS.colors.brand.cream        // #FFF8F0

// Role colors (WCAG AA compliant)
DESIGN_TOKENS.colors.roles.admin        // #8B5CF6 (Purple)
DESIGN_TOKENS.colors.roles.superadmin   // #F5A623 (Gold)
DESIGN_TOKENS.colors.roles.coach        // #22C55E (Green)
DESIGN_TOKENS.colors.roles.player       // #FF6B00 (Saffron)
DESIGN_TOKENS.colors.roles.judge        // #8B5CF6 (Purple)
DESIGN_TOKENS.colors.roles.public       // #3B82F6 (Blue)

// Semantic colors
DESIGN_TOKENS.colors.semantic.success   // #22C55E
DESIGN_TOKENS.colors.semantic.error     // #EF4444
DESIGN_TOKENS.colors.semantic.warning   // #F59E0B
DESIGN_TOKENS.colors.semantic.info      // #3B82F6

// Status colors
DESIGN_TOKENS.colors.status.completed   // #22C55E
DESIGN_TOKENS.colors.status.pending     // #F5A623
DESIGN_TOKENS.colors.status.failed      // #EF4444
DESIGN_TOKENS.colors.status.started     // #3B82F6

// Surface colors
DESIGN_TOKENS.colors.surfaces.dark          // #0A0A0A
DESIGN_TOKENS.colors.surfaces.darkCard      // #111111
DESIGN_TOKENS.colors.surfaces.darkElevated  // #161616
DESIGN_TOKENS.colors.surfaces.darkPanel     // #1A1A1A

// Text colors (WCAG AA compliant)
DESIGN_TOKENS.colors.text.primary       // #FFFFFF
DESIGN_TOKENS.colors.text.secondary     // rgba(255,255,255,0.65)
DESIGN_TOKENS.colors.text.muted         // rgba(255,255,255,0.45)
DESIGN_TOKENS.colors.text.disabled      // rgba(255,255,255,0.30)
```

#### Spacing

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

#### Typography

```javascript
// Font sizes
DESIGN_TOKENS.typography.fontSize.xs    // 11px
DESIGN_TOKENS.typography.fontSize.sm    // 13px
DESIGN_TOKENS.typography.fontSize.base  // 16px
DESIGN_TOKENS.typography.fontSize.lg    // 18px
DESIGN_TOKENS.typography.fontSize.xl    // 20px
DESIGN_TOKENS.typography.fontSize['2xl'] // 24px
DESIGN_TOKENS.typography.fontSize['3xl'] // 30px
DESIGN_TOKENS.typography.fontSize['4xl'] // 36px
DESIGN_TOKENS.typography.fontSize['5xl'] // 48px

// Font weights
DESIGN_TOKENS.typography.fontWeight.normal    // 400
DESIGN_TOKENS.typography.fontWeight.medium    // 500
DESIGN_TOKENS.typography.fontWeight.semibold  // 600
DESIGN_TOKENS.typography.fontWeight.bold      // 700
DESIGN_TOKENS.typography.fontWeight.black     // 900

// Line heights
DESIGN_TOKENS.typography.lineHeight.tight    // 1.2
DESIGN_TOKENS.typography.lineHeight.normal   // 1.5
DESIGN_TOKENS.typography.lineHeight.relaxed  // 1.75
```

#### Helper Functions

```javascript
import { getRoleColor, getStatusColor, getRoleBg, getStatusBg } from '../styles/tokens';

// Get role color
const adminColor = getRoleColor('admin');        // #8B5CF6
const coachColor = getRoleColor('coach');        // #22C55E

// Get status color
const completedColor = getStatusColor('completed'); // #22C55E
const pendingColor = getStatusColor('pending');     // #F5A623

// Get background colors with opacity
const adminBg = getRoleBg('admin');           // rgba(139, 92, 246, 0.09)
const completedBg = getStatusBg('completed'); // rgba(34, 197, 94, 0.09)
```

## Component Catalog

### Animations

#### FadeIn

Scroll-triggered fade-in animation with configurable direction and delay.

```javascript
import { FadeIn } from './components/design-system/animations';

<FadeIn delay={0.2} direction="up">
  <YourContent />
</FadeIn>
```

**Props:**
- `delay` (number): Animation delay in seconds (default: 0)
- `direction` ('up' | 'down' | 'left' | 'right'): Animation direction (default: 'up')
- `className` (string): Additional CSS classes
- `children` (ReactNode): Content to animate

**Features:**
- Uses Intersection Observer for performance
- Respects `prefers-reduced-motion`
- Runs once per element (idempotent)

#### useReducedMotion

Hook to detect user's motion preferences.

```javascript
import { useReducedMotion } from './components/design-system/animations';

function MyComponent() {
  const reducedMotion = useReducedMotion();
  
  return (
    <motion.div
      animate={reducedMotion ? {} : { scale: [1, 1.05, 1] }}
    />
  );
}
```

### Forms

#### ThemedInput

Themed text input with icon support and error states.

```javascript
import { ThemedInput } from './components/design-system/forms';
import { Mail } from 'lucide-react';

<ThemedInput
  type="email"
  placeholder="Enter email"
  icon={Mail}
  error={errors.email?.message}
  {...register('email')}
/>
```

**Props:**
- `icon` (Component): Icon component to display on the left
- `error` (boolean | string): Error state or error message
- `rightElement` (ReactNode): Element to display on the right (e.g., password toggle)
- All standard HTML input attributes

**Accessibility:**
- Minimum 44px touch target
- Focus indicator with 3:1 contrast ratio
- Error messages announced to screen readers
- Proper label association

#### ThemedButton

Themed button with variants, sizes, and loading states.

```javascript
import { ThemedButton } from './components/design-system/forms';

<ThemedButton
  variant="solid"
  size="md"
  loading={isSubmitting}
  onClick={handleSubmit}
>
  Submit
</ThemedButton>
```

**Props:**
- `variant` ('solid' | 'outline' | 'ghost'): Button style (default: 'solid')
- `size` ('sm' | 'md' | 'lg'): Button size (default: 'md')
- `loading` (boolean): Show loading spinner
- `icon` (Component): Icon component to display
- All standard HTML button attributes

**Variants:**
- `solid`: Filled background with role color
- `outline`: Transparent background with role-colored border
- `ghost`: Transparent background, no border, hover effect

#### ThemedSelect

Themed dropdown select component.

```javascript
import { ThemedSelect } from './components/design-system/forms';

<ThemedSelect {...register('category')}>
  <option value="">Select category</option>
  <option value="pole">Pole</option>
  <option value="rope">Rope</option>
</ThemedSelect>
```

**Props:**
- All standard HTML select attributes
- Automatically themed based on current role

#### ThemedTextarea

Themed multi-line text input.

```javascript
import { ThemedTextarea } from './components/design-system/forms';

<ThemedTextarea
  placeholder="Enter description"
  rows={4}
  {...register('description')}
/>
```

**Props:**
- All standard HTML textarea attributes
- Automatically themed based on current role

### Cards

#### GlassCard

Glassmorphism card with backdrop blur effect.

```javascript
import { GlassCard } from './components/design-system/cards';

<GlassCard className="p-6">
  <h3>Card Title</h3>
  <p>Card content</p>
</GlassCard>
```

**Props:**
- `className` (string): Additional CSS classes
- `style` (object): Inline styles
- `children` (ReactNode): Card content

#### DarkCard

Dark glassmorphism card with optional hover animation.

```javascript
import { DarkCard } from './components/design-system/cards';

<DarkCard hover className="p-6">
  <h3>Card Title</h3>
  <p>Card content</p>
</DarkCard>
```

**Props:**
- `hover` (boolean): Enable hover animation
- `className` (string): Additional CSS classes
- `style` (object): Inline styles
- `children` (ReactNode): Card content

#### StatCard

Statistics display card with icon and value.

```javascript
import { StatCard } from './components/design-system/cards';
import { Users } from 'lucide-react';

<StatCard
  icon={Users}
  label="Total Teams"
  value={teamCount}
  color={DESIGN_TOKENS.colors.roles.admin}
  delay={0.1}
  subtitle="Active this season"
/>
```

**Props:**
- `icon` (Component): Icon component
- `label` (string): Stat label
- `value` (number | string): Stat value
- `color` (string): Icon and accent color
- `delay` (number): Animation delay
- `subtitle` (string): Optional subtitle

#### TiltCard

Card with 3D tilt effect on hover.

```javascript
import { TiltCard } from './components/design-system/cards';

<TiltCard className="p-6">
  <h3>Interactive Card</h3>
  <p>Hover to see tilt effect</p>
</TiltCard>
```

**Props:**
- `className` (string): Additional CSS classes
- `style` (object): Inline styles
- `children` (ReactNode): Card content

**Features:**
- Respects `prefers-reduced-motion`
- Smooth 3D transform on hover

### Background Decorations

#### HexGrid

Hexagonal grid pattern background.

```javascript
import { HexGrid } from './components/design-system/backgrounds';

<HexGrid
  color={DESIGN_TOKENS.colors.roles.admin}
  opacity={0.15}
/>
```

**Props:**
- `color` (string): Pattern color (default: saffron)
- `opacity` (number): Pattern opacity (default: 0.15)

#### RadialBurst

Radial gradient burst effect.

```javascript
import { RadialBurst } from './components/design-system/backgrounds';

<RadialBurst
  position="top-right"
  size="lg"
  color={DESIGN_TOKENS.colors.roles.coach}
/>
```

**Props:**
- `position` ('top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'): Position
- `size` ('sm' | 'md' | 'lg'): Burst size
- `color` (string): Burst color

#### DiagonalBurst

Diagonal gradient effect.

```javascript
import { DiagonalBurst } from './components/design-system/backgrounds';

<DiagonalBurst
  color={DESIGN_TOKENS.colors.roles.player}
  opacity={0.2}
/>
```

**Props:**
- `color` (string): Gradient color
- `opacity` (number): Effect opacity

#### HexMesh

Hexagonal mesh pattern.

```javascript
import { HexMesh } from './components/design-system/backgrounds';

<HexMesh
  color={DESIGN_TOKENS.colors.roles.judge}
  opacity={0.1}
/>
```

**Props:**
- `color` (string): Mesh color
- `opacity` (number): Mesh opacity

#### Constellation

Animated star field with connected dots.

```javascript
import { Constellation } from './components/design-system/backgrounds';

<Constellation
  color={DESIGN_TOKENS.colors.brand.saffron}
  opacity={0.3}
/>
```

**Props:**
- `color` (string): Star and line color
- `opacity` (number): Effect opacity

**Features:**
- Animated connections between stars
- Respects `prefers-reduced-motion`

### Ornaments

#### ShieldOrnament

Shield icon with role-specific styling.

```javascript
import { ShieldOrnament } from './components/design-system/ornaments';

<ShieldOrnament size={64} color={DESIGN_TOKENS.colors.roles.admin} />
```

**Props:**
- `size` (number): Icon size in pixels
- `color` (string): Icon color

#### CoachOrnament

Coach-specific icon with styling.

```javascript
import { CoachOrnament } from './components/design-system/ornaments';

<CoachOrnament size={64} color={DESIGN_TOKENS.colors.roles.coach} />
```

**Props:**
- `size` (number): Icon size in pixels
- `color` (string): Icon color

#### GradientText

Animated gradient text effect.

```javascript
import { GradientText } from './components/design-system/ornaments';

<GradientText>Welcome Back</GradientText>
```

**Props:**
- `children` (ReactNode): Text content

**Features:**
- Animated gradient effect
- Respects `prefers-reduced-motion`

## Theme System Guide

### ThemeProvider

The ThemeProvider automatically detects the user role from the route path and provides role-specific theme configuration to all child components.

```javascript
import { ThemeProvider } from './components/design-system/theme';

function App() {
  return (
    <ThemeProvider>
      <YourRoutes />
    </ThemeProvider>
  );
}
```

**Role Detection:**
- `/admin/*` → admin theme (purple)
- `/superadmin/*` → superadmin theme (gold)
- `/coach/*` → coach theme (green)
- `/player/*` → player theme (saffron)
- `/judge/*` → judge theme (purple)
- Default → public theme (blue)

**Manual Override:**
```javascript
<ThemeProvider role="admin">
  <YourComponents />
</ThemeProvider>
```

### useTheme Hook

Access theme values in your components:

```javascript
import { useTheme } from './components/design-system/theme';

function MyComponent() {
  const theme = useTheme();
  
  return (
    <div style={{ color: theme.colors.primary }}>
      Role: {theme.role}
    </div>
  );
}
```

**Theme Object:**
```javascript
{
  role: 'admin' | 'superadmin' | 'coach' | 'player' | 'judge' | 'public',
  colors: {
    primary: string,
    primaryLight: string,
    primaryDark: string,
    background: string,
    card: string,
    border: string,
    borderBright: string,
  },
  spacing: typeof DESIGN_TOKENS.spacing,
  typography: typeof DESIGN_TOKENS.typography,
}
```

## Accessibility Guidelines

### Color Contrast

All text must meet WCAG AA standards:
- **Normal text** (< 18pt): Minimum 4.5:1 contrast ratio
- **Large text** (≥ 18pt): Minimum 3:1 contrast ratio
- **Focus indicators**: Minimum 3:1 contrast ratio

Use the design system's pre-defined colors, which are already WCAG AA compliant.

### Touch Targets

All interactive elements must have a minimum 44px × 44px touch target:

```javascript
// ✅ Good - meets minimum
<ThemedButton size="md">Click me</ThemedButton>

// ❌ Bad - too small
<button style={{ height: '32px', width: '32px' }}>X</button>
```

### Keyboard Navigation

All interactive elements must be keyboard accessible:

```javascript
// ✅ Good - native button is keyboard accessible
<ThemedButton onClick={handleClick}>Submit</ThemedButton>

// ❌ Bad - div is not keyboard accessible by default
<div onClick={handleClick}>Submit</div>

// ✅ Good - div with proper ARIA and keyboard handlers
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Submit
</div>
```

### Screen Readers

Provide meaningful labels for all interactive elements:

```javascript
// ✅ Good - icon button with label
<button aria-label="Close dialog">
  <X className="w-4 h-4" aria-hidden="true" />
</button>

// ❌ Bad - no label for screen readers
<button>
  <X className="w-4 h-4" />
</button>
```

Use ARIA live regions for dynamic content:

```javascript
import { LiveRegion } from './components/design-system/accessibility';

<LiveRegion>
  {errorMessage}
</LiveRegion>
```

### Reduced Motion

Always respect user's motion preferences:

```javascript
import { useReducedMotion } from './components/design-system/animations';

function MyComponent() {
  const reducedMotion = useReducedMotion();
  
  return (
    <motion.div
      animate={reducedMotion ? {} : { scale: [1, 1.05, 1] }}
    />
  );
}
```

All design system components automatically respect `prefers-reduced-motion`.

## Contributing Guidelines

### Adding New Components

1. **Create component file** in the appropriate directory:
   - Forms: `components/design-system/forms/`
   - Cards: `components/design-system/cards/`
   - Animations: `components/design-system/animations/`
   - Backgrounds: `components/design-system/backgrounds/`
   - Ornaments: `components/design-system/ornaments/`

2. **Use design tokens** instead of hardcoded values:
   ```javascript
   // ❌ Bad
   const styles = { color: '#FF6B00' };
   
   // ✅ Good
   import { DESIGN_TOKENS } from '../../../styles/tokens';
   const styles = { color: DESIGN_TOKENS.colors.brand.saffron };
   ```

3. **Integrate with theme system** if component needs role-specific styling:
   ```javascript
   import { useTheme } from '../theme';
   
   function MyComponent() {
     const theme = useTheme();
     return <div style={{ color: theme.colors.primary }} />;
   }
   ```

4. **Ensure accessibility**:
   - Minimum 44px touch targets
   - WCAG AA color contrast
   - Keyboard navigation
   - Screen reader support
   - Respect `prefers-reduced-motion`

5. **Write tests**:
   - Unit tests for logic
   - Component tests for rendering
   - Accessibility tests with vitest-axe

6. **Add to barrel export**:
   ```javascript
   // components/design-system/forms/index.js
   export { MyNewComponent } from './MyNewComponent';
   ```

7. **Document usage** in this README with examples

### Code Style

- Use functional components with hooks
- Use PropTypes for prop validation
- Provide sensible default props
- Use descriptive variable names
- Add JSDoc comments for complex functions
- Keep components focused and single-purpose

### Testing Requirements

All new components must include:

1. **Unit tests** for helper functions
2. **Component tests** for rendering and props
3. **Accessibility tests** using vitest-axe
4. **Integration tests** for theme integration (if applicable)

Example test structure:

```javascript
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
  
  it('has no accessibility violations', async () => {
    const { container } = render(<MyComponent />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Pull Request Checklist

- [ ] Component uses design tokens
- [ ] Component integrates with theme system (if needed)
- [ ] Accessibility requirements met (WCAG AA)
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Barrel export updated
- [ ] No console warnings or errors
- [ ] Bundle size impact checked

## Resources

- **Migration Guide**: `MIGRATION.md` - How to migrate from old code
- **Design Document**: `.kiro/specs/global-design-system-refactoring/design.md`
- **Requirements**: `.kiro/specs/global-design-system-refactoring/requirements.md`
- **Tasks**: `.kiro/specs/global-design-system-refactoring/tasks.md`

## Support

For questions or issues:

1. Check the Migration Guide for common patterns
2. Review component source code for implementation details
3. Check existing usage in `UnifiedLogin.jsx` and `UnifiedDashboard.jsx`
4. Consult the design document for architectural decisions
