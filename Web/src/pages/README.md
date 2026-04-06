# Pages Folder Documentation

**Last Updated:** March 26, 2026  
**Status:** ✅ Refactoring Complete

---

## Overview

The `pages/` folder contains all page-level React components for the Mallakhamb Competition Management System, organized by user role for improved maintainability and discoverability. This refactoring consolidates 29 page files across 5 user roles (Admin, SuperAdmin, Coach, Player, Judge) into a clean, role-based structure with unified components that adapt to user context.

### Key Improvements

- **30%+ Code Reduction**: Eliminated duplication through unified components
- **Role-Based Organization**: Clear folder structure by user type
- **Modern React Patterns**: Custom hooks, composition, and proper separation of concerns
- **Design System Integration**: Centralized tokens and components
- **Backward Compatible**: Zero breaking changes during migration

---

## Folder Structure

```
pages/
├── admin/                      # Admin-specific pages (7 files)
│   ├── AdminDashboard.jsx     # Competition-specific dashboard
│   ├── AdminLogin.jsx         # Admin authentication
│   ├── AdminTeams.jsx         # Team management
│   ├── AdminScores.jsx        # Score viewing
│   ├── AdminJudges.jsx        # Judge assignment
│   ├── AdminScoring.jsx       # Manual scoring interface
│   └── AdminTransactions.jsx  # Payment transactions
│
├── superadmin/                 # SuperAdmin-specific pages (4 files)
│   ├── SuperAdminDashboard.jsx     # System-wide dashboard
│   ├── SuperAdminLogin.jsx         # SuperAdmin authentication
│   ├── SuperAdminManagement.jsx    # Admin & competition management
│   └── SuperAdminSystemStats.jsx   # System statistics
│
├── coach/                      # Coach-specific pages (6 files)
│   ├── CoachLogin.jsx         # Coach authentication
│   ├── CoachRegister.jsx      # Coach registration
│   ├── CoachDashboard.jsx     # Team overview
│   ├── CoachCreateTeam.jsx    # Team creation wizard
│   ├── CoachSelectCompetition.jsx  # Competition selection
│   └── CoachPayment.jsx       # Payment processing
│
├── player/                     # Player-specific pages (4 files)
│   ├── PlayerLogin.jsx        # Player authentication
│   ├── PlayerRegister.jsx     # Player registration
│   ├── PlayerDashboard.jsx    # Personal dashboard
│   └── PlayerSelectTeam.jsx   # Team selection
│
├── judge/                      # Judge-specific pages (2 files)
│   ├── JudgeLogin.jsx         # Judge authentication
│   └── JudgeScoring.jsx       # Live scoring interface
│
├── public/                     # Public-facing pages (2 files)
│   ├── Home.jsx               # Landing page
│   └── PublicScores.jsx       # Public score viewing
│
├── shared/                     # Shared utility pages (3 files)
│   ├── ForgotPassword.jsx     # Password reset request
│   ├── ResetPassword.jsx      # Password reset confirmation
│   └── DesignTokenAuditPage.jsx  # Design system audit tool
│
└── unified/                    # Cross-role unified components (4 files)
    ├── UnifiedLogin.jsx       # Role-adaptive login
    ├── UnifiedDashboard.jsx   # Admin/SuperAdmin dashboard
    ├── UnifiedRegister.jsx    # Coach/Player registration
    └── UnifiedCompetitionSelection.jsx  # Coach/Player selection
```

---

## Unified Components

Unified components are single components that adapt their behavior and styling based on the current user role, eliminating code duplication across similar pages.

### UnifiedLogin

**Purpose**: Single login component for all 5 user roles  
**Routes**: `/admin/login`, `/coach/login`, `/player/login`, `/judge/login`, `/superadmin/login`

**Features**:
- Role detection from route path
- Role-specific theming (colors, icons, backgrounds)
- Role-specific authentication endpoints
- Competition selection for Admin after login
- Redirect to appropriate dashboard based on role

**Usage**:
```javascript
// In App.jsx
<Route path="/admin/login" element={<UnifiedLogin />} />
<Route path="/coach/login" element={<UnifiedLogin />} />
```

### UnifiedDashboard

**Purpose**: Single dashboard for Admin and SuperAdmin roles  
**Routes**: `/admin/dashboard`, `/superadmin/dashboard`

**Features**:
- Admin view: Competition-specific statistics and judge assignment
- SuperAdmin view: System-wide statistics and competition filtering
- Shared navigation tabs with role-specific options
- Real-time updates via socket.io
- Mobile-responsive design

