# Storybook Setup Guide

This guide explains how to set up Storybook for the Mallakhamb Design System and provides example stories for all components.

## Installation

### Step 1: Install Storybook

Run the Storybook initialization command:

```bash
cd Web
npx storybook@latest init
```

This will:
- Install Storybook dependencies
- Create `.storybook` configuration directory
- Add Storybook scripts to `package.json`
- Create example stories

### Step 2: Configure Storybook for Vite

Update `.storybook/main.js`:

```javascript
export default {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|ts|tsx)'
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y', // Accessibility testing
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
};
```

### Step 3: Configure Theme Provider

Update `.storybook/preview.js` to wrap all stories with ThemeProvider:

```javascript
import React from 'react';
import { ThemeProvider } from '../src/components/design-system/theme';
import '../src/index.css'; // Import Tailwind styles

export const decorators = [
  (Story, context) => {
    // Get role from story parameters or use default
    const role = context.parameters.role || 'admin';
    
    return (
      <ThemeProvider role={role}>
        <div style={{
          minHeight: '100vh',
          background: '#0A0A0A',
          padding: '2rem',
        }}>
          <Story />
        </div>
      </ThemeProvider>
    );
  },
];

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  backgrounds: {
    default: 'dark',
    values: [
      {
        name: 'dark',
        value: '#0A0A0A',
      },
      {
        name: 'light',
        value: '#FFFFFF',
      },
    ],
  },
};
```

### Step 4: Add Scripts to package.json

The Storybook init command should add these scripts automatically:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

### Step 5: Run Storybook

```bash
npm run storybook
```

Storybook will open at `http://localhost:6006`

## Story Examples

### Form Components

#### ThemedInput.stories.jsx

```javascript
import React from 'react';
import { ThemedInput } from './ThemedInput';
import { Mail, Lock, User, Search } from 'lucide-react';

export default {
  title: 'Design System/Forms/ThemedInput',
  component: ThemedInput,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel'],
    },
    error: {
      control: 'text',
    },
  },
  parameters: {
    role: 'admin', // Default role for all stories
  },
};

// Default story
export const Default = {
  args: {
    placeholder: 'Enter text...',
  },
};

// With icon
export const WithIcon = {
  args: {
    placeholder: 'Enter email...',
    icon: Mail,
    type: 'email',
  },
};

// With error
export const WithError = {
  args: {
    placeholder: 'Enter password...',
    icon: Lock,
    type: 'password',
    error: 'Password is required',
  },
};

// With right element (password toggle)
export const WithRightElement = {
  render: () => {
    const [showPassword, setShowPassword] = React.useState(false);
    
    return (
      <ThemedInput
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter password..."
        icon={Lock}
        rightElement={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{ color: 'rgba(255,255,255,0.65)' }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        }
      />
    );
  },
};

// Disabled state
export const Disabled = {
  args: {
    placeholder: 'Disabled input...',
    icon: User,
    disabled: true,
  },
};

// Different roles
export const AdminTheme = {
  args: {
    placeholder: 'Admin themed input...',
    icon: Search,
  },
  parameters: {
    role: 'admin',
  },
};

export const CoachTheme = {
  args: {
    placeholder: 'Coach themed input...',
    icon: Search,
  },
  parameters: {
    role: 'coach',
  },
};

export const PlayerTheme = {
  args: {
    placeholder: 'Player themed input...',
    icon: Search,
  },
  parameters: {
    role: 'player',
  },
};
```

#### ThemedButton.stories.jsx

