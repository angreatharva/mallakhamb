# Design Document: Global Design System Refactoring

## Overview

This design document outlines the technical architecture for refactoring the Mallakhamb competition management platform's frontend to eliminate design token duplication and establish a unified design system. The current codebase contains approximately 3,500 lines of duplicated code across 15+ role-based pages (Admin, SuperAdmin, Coach, Player, Judge, and public pages), with each role implementing its own design tokens, color schemes, animations, and UI patterns.

The refactoring will centralize all design tokens into `Web/src/styles/tokens.js`, create a reusable component library in `Web/src/components/design-system/`, implement a theme provider system for role-specific styling, and consolidate duplicate pages into unified components. This will reduce the codebase by an estimated 40% (1,400+ lines) while maintaining all existing functionality and improving maintainability.

### Goals

1. Eliminate code duplication across role-based pages
2. Establish a single source of truth for design tokens
3. Create reusable, themeable UI components
4. Improve developer experience with consistent APIs
5. Maintain backward compatibility during migration
6. Ensure accessibility compliance (WCAG AA)
7. Optimize bundle size and performance

### Non-Goals

1. Redesigning the visual appearance of the application
2. Changing existing user workflows or functionality
3. Migrating to a different UI framework
4. Implementing new features beyond the design system

## Architecture

### High-Level Architecture

```
Web/src/
├── styles/
│   └── tokens.js                    # Centralized design tokens (EXISTING - enhanced)
├── components/
│   └── design-system/               # New component library
│       ├── animations/
│       │   ├── FadeIn.jsx
│       │   ├── useReducedMotion.js
│       │   └── index.js
│       ├── backgrounds/
│       │   ├── HexGrid.jsx
│       │   ├── HexMesh.jsx
│       │   ├── RadialBurst.jsx
│       │   ├── DiagonalBurst.jsx
│       │   ├── Constellation.jsx
│       │   └── index.js
│       ├── cards/
│       │   ├── GlassCard.jsx
│       │   ├── DarkCard.jsx
│       │   ├── StatCard.jsx
│       │   ├── TiltCard.jsx
│       │   └── index.js
│       ├── forms/
│       │   ├── ThemedInput.jsx
│       │   ├── ThemedSelect.jsx
│       │   ├── ThemedTextarea.jsx
│       │   ├── ThemedButton.jsx
│       │   └── index.js
│       ├── ornaments/
│       │   ├── ShieldOrnament.jsx
│       │   ├── CoachOrnament.jsx
│       │   ├── GradientText.jsx
│       │   └── index.js
│       └── theme/
│           ├── ThemeProvider.jsx
│           ├── useTheme.js
│           └── index.js
├── pages/
│   ├── unified/                     # New unified components
│   │   ├── UnifiedLogin.jsx
│   │   └── UnifiedDashboard.jsx
│   ├── AdminLogin.jsx               # Becomes redirect wrapper
│   ├── CoachLogin.jsx               # Becomes redirect wrapper
│   └── ...
└── utils/
    └── theme.js                     # Theme utilities
```

### Design System Layers

The design system is organized into four layers:

1. **Token Layer** (`styles/tokens.js`): Raw design values (colors, spacing, typography)
2. **Component Layer** (`components/design-system/`): Reusable UI components
3. **Theme Layer** (`components/design-system/theme/`): Role-specific theming logic
4. **Page Layer** (`pages/unified/`): Composed page components

### Data Flow

```
Route → ThemeProvider (detects role) → Theme Context → Components → Styled UI
```

1. User navigates to a route (e.g., `/admin/login`)
2. ThemeProvider detects role from route path
3. Theme configuration is provided via React Context
4. Components consume theme via `useTheme()` hook
5. Components render with role-specific styling

## Components and Interfaces

### 1. Design Tokens (Enhanced)

**File**: `Web/src/styles/tokens.js`

The existing tokens file will be enhanced to include all role-specific colors and additional tokens:

```javascript
export const DESIGN_TOKENS = {
  colors: {
    brand: { /* existing */ },
    roles: {
      admin: '#8B5CF6',      // Purple
      superadmin: '#F5A623', // Gold
      coach: '#22C55E',      // Green
      player: '#FF6B00',     // Saffron
      judge: '#8B5CF6',      // Purple
      public: '#3B82F6',     // Blue
    },
    // ... existing structure
  },
  // ... existing tokens
};
```

### 2. Theme Provider System

**File**: `Web/src/components/design-system/theme/ThemeProvider.jsx`