**Usage**:
```javascript
// In App.jsx
<Route path="/admin/dashboard" element={
  <ProtectedRoute requiredUserType="admin">
    <UnifiedDashboard />
  </ProtectedRoute>
} />
```

### UnifiedRegister

**Purpose**: Single registration component for Coach and Player roles  
**Routes**: `/coach/register`, `/player/register`

**Features**:
- Role detection from route path
- Role-specific theming (green for Coach, saffron for Player)
- Role-specific form fields
- Form validation with react-hook-form
- Post-registration navigation

**Usage**:
```javascript
// In App.jsx
<Route path="/coach/register" element={<UnifiedRegister />} />
<Route path="/player/register" element={<UnifiedRegister />} />
```

### UnifiedCompetitionSelection

**Purpose**: Single selection component for Coach and Player roles  
**Routes**: `/coach/select-competition`, `/player/select-team`

**Features**:
- Coach view: Competition selection with details
- Player view: Team selection with competition info
- Role-specific theming
- API integration for fetching competitions/teams
- Selection persistence in CompetitionContext

**Usage**:
```javascript
// In App.jsx
<Route path="/coach/select-competition" element={
  <ProtectedRoute requiredUserType="coach">
    <UnifiedCompetitionSelection />
  </ProtectedRoute>
} />
```

---

## Role Detection Mechanism

All unified components use a consistent role detection strategy based on the route path:

```javascript
/**
 * Detect user role from route path
 * @param {string} pathname - Current route pathname (e.g., "/coach/login")
 * @returns {string} Detected role (admin, superadmin, coach, player, judge)
 */
const detectRoleFromPath = (pathname) => {
  const roleMatch = pathname.match(/^\/([^/]+)/);
  if (!roleMatch) return 'admin'; // Default fallback
  
  const segment = roleMatch[1].toLowerCase();
  const roleMap = {
    admin: 'admin',
    superadmin: 'superadmin',
    'super-admin': 'superadmin', // Handle variations
    coach: 'coach',
    player: 'player',
    judge: 'judge',
  };
  
  return roleMap[segment] || 'admin';
};
```

This approach ensures:
- **Consistency**: All unified components use the same detection logic
- **Reliability**: Based on URL structure, not state that could be stale
- **Simplicity**: No prop drilling or complex context lookups
- **Testability**: Easy to test with different route paths

---

## Design System Integration

All pages integrate with the centralized design system located in `Web/src/components/design-system/` and `Web/src/styles/tokens.js`.

### Importing Design Tokens

```javascript
import { DESIGN_TOKENS, getRoleColor } from '../../styles/tokens';

// Access tokens
const primaryColor = DESIGN_TOKENS.colors.roles.admin; // '#8B5CF6'
const cardBackground = DESIGN_TOKENS.colors.surfaces.darkCard; // '#111111'
const spacing = DESIGN_TOKENS.spacing.md; // '16px'

// Or use helper functions
const roleColor = getRoleColor('admin'); // '#8B5CF6'
```

### Using Design System Components

```javascript
// Form components
import { ThemedInput, ThemedButton, ThemedSelect } from '../../components/design-system/forms';

// Card components
import { GlassCard, DarkCard, StatCard } from '../../components/design-system/cards';

// Background components
import { HexGrid, RadialBurst, HexMesh } from '../../components/design-system/backgrounds';

// Animation components
import { FadeIn } from '../../components/design-system/animations';
import { useReducedMotion } from '../../components/design-system/animations';

// Theme provider
import { ThemeProvider, useTheme } from '../../components/design-system/theme';
```

### Using the Theme Provider

```javascript
const MyPage = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <MyPageInner />
    </ThemeProvider>
  );
};

const MyPageInner = () => {
  const theme = useTheme();
  
  return (
    <div style={{ background: theme.colors.background }}>
      <h1 style={{ color: theme.colors.primary }}>Title</h1>
    </div>
  );
};
```

---

## Adding New Pages

### Step 1: Determine Page Type

**Role-Specific Page**: Place in the appropriate role folder (admin/, coach/, player/, judge/, superadmin/)  
**Unified Component**: Place in unified/ if used by 2+ roles with adaptive behavior  
**Public Page**: Place in public/ if no authentication required  
**Shared Utility**: Place in shared/ if used across roles but not role-adaptive

### Step 2: Create the Component