```javascript
import React from 'react';
import { ThemedButton } from './ThemedButton';
import { Save, Trash2, Plus } from 'lucide-react';

export default {
  title: 'Design System/Forms/ThemedButton',
  component: ThemedButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['solid', 'outline', 'ghost'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    loading: {
      control: 'boolean',
    },
  },
};

// Variants
export const Solid = {
  args: {
    children: 'Solid Button',
    variant: 'solid',
  },
};

export const Outline = {
  args: {
    children: 'Outline Button',
    variant: 'outline',
  },
};

export const Ghost = {
  args: {
    children: 'Ghost Button',
    variant: 'ghost',
  },
};

// Sizes
export const Small = {
  args: {
    children: 'Small Button',
    size: 'sm',
  },
};

export const Medium = {
  args: {
    children: 'Medium Button',
    size: 'md',
  },
};

export const Large = {
  args: {
    children: 'Large Button',
    size: 'lg',
  },
};

// With icon
export const WithIcon = {
  args: {
    children: 'Save Changes',
    icon: Save,
  },
};

// Loading state
export const Loading = {
  args: {
    children: 'Submitting...',
    loading: true,
  },
};

// Disabled
export const Disabled = {
  args: {
    children: 'Disabled Button',
    disabled: true,
  },
};

// Different roles
export const AllVariantsAdminTheme = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <ThemedButton variant="solid">Solid</ThemedButton>
      <ThemedButton variant="outline">Outline</ThemedButton>
      <ThemedButton variant="ghost">Ghost</ThemedButton>
    </div>
  ),
  parameters: {
    role: 'admin',
  },
};

export const AllVariantsCoachTheme = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <ThemedButton variant="solid">Solid</ThemedButton>
      <ThemedButton variant="outline">Outline</ThemedButton>
      <ThemedButton variant="ghost">Ghost</ThemedButton>
    </div>
  ),
  parameters: {
    role: 'coach',
  },
};
```

### Card Components

#### GlassCard.stories.jsx

```javascript
import React from 'react';
import { GlassCard } from './GlassCard';

export default {
  title: 'Design System/Cards/GlassCard',
  component: GlassCard,
  tags: ['autodocs'],
};

export const Default = {
  render: () => (
    <GlassCard className="p-6">
      <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
        Glass Card
      </h3>
      <p style={{ color: 'rgba(255,255,255,0.65)' }}>
        This is a glassmorphism card with backdrop blur effect.
      </p>
    </GlassCard>
  ),
};

export const WithContent = {
  render: () => (
    <GlassCard className="p-6" style={{ maxWidth: '400px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
        Competition Details
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px' }}>
            Name
          </div>
          <div style={{ fontWeight: '500' }}>
            National Championship 2024
          </div>
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px' }}>
            Location
          </div>
          <div style={{ fontWeight: '500' }}>
            Mumbai, Maharashtra
          </div>
        </div>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px' }}>
            Date
          </div>
          <div style={{ fontWeight: '500' }}>
            March 15-17, 2024
          </div>
        </div>
      </div>
    </GlassCard>
  ),
};
```

#### DarkCard.stories.jsx

```javascript
import React from 'react';
import { DarkCard } from './DarkCard';

export default {
  title: 'Design System/Cards/DarkCard',
  component: DarkCard,
  tags: ['autodocs'],
  argTypes: {
    hover: {
      control: 'boolean',
    },
  },
};

export const Default = {
  render: () => (
    <DarkCard className="p-6">
      <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
        Dark Card
      </h3>
      <p style={{ color: 'rgba(255,255,255,0.65)' }}>
        This is a dark glassmorphism card.
      </p>
    </DarkCard>
  ),
};

export const WithHover = {
  render: () => (
    <DarkCard hover className="p-6">
      <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
        Hover Me
      </h3>
      <p style={{ color: 'rgba(255,255,255,0.65)' }}>
        This card has a hover animation effect.
      </p>
    </DarkCard>
  ),
};
```

#### StatCard.stories.jsx

