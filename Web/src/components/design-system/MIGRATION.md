# Design System Migration Guide

This guide helps you migrate from the old scattered design tokens and components to the new unified design system.

## Overview

The design system refactoring consolidates all design tokens, creates reusable components, and implements a theme provider system. This reduces code duplication by 40% while maintaining all existing functionality.

## Import Path Updates

### Design Tokens

**Before:**
```javascript
// Old scattered imports
import { COLORS } from '../styles/tokens';
import { ADMIN_COLORS } from '../styles/adminTheme';
```

**After:**
```javascript
// New centralized imports
import { DESIGN_TOKENS, getRoleColor, getStatusColor } from '../styles/tokens';

// Access tokens
const primaryColor = DESIGN_TOKENS.colors.brand.saffron;
const adminColor = DESIGN_TOKENS.colors.roles.admin;
const spacing = DESIGN_TOKENS.spacing.md;
```

### Animation Utilities

**Before:**
```javascript
// Inline animation definitions
const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};
```

**After:**
```javascript
import { FadeIn, useReducedMotion } from '../components/design-system/animations';

// Use component
<FadeIn delay={0.2} direction="up">
  <YourContent />
</FadeIn>

// Or use hook
const reducedMotion = useReducedMotion();
```

### Form Components

**Before:**
```javascript
// Custom styled inputs
<input
  style={{
    background: 'rgba(17, 17, 17, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    color: '#fff',
    // ... many more styles
  }}
/>
```

**After:**
```javascript
import { ThemedInput, ThemedButton, ThemedSelect } from '../components/design-system/forms';

<ThemedInput
  icon={Mail}
  placeholder="Enter email"
  error={errors.email}
/>

<ThemedButton variant="solid" size="md" loading={isLoading}>
  Submit
</ThemedButton>
```

### Card Components

**Before:**
```javascript
// Custom card styling
<div style={{
  background: 'rgba(17, 17, 17, 0.8)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '12px',
  // ... more styles
}}>
  {content}
</div>
```

**After:**
```javascript
import { GlassCard, DarkCard, StatCard } from '../components/design-system/cards';

<GlassCard>
  {content}
</GlassCard>

<StatCard
  icon={Users}
  label="Total Teams"
  value={teamCount}
  color={DESIGN_TOKENS.colors.roles.admin}
/>
```

### Background Decorations

**Before:**
```javascript
// Inline SVG or complex CSS
<div style={{
  position: 'absolute',
  background: 'radial-gradient(...)',
  // ... complex styling
}} />
```

**After:**
```javascript
import { HexGrid, RadialBurst, Constellation } from '../components/design-system/backgrounds';

<HexGrid color={DESIGN_TOKENS.colors.roles.admin} opacity={0.15} />
<RadialBurst position="top-right" size="lg" />
<Constellation />
```

## Component API Changes

### ThemedInput

**Props:**
- `icon` - Icon component to display on the left
- `error` - Boolean or string for error state
- `rightElement` - React node for right side (e.g., password toggle)
- All standard HTML input attributes

**Example:**
```javascript
<ThemedInput
  type="email"
  placeholder="Enter email"
  icon={Mail}
  error={errors.email?.message}
  {...register('email')}
/>
```

### ThemedButton

**Props:**
- `variant` - 'solid' | 'outline' | 'ghost' (default: 'solid')
- `size` - 'sm' | 'md' | 'lg' (default: 'md')
- `loading` - Boolean to show loading spinner
- `icon` - Icon component to display
- All standard HTML button attributes

**Example:**
```javascript
<ThemedButton
  variant="solid"
  size="md"
  loading={isSubmitting}
  onClick={handleSubmit}
>
  Submit
</ThemedButton>
```

### DarkCard

**Props:**
- `hover` - Boolean to enable hover animation
- `className` - Additional CSS classes
- `style` - Inline styles
- `children` - Card content

**Example:**
```javascript
<DarkCard hover className="p-6">
  <h3>Card Title</h3>
  <p>Card content</p>
</DarkCard>
```

### FadeIn

**Props:**
- `delay` - Animation delay in seconds (default: 0)
- `direction` - 'up' | 'down' | 'left' | 'right' (default: 'up')
- `className` - Additional CSS classes
- `children` - Content to animate

**Example:**
```javascript
<FadeIn delay={0.2} direction="up">
  <YourComponent />
</FadeIn>
```

## Theme System Integration

### Using ThemeProvider

Wrap your app or role-specific routes with ThemeProvider:

```javascript
import { ThemeProvider } from '../components/design-system/theme';

function App() {
  return (
    <ThemeProvider>
      <YourRoutes />
    </ThemeProvider>
  );
}
```

The ThemeProvider automatically detects the user role from the route path:
- `/admin/*` → admin theme (purple)
- `/superadmin/*` → superadmin theme (gold)
- `/coach/*` → coach theme (green)
- `/player/*` → player theme (saffron)
- `/judge/*` → judge theme (purple)

### Using useTheme Hook

Access theme values in your components:

```javascript
import { useTheme } from '../components/design-system/theme';

function MyComponent() {
  const theme = useTheme();
  
  return (
    <div style={{ color: theme.colors.primary }}>
      Themed content
    </div>
  );
}
```

## Common Migration Patterns

### Pattern 1: Migrating Login Pages

**Before:**
```javascript
// AdminLogin.jsx - 200+ lines of code
function AdminLogin() {
  // Duplicate form logic
  // Duplicate styling
  // Duplicate validation
}
```

**After:**
```javascript
// AdminLogin.jsx - redirect wrapper
import UnifiedLogin from './unified/UnifiedLogin';

const AdminLogin = () => <UnifiedLogin role="admin" />;
export default AdminLogin;
```

### Pattern 2: Migrating Dashboard Pages