```javascript
interface ThemeProviderProps {
  children: React.ReactNode;
  role?: 'admin' | 'superadmin' | 'coach' | 'player' | 'judge' | 'public';
}

interface ThemeContextValue {
  role: string;
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    card: string;
    border: string;
  };
  spacing: typeof DESIGN_TOKENS.spacing;
  typography: typeof DESIGN_TOKENS.typography;
}
```

**Implementation Strategy**:
- Auto-detect role from route path using `useLocation()`
- Provide theme configuration via React Context
- Support manual role override via prop
- Memoize theme object to prevent unnecessary re-renders

### 3. Animation Components

#### FadeIn Component

**File**: `Web/src/components/design-system/animations/FadeIn.jsx`

```javascript
interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  className?: string;
}
```

**Features**:
- Respects `prefers-reduced-motion`
- Uses Intersection Observer for scroll-triggered animations
- Configurable delay and direction
- Runs animation once per element

#### useReducedMotion Hook

**File**: `Web/src/components/design-system/animations/useReducedMotion.js`

```javascript
function useReducedMotion(): boolean
```

**Implementation**:
- Checks `window.matchMedia('(prefers-reduced-motion: reduce)')`
- Listens for changes to user preference
- Returns boolean indicating if motion should be reduced

### 4. Form Components

#### ThemedInput Component

**File**: `Web/src/components/design-system/forms/ThemedInput.jsx`

```javascript
interface ThemedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ComponentType;
  error?: boolean | string;
  rightElement?: React.ReactNode;
}
```

**Features**:
- Auto-themed based on current role context
- Icon support (left side)
- Right element slot for password toggle, etc.
- Error state styling
- Focus indicators with 3:1 contrast ratio
- Minimum 44px touch target height

#### ThemedButton Component

**File**: `Web/src/components/design-system/forms/ThemedButton.jsx`

```javascript
interface ThemedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ComponentType;
}
```

**Variants**:
- `solid`: Filled background with role color
- `outline`: Transparent background with role-colored border
- `ghost`: Transparent background, no border, hover effect

### 5. Card Components

#### DarkCard Component

**File**: `Web/src/components/design-system/cards/DarkCard.jsx`

```javascript
interface DarkCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  hover?: boolean;
}
```

**Features**:
- Dark glassmorphism background
- Subtle border with role-specific accent on hover
- Optional hover animation
- Supports custom className and style for extension

#### StatCard Component

**File**: `Web/src/components/design-system/cards/StatCard.jsx`

```javascript
interface StatCardProps {
  icon: React.ComponentType;
  label: string;
  value: number | string;
  color: string;
  delay?: number;
  subtitle?: string;
}
```

### 6. Background Decoration Components

#### HexGrid Component

**File**: `Web/src/components/design-system/backgrounds/HexGrid.jsx`

```javascript
interface HexGridProps {
  color?: string;
  opacity?: number;
}
```

**Features**:
- SVG-based hexagonal pattern
- Configurable color and opacity
- Static when `prefers-reduced-motion` is enabled
- Positioned absolutely, non-interactive

#### RadialBurst Component

**File**: `Web/src/components/design-system/backgrounds/RadialBurst.jsx`

```javascript
interface RadialBurstProps {
  color?: string;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  size?: 'sm' | 'md' | 'lg';
}
```

### 7. Unified Login Component

**File**: `Web/src/pages/unified/UnifiedLogin.jsx`

```javascript
interface UnifiedLoginProps {
  role: 'admin' | 'superadmin' | 'coach' | 'player' | 'judge';
  onSuccess?: (user: any, token: string) => void;
}
```

**Role Detection Strategy**:
1. Check route path: `/admin/login` → role = 'admin'
2. Extract role from path using regex: `/(\w+)/login`
3. Pass role to ThemeProvider
4. Render role-specific ornament and background

**Shared Logic**:
- Form validation using react-hook-form
- Rate limiting (5 attempts per 60 seconds)
- Error handling and toast notifications
- Password visibility toggle
- Forgot password link

**Role-Specific Elements**:
- Background decoration (HexGrid for admin, HexMesh for coach, etc.)
- Ornament icon (Shield for admin, UserCheck for coach, etc.)
- Color scheme from theme context
- Post-login navigation path

### 8. Unified Dashboard Component

**File**: `Web/src/pages/unified/UnifiedDashboard.jsx`

```javascript
interface UnifiedDashboardProps {
  role: 'admin' | 'superadmin';
}
```

**Conditional Rendering**:
- SuperAdmin: Show system overview stats + competition filter
- Admin: Show competition-specific stats only
- Shared: Navigation tabs, judges summary, team/score/judge/transaction views