```javascript
import React from 'react';
import { StatCard } from './StatCard';
import { Users, Trophy, Target, Award } from 'lucide-react';
import { DESIGN_TOKENS } from '../../../styles/tokens';

export default {
  title: 'Design System/Cards/StatCard',
  component: StatCard,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    icon: Users,
    label: 'Total Teams',
    value: 24,
    color: DESIGN_TOKENS.colors.roles.admin,
  },
};

export const WithSubtitle = {
  args: {
    icon: Trophy,
    label: 'Competitions',
    value: 12,
    subtitle: 'Active this season',
    color: DESIGN_TOKENS.colors.brand.gold,
  },
};

export const MultipleStats = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
      <StatCard
        icon={Users}
        label="Total Teams"
        value={24}
        color={DESIGN_TOKENS.colors.roles.admin}
        delay={0}
      />
      <StatCard
        icon={Trophy}
        label="Competitions"
        value={12}
        color={DESIGN_TOKENS.colors.brand.gold}
        delay={0.1}
      />
      <StatCard
        icon={Target}
        label="Active Players"
        value={156}
        color={DESIGN_TOKENS.colors.roles.player}
        delay={0.2}
      />
      <StatCard
        icon={Award}
        label="Judges"
        value={8}
        color={DESIGN_TOKENS.colors.roles.judge}
        delay={0.3}
      />
    </div>
  ),
};
```

### Background Decorations

#### Backgrounds.stories.jsx

```javascript
import React from 'react';
import { HexGrid, RadialBurst, DiagonalBurst, HexMesh, Constellation } from './index';
import { DESIGN_TOKENS } from '../../../styles/tokens';

export default {
  title: 'Design System/Backgrounds',
  parameters: {
    layout: 'fullscreen',
  },
};

export const HexGridExample = {
  render: () => (
    <div style={{ position: 'relative', height: '400px', background: '#0A0A0A' }}>
      <HexGrid color={DESIGN_TOKENS.colors.roles.admin} opacity={0.15} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold' }}>HexGrid Background</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
          Hexagonal grid pattern decoration
        </p>
      </div>
    </div>
  ),
};

export const RadialBurstExample = {
  render: () => (
    <div style={{ position: 'relative', height: '400px', background: '#0A0A0A' }}>
      <RadialBurst position="top-right" size="lg" color={DESIGN_TOKENS.colors.roles.coach} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold' }}>RadialBurst Background</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
          Radial gradient burst effect
        </p>
      </div>
    </div>
  ),
};

export const DiagonalBurstExample = {
  render: () => (
    <div style={{ position: 'relative', height: '400px', background: '#0A0A0A' }}>
      <DiagonalBurst color={DESIGN_TOKENS.colors.roles.player} opacity={0.2} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold' }}>DiagonalBurst Background</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
          Diagonal gradient effect
        </p>
      </div>
    </div>
  ),
};

export const HexMeshExample = {
  render: () => (
    <div style={{ position: 'relative', height: '400px', background: '#0A0A0A' }}>
      <HexMesh color={DESIGN_TOKENS.colors.roles.judge} opacity={0.1} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold' }}>HexMesh Background</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
          Hexagonal mesh pattern
        </p>
      </div>
    </div>
  ),
};

export const ConstellationExample = {
  render: () => (
    <div style={{ position: 'relative', height: '400px', background: '#0A0A0A' }}>
      <Constellation color={DESIGN_TOKENS.colors.brand.saffron} opacity={0.3} />
      <div style={{ position: 'relative', zIndex: 1, padding: '2rem' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 'bold' }}>Constellation Background</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '8px' }}>
          Animated star field with connected dots
        </p>
      </div>
    </div>
  ),
};

export const AllBackgrounds = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
      <div style={{ position: 'relative', height: '200px', background: '#0A0A0A', borderRadius: '8px', overflow: 'hidden' }}>
        <HexGrid color={DESIGN_TOKENS.colors.roles.admin} opacity={0.15} />
        <div style={{ position: 'relative', zIndex: 1, padding: '1rem' }}>
          <h3 style={{ fontWeight: 'bold' }}>HexGrid</h3>
        </div>
      </div>
      
      <div style={{ position: 'relative', height: '200px', background: '#0A0A0A', borderRadius: '8px', overflow: 'hidden' }}>
        <RadialBurst position="center" size="md" color={DESIGN_TOKENS.colors.roles.coach} />
        <div style={{ position: 'relative', zIndex: 1, padding: '1rem' }}>
          <h3 style={{ fontWeight: 'bold' }}>RadialBurst</h3>
        </div>
      </div>
      
      <div style={{ position: 'relative', height: '200px', background: '#0A0A0A', borderRadius: '8px', overflow: 'hidden' }}>
        <DiagonalBurst color={DESIGN_TOKENS.colors.roles.player} opacity={0.2} />
        <div style={{ position: 'relative', zIndex: 1, padding: '1rem' }}>
          <h3 style={{ fontWeight: 'bold' }}>DiagonalBurst</h3>
        </div>
      </div>
      
      <div style={{ position: 'relative', height: '200px', background: '#0A0A0A', borderRadius: '8px', overflow: 'hidden' }}>
        <HexMesh color={DESIGN_TOKENS.colors.roles.judge} opacity={0.1} />
        <div style={{ position: 'relative', zIndex: 1, padding: '1rem' }}>
          <h3 style={{ fontWeight: 'bold' }}>HexMesh</h3>
        </div>
      </div>
      
      <div style={{ position: 'relative', height: '200px', background: '#0A0A0A', borderRadius: '8px', overflow: 'hidden' }}>
        <Constellation color={DESIGN_TOKENS.colors.brand.saffron} opacity={0.3} />
        <div style={{ position: 'relative', zIndex: 1, padding: '1rem' }}>
          <h3 style={{ fontWeight: 'bold' }}>Constellation</h3>
        </div>
      </div>
    </div>
  ),
};
```