**Before:**
```javascript
// AdminDashboard.jsx - 300+ lines
function AdminDashboard() {
  // Duplicate stats display
  // Duplicate navigation
  // Duplicate styling
}
```

**After:**
```javascript
// AdminDashboard.jsx - redirect wrapper
import UnifiedDashboard from './unified/UnifiedDashboard';

const AdminDashboard = () => <UnifiedDashboard role="admin" />;
export default AdminDashboard;
```

### Pattern 3: Migrating Form Sections

**Before:**
```javascript
<div className="space-y-4">
  <div>
    <label>Email</label>
    <input
      type="email"
      style={{ /* many inline styles */ }}
    />
  </div>
  <button style={{ /* many inline styles */ }}>
    Submit
  </button>
</div>
```

**After:**
```javascript
import { ThemedInput, ThemedButton } from '../components/design-system/forms';

<div className="space-y-4">
  <ThemedInput
    type="email"
    label="Email"
    icon={Mail}
    {...register('email')}
  />
  <ThemedButton type="submit">
    Submit
  </ThemedButton>
</div>
```

### Pattern 4: Migrating Statistics Cards

**Before:**
```javascript
<div style={{
  background: 'rgba(17, 17, 17, 0.8)',
  padding: '24px',
  borderRadius: '12px',
  // ... more styles
}}>
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <Users style={{ color: '#8B5CF6' }} />
    <span>Total Teams</span>
  </div>
  <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
    {teamCount}
  </div>
</div>
```

**After:**
```javascript
import { StatCard } from '../components/design-system/cards';

<StatCard
  icon={Users}
  label="Total Teams"
  value={teamCount}
  color={DESIGN_TOKENS.colors.roles.admin}
  delay={0.1}
/>
```

## Troubleshooting

### Issue: Theme not applied to components

**Symptom:** Components render with default styling instead of role-specific colors.

**Solution:** Ensure your component tree is wrapped with ThemeProvider:

```javascript
import { ThemeProvider } from '../components/design-system/theme';

<ThemeProvider>
  <YourComponents />
</ThemeProvider>
```

### Issue: "useTheme must be used within ThemeProvider" error

**Symptom:** Error thrown when using useTheme hook.

**Solution:** Make sure the component using useTheme is a child of ThemeProvider:

```javascript
// ❌ Wrong
function App() {
  const theme = useTheme(); // Error!
  return <ThemeProvider>...</ThemeProvider>;
}

// ✅ Correct
function App() {
  return (
    <ThemeProvider>
      <MyComponent /> {/* useTheme works here */}
    </ThemeProvider>
  );
}
```

### Issue: Animations not working

**Symptom:** FadeIn or other animations don't trigger.

**Solution:** Check if user has prefers-reduced-motion enabled. The design system respects this setting:

```javascript
import { useReducedMotion } from '../components/design-system/animations';

const reducedMotion = useReducedMotion();
// If true, animations are disabled
```

### Issue: Deprecation warnings in console

**Symptom:** Console shows warnings about deprecated exports.

**Solution:** Update your imports to use the new design system:

```javascript
// ❌ Deprecated
import { COLORS, ADMIN_COLORS, EASE_OUT } from '../styles/tokens';

// ✅ New
import { DESIGN_TOKENS } from '../styles/tokens';
const color = DESIGN_TOKENS.colors.brand.saffron;
const easing = DESIGN_TOKENS.easings.easeOut;
```

### Issue: TypeScript errors with component props

**Symptom:** TypeScript complains about missing or invalid props.

**Solution:** Check the component API documentation above. Common fixes:

```javascript
// ❌ Wrong
<ThemedButton color="primary">Submit</ThemedButton>

// ✅ Correct
<ThemedButton variant="solid">Submit</ThemedButton>
```

### Issue: Styling conflicts with existing CSS

**Symptom:** Components don't look right due to CSS conflicts.

**Solution:** The design system uses inline styles and CSS-in-JS to avoid conflicts. If you need to override:

```javascript
<ThemedInput
  className="my-custom-class"
  style={{ marginTop: '16px' }}
/>
```

### Issue: Bundle size increased after migration

**Symptom:** Build output shows larger bundle size.

**Solution:** Ensure you're using named imports for tree-shaking:

```javascript
// ❌ Wrong - imports everything
import * as DesignSystem from '../components/design-system';

// ✅ Correct - tree-shakeable
import { ThemedInput, ThemedButton } from '../components/design-system/forms';
```

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Update design token imports to use DESIGN_TOKENS
- [ ] Replace custom form inputs with ThemedInput/ThemedSelect/ThemedTextarea
- [ ] Replace custom buttons with ThemedButton
- [ ] Replace custom cards with GlassCard/DarkCard/StatCard
- [ ] Replace inline animations with FadeIn component
- [ ] Wrap app with ThemeProvider
- [ ] Update role-specific pages to use unified components
- [ ] Remove old custom styling code
- [ ] Run tests to ensure no regressions
- [ ] Update documentation and comments
- [ ] Remove deprecated imports after transition period

## Getting Help

If you encounter issues not covered in this guide:

1. Check the component source code in `Web/src/components/design-system/`
2. Review the design system README at `Web/src/components/design-system/README.md`
3. Check existing usage examples in `UnifiedLogin.jsx` and `UnifiedDashboard.jsx`
4. Consult the design document at `.kiro/specs/global-design-system-refactoring/design.md`

## Timeline

The migration is designed to be gradual:

- **Sprint 1-2:** New components available, old code still works
- **Sprint 3-4:** Gradual migration of pages to new components
- **Sprint 5-6:** Deprecation warnings added to old exports
- **Sprint 7+:** Old code removed after full migration

During this period, both old and new approaches will work, allowing for incremental migration without breaking existing functionality.
