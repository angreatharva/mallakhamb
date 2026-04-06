# Design System Integration Guide

**Last Updated:** March 26, 2026  
**Status:** ✅ Complete

---

## Overview

This guide documents how pages integrate with the centralized design system located in `Web/src/components/design-system/` and `Web/src/styles/tokens.js`. The design system provides consistent theming, components, and utilities across all pages.

---

## Table of Contents

1. [Design Tokens](#design-tokens)
2. [Theme Provider](#theme-provider)
3. [Form Components](#form-components)
4. [Card Components](#card-components)
5. [Background Components](#background-components)
6. [Animation Components](#animation-components)
7. [Ornament Components](#ornament-components)
8. [Usage Patterns](#usage-patterns)
9. [Role-Specific Theming](#role-specific-theming)

---

## Design Tokens

### Token Structure

Design tokens are centralized in `Web/src/styles/tokens.js`:

```javascript
export const DESIGN_TOKENS = {
  colors: {
    // Role-specific colors
    roles: {
      admin: '#8B5CF6',      // Purple
      superadmin: '#A855F7', // Bright purple
      coach: '#22C55E',      // Green
      player: '#FF6B00',     // Saffron
      judge: '#3B82F6',      // Blue
    },
    
    // Surface colors
    surfaces: {
      dark: '#0A0A0A',
      darkCard: '#111111',
      darkHover: '#1A1A1A',
      darkBorder: '#222222',
    },
    
    // Text colors
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.7)',
      tertiary: 'rgba(255, 255, 255, 0.4)',
      disabled: 'rgba(255, 255, 255, 0.2)',
    },
    
    // Semantic colors
    semantic: {
      success: '#22C55E',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6',
    },
  },
  
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
  
  typography: {
    sizes: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      black: 900,
    },
    lineHeights: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },
  
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  
  easings: {
    smooth: [0.22, 1, 0.36, 1],
    bounce: [0.68, -0.55, 0.265, 1.55],
    elastic: [0.175, 0.885, 0.32, 1.275],
  },
};
```

### Helper Functions

```javascript
/**
 * Get role-specific color
 * @param {string} role - User role (admin, coach, player, judge, superadmin)
 * @returns {string} Hex color code
 */
export const getRoleColor = (role) => {
  return DESIGN_TOKENS.colors.roles[role] || DESIGN_TOKENS.colors.roles.admin;
};

/**
 * Get role-specific gradient
 * @param {string} role - User role
 * @returns {string} CSS gradient string
 */
export const getRoleGradient = (role) => {
  const color = getRoleColor(role);
  return `linear-gradient(135deg, ${color}, ${adjustBrightness(color, -20)})`;
};

/**
 * Get contrast text color for background
 * @param {string} backgroundColor - Background color hex
 * @returns {string} 'white' or 'black'
 */
export const getContrastText = (backgroundColor) => {
  // Calculate luminance and return appropriate text color
  const rgb = hexToRgb(backgroundColor);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? 'black' : 'white';
};
```

### Importing Tokens

```javascript
// Import tokens
import { DESIGN_TOKENS, getRoleColor, getRoleGradient } from '../../styles/tokens';

// Use in component
const MyComponent = () => {
  const primaryColor = DESIGN_TOKENS.colors.roles.admin;
  const cardBackground = DESIGN_TOKENS.colors.surfaces.darkCard;
  const spacing = DESIGN_TOKENS.spacing.md;
  
  // Or use helper functions
  const roleColor = getRoleColor('coach'); // '#22C55E'
  const gradient = getRoleGradient('player'); // 'linear-gradient(...)'
  
  return (
    <div style={{ 
      background: cardBackground,
      padding: spacing,
      color: primaryColor 
    }}>
      Content
    </div>
  );
};
```

---

## Theme Provider

### Overview

The ThemeProvider component wraps pages to provide role-specific theming through React Context.

### Usage

```javascript
import { ThemeProvider, useTheme } from '../../components/design-system/theme';

// Wrap your component
const MyPage = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <MyPageInner />
    </ThemeProvider>
  );
};

// Access theme in child components
const MyPageInner = () => {
  const theme = useTheme();
  
  return (
    <div style={{ background: theme.colors.background }}>
      <h1 style={{ color: theme.colors.primary }}>Title</h1>
      <p style={{ color: theme.colors.text }}>Content</p>
    </div>
  );
};
```

### Theme Object Structure

```javascript
const theme = {
  colors: {
    primary: '#22C55E',        // Role-specific primary color
    primaryLight: '#86EFAC',   // Lighter variant
    primaryDark: '#16A34A',    // Darker variant
    background: '#0A0A0A',     // Page background
    card: '#111111',           // Card background
    cardHover: '#1A1A1A',      // Card hover state
    border: '#222222',         // Border color
    borderBright: '#333333',   // Brighter border
    text: '#FFFFFF',           // Primary text
    textSecondary: 'rgba(255, 255, 255, 0.7)',  // Secondary text
    textTertiary: 'rgba(255, 255, 255, 0.4)',   // Tertiary text
  },
  spacing: { /* ... */ },
  typography: { /* ... */ },
  radii: { /* ... */ },
  shadows: { /* ... */ },
  easings: { /* ... */ },
};
```

---

## Form Components

### ThemedInput

```javascript
import { ThemedInput } from '../../components/design-system/forms';
import { Mail, Lock } from 'lucide-react';

<ThemedInput
  icon={Mail}
  type="email"
  placeholder="admin@example.com"
  error={errors.email}
  autoComplete="email"
  {...register('email', { required: 'Email is required' })}
/>

<ThemedInput
  icon={Lock}
  type="password"
  placeholder="••••••••"
  error={errors.password}
  autoComplete="current-password"
  rightElement={
    <button onClick={() => setShowPassword(!showPassword)}>
      {showPassword ? <EyeOff /> : <Eye />}
    </button>
  }
  {...register('password')}
/>
```

**Props**:
- `icon`: Lucide icon component
- `type`: Input type (text, email, password, etc.)
- `placeholder`: Placeholder text
- `error`: Error message (string or object)
- `autoComplete`: Autocomplete attribute
- `rightElement`: Optional element to render on the right side
- All standard input props

### ThemedButton

```javascript
import { ThemedButton } from '../../components/design-system/forms';
import { ArrowRight } from 'lucide-react';

<ThemedButton
  type="submit"
  disabled={loading}
  loading={loading}
  className="w-full"
>
  {loading ? 'Signing in...' : 'Sign In'}
  {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
</ThemedButton>
```

**Props**:
- `type`: Button type (button, submit, reset)
- `disabled`: Disabled state
- `loading`: Loading state (shows spinner)
- `className`: Additional CSS classes
- `children`: Button content

### ThemedSelect

```javascript
import { ThemedSelect } from '../../components/design-system/forms';

<ThemedSelect
  placeholder="Select gender"
  options={[
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ]}
  {...register('gender', { required: 'Gender is required' })}
/>
```

**Props**:
- `placeholder`: Placeholder text
- `options`: Array of { value, label } objects
- All standard select props

### ThemedTextarea

```javascript
import { ThemedTextarea } from '../../components/design-system/forms';

<ThemedTextarea
  placeholder="Enter description"
  rows={4}
  error={errors.description}
  {...register('description')}
/>
```

**Props**:
- `placeholder`: Placeholder text
- `rows`: Number of rows
- `error`: Error message
- All standard textarea props

---

## Card Components

### GlassCard

```javascript
import { GlassCard } from '../../components/design-system/cards';

<GlassCard className="p-6">
  <h3 className="text-xl font-bold text-white">Competition Details</h3>
  <p className="text-white/60">Information here...</p>
</GlassCard>
```

**Features**:
- Glassmorphism effect
- Backdrop blur
- Semi-transparent background
- Subtle border

### DarkCard

```javascript
import { DarkCard } from '../../components/design-system/cards';

<DarkCard className="p-6">
  <h3 className="text-xl font-bold text-white">Statistics</h3>
  <div className="grid grid-cols-3 gap-4">
    {/* Stats */}
  </div>
</DarkCard>
```

**Features**:
- Solid dark background
- Subtle border
- Hover effect

### StatCard

```javascript
import { StatCard } from '../../components/design-system/cards';
import { Users } from 'lucide-react';

<StatCard
  icon={Users}
  label="Total Teams"
  value={stats?.totalTeams}
  color="#8B5CF6"
  delay={0}
/>
```

**Props**:
- `icon`: Lucide icon component
- `label`: Stat label
- `value`: Stat value (number or string)
- `color`: Icon and accent color
- `delay`: Animation delay (optional)

### TiltCard

```javascript
import { TiltCard } from '../../components/design-system/cards';

<TiltCard className="p-6">
  <h3 className="text-xl font-bold text-white">Interactive Card</h3>
  <p className="text-white/60">Tilts on hover</p>
</TiltCard>
```

**Features**:
- 3D tilt effect on hover
- Smooth animations
- Glassmorphism styling

---

## Background Components

### HexGrid

```javascript
import { HexGrid } from '../../components/design-system/backgrounds';

<div className="relative">
  <HexGrid color="#8B5CF6" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

**Props**:
- `color`: Hex color for the grid

### RadialBurst

```javascript
import { RadialBurst } from '../../components/design-system/backgrounds';

<div className="relative">
  <RadialBurst color="#FF6B00" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

**Props**:
- `color`: Hex color for the burst

### DiagonalBurst

```javascript
import { DiagonalBurst } from '../../components/design-system/backgrounds';

<div className="relative">
  <DiagonalBurst color="#22C55E" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

**Props**:
- `color`: Hex color for the burst

### HexMesh

```javascript
import { HexMesh } from '../../components/design-system/backgrounds';

<div className="relative">
  <HexMesh color="#22C55E" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

**Props**:
- `color`: Hex color for the mesh

### Constellation

```javascript
import { Constellation } from '../../components/design-system/backgrounds';

<div className="relative">
  <Constellation color="#3B82F6" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

**Props**:
- `color`: Hex color for the constellation

---

## Animation Components

### FadeIn

```javascript
import { FadeIn } from '../../components/design-system/animations';

<FadeIn delay={0.2}>
  <div className="content">
    {/* Content fades in */}
  </div>
</FadeIn>
```

**Props**:
- `delay`: Animation delay in seconds (optional)
- `children`: Content to animate

### useReducedMotion

```javascript
import { useReducedMotion } from '../../components/design-system/animations';

const MyComponent = () => {
  const reduced = useReducedMotion();
  
  return (
    <motion.div
      animate={reduced ? {} : { scale: [1, 1.1, 1] }}
      transition={reduced ? {} : { duration: 2, repeat: Infinity }}
    >
      Content
    </motion.div>
  );
};
```

**Returns**: Boolean indicating if user prefers reduced motion

---

## Ornament Components

### ShieldOrnament

```javascript
import { ShieldOrnament } from '../../components/design-system/ornaments';

<ShieldOrnament color="#8B5CF6" />
```

**Props**:
- `color`: Hex color for the ornament

### CoachOrnament

```javascript
import { CoachOrnament } from '../../components/design-system/ornaments';

<CoachOrnament color="#22C55E" />
```

**Props**:
- `color`: Hex color for the ornament

### GradientText

```javascript
import { GradientText } from '../../components/design-system/ornaments';

<h1 className="text-4xl font-black">
  <GradientText colors={['#8B5CF6', '#A855F7', '#7C3AED']}>
    Admin Portal
  </GradientText>
</h1>
```

**Props**:
- `colors`: Array of hex colors for the gradient
- `children`: Text content

---

## Usage Patterns

### Complete Page Example

```javascript
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// Design system imports
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
import { ThemedInput, ThemedButton } from '../../components/design-system/forms';
import { GlassCard, StatCard } from '../../components/design-system/cards';
import { HexGrid } from '../../components/design-system/backgrounds';
import { FadeIn, useReducedMotion } from '../../components/design-system/animations';
import { ShieldOrnament, GradientText } from '../../components/design-system/ornaments';

// Icons
import { Shield, Users, Trophy } from 'lucide-react';

// API
import { adminAPI } from '../../services/api';

// Role detection
const detectRoleFromPath = (pathname) => {
  const match = pathname.match(/^\/([^/]+)/);
  return match ? match[1] : 'admin';
};

// Inner component (uses theme)
const MyPageInner = () => {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchStats();
  }, []);
  
  const fetchStats = async () => {
    try {
      const response = await adminAPI.getDashboard();
      setStats(response.data.stats);
    } catch (error) {
      toast.error('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen" style={{ background: theme.colors.background }}>
      {/* Background */}
      {!reduced && <HexGrid color={theme.colors.primary} />}
      
      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <FadeIn>
          <div className="text-center mb-12">
            <ShieldOrnament color={theme.colors.primary} />
            <h1 className="text-4xl font-black mt-6">
              <GradientText colors={[
                theme.colors.primary,
                theme.colors.primaryLight,
                theme.colors.primaryDark
              ]}>
                Admin Dashboard
              </GradientText>
            </h1>
          </div>
        </FadeIn>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={Users}
            label="Total Teams"
            value={stats?.totalTeams}
            color={theme.colors.primary}
            delay={0}
          />
          <StatCard
            icon={Trophy}
            label="Competitions"
            value={stats?.totalCompetitions}
            color={theme.colors.primary}
            delay={0.1}
          />
          <StatCard
            icon={Shield}
            label="Active Judges"
            value={stats?.totalJudges}
            color={theme.colors.primary}
            delay={0.2}
          />
        </div>
        
        {/* Details Card */}
        <FadeIn delay={0.3}>
          <GlassCard className="mt-8 p-6">
            <h2 className="text-2xl font-bold text-white mb-4">
              Competition Details
            </h2>
            <p className="text-white/60">
              Detailed information here...
            </p>
          </GlassCard>
        </FadeIn>
      </div>
    </div>
  );
};

// Main component (with ThemeProvider)
const MyPage = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <MyPageInner />
    </ThemeProvider>
  );
};

export default MyPage;
```

---

## Role-Specific Theming

### Color Mapping

| Role | Primary Color | Light Variant | Dark Variant |
|---|---|---|---|
| Admin | `#8B5CF6` (Purple) | `#C4B5FD` | `#7C3AED` |
| SuperAdmin | `#A855F7` (Bright Purple) | `#D8B4FE` | `#9333EA` |
| Coach | `#22C55E` (Green) | `#86EFAC` | `#16A34A` |
| Player | `#FF6B00` (Saffron) | `#FDBA74` | `#EA580C` |
| Judge | `#3B82F6` (Blue) | `#93C5FD` | `#2563EB` |

### Automatic Theme Application

When you wrap a component with `ThemeProvider` and pass a role, the theme automatically applies:

```javascript
<ThemeProvider role="coach">
  {/* All child components get green theme */}
</ThemeProvider>

<ThemeProvider role="player">
  {/* All child components get saffron theme */}
</ThemeProvider>
```

### Accessing Theme Values

```javascript
const MyComponent = () => {
  const theme = useTheme();
  
  // Access role-specific colors
  console.log(theme.colors.primary);      // '#22C55E' for coach
  console.log(theme.colors.primaryLight); // '#86EFAC' for coach
  console.log(theme.colors.primaryDark);  // '#16A34A' for coach
  
  // Access common colors
  console.log(theme.colors.background);   // '#0A0A0A'
  console.log(theme.colors.card);         // '#111111'
  console.log(theme.colors.text);         // '#FFFFFF'
  
  return (
    <div style={{ 
      background: theme.colors.card,
      color: theme.colors.text,
      borderColor: theme.colors.primary
    }}>
      Content
    </div>
  );
};
```

---

## Best Practices

### 1. Always Use ThemeProvider

```javascript
// ✅ Good
const MyPage = () => {
  const role = detectRoleFromPath(location.pathname);
  return (
    <ThemeProvider role={role}>
      <MyPageInner />
    </ThemeProvider>
  );
};

// ❌ Bad
const MyPage = () => {
  return <MyPageInner />; // No theme context
};
```

### 2. Use Design System Components

```javascript
// ✅ Good
import { ThemedInput } from '../../components/design-system/forms';
<ThemedInput icon={Mail} type="email" />

// ❌ Bad
<input 
  type="email" 
  className="bg-gray-800 text-white rounded-lg p-3"
/>
```

### 3. Use Theme Colors

```javascript
// ✅ Good
const theme = useTheme();
<div style={{ color: theme.colors.primary }}>Text</div>

// ❌ Bad
<div style={{ color: '#8B5CF6' }}>Text</div>
```

### 4. Use Design Tokens

```javascript
// ✅ Good
import { DESIGN_TOKENS } from '../../styles/tokens';
<div style={{ padding: DESIGN_TOKENS.spacing.md }}>Content</div>

// ❌ Bad
<div style={{ padding: '16px' }}>Content</div>
```

### 5. Respect Reduced Motion

```javascript
// ✅ Good
const reduced = useReducedMotion();
<motion.div animate={reduced ? {} : { scale: [1, 1.1, 1] }}>
  Content
</motion.div>

// ❌ Bad
<motion.div animate={{ scale: [1, 1.1, 1] }}>
  Content
</motion.div>
```

---

## Related Documentation

- [README.md](./README.md) - Pages folder documentation
- [MIGRATION.md](./MIGRATION.md) - Migration guide
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall architecture
- [Design System Components](../components/design-system/README.md) - Component documentation

---

*Last updated: March 26, 2026*  
*Design system integration completed: Sprint 2, Week 2*