### Theme Variations

#### ThemeShowcase.stories.jsx

```javascript
import React from 'react';
import { ThemeProvider } from '../theme';
import { ThemedButton, ThemedInput } from '../forms';
import { StatCard } from '../cards';
import { Users } from 'lucide-react';
import { DESIGN_TOKENS } from '../../../styles/tokens';

export default {
  title: 'Design System/Theme Variations',
  parameters: {
    layout: 'fullscreen',
  },
};

const ThemeDemo = ({ role }) => (
  <ThemeProvider role={role}>
    <div style={{ padding: '2rem', background: '#0A0A0A', minHeight: '400px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '1rem', textTransform: 'capitalize' }}>
        {role} Theme
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '400px' }}>
        <ThemedInput placeholder="Themed input..." />
        
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <ThemedButton variant="solid">Solid</ThemedButton>
          <ThemedButton variant="outline">Outline</ThemedButton>
          <ThemedButton variant="ghost">Ghost</ThemedButton>
        </div>
        
        <StatCard
          icon={Users}
          label="Sample Stat"
          value={42}
          color={DESIGN_TOKENS.colors.roles[role]}
        />
      </div>
    </div>
  </ThemeProvider>
);

export const AdminTheme = {
  render: () => <ThemeDemo role="admin" />,
};

export const SuperAdminTheme = {
  render: () => <ThemeDemo role="superadmin" />,
};

export const CoachTheme = {
  render: () => <ThemeDemo role="coach" />,
};

export const PlayerTheme = {
  render: () => <ThemeDemo role="player" />,
};

export const JudgeTheme = {
  render: () => <ThemeDemo role="judge" />,
};

export const AllThemes = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1rem' }}>
      <ThemeDemo role="admin" />
      <ThemeDemo role="superadmin" />
      <ThemeDemo role="coach" />
      <ThemeDemo role="player" />
      <ThemeDemo role="judge" />
    </div>
  ),
};
```

## Running Storybook

After setup, run:

```bash
npm run storybook
```

This will start Storybook on `http://localhost:6006` where you can:

- Browse all components
- Test different props and states
- View component documentation
- Test accessibility with the a11y addon
- Test responsive behavior
- View theme variations

## Building Storybook

To build a static version of Storybook for deployment:

```bash
npm run build-storybook
```

This creates a `storybook-static` directory that can be deployed to any static hosting service.

## Next Steps

1. Install Storybook using the commands above
2. Copy the story files from this guide to the appropriate component directories
3. Run Storybook and verify all stories work correctly
4. Add more stories as needed for new components
5. Use Storybook for component development and documentation

## Resources

- [Storybook Documentation](https://storybook.js.org/docs/react/get-started/introduction)
- [Storybook for Vite](https://storybook.js.org/docs/react/builders/vite)
- [Accessibility Addon](https://storybook.js.org/addons/@storybook/addon-a11y)