**Tab Structure**:
```javascript
const TABS = {
  admin: ['dashboard', 'teams', 'scores', 'judges', 'transactions'],
  superadmin: ['overview', 'management', 'teams', 'scores', 'judges', 'transactions'],
};
```

## Data Models

### Theme Configuration

```typescript
interface ThemeConfig {
  role: RoleType;
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    card: string;
    border: string;
    borderBright: string;
  };
  ornament: React.ComponentType;
  backgroundDecoration: React.ComponentType;
}

type RoleType = 'admin' | 'superadmin' | 'coach' | 'player' | 'judge' | 'public';
```

### Component Theme Props

```typescript
interface ThemedComponentProps {
  theme?: Partial<ThemeConfig>;
  className?: string;
  style?: React.CSSProperties;
}
```

## Error Handling

### Design Token Access

**Error**: Accessing undefined token
**Handling**: Provide fallback values and log warning in development

```javascript
export const getToken = (path, fallback) => {
  const value = get(DESIGN_TOKENS, path);
  if (!value && process.env.NODE_ENV === 'development') {
    console.warn(`Design token not found: ${path}`);
  }
  return value || fallback;
};
```

### Theme Context

**Error**: Component used outside ThemeProvider
**Handling**: Throw descriptive error in development, use default theme in production

```javascript
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context && process.env.NODE_ENV === 'development') {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context || DEFAULT_THEME;
};
```

### Component Prop Validation

**Error**: Invalid prop values
**Handling**: Use PropTypes or TypeScript for validation, provide sensible defaults

```javascript
ThemedButton.propTypes = {
  variant: PropTypes.oneOf(['solid', 'outline', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
};

ThemedButton.defaultProps = {
  variant: 'solid',
  size: 'md',
};
```

### Animation Errors

**Error**: Framer Motion animation failures
**Handling**: Wrap animations in error boundaries, gracefully degrade to static rendering

```javascript
class AnimationErrorBoundary extends React.Component {
  componentDidCatch(error) {
    console.error('Animation error:', error);
  }
  render() {
    return this.props.children;
  }
}
```

## Testing Strategy

This refactoring project focuses on infrastructure and code organization rather than new business logic. The testing strategy emphasizes:

### Unit Tests

**Focus**: Utility functions and helper methods

- `getStatusColor()` returns correct color for each status
- `getRoleColor()` returns correct color for each role
- `getStatusBg()` returns color with correct opacity
- `useReducedMotion()` detects user preference correctly
- Theme detection from route path works correctly

**Example**:
```javascript
describe('getStatusColor', () => {
  it('returns green for completed status', () => {
    expect(getStatusColor('completed')).toBe('#22C55E');
  });
  
  it('returns fallback for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('#FF6B00');
  });
});
```

### Component Tests

**Focus**: Component rendering and prop handling

- ThemedInput renders with correct styling based on theme
- ThemedButton renders all variants correctly
- DarkCard applies hover styles when hover prop is true
- FadeIn respects prefers-reduced-motion setting
- ThemeProvider provides correct theme values to children

**Example**:
```javascript
describe('ThemedInput', () => {
  it('renders with icon when provided', () => {
    render(<ThemedInput icon={Mail} />);
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
  });
  
  it('applies error styling when error prop is true', () => {
    const { container } = render(<ThemedInput error />);
    const input = container.querySelector('input');
    expect(input).toHaveStyle({ borderColor: expect.stringContaining('#EF4444') });
  });
});
```

### Integration Tests

**Focus**: Theme context propagation and component composition

- ThemeProvider correctly provides theme to nested components
- UnifiedLogin renders with correct role-specific styling
- UnifiedDashboard shows correct tabs based on role
- Theme changes propagate to all themed components

**Example**:
```javascript
describe('ThemeProvider integration', () => {
  it('provides admin theme to nested components', () => {
    render(
      <ThemeProvider role="admin">
        <ThemedButton>Test</ThemedButton>
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveStyle({ background: expect.stringContaining('#8B5CF6') });
  });
});
```

### Visual Regression Tests

**Focus**: Ensuring refactored components match original appearance

- Snapshot tests for each themed component variant
- Screenshot comparison for login pages (all roles)
- Screenshot comparison for dashboard pages (admin vs superadmin)

**Tools**: Jest snapshots, Playwright for screenshot testing

### Accessibility Tests

**Focus**: WCAG AA compliance