```javascript
// Example: Web/src/pages/coach/CoachReports.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../App';
import { coachAPI } from '../../services/api';
import { DarkCard } from '../../components/design-system/cards';
import { ThemedButton } from '../../components/design-system/forms';

const CoachReports = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchReports();
  }, []);
  
  const fetchReports = async () => {
    try {
      const response = await coachAPI.getReports();
      setReports(response.data.reports);
    } catch (error) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div className="min-h-screen p-8 bg-dark">
      <h1 className="text-3xl font-black text-white mb-6">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map(report => (
          <DarkCard key={report._id}>
            <h3 className="text-xl font-bold text-white">{report.title}</h3>
            <p className="text-white/60">{report.description}</p>
            <ThemedButton onClick={() => downloadReport(report._id)}>
              Download
            </ThemedButton>
          </DarkCard>
        ))}
      </div>
    </div>
  );
};

export default CoachReports;
```

### Step 3: Add Route in App.jsx

```javascript
// Import the component (lazy loading)
const CoachReports = lazy(() => import('./pages/coach/CoachReports'));

// Add route in the Routes section
<Route path="/coach/reports" element={
  <ProtectedRoute requiredUserType="coach">
    <CoachReports />
  </ProtectedRoute>
} />
```

### Step 4: Add Navigation Link

```javascript
// In CoachDashboard.jsx or navigation component
<Link to="/coach/reports" className="nav-link">
  Reports
</Link>
```

---

## Best Practices

### 1. Use Custom Hooks

```javascript
// Use existing hooks for common functionality
const { user, userType, login, logout } = useAuth();
const { currentCompetition, setCurrentCompetition } = useCompetition();
const theme = useTheme();
const { isMobile, isTablet, isDesktop } = useResponsive();
```

### 2. Implement Proper Error Handling

```javascript
const fetchData = async () => {
  try {
    const response = await api.getData();
    setData(response.data);
  } catch (error) {
    toast.error(error.response?.data?.message || 'Failed to load data');
    logger.error('fetchData error:', error);
  } finally {
    setLoading(false);
  }
};
```

### 3. Use Design System Components

```javascript
// Instead of custom styled divs
<div className="bg-gray-800 rounded-lg p-4">
  <input className="bg-gray-700 text-white" />
</div>

// Use design system components
<DarkCard>
  <ThemedInput placeholder="Enter value" />
</DarkCard>
```

### 4. Implement Accessibility

```javascript
// Add ARIA labels
<button aria-label="Close modal" onClick={onClose}>
  <X />
</button>

// Ensure keyboard navigation
<div 
  role="button" 
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</div>

// Use semantic HTML
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/dashboard">Dashboard</a></li>
  </ul>
</nav>
```

### 5. Optimize Performance

```javascript
// Use React.memo for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* Complex rendering */}</div>;
});

// Use useMemo for expensive calculations
const filteredData = useMemo(() => {
  return data.filter(item => item.active);
}, [data]);

// Use useCallback for event handlers
const handleClick = useCallback(() => {
  // Handle click
}, []);
```

### 6. Follow Single Responsibility Principle

```javascript
// Bad: Component doing too much
const Dashboard = () => {
  // Data fetching, state management, business logic, rendering
  // 500+ lines of code
};

// Good: Separated concerns
const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'teams' && <TeamsTab />}
    </DashboardLayout>
  );
};
```

---

## Testing

All pages should have corresponding test files following these patterns:

### Unit Tests

```javascript
// CoachDashboard.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CoachDashboard from './CoachDashboard';

describe('CoachDashboard', () => {
  it('renders dashboard title', () => {
    render(
      <BrowserRouter>
        <CoachDashboard />
      </BrowserRouter>
    );
    expect(screen.getByText('Coach Dashboard')).toBeInTheDocument();
  });
  
  it('fetches and displays teams', async () => {
    // Mock API
    // Render component
    // Wait for data
    // Assert teams are displayed
  });
});
```

### Integration Tests

```javascript
// Test complete user flows
it('completes registration flow', async () => {
  // Navigate to register page
  // Fill form
  // Submit
  // Verify redirect to dashboard
});
```

---

## Migration Guide

For detailed migration instructions from the old structure, see [MIGRATION.md](./MIGRATION.md).

---

## Related Documentation

- [MIGRATION.md](./MIGRATION.md) - Migration guide from old structure
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall architecture documentation
- [WEB_DOCUMENTATION.md](../../WEB_DOCUMENTATION.md) - Complete web frontend documentation
- [Design System Documentation](../components/design-system/README.md) - Design system components and tokens

---

*Last updated: March 26, 2026*  
*Refactoring completed: Sprint 2, Week 2*