- All interactive elements have minimum 44px touch targets
- Color contrast ratios meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Focus indicators have 3:1 contrast ratio
- Keyboard navigation works for all interactive components
- Screen reader announcements for errors and state changes

**Tools**: jest-axe, manual testing with screen readers

### Migration Tests

**Focus**: Backward compatibility during transition

- Old import paths still work (COLORS, ADMIN_COLORS)
- Deprecated functions still work with warnings
- Existing pages continue to function during gradual migration
- No regressions in existing functionality

### Performance Tests

**Focus**: Bundle size and runtime performance

- Bundle size does not increase after refactoring
- Component render times remain consistent
- Theme context updates do not cause unnecessary re-renders
- Lazy loading works correctly for role-specific features

**Metrics**:
- Lighthouse performance score ≥ 90
- First Contentful Paint < 1.5s
- Time to Interactive < 3.5s
- Bundle size reduction of ~40% (1,400 lines)

### Test Coverage Goals

- Utility functions: 100% coverage
- UI components: 80% coverage
- Integration scenarios: Key user flows covered
- Visual regression: All themed components covered
- Accessibility: All interactive components tested

## Migration Strategy

### Phase 1: Foundation (Week 1)

1. Enhance `Web/src/styles/tokens.js` with all role colors
2. Create `Web/src/components/design-system/` directory structure
3. Implement core utilities:
   - `useReducedMotion` hook
   - `ThemeProvider` and `useTheme` hook
   - Helper functions for theme detection

### Phase 2: Component Library (Week 2-3)

1. Build animation components:
   - FadeIn
   - Animation utilities
2. Build form components:
   - ThemedInput
   - ThemedSelect
   - ThemedTextarea
   - ThemedButton
3. Build card components:
   - GlassCard
   - DarkCard
   - StatCard
   - TiltCard
4. Build background decorations:
   - HexGrid
   - HexMesh
   - RadialBurst
   - DiagonalBurst
   - Constellation
5. Build ornament components:
   - ShieldOrnament
   - CoachOrnament
   - GradientText

### Phase 3: Unified Pages (Week 4)

1. Create `UnifiedLogin` component
2. Test with one role (e.g., admin)
3. Extend to all roles (admin, superadmin, coach, player, judge)
4. Create redirect wrappers for old login pages
5. Create `UnifiedDashboard` component
6. Test with admin and superadmin roles

### Phase 4: Migration and Cleanup (Week 5)

1. Update imports across codebase to use new components
2. Add deprecation warnings to old exports
3. Update documentation
4. Run full test suite
5. Performance testing and optimization
6. Remove old code after 2 sprints

### Backward Compatibility Strategy

**Approach**: Maintain old exports with deprecation warnings

```javascript
// Web/src/styles/tokens.js
export const COLORS = {
  // ... old structure
};

if (process.env.NODE_ENV === 'development') {
  console.warn('COLORS export is deprecated. Use DESIGN_TOKENS instead.');
}
```

**Redirect Wrappers**: Keep old page files as thin wrappers

```javascript
// Web/src/pages/AdminLogin.jsx
import UnifiedLogin from './unified/UnifiedLogin';

const AdminLogin = () => <UnifiedLogin role="admin" />;
export default AdminLogin;
```

### Rollback Plan

If critical issues are discovered:

1. Revert to old imports using git
2. Keep both old and new code paths active
3. Feature flag new components
4. Gradual rollout to subset of users

## Documentation

### Component Documentation

Each component will include:

1. **JSDoc comments** with prop descriptions
2. **Usage examples** in component file
3. **Storybook stories** for visual documentation
4. **Accessibility notes** for screen reader behavior

**Example**:
```javascript
/**
 * ThemedInput - A themed input component that adapts to the current role context
 * 
 * @param {Object} props
 * @param {React.ComponentType} props.icon - Icon component to display on the left
 * @param {boolean|string} props.error - Error state or error message
 * @param {React.ReactNode} props.rightElement - Element to display on the right (e.g., password toggle)
 * 
 * @example
 * <ThemedInput 
 *   icon={Mail} 
 *   type="email" 
 *   placeholder="Enter email"
 *   error={errors.email}
 * />
 */
```

### Migration Guide

**File**: `Web/src/components/design-system/MIGRATION.md`

Contents:
1. Overview of changes
2. Import path updates
3. Component API changes
4. Code examples (before/after)
5. Common migration patterns
6. Troubleshooting guide

### Design System README

**File**: `Web/src/components/design-system/README.md`

Contents:
1. Design system philosophy
2. Token structure and usage
3. Component catalog with examples
4. Theme system guide
5. Accessibility guidelines
6. Contributing guidelines

### Storybook Setup

Create stories for all components:

```javascript
// Web/src/components/design-system/forms/ThemedInput.stories.jsx
export default {
  title: 'Design System/Forms/ThemedInput',
  component: ThemedInput,
};

export const Default = () => <ThemedInput placeholder="Enter text" />;
export const WithIcon = () => <ThemedInput icon={Mail} placeholder="Enter email" />;
export const WithError = () => <ThemedInput error="This field is required" />;
export const AdminTheme = () => (
  <ThemeProvider role="admin">
    <ThemedInput placeholder="Admin themed input" />
  </ThemeProvider>
);
```

## Performance Considerations

### Code Splitting

- Lazy load role-specific components
- Split background decorations into separate chunks
- Use React.lazy() for non-critical components

```javascript
const HexGrid = React.lazy(() => import('./backgrounds/HexGrid'));
```

### Memoization

- Memoize theme context value to prevent unnecessary re-renders
- Use React.memo for expensive components
- Memoize color calculations

```javascript
const themeValue = useMemo(() => ({
  role,
  colors: getRoleColors(role),
  // ...
}), [role]);
```

### CSS-in-JS Optimization

- Use static tokens instead of runtime calculations where possible
- Extract common styles into shared objects
- Avoid inline style objects in render

```javascript
// Bad: Creates new object on every render
<div style={{ color: theme.colors.primary }} />

// Good: Use CSS classes or memoized styles
const styles = useMemo(() => ({ color: theme.colors.primary }), [theme]);
<div style={styles} />
```

### Bundle Size Optimization

- Tree-shake unused components
- Use named exports for better tree-shaking
- Minimize framer-motion usage (only where needed)

**Expected Results**:
- 40% reduction in code (1,400 lines removed)
- No increase in bundle size
- Improved Lighthouse scores

## Accessibility Compliance

### Touch Targets

All interactive elements meet minimum 44px × 44px touch target size:

```javascript
const MIN_TOUCH_TARGET = 44; // pixels

<button style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET }}>
  Click me
</button>
```

### Color Contrast

All text meets WCAG AA contrast ratios:

- Normal text (< 18pt): 4.5:1 contrast ratio
- Large text (≥ 18pt): 3:1 contrast ratio
- Focus indicators: 3:1 contrast ratio

**Validation**: Use contrast checker during development

### Keyboard Navigation

- All interactive elements are keyboard accessible
- Focus order follows logical reading order
- Focus indicators are clearly visible
- Skip links for main content

### Screen Reader Support

- Semantic HTML elements (button, input, label)
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic content
- Error announcements

```javascript
<button aria-label="Close dialog">
  <X className="w-4 h-4" aria-hidden="true" />
</button>
```

### Reduced Motion

- Respect `prefers-reduced-motion` setting
- Disable non-essential animations
- Provide static alternatives

```javascript
const reduced = useReducedMotion();

<motion.div
  animate={reduced ? {} : { scale: [1, 1.05, 1] }}
  transition={{ duration: 2, repeat: Infinity }}
/>
```

## Security Considerations

### Input Sanitization

- All form inputs are validated and sanitized
- Use existing validation utilities
- Prevent XSS through proper escaping

### Token Exposure

- Design tokens are safe to expose (no secrets)
- No sensitive data in theme configuration
- API tokens remain in secure storage

### Dependency Security

- Regular dependency audits
- Use only trusted packages
- Minimize external dependencies

## Responsive Design

### Breakpoint Strategy

Use existing breakpoints from tokens:

```javascript
const breakpoints = {
  mobile: '320px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1280px',
};
```

### Component Responsiveness

- All components adapt to mobile, tablet, desktop
- Touch targets are 44px minimum on mobile
- Font sizes scale appropriately
- Spacing adjusts for smaller screens

### Integration with useResponsive Hook

```javascript
const { isMobile, isTablet, isDesktop } = useResponsive();

<ThemedButton size={isMobile ? 'sm' : 'md'}>
  Click me
</ThemedButton>
```

## Conclusion

This design establishes a comprehensive, maintainable design system that eliminates code duplication while preserving all existing functionality. The phased migration approach ensures backward compatibility and minimizes risk. The component library provides a solid foundation for future development with consistent styling, improved accessibility, and better developer experience.

The refactoring will reduce the codebase by approximately 1,400 lines (40%), improve maintainability through centralized tokens and reusable components, and establish patterns for future feature development. All changes maintain WCAG AA accessibility compliance and respect user preferences for reduced motion.
