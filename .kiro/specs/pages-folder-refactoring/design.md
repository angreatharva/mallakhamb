# Design Document: Pages Folder Refactoring

## Overview

This design document specifies the technical architecture for refactoring the Web/src/pages folder in the Mallakhamb competition management platform. The refactoring addresses significant code duplication across 29 page files serving 5 user roles (Admin, SuperAdmin, Coach, Player, Judge) by establishing a modern, role-based folder structure, consolidating duplicated code into unified components, and implementing contemporary React patterns.

### Goals

1. **Eliminate Code Duplication**: Reduce page code by 30%+ through consolidation of login, registration, dashboard, and competition selection pages
2. **Establish Clear Organization**: Implement role-based folder structure for improved navigation and maintainability
3. **Modernize React Patterns**: Apply custom hooks, component composition, and proper separation of concerns
4. **Integrate Design System**: Leverage centralized design tokens and components from the global design system refactoring
5. **Maintain Backward Compatibility**: Ensure zero breaking changes during migration with redirect wrappers and index re-exports
6. **Optimize Performance**: Implement code splitting, lazy loading, and memoization for faster load times

### Scope

**In Scope:**
- File renaming (JudgeScoringNew → JudgeScoring)
- Role-based folder organization (admin/, coach/, player/, judge/, superadmin/, public/, shared/, unified/)
- Unified component creation (UnifiedRegister, UnifiedCompetitionSelection)
- Documentation of existing unified components (UnifiedLogin, UnifiedDashboard)
- Modern React patterns (custom hooks, composition, error boundaries)
- Design system integration
- Routing configuration updates
- Backward compatibility strategy
- Testing suite
- Migration documentation

**Out of Scope:**
- Backend API changes
- Database schema modifications
- Authentication flow changes (maintain existing flows)
- New feature development
- UI/UX redesign (maintain existing interfaces)

### Success Criteria

1. All 29 page files organized into role-based folders
2. JudgeScoringNew renamed to JudgeScoring with all references updated
3. UnifiedRegister and UnifiedCompetitionSelection components created and functional
4. All existing routes continue to function without breaking
5. Code coverage maintained at 80%+ for refactored components
6. Bundle size does not increase
7. Lighthouse performance scores maintained or improved
8. Zero regressions in existing functionality



## Architecture

### High-Level Architecture

The refactored pages folder follows a role-based architecture with unified components that adapt to user context:

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.jsx (Router)                         │
│                    AuthContext + CompetitionProvider             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼────────┐       ┌───────▼────────┐
        │  Role-Specific │       │     Unified    │
        │     Pages      │       │   Components   │
        └───────┬────────┘       └───────┬────────┘
                │                        │
    ┌───────────┼────────────┐          │
    │           │            │          │
┌───▼───┐  ┌───▼───┐  ┌────▼────┐  ┌──▼──────────┐
│ Admin │  │ Coach │  │ Player  │  │ UnifiedLogin│
│ Pages │  │ Pages │  │  Pages  │  │ UnifiedDash │
└───┬───┘  └───┬───┘  └────┬────┘  │ UnifiedReg  │
    │          │           │       │ UnifiedComp │
    └──────────┴───────────┴───────┴─────────────┘
                             │
                    ┌────────▼────────┐
                    │  Design System  │
                    │   Components    │
                    │  (Tokens, UI)   │
                    └─────────────────┘
```

### Component Hierarchy

```
pages/
├── unified/                    # Cross-role unified components
│   ├── UnifiedLogin.jsx       # Existing: Role-adaptive login
│   ├── UnifiedDashboard.jsx   # Existing: Admin/SuperAdmin dashboard
│   ├── UnifiedRegister.jsx    # New: Coach/Player registration
│   └── UnifiedCompetitionSelection.jsx  # New: Coach/Player selection
│
├── admin/                      # Admin-specific pages
│   ├── AdminDashboard.jsx     # Redirect wrapper → UnifiedDashboard
│   ├── AdminLogin.jsx         # Redirect wrapper → UnifiedLogin
│   ├── AdminTeams.jsx         # Standalone component
│   ├── AdminScores.jsx        # Standalone component
│   ├── AdminJudges.jsx        # Standalone component
│   ├── AdminScoring.jsx       # Standalone component
│   ├── AdminTransactions.jsx  # Standalone component
│   └── adminTheme.js          # Deprecated (use design system)
│
├── superadmin/                 # SuperAdmin-specific pages
│   ├── SuperAdminDashboard.jsx     # Redirect wrapper → UnifiedDashboard
│   ├── SuperAdminLogin.jsx         # Redirect wrapper → UnifiedLogin
│   ├── SuperAdminManagement.jsx    # Standalone component
│   └── SuperAdminSystemStats.jsx   # Standalone component
│
├── coach/                      # Coach-specific pages
│   ├── CoachLogin.jsx         # Redirect wrapper → UnifiedLogin
│   ├── CoachRegister.jsx      # Redirect wrapper → UnifiedRegister
│   ├── CoachDashboard.jsx     # Standalone component
│   ├── CoachCreateTeam.jsx    # Standalone component
│   ├── CoachSelectCompetition.jsx  # Redirect wrapper → UnifiedCompetitionSelection
│   └── CoachPayment.jsx       # Standalone component
│
├── player/                     # Player-specific pages
│   ├── PlayerLogin.jsx        # Redirect wrapper → UnifiedLogin
│   ├── PlayerRegister.jsx     # Redirect wrapper → UnifiedRegister
│   ├── PlayerDashboard.jsx    # Standalone component
│   └── PlayerSelectTeam.jsx   # Redirect wrapper → UnifiedCompetitionSelection
│
├── judge/                      # Judge-specific pages
│   ├── JudgeLogin.jsx         # Redirect wrapper → UnifiedLogin
│   └── JudgeScoring.jsx       # Renamed from JudgeScoringNew.jsx
│
├── public/                     # Public-facing pages
│   ├── Home.jsx               # Landing page
│   └── PublicScores.jsx       # Public score viewing
│
├── shared/                     # Shared utility pages
│   ├── ForgotPassword.jsx     # Password reset request
│   ├── ResetPassword.jsx      # Password reset form
│   └── DesignTokenAuditPage.jsx  # Design system audit tool
│
└── index.js                    # Root-level re-exports for backward compatibility
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Authentication Flow                    │
└─────────────────────────────────────────────────────────────────┘

1. User navigates to /{role}/login
   │
   ├─→ UnifiedLogin detects role from route path
   │   ├─→ Applies role-specific theme (ThemeProvider)
   │   ├─→ Renders role-specific UI (icons, colors, backgrounds)
   │   └─→ Submits to role-specific API endpoint
   │
2. On successful authentication:
   │
   ├─→ AuthContext.login(userData, token, role)
   │   ├─→ Stores token in secureStorage with role prefix
   │   └─→ Updates global auth state
   │
3. Navigation based on role:
   │
   ├─→ Admin: CompetitionSelectionScreen → /admin/dashboard
   ├─→ SuperAdmin: /superadmin/dashboard
   ├─→ Coach: /coach/select-competition or /coach/create-team
   ├─→ Player: /player/select-team or /player/dashboard
   └─→ Judge: /judge/scoring

┌─────────────────────────────────────────────────────────────────┐
│                    Competition Context Flow                      │
└─────────────────────────────────────────────────────────────────┘

1. CompetitionProvider wraps protected routes
   │
   ├─→ Loads selected competition from secureStorage
   ├─→ Provides currentCompetition to child components
   └─→ Handles competition selection changes
   │
2. Components access competition via useCompetition hook
   │
   ├─→ CompetitionDisplay shows current selection
   ├─→ CompetitionSelector allows changing selection
   └─→ Dashboard components filter data by competition
```

### Role Detection Mechanism

All unified components use a consistent role detection strategy:

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



## Folder Structure Design

### Detailed Folder Organization

The new folder structure groups pages by role for improved discoverability and maintainability:

#### Role-Based Folders

**admin/** - Admin-specific pages (6 files + 1 theme file)
```
admin/
├── AdminDashboard.jsx          # Redirect wrapper → unified/UnifiedDashboard
├── AdminLogin.jsx              # Redirect wrapper → unified/UnifiedLogin
├── AdminTeams.jsx              # Team management interface
├── AdminScores.jsx             # Score viewing and management
├── AdminJudges.jsx             # Judge assignment interface
├── AdminScoring.jsx            # Manual scoring interface
├── AdminTransactions.jsx       # Payment transaction management
└── adminTheme.js               # DEPRECATED: Use design system tokens
```

**superadmin/** - SuperAdmin-specific pages (4 files)
```
superadmin/
├── SuperAdminDashboard.jsx     # Redirect wrapper → unified/UnifiedDashboard
├── SuperAdminLogin.jsx         # Redirect wrapper → unified/UnifiedLogin
├── SuperAdminManagement.jsx    # Admin and competition management
└── SuperAdminSystemStats.jsx   # System-wide statistics
```

**coach/** - Coach-specific pages (6 files)
```
coach/
├── CoachLogin.jsx              # Redirect wrapper → unified/UnifiedLogin
├── CoachRegister.jsx           # Redirect wrapper → unified/UnifiedRegister
├── CoachDashboard.jsx          # Team overview and management
├── CoachCreateTeam.jsx         # Team creation wizard
├── CoachSelectCompetition.jsx  # Redirect wrapper → unified/UnifiedCompetitionSelection
└── CoachPayment.jsx            # Payment processing
```

**player/** - Player-specific pages (4 files)
```
player/
├── PlayerLogin.jsx             # Redirect wrapper → unified/UnifiedLogin
├── PlayerRegister.jsx          # Redirect wrapper → unified/UnifiedRegister
├── PlayerDashboard.jsx         # Personal dashboard and scores
└── PlayerSelectTeam.jsx        # Redirect wrapper → unified/UnifiedCompetitionSelection
```

**judge/** - Judge-specific pages (2 files)
```
judge/
├── JudgeLogin.jsx              # Redirect wrapper → unified/UnifiedLogin
└── JudgeScoring.jsx            # RENAMED from JudgeScoringNew.jsx - Live scoring interface
```

**public/** - Public-facing pages (2 files)
```
public/
├── Home.jsx                    # Landing page with role selection
└── PublicScores.jsx            # Public score viewing (no auth required)
```

**shared/** - Shared utility pages (3 files)
```
shared/
├── ForgotPassword.jsx          # Password reset request form
├── ResetPassword.jsx           # Password reset confirmation form
└── DesignTokenAuditPage.jsx    # Design system audit tool (dev only)
```

**unified/** - Cross-role unified components (4 files + tests)
```
unified/
├── UnifiedLogin.jsx            # EXISTING: Role-adaptive login component
├── UnifiedDashboard.jsx        # EXISTING: Admin/SuperAdmin dashboard
├── UnifiedRegister.jsx         # NEW: Coach/Player registration
├── UnifiedCompetitionSelection.jsx  # NEW: Coach/Player competition/team selection
├── UnifiedDashboard.test.jsx   # Unit tests
└── visual-regression.test.jsx  # Visual regression tests
```

### File Placement Rules

1. **Role-Specific Pages**: Place in corresponding role folder (admin/, coach/, player/, judge/, superadmin/)
2. **Unified Components**: Place in unified/ folder if used by 2+ roles with adaptive behavior
3. **Public Pages**: Place in public/ folder if no authentication required
4. **Shared Utilities**: Place in shared/ folder if used across roles but not role-adaptive
5. **Redirect Wrappers**: Keep in role folders for backward compatibility during migration

### Index.js Re-Export Strategy

To maintain backward compatibility during migration, create a root-level index.js that re-exports all moved files:

```javascript
// Web/src/pages/index.js
// Backward compatibility re-exports
// These will be removed after 2 sprints when all consumers have migrated

// Admin pages
export { default as AdminDashboard } from './admin/AdminDashboard';
export { default as AdminLogin } from './admin/AdminLogin';
export { default as AdminTeams } from './admin/AdminTeams';
export { default as AdminScores } from './admin/AdminScores';
export { default as AdminJudges } from './admin/AdminJudges';
export { default as AdminScoring } from './admin/AdminScoring';
export { default as AdminTransactions } from './admin/AdminTransactions';

// SuperAdmin pages
export { default as SuperAdminDashboard } from './superadmin/SuperAdminDashboard';
export { default as SuperAdminLogin } from './superadmin/SuperAdminLogin';
export { default as SuperAdminManagement } from './superadmin/SuperAdminManagement';
export { default as SuperAdminSystemStats } from './superadmin/SuperAdminSystemStats';

// Coach pages
export { default as CoachLogin } from './coach/CoachLogin';
export { default as CoachRegister } from './coach/CoachRegister';
export { default as CoachDashboard } from './coach/CoachDashboard';
export { default as CoachCreateTeam } from './coach/CoachCreateTeam';
export { default as CoachSelectCompetition } from './coach/CoachSelectCompetition';
export { default as CoachPayment } from './coach/CoachPayment';

// Player pages
export { default as PlayerLogin } from './player/PlayerLogin';
export { default as PlayerRegister } from './player/PlayerRegister';
export { default as PlayerDashboard } from './player/PlayerDashboard';
export { default as PlayerSelectTeam } from './player/PlayerSelectTeam';

// Judge pages
export { default as JudgeLogin } from './judge/JudgeLogin';
export { default as JudgeScoring } from './judge/JudgeScoring'; // Note: renamed from JudgeScoringNew

// Public pages
export { default as Home } from './public/Home';
export { default as PublicScores } from './public/PublicScores';

// Shared pages
export { default as ForgotPassword } from './shared/ForgotPassword';
export { default as ResetPassword } from './shared/ResetPassword';
export { default as DesignTokenAuditPage } from './shared/DesignTokenAuditPage';

// Unified components
export { default as UnifiedLogin } from './unified/UnifiedLogin';
export { default as UnifiedDashboard } from './unified/UnifiedDashboard';
export { default as UnifiedRegister } from './unified/UnifiedRegister';
export { default as UnifiedCompetitionSelection } from './unified/UnifiedCompetitionSelection';

// Deprecation warnings in development
if (process.env.NODE_ENV === 'development') {
  console.warn(
    '[Pages Refactoring] You are importing from the root pages/index.js. ' +
    'This is deprecated and will be removed in 2 sprints. ' +
    'Please update imports to use the new folder structure. ' +
    'See MIGRATION.md for details.'
  );
}
```

### Migration Path

**Phase 1: Preparation (Sprint 1, Week 1)**
1. Create new folder structure (admin/, coach/, player/, judge/, superadmin/, public/, shared/)
2. Move files to new locations
3. Create index.js with re-exports
4. Update App.jsx imports to use new paths

**Phase 2: Unified Components (Sprint 1, Week 2)**
1. Create UnifiedRegister component
2. Create UnifiedCompetitionSelection component
3. Create redirect wrappers in role folders
4. Update tests

**Phase 3: Validation (Sprint 2, Week 1)**
1. Run full test suite
2. Perform manual testing of all flows
3. Monitor for issues in production

**Phase 4: Cleanup (Sprint 2, Week 2)**
1. Remove index.js re-exports
2. Remove deprecation warnings
3. Update documentation
4. Archive old code



## Unified Component Designs

### UnifiedLogin Architecture (Existing)

**Status**: Already implemented in `Web/src/pages/unified/UnifiedLogin.jsx`

**Purpose**: Single login component that adapts to all 5 user roles (Admin, SuperAdmin, Coach, Player, Judge)

**Key Features**:
- Role detection from route path (`/admin/login`, `/coach/login`, etc.)
- Role-specific theming via ThemeProvider
- Role-specific UI elements (icons, backgrounds, ornaments)
- Role-specific authentication endpoints
- Competition selection for Admin after login
- Redirect to appropriate dashboard based on role

**Architecture**:
```javascript
UnifiedLogin
├── ThemeProvider (role-based theme)
│   └── UnifiedLoginInner
│       ├── Role Detection (detectRoleFromPath)
│       ├── Role Configuration (getRoleConfig)
│       │   ├── title, subtitle, description
│       │   ├── icons, ornaments, backgrounds
│       │   ├── form fields (email vs username)
│       │   └── navigation links
│       ├── Authentication Logic
│       │   ├── Form validation (react-hook-form)
│       │   ├── Rate limiting (useRateLimit)
│       │   ├── API calls (role-specific services)
│       │   └── Token storage (secureStorage)
│       ├── UI Rendering
│       │   ├── Left Panel (desktop): Logo, ornament, features
│       │   ├── Right Panel: Login form
│       │   └── Mobile: Compact layout
│       └── Post-Login Navigation
│           ├── Admin → CompetitionSelectionScreen
│           ├── Coach → /coach/select-competition or /coach/create-team
│           ├── Player → /player/select-team or /player/dashboard
│           ├── Judge → /judge/scoring
│           └── SuperAdmin → /superadmin/dashboard
```

**Role Configuration Example**:
```javascript
const getRoleConfig = (role) => {
  const configs = {
    admin: {
      title: 'Admin',
      subtitle: 'Portal',
      icon: Shield,
      background: HexGrid,
      ornament: ShieldOrnament,
      usesEmail: true,
      registerLink: null,
      forgotPasswordLink: '/forgot-password',
    },
    coach: {
      title: 'Coach',
      subtitle: 'Portal',
      icon: UserCheck,
      background: HexMesh,
      ornament: CoachOrnament,
      usesEmail: true,
      registerLink: '/coach/register',
      forgotPasswordLink: '/forgot-password',
    },
    // ... other roles
  };
  return configs[role] || configs.admin;
};
```

**Theme Application**:
```javascript
// ThemeProvider automatically applies role-specific colors
<ThemeProvider role={role}>
  <UnifiedLoginInner />
</ThemeProvider>

// Inside component, access theme via useTheme hook
const theme = useTheme();
// theme.colors.primary → role-specific primary color
// theme.colors.background → role-specific background
```

**Validation**: Validates Requirements 3.1-3.8 (Consolidate Login Pages)

---

### UnifiedDashboard Architecture (Existing)

**Status**: Already implemented in `Web/src/pages/unified/UnifiedDashboard.jsx`

**Purpose**: Single dashboard component for Admin and SuperAdmin roles with role-specific views

**Key Features**:
- Role detection from route context
- Admin view: Competition-specific statistics and judge assignment
- SuperAdmin view: System-wide statistics and competition filtering
- Shared navigation tabs with role-specific options
- Real-time updates via socket.io
- Mobile-responsive design

**Architecture**:
```javascript
UnifiedDashboard
├── Role Detection (from routePrefix or location.pathname)
├── API Service Selection (adminAPI vs superAdminAPI)
├── State Management
│   ├── stats (Admin) / systemStats + competitionStats (SuperAdmin)
│   ├── judgesSummary (Admin only)
│   ├── competitions (SuperAdmin only)
│   └── UI state (loading, mobile menu, etc.)
├── Navigation Tabs (role-specific)
│   ├── Admin: dashboard, teams, scores, judges, transactions
│   └── SuperAdmin: overview, management, teams, scores, judges, transactions
├── Tab Content Rendering
│   ├── Admin Dashboard Tab
│   │   ├── CompetitionDisplay
│   │   ├── Statistics Grid (StatCard components)
│   │   └── Judges Assignment Status (JudgeGroupCard)
│   ├── SuperAdmin Overview Tab
│   │   ├── System Overview Statistics
│   │   ├── Competition Filter Dropdown
│   │   └── Competition Statistics
│   └── Shared Tabs
│       ├── Teams → AdminTeams component
│       ├── Scores → AdminScores component
│       ├── Judges → AdminJudges component
│       └── Transactions → AdminTransactions component
└── Theme Integration (useTheme hook)
```

**Admin Dashboard View**:
```javascript
const renderAdminDashboard = () => (
  <div className="space-y-8">
    {/* Competition Display */}
    <CompetitionProvider userType="admin">
      <CompetitionDisplay />
    </CompetitionProvider>

    {/* Stats Grid */}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard icon={ShieldHalf} label="Total Teams" value={stats?.totalTeams} />
      <StatCard icon={Users} label="Total Participants" value={stats?.totalParticipants} />
      {/* ... more stats */}
    </div>

    {/* Judges Assignment Status */}
    <div className="space-y-8">
      {/* Boys Age Groups */}
      {judgesSummary.filter(item => item.gender === 'Male').map(item => (
        <JudgeGroupCard key={item.ageGroup} item={item} onStart={handleStartCompetitionType} />
      ))}
      {/* Girls Age Groups */}
      {judgesSummary.filter(item => item.gender === 'Female').map(item => (
        <JudgeGroupCard key={item.ageGroup} item={item} onStart={handleStartCompetitionType} />
      ))}
    </div>
  </div>
);
```

**SuperAdmin Overview View**:
```javascript
const renderSuperAdminOverview = () => (
  <div className="space-y-8">
    {/* System Overview */}
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard icon={Shield} label="Total Admins" value={systemStats?.stats?.users?.totalAdmins} />
      <StatCard icon={UserCheck} label="Total Coaches" value={systemStats?.stats?.users?.totalCoaches} />
      {/* ... more system stats */}
    </div>

    {/* Competition Statistics with Filter */}
    <DarkCard>
      <select value={selectedCompetition} onChange={(e) => setSelectedCompetition(e.target.value)}>
        <option value="">All Competitions</option>
        {competitions.map(comp => <option key={comp._id} value={comp._id}>{comp.name}</option>)}
      </select>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <CompStatCard label="Total Teams" value={competitionStats?.totalTeams} />
        {/* ... competition-specific stats */}
      </div>
    </DarkCard>
  </div>
);
```

**Validation**: Validates Requirements 5.1-5.8 (Consolidate Dashboard Pages)

---

### UnifiedRegister Design (New)

**Purpose**: Single registration component for Coach and Player roles

**Key Features**:
- Role detection from route path (`/coach/register`, `/player/register`)
- Role-specific theming (green for Coach, saffron for Player)
- Role-specific form fields
- Form validation with react-hook-form
- API integration with role-specific endpoints
- Post-registration navigation

**Architecture**:
```javascript
UnifiedRegister
├── ThemeProvider (role-based theme)
│   └── UnifiedRegisterInner
│       ├── Role Detection (detectRoleFromPath)
│       ├── Role Configuration (getRoleConfig)
│       │   ├── title, subtitle, description
│       │   ├── form fields (role-specific)
│       │   └── validation rules
│       ├── Form Management
│       │   ├── react-hook-form setup
│       │   ├── Field validation
│       │   └── Error handling
│       ├── Registration Logic
│       │   ├── API calls (coachAPI.register / playerAPI.register)
│       │   ├── Token storage
│       │   └── Success handling
│       ├── UI Rendering
│       │   ├── Left Panel (desktop): Branding, features
│       │   ├── Right Panel: Registration form
│       │   └── Mobile: Compact layout
│       └── Post-Registration Navigation
│           ├── Coach → /coach/create-team
│           └── Player → /player/select-team
```

**Role-Specific Form Fields**:

**Coach Registration**:
```javascript
const coachFields = [
  { name: 'name', label: 'Full Name', type: 'text', icon: User, required: true },
  { name: 'email', label: 'Email', type: 'email', icon: Mail, required: true },
  { name: 'phone', label: 'Phone Number', type: 'tel', icon: Phone, required: true },
  { name: 'organization', label: 'Organization', type: 'text', icon: Building, required: false },
  { name: 'password', label: 'Password', type: 'password', icon: Lock, required: true },
  { name: 'confirmPassword', label: 'Confirm Password', type: 'password', icon: Lock, required: true },
];
```

**Player Registration**:
```javascript
const playerFields = [
  { name: 'name', label: 'Full Name', type: 'text', icon: User, required: true },
  { name: 'email', label: 'Email', type: 'email', icon: Mail, required: true },
  { name: 'phone', label: 'Phone Number', type: 'tel', icon: Phone, required: true },
  { name: 'dateOfBirth', label: 'Date of Birth', type: 'date', icon: Calendar, required: true },
  { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female'], required: true },
  { name: 'password', label: 'Password', type: 'password', icon: Lock, required: true },
  { name: 'confirmPassword', label: 'Confirm Password', type: 'password', icon: Lock, required: true },
];
```

**Implementation Example**:
```javascript
const UnifiedRegisterInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const role = detectRoleFromPath(location.pathname); // 'coach' or 'player'
  const config = getRoleConfig(role);
  const { register, handleSubmit, formState: { errors }, watch } = useForm();
  
  const onSubmit = async (data) => {
    try {
      const apiService = role === 'coach' ? coachAPI : playerAPI;
      const response = await apiService.register(data);
      
      // Store token and user data
      secureStorage.setItem(`${role}_token`, response.data.token);
      secureStorage.setItem(`${role}_user`, JSON.stringify(response.data[role]));
      
      toast.success(`Welcome, ${data.name}!`);
      
      // Navigate to next step
      navigate(role === 'coach' ? '/coach/create-team' : '/player/select-team');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    }
  };
  
  return (
    <div className="min-h-dvh flex" style={{ background: theme.colors.background }}>
      {/* Left Panel: Branding */}
      <div className="hidden lg:flex flex-col items-center justify-center w-[45%]">
        <BackgroundComponent color={theme.colors.primary} />
        <OrnamentComponent color={theme.colors.primary} />
        <h1>{config.title} Registration</h1>
        <p>{config.description}</p>
      </div>
      
      {/* Right Panel: Form */}
      <div className="flex-1 flex items-center justify-center">
        <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md">
          {config.fields.map(field => (
            <ThemedInput
              key={field.name}
              icon={field.icon}
              type={field.type}
              label={field.label}
              error={errors[field.name]}
              {...register(field.name, { required: field.required })}
            />
          ))}
          
          <ThemedButton type="submit" loading={loading}>
            Create Account
          </ThemedButton>
          
          <Link to={`/${role}/login`}>Already have an account? Sign in</Link>
        </form>
      </div>
    </div>
  );
};

const UnifiedRegister = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <UnifiedRegisterInner />
    </ThemeProvider>
  );
};
```

**Validation**: Validates Requirements 4.1-4.8 (Consolidate Register Pages)

---

### UnifiedCompetitionSelection Design (New)

**Purpose**: Single competition/team selection component for Coach and Player roles

**Key Features**:
- Role detection from route path
- Coach view: Competition selection with details
- Player view: Team selection with competition info
- Role-specific theming
- API integration for fetching competitions/teams
- Selection persistence in CompetitionContext

**Architecture**:
```javascript
UnifiedCompetitionSelection
├── ThemeProvider (role-based theme)
│   └── UnifiedCompetitionSelectionInner
│       ├── Role Detection (detectRoleFromPath)
│       ├── Data Fetching
│       │   ├── Coach: Fetch available competitions
│       │   └── Player: Fetch available teams
│       ├── Selection Logic
│       │   ├── Coach: Select competition → navigate to dashboard
│       │   └── Player: Select team → join team → navigate to dashboard
│       ├── UI Rendering
│       │   ├── Header with role-specific title
│       │   ├── Grid of selectable cards
│       │   └── Loading and empty states
│       └── Navigation
│           ├── Coach → /coach/dashboard
│           └── Player → /player/dashboard
```

**Coach Competition Selection View**:
```javascript
const renderCoachView = () => (
  <div className="space-y-6">
    <h1 className="text-3xl font-black text-white">Select Competition</h1>
    <p className="text-white/60">Choose a competition to register your team</p>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {competitions.map(competition => (
        <GlassCard
          key={competition._id}
          onClick={() => handleSelectCompetition(competition)}
          className="cursor-pointer hover:border-green-500 transition-all"
        >
          <h3 className="text-xl font-bold text-white">{competition.name}</h3>
          <p className="text-white/60 text-sm">{competition.location}</p>
          <p className="text-white/40 text-xs">
            {new Date(competition.startDate).toLocaleDateString()} - 
            {new Date(competition.endDate).toLocaleDateString()}
          </p>
          
          <div className="mt-4 flex items-center gap-2">
            <span className="px-2 py-1 rounded-full text-xs font-bold"
              style={{ 
                background: competition.isActive ? '#22C55E20' : '#EF444420',
                color: competition.isActive ? '#22C55E' : '#EF4444'
              }}>
              {competition.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </GlassCard>
      ))}
    </div>
  </div>
);

const handleSelectCompetition = async (competition) => {
  try {
    // Store selection in context
    setCurrentCompetition(competition);
    secureStorage.setItem('coach_competition', JSON.stringify(competition));
    
    toast.success(`Selected ${competition.name}`);
    navigate('/coach/dashboard');
  } catch (error) {
    toast.error('Failed to select competition');
  }
};
```

**Player Team Selection View**:
```javascript
const renderPlayerView = () => (
  <div className="space-y-6">
    <h1 className="text-3xl font-black text-white">Join a Team</h1>
    <p className="text-white/60">Select a team to join and start competing</p>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {teams.map(team => (
        <GlassCard
          key={team._id}
          onClick={() => handleJoinTeam(team)}
          className="cursor-pointer hover:border-saffron transition-all"
        >
          <h3 className="text-xl font-bold text-white">{team.name}</h3>
          <p className="text-white/60 text-sm">Coach: {team.coach?.name}</p>
          <p className="text-white/40 text-xs">Competition: {team.competition?.name}</p>
          
          <div className="mt-4 flex items-center justify-between">
            <span className="text-white/60 text-xs">
              {team.players?.length || 0} members
            </span>
            <span className="px-2 py-1 rounded-full text-xs font-bold"
              style={{ background: '#FF6B0020', color: '#FF6B00' }}>
              {team.gender}
            </span>
          </div>
        </GlassCard>
      ))}
    </div>
  </div>
);

const handleJoinTeam = async (team) => {
  try {
    // API call to join team
    await playerAPI.joinTeam(team._id);
    
    // Update user data
    const updatedUser = { ...user, team: team._id };
    secureStorage.setItem('player_user', JSON.stringify(updatedUser));
    
    toast.success(`Joined ${team.name}!`);
    navigate('/player/dashboard');
  } catch (error) {
    toast.error(error.response?.data?.message || 'Failed to join team');
  }
};
```

**Implementation Example**:
```javascript
const UnifiedCompetitionSelectionInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  
  const role = detectRoleFromPath(location.pathname); // 'coach' or 'player'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchData();
  }, [role]);
  
  const fetchData = async () => {
    try {
      if (role === 'coach') {
        const response = await coachAPI.getCompetitions();
        setData(response.data.competitions);
      } else {
        const response = await playerAPI.getAvailableTeams();
        setData(response.data.teams);
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-dvh p-8" style={{ background: theme.colors.background }}>
      {loading ? (
        <LoadingSpinner />
      ) : (
        role === 'coach' ? renderCoachView() : renderPlayerView()
      )}
    </div>
  );
};

const UnifiedCompetitionSelection = () => {
  const location = useLocation();
  const role = detectRoleFromPath(location.pathname);
  
  return (
    <ThemeProvider role={role}>
      <UnifiedCompetitionSelectionInner />
    </ThemeProvider>
  );
};
```

**Validation**: Validates Requirements 6.1-6.8 (Create Unified Competition Selection Component)



## File Naming and Migration Strategy

### File Renaming Plan

**Primary Rename**: JudgeScoringNew.jsx → JudgeScoring.jsx

**Rationale**: The "New" suffix indicates a temporary naming convention, suggesting there was an older version that has since been deprecated. Removing this suffix aligns with standard naming conventions and improves code clarity.

**Impact Analysis**:
- **Files affected**: 1 (JudgeScoringNew.jsx)
- **Import references**: 1 (App.jsx lazy import)
- **Route references**: 1 (App.jsx route definition)
- **Test files**: 0 (no existing tests for this component)

**Migration Steps**:

1. **Rename the file**:
   ```bash
   mv Web/src/pages/JudgeScoringNew.jsx Web/src/pages/judge/JudgeScoring.jsx
   ```

2. **Update App.jsx lazy import**:
   ```javascript
   // Before
   const JudgeScoringNew = lazy(() => import('./pages/JudgeScoringNew'));
   
   // After
   const JudgeScoring = lazy(() => import('./pages/judge/JudgeScoring'));
   ```

3. **Update App.jsx route**:
   ```javascript
   // Before
   <Route path="/judge/scoring" element={
     <ProtectedRoute requiredUserType="judge">
       <JudgeScoringNew />
     </ProtectedRoute>
   } />
   
   // After
   <Route path="/judge/scoring" element={
     <ProtectedRoute requiredUserType="judge">
       <JudgeScoring />
     </ProtectedRoute>
   } />
   ```

4. **Create backward compatibility export** (temporary):
   ```javascript
   // Web/src/pages/index.js
   export { default as JudgeScoringNew } from './judge/JudgeScoring';
   export { default as JudgeScoring } from './judge/JudgeScoring';
   ```

5. **Verify functionality**:
   - Test judge login flow
   - Test scoring interface
   - Verify real-time updates
   - Check mobile responsiveness

### Import Path Updates in App.jsx

**Current Import Structure**:
```javascript
// All imports from root pages folder
const Home = lazy(() => import('./pages/Home'));
const PlayerLogin = lazy(() => import('./pages/PlayerLogin'));
const CoachDashboard = lazy(() => import('./pages/CoachDashboard'));
// ... 26 more imports
```

**New Import Structure**:
```javascript
// Organized by role
// Admin
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminTeams = lazy(() => import('./pages/admin/AdminTeams'));
const AdminScores = lazy(() => import('./pages/admin/AdminScores'));
const AdminJudges = lazy(() => import('./pages/admin/AdminJudges'));
const AdminScoring = lazy(() => import('./pages/admin/AdminScoring'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));

// SuperAdmin
const SuperAdminLogin = lazy(() => import('./pages/superadmin/SuperAdminLogin'));
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/SuperAdminDashboard'));
const SuperAdminManagement = lazy(() => import('./pages/superadmin/SuperAdminManagement'));

// Coach
const CoachLogin = lazy(() => import('./pages/coach/CoachLogin'));
const CoachRegister = lazy(() => import('./pages/coach/CoachRegister'));
const CoachDashboard = lazy(() => import('./pages/coach/CoachDashboard'));
const CoachCreateTeam = lazy(() => import('./pages/coach/CoachCreateTeam'));
const CoachSelectCompetition = lazy(() => import('./pages/coach/CoachSelectCompetition'));
const CoachPayment = lazy(() => import('./pages/coach/CoachPayment'));

// Player
const PlayerLogin = lazy(() => import('./pages/player/PlayerLogin'));
const PlayerRegister = lazy(() => import('./pages/player/PlayerRegister'));
const PlayerDashboard = lazy(() => import('./pages/player/PlayerDashboard'));
const PlayerSelectTeam = lazy(() => import('./pages/player/PlayerSelectTeam'));

// Judge
const JudgeLogin = lazy(() => import('./pages/judge/JudgeLogin'));
const JudgeScoring = lazy(() => import('./pages/judge/JudgeScoring'));

// Public
const Home = lazy(() => import('./pages/public/Home'));
const PublicScores = lazy(() => import('./pages/public/PublicScores'));

// Shared
const ForgotPassword = lazy(() => import('./pages/shared/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/shared/ResetPassword'));
```

### Redirect Wrapper Implementation

For pages that have been consolidated into unified components, create lightweight redirect wrappers:

**Example: AdminLogin.jsx (Redirect Wrapper)**
```javascript
// Web/src/pages/admin/AdminLogin.jsx
import { Navigate } from 'react-router-dom';

/**
 * AdminLogin - Redirect wrapper to UnifiedLogin
 * @deprecated This component is deprecated. Use UnifiedLogin directly.
 * This wrapper will be removed in 2 sprints.
 */
const AdminLogin = () => {
  // Simply redirect to the same route - UnifiedLogin will handle it
  return <Navigate to="/admin/login" replace />;
};

export default AdminLogin;
```

**Note**: The redirect wrapper is not actually needed since App.jsx will import UnifiedLogin directly. However, if there are any direct imports of AdminLogin elsewhere in the codebase, this wrapper ensures they continue to work.

**Better Approach**: Update App.jsx to use UnifiedLogin directly:
```javascript
// Import unified component
const UnifiedLogin = lazy(() => import('./pages/unified/UnifiedLogin'));

// Use for all login routes
<Route path="/admin/login" element={<UnifiedLogin />} />
<Route path="/coach/login" element={<UnifiedLogin />} />
<Route path="/player/login" element={<UnifiedLogin />} />
<Route path="/judge/login" element={<UnifiedLogin />} />
<Route path="/superadmin/login" element={<UnifiedLogin />} />
```

### Deprecation Warning Mechanism

**Development-Only Warnings**:
```javascript
// Web/src/pages/admin/AdminLogin.jsx (if keeping wrapper)
import { useEffect } from 'react';
import UnifiedLogin from '../unified/UnifiedLogin';

const AdminLogin = () => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Deprecation Warning] AdminLogin is deprecated. ' +
        'This component now redirects to UnifiedLogin. ' +
        'Please update your imports to use UnifiedLogin directly. ' +
        'This wrapper will be removed in 2 sprints.'
      );
    }
  }, []);
  
  return <UnifiedLogin />;
};

export default AdminLogin;
```

**ESLint Rule** (optional):
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/pages/AdminLogin', '**/pages/CoachLogin', '**/pages/PlayerLogin'],
        message: 'These components are deprecated. Use UnifiedLogin from pages/unified/ instead.'
      }]
    }]
  }
};
```

### Migration Checklist

**Pre-Migration**:
- [ ] Create backup branch
- [ ] Document current import paths
- [ ] Run full test suite to establish baseline
- [ ] Verify all routes are functioning

**Phase 1: File Organization**:
- [ ] Create new folder structure (admin/, coach/, player/, judge/, superadmin/, public/, shared/)
- [ ] Move files to new locations
- [ ] Rename JudgeScoringNew.jsx to JudgeScoring.jsx
- [ ] Create index.js with re-exports
- [ ] Update App.jsx imports
- [ ] Run tests
- [ ] Manual testing of all routes

**Phase 2: Unified Components**:
- [ ] Create UnifiedRegister component
- [ ] Create UnifiedCompetitionSelection component
- [ ] Update App.jsx to use unified components
- [ ] Create redirect wrappers (if needed)
- [ ] Run tests
- [ ] Manual testing of registration and selection flows

**Phase 3: Validation**:
- [ ] Full regression testing
- [ ] Performance testing (Lighthouse)
- [ ] Accessibility testing (WCAG AA)
- [ ] Cross-browser testing
- [ ] Mobile device testing
- [ ] Monitor production for issues

**Phase 4: Cleanup** (After 2 sprints):
- [ ] Remove index.js re-exports
- [ ] Remove redirect wrappers
- [ ] Remove deprecation warnings
- [ ] Update documentation
- [ ] Archive old code



## Modern React Patterns

### Custom Hooks Design

#### useAuth Hook

**Purpose**: Centralized authentication state and operations

**Location**: Already exists in `Web/src/App.jsx` as AuthContext

**Current Implementation**:
```javascript
export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Provides: { user, userType, login, logout }
```

**Usage in Pages**:
```javascript
const MyPage = () => {
  const { user, userType, login, logout } = useAuth();
  
  // Access current user data
  console.log(user.name, user.email);
  
  // Check user type
  if (userType === 'admin') {
    // Admin-specific logic
  }
  
  // Logout
  const handleLogout = () => {
    logout();
    navigate('/');
  };
};
```

#### useCompetition Hook

**Purpose**: Access current competition context

**Location**: Already exists in `Web/src/contexts/CompetitionContext.jsx`

**Current Implementation**:
```javascript
export const useCompetition = () => {
  const context = useContext(CompetitionContext);
  if (!context) {
    throw new Error('useCompetition must be used within CompetitionProvider');
  }
  return context;
};

// Provides: { currentCompetition, setCurrentCompetition, loading }
```

**Usage in Pages**:
```javascript
const MyPage = () => {
  const { currentCompetition, setCurrentCompetition } = useCompetition();
  
  // Access current competition
  if (currentCompetition) {
    console.log(currentCompetition.name, currentCompetition._id);
  }
  
  // Change competition
  const handleSelectCompetition = (competition) => {
    setCurrentCompetition(competition);
  };
};
```

#### useTheme Hook

**Purpose**: Access role-specific theme configuration

**Location**: Already exists in `Web/src/components/design-system/theme/useTheme.js`

**Current Implementation**:
```javascript
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

// Provides: { colors, spacing, typography, radii, shadows, easings }
```

**Usage in Pages**:
```javascript
const MyPage = () => {
  const theme = useTheme();
  
  return (
    <div style={{ background: theme.colors.background }}>
      <h1 style={{ color: theme.colors.primary }}>Title</h1>
      <button style={{ 
        background: theme.colors.primary,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md
      }}>
        Click Me
      </button>
    </div>
  );
};
```

#### useResponsive Hook

**Purpose**: Detect viewport size and provide responsive utilities

**Location**: Already exists in `Web/src/hooks/useResponsive.js`

**Usage in Pages**:
```javascript
const MyPage = () => {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  return (
    <div>
      {isMobile && <MobileNav />}
      {isDesktop && <DesktopNav />}
      
      <div className={isMobile ? 'grid-cols-1' : 'grid-cols-3'}>
        {/* Responsive grid */}
      </div>
    </div>
  );
};
```

#### useRateLimit Hook

**Purpose**: Implement rate limiting for form submissions

**Location**: Already exists in `Web/src/hooks/useRateLimit.js`

**Usage in Pages**:
```javascript
const LoginPage = () => {
  const { checkRateLimit, recordAttempt, reset } = useRateLimit(5, 60000); // 5 attempts per 60s
  
  const handleSubmit = async (data) => {
    const { allowed, waitTime } = checkRateLimit();
    if (!allowed) {
      toast.error(`Too many attempts. Wait ${waitTime}s`);
      return;
    }
    
    try {
      await login(data);
      reset(); // Reset on success
    } catch (error) {
      recordAttempt(); // Record failed attempt
    }
  };
};
```

### Component Composition Patterns

#### Container/Presenter Pattern

**Separate data fetching from presentation**:

```javascript
// Container Component (handles logic)
const AdminTeamsContainer = () => {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentCompetition } = useCompetition();
  
  useEffect(() => {
    fetchTeams();
  }, [currentCompetition]);
  
  const fetchTeams = async () => {
    try {
      const response = await adminAPI.getTeams(currentCompetition._id);
      setTeams(response.data.teams);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteTeam = async (teamId) => {
    await adminAPI.deleteTeam(teamId);
    fetchTeams();
  };
  
  return (
    <AdminTeamsPresenter 
      teams={teams}
      loading={loading}
      onDeleteTeam={handleDeleteTeam}
    />
  );
};

// Presenter Component (handles UI)
const AdminTeamsPresenter = ({ teams, loading, onDeleteTeam }) => {
  if (loading) return <LoadingSpinner />;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {teams.map(team => (
        <TeamCard key={team._id} team={team} onDelete={onDeleteTeam} />
      ))}
    </div>
  );
};
```

#### Compound Components Pattern

**For complex UI with shared state**:

```javascript
// Parent component manages state
const TabPanel = ({ children }) => {
  const [activeTab, setActiveTab] = useState(0);
  
  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tab-panel">{children}</div>
    </TabContext.Provider>
  );
};

// Child components access shared state
TabPanel.TabList = ({ children }) => {
  return <div className="tab-list">{children}</div>;
};

TabPanel.Tab = ({ index, children }) => {
  const { activeTab, setActiveTab } = useContext(TabContext);
  return (
    <button 
      onClick={() => setActiveTab(index)}
      className={activeTab === index ? 'active' : ''}
    >
      {children}
    </button>
  );
};

TabPanel.TabContent = ({ index, children }) => {
  const { activeTab } = useContext(TabContext);
  return activeTab === index ? <div>{children}</div> : null;
};

// Usage
<TabPanel>
  <TabPanel.TabList>
    <TabPanel.Tab index={0}>Teams</TabPanel.Tab>
    <TabPanel.Tab index={1}>Scores</TabPanel.Tab>
  </TabPanel.TabList>
  <TabPanel.TabContent index={0}><TeamsView /></TabPanel.TabContent>
  <TabPanel.TabContent index={1}><ScoresView /></TabPanel.TabContent>
</TabPanel>
```

#### Render Props Pattern

**For flexible component reuse**:

```javascript
const DataFetcher = ({ url, children }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);
  
  return children({ data, loading, error });
};

// Usage
<DataFetcher url="/api/teams">
  {({ data, loading, error }) => {
    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorMessage error={error} />;
    return <TeamsList teams={data} />;
  }}
</DataFetcher>
```

### State Management Approach

#### Local State with useState

**For simple component state**:
```javascript
const MyComponent = () => {
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
    </div>
  );
};
```

#### Complex State with useReducer

**For complex state logic with multiple sub-values**:
```javascript
const initialState = {
  teams: [],
  selectedTeam: null,
  filters: { gender: 'all', ageGroup: 'all' },
  loading: false,
  error: null,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, teams: action.payload };
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SELECT_TEAM':
      return { ...state, selectedTeam: action.payload };
    case 'UPDATE_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    default:
      return state;
  }
};

const TeamsPage = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  
  const fetchTeams = async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const response = await api.getTeams();
      dispatch({ type: 'FETCH_SUCCESS', payload: response.data.teams });
    } catch (error) {
      dispatch({ type: 'FETCH_ERROR', payload: error.message });
    }
  };
  
  return (
    <div>
      {state.loading && <LoadingSpinner />}
      {state.error && <ErrorMessage error={state.error} />}
      <TeamsList teams={state.teams} />
    </div>
  );
};
```

#### Global State with Context

**For app-wide state (already implemented)**:
- AuthContext: User authentication state
- CompetitionContext: Current competition selection
- ThemeContext: Role-specific theming

### Error Boundary Implementation

**Create a reusable ErrorBoundary component**:

```javascript
// Web/src/components/ErrorBoundary.jsx (already exists)
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-dark">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-white/60 mb-6">{this.state.error?.message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-saffron text-white rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Usage in pages**:
```javascript
// Wrap entire app (already done in App.jsx)
<ErrorBoundary>
  <Router>
    <AppContent />
  </Router>
</ErrorBoundary>

// Wrap individual sections
<ErrorBoundary>
  <AdminDashboard />
</ErrorBoundary>
```

### Memoization Strategy

#### React.memo for Component Memoization

**Prevent unnecessary re-renders**:
```javascript
const TeamCard = React.memo(({ team, onDelete }) => {
  return (
    <div className="team-card">
      <h3>{team.name}</h3>
      <button onClick={() => onDelete(team._id)}>Delete</button>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function
  return prevProps.team._id === nextProps.team._id;
});
```

#### useMemo for Expensive Calculations

**Cache computed values**:
```javascript
const TeamsPage = () => {
  const [teams, setTeams] = useState([]);
  const [filters, setFilters] = useState({ gender: 'all', ageGroup: 'all' });
  
  const filteredTeams = useMemo(() => {
    return teams.filter(team => {
      if (filters.gender !== 'all' && team.gender !== filters.gender) return false;
      if (filters.ageGroup !== 'all' && team.ageGroup !== filters.ageGroup) return false;
      return true;
    });
  }, [teams, filters]);
  
  return <TeamsList teams={filteredTeams} />;
};
```

#### useCallback for Function Memoization

**Prevent function recreation on every render**:
```javascript
const TeamsPage = () => {
  const [teams, setTeams] = useState([]);
  
  const handleDeleteTeam = useCallback(async (teamId) => {
    await api.deleteTeam(teamId);
    setTeams(prev => prev.filter(t => t._id !== teamId));
  }, []); // Empty deps - function never changes
  
  return (
    <div>
      {teams.map(team => (
        <TeamCard key={team._id} team={team} onDelete={handleDeleteTeam} />
      ))}
    </div>
  );
};
```

### Single Responsibility Principle

**Each component should have one clear purpose**:

**Bad Example** (component doing too much):
```javascript
const AdminDashboard = () => {
  // Fetching data
  const [stats, setStats] = useState(null);
  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  
  // UI state
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Business logic
  const calculateTotalParticipants = () => { /* ... */ };
  const filterTeamsByGender = () => { /* ... */ };
  
  // Rendering everything
  return (
    <div>
      {/* 500+ lines of JSX */}
    </div>
  );
};
```

**Good Example** (separated concerns):
```javascript
// Container: Data fetching and state management
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <DashboardLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'teams' && <TeamsTab />}
      {activeTab === 'judges' && <JudgesTab />}
    </DashboardLayout>
  );
};

// Presenter: UI layout
const DashboardLayout = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="dashboard">
      <DashboardNav activeTab={activeTab} onTabChange={onTabChange} />
      <main>{children}</main>
    </div>
  );
};

// Feature: Overview statistics
const OverviewTab = () => {
  const { stats, loading } = useDashboardStats();
  
  if (loading) return <LoadingSpinner />;
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Teams" value={stats.totalTeams} />
      <StatCard label="Participants" value={stats.totalParticipants} />
      <StatCard label="Judges" value={stats.totalJudges} />
    </div>
  );
};
```



## Design System Integration

### Token Usage from Web/src/styles/tokens.js

All pages should import design tokens from the centralized location instead of defining local constants:

**Before** (local definitions):
```javascript
// AdminDashboard.jsx
const COLORS = {
  purple: '#8B5CF6',
  dark: '#0A0A0A',
  darkCard: '#111111',
  // ... more colors
};

const SPACING = {
  sm: '8px',
  md: '16px',
  // ... more spacing
};
```

**After** (centralized tokens):
```javascript
// AdminDashboard.jsx
import { DESIGN_TOKENS, getRoleColor } from '../../styles/tokens';

// Access tokens
const primaryColor = DESIGN_TOKENS.colors.roles.admin; // '#8B5CF6'
const cardBackground = DESIGN_TOKENS.colors.surfaces.darkCard; // '#111111'
const spacing = DESIGN_TOKENS.spacing.md; // '16px'

// Or use helper functions
const roleColor = getRoleColor('admin'); // '#8B5CF6'
```

### Component Imports from design-system/

**Available Design System Components**:

#### Form Components
```javascript
import { ThemedInput, ThemedButton, ThemedSelect, ThemedTextarea } from '../../components/design-system/forms';

// Usage
<ThemedInput 
  icon={Mail}
  type="email"
  placeholder="admin@example.com"
  error={errors.email}
  {...register('email')}
/>

<ThemedButton type="submit" loading={loading}>
  Sign In
</ThemedButton>
```

#### Card Components
```javascript
import { GlassCard, DarkCard, StatCard, TiltCard } from '../../components/design-system/cards';

// Usage
<GlassCard className="p-6">
  <h3>Competition Details</h3>
  <p>Information here...</p>
</GlassCard>

<StatCard 
  icon={Users}
  label="Total Teams"
  value={stats.totalTeams}
  color="#8B5CF6"
/>
```

#### Background Components
```javascript
import { HexGrid, RadialBurst, DiagonalBurst, HexMesh, Constellation } from '../../components/design-system/backgrounds';

// Usage
<div className="relative">
  <HexGrid color="#FF6B00" />
  <div className="relative z-10">
    {/* Content here */}
  </div>
</div>
```

#### Animation Components
```javascript
import { FadeIn, useReducedMotion } from '../../components/design-system/animations';

// Usage
<FadeIn delay={0.2}>
  <h1>Welcome to Dashboard</h1>
</FadeIn>

// Check motion preference
const reduced = useReducedMotion();
const animationDuration = reduced ? 0 : 0.3;
```

#### Ornament Components
```javascript
import { ShieldOrnament, CoachOrnament, GradientText } from '../../components/design-system/ornaments';

// Usage
<ShieldOrnament color="#8B5CF6" />

<GradientText colors={['#FF6B00', '#FF8C38', '#CC5500']}>
  Mallakhamb Competition
</GradientText>
```

### Theme Provider Integration

**Wrap pages with ThemeProvider for role-specific theming**:

```javascript
import { ThemeProvider, useTheme } from '../../components/design-system/theme';

// Wrap component
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
      <h1 style={{ color: theme.colors.primary }}>
        {/* Automatically uses role-specific primary color */}
      </h1>
    </div>
  );
};
```

**Theme Structure**:
```javascript
{
  colors: {
    primary: '#8B5CF6',        // Role-specific
    primaryLight: '#A78BFA',   // Role-specific
    primaryDark: '#7C3AED',    // Role-specific
    background: '#0A0A0A',
    card: '#111111',
    border: 'rgba(255,255,255,0.06)',
    borderBright: 'rgba(139,92,246,0.38)', // Role-specific
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255,255,255,0.65)',
      muted: 'rgba(255,255,255,0.45)',
    },
  },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  typography: { fontSize: { xs: '11px', sm: '13px', base: '16px', ... } },
  radii: { sm: '4px', md: '8px', lg: '12px', xl: '16px', '2xl': '24px' },
  shadows: { sm: '...', md: '...', lg: '...', saffron: '...' },
  easings: { easeOut: [0.22, 1, 0.36, 1], spring: [0.68, -0.55, 0.265, 1.55] },
}
```

### Animation Utilities Usage

**FadeIn Component**:
```javascript
import { FadeIn } from '../../components/design-system/animations';

<FadeIn delay={0.1}>
  <StatCard label="Teams" value={stats.totalTeams} />
</FadeIn>

<FadeIn delay={0.2} direction="up">
  <StatCard label="Participants" value={stats.totalParticipants} />
</FadeIn>
```

**useReducedMotion Hook**:
```javascript
import { useReducedMotion } from '../../components/design-system/animations';
import { motion } from 'framer-motion';

const MyComponent = () => {
  const reduced = useReducedMotion();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.3 }}
    >
      Content
    </motion.div>
  );
};
```

**Framer Motion with Design Tokens**:
```javascript
import { motion } from 'framer-motion';
import { DESIGN_TOKENS } from '../../styles/tokens';

<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
  style={{
    background: DESIGN_TOKENS.colors.roles.admin,
    borderRadius: DESIGN_TOKENS.radii.lg,
    padding: `${DESIGN_TOKENS.spacing.sm} ${DESIGN_TOKENS.spacing.md}`,
  }}
>
  Click Me
</motion.button>
```

### Migration from Local Tokens

**Step 1: Identify Local Token Definitions**
```bash
# Find files with local color definitions
grep -r "const COLORS = {" Web/src/pages/
grep -r "const ADMIN_COLORS = {" Web/src/pages/
```

**Step 2: Replace with Design System Imports**
```javascript
// Before
const COLORS = {
  saffron: '#FF6B00',
  dark: '#0A0A0A',
  darkCard: '#111111',
};

// After
import { DESIGN_TOKENS } from '../../styles/tokens';
// Use DESIGN_TOKENS.colors.brand.saffron
// Use DESIGN_TOKENS.colors.surfaces.dark
// Use DESIGN_TOKENS.colors.surfaces.darkCard
```

**Step 3: Update Style Objects**
```javascript
// Before
<div style={{ background: COLORS.dark, border: `1px solid ${COLORS.darkBorder}` }}>

// After
<div style={{ 
  background: DESIGN_TOKENS.colors.surfaces.dark, 
  border: `1px solid ${DESIGN_TOKENS.colors.borders.subtle}` 
}}>
```

**Step 4: Use Theme Provider for Role-Specific Colors**
```javascript
// Before
const primaryColor = userType === 'admin' ? '#8B5CF6' : '#FF6B00';

// After
const theme = useTheme();
const primaryColor = theme.colors.primary; // Automatically role-specific
```

### Design System Best Practices

1. **Always use design tokens** - Never hardcode colors, spacing, or other design values
2. **Leverage ThemeProvider** - Let the theme system handle role-specific styling
3. **Use design system components** - Don't recreate buttons, inputs, or cards
4. **Respect reduced motion** - Always check useReducedMotion() for animations
5. **Maintain accessibility** - Use design system components that have built-in WCAG compliance
6. **Follow naming conventions** - Use semantic names (primary, secondary) over specific colors (purple, green)
7. **Test with different themes** - Verify components work with all role themes
8. **Document custom extensions** - If extending design system components, document the changes

### Example: Migrating a Page to Design System

**Before** (local tokens and inline styles):
```javascript
const AdminTeams = () => {
  const COLORS = {
    purple: '#8B5CF6',
    dark: '#0A0A0A',
    darkCard: '#111111',
  };
  
  return (
    <div style={{ background: COLORS.dark, minHeight: '100vh', padding: '24px' }}>
      <div style={{ 
        background: COLORS.darkCard, 
        borderRadius: '12px', 
        padding: '24px',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <h1 style={{ color: COLORS.purple, fontSize: '24px', fontWeight: 'bold' }}>
          Teams Management
        </h1>
        <button style={{
          background: COLORS.purple,
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          border: 'none',
        }}>
          Add Team
        </button>
      </div>
    </div>
  );
};
```

**After** (design system integration):
```javascript
import { DESIGN_TOKENS } from '../../styles/tokens';
import { DarkCard } from '../../components/design-system/cards';
import { ThemedButton } from '../../components/design-system/forms';
import { FadeIn } from '../../components/design-system/animations';
import { useTheme } from '../../components/design-system/theme';

const AdminTeams = () => {
  const theme = useTheme();
  
  return (
    <div style={{ 
      background: theme.colors.background, 
      minHeight: '100vh', 
      padding: DESIGN_TOKENS.spacing.lg 
    }}>
      <FadeIn>
        <DarkCard className="p-6">
          <h1 style={{ 
            color: theme.colors.primary, 
            fontSize: DESIGN_TOKENS.typography.fontSize['2xl'],
            fontWeight: DESIGN_TOKENS.typography.fontWeight.bold
          }}>
            Teams Management
          </h1>
          <ThemedButton>
            Add Team
          </ThemedButton>
        </DarkCard>
      </FadeIn>
    </div>
  );
};
```

**Benefits**:
- Consistent styling across the app
- Automatic role-specific theming
- Reduced code duplication
- Easier maintenance
- Built-in accessibility
- Responsive design support



## Routing Architecture

### Updated App.jsx Structure

The routing configuration will be updated to use the new folder structure and unified components:

```javascript
// Web/src/App.jsx

import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { CompetitionProvider } from './contexts/CompetitionContext';

// ─── Unified Components ─────────────────────────────────────────────────────
const UnifiedLogin = lazy(() => import('./pages/unified/UnifiedLogin'));
const UnifiedDashboard = lazy(() => import('./pages/unified/UnifiedDashboard'));
const UnifiedRegister = lazy(() => import('./pages/unified/UnifiedRegister'));
const UnifiedCompetitionSelection = lazy(() => import('./pages/unified/UnifiedCompetitionSelection'));

// ─── Admin Pages ────────────────────────────────────────────────────────────
const AdminTeams = lazy(() => import('./pages/admin/AdminTeams'));
const AdminScores = lazy(() => import('./pages/admin/AdminScores'));
const AdminJudges = lazy(() => import('./pages/admin/AdminJudges'));
const AdminScoring = lazy(() => import('./pages/admin/AdminScoring'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));

// ─── SuperAdmin Pages ───────────────────────────────────────────────────────
const SuperAdminManagement = lazy(() => import('./pages/superadmin/SuperAdminManagement'));

// ─── Coach Pages ────────────────────────────────────────────────────────────
const CoachDashboard = lazy(() => import('./pages/coach/CoachDashboard'));
const CoachCreateTeam = lazy(() => import('./pages/coach/CoachCreateTeam'));
const CoachPayment = lazy(() => import('./pages/coach/CoachPayment'));

// ─── Player Pages ───────────────────────────────────────────────────────────
const PlayerDashboard = lazy(() => import('./pages/player/PlayerDashboard'));

// ─── Judge Pages ────────────────────────────────────────────────────────────
const JudgeScoring = lazy(() => import('./pages/judge/JudgeScoring'));

// ─── Public Pages ───────────────────────────────────────────────────────────
const Home = lazy(() => import('./pages/public/Home'));
const PublicScores = lazy(() => import('./pages/public/PublicScores'));

// ─── Shared Pages ───────────────────────────────────────────────────────────
const ForgotPassword = lazy(() => import('./pages/shared/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/shared/ResetPassword'));

// ─── Loading Component ──────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-saffron mx-auto"></div>
      <p className="mt-4 text-white/45">Loading...</p>
    </div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ─── Public Routes ──────────────────────────────────────────── */}
            <Route path="/" element={<Home />} />
            <Route path="/scores" element={<PublicScores />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* ─── Admin Routes ───────────────────────────────────────────── */}
            <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
            <Route path="/admin/login" element={<UnifiedLogin />} />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute requiredUserType="admin">
                <CompetitionProvider userType="admin">
                  <UnifiedDashboard />
                </CompetitionProvider>
              </ProtectedRoute>
            } />
            <Route path="/admin/dashboard/:tab" element={
              <ProtectedRoute requiredUserType="admin">
                <CompetitionProvider userType="admin">
                  <UnifiedDashboard />
                </CompetitionProvider>
              </ProtectedRoute>
            } />
            <Route path="/admin/teams" element={
              <ProtectedRoute requiredUserType="admin">
                <AdminTeams />
              </ProtectedRoute>
            } />
            <Route path="/admin/scoring" element={
              <ProtectedRoute requiredUserType="admin">
                <AdminScoring />
              </ProtectedRoute>
            } />

            {/* ─── SuperAdmin Routes ──────────────────────────────────────── */}
            <Route path="/superadmin" element={<Navigate to="/superadmin/login" replace />} />
            <Route path="/superadmin/login" element={<UnifiedLogin />} />
            <Route path="/superadmin/dashboard" element={
              <ProtectedRoute requiredUserType="superadmin">
                <UnifiedDashboard routePrefix="/superadmin" />
              </ProtectedRoute>
            } />
            <Route path="/superadmin/dashboard/:tab" element={
              <ProtectedRoute requiredUserType="superadmin">
                <UnifiedDashboard routePrefix="/superadmin" />
              </ProtectedRoute>
            } />

            {/* ─── Coach Routes ───────────────────────────────────────────── */}
            <Route path="/coach" element={<Navigate to="/coach/login" replace />} />
            <Route path="/coach/login" element={<UnifiedLogin />} />
            <Route path="/coach/register" element={<UnifiedRegister />} />
            <Route path="/coach/create-team" element={
              <ProtectedRoute requiredUserType="coach">
                <CoachCreateTeam />
              </ProtectedRoute>
            } />
            <Route path="/coach/select-competition" element={
              <ProtectedRoute requiredUserType="coach">
                <UnifiedCompetitionSelection />
              </ProtectedRoute>
            } />
            <Route path="/coach/dashboard" element={
              <ProtectedRoute requiredUserType="coach">
                <CoachDashboard />
              </ProtectedRoute>
            } />
            <Route path="/coach/payment" element={
              <ProtectedRoute requiredUserType="coach">
                <CoachPayment />
              </ProtectedRoute>
            } />

            {/* ─── Player Routes ──────────────────────────────────────────── */}
            <Route path="/player" element={<Navigate to="/player/login" replace />} />
            <Route path="/player/login" element={<UnifiedLogin />} />
            <Route path="/player/register" element={<UnifiedRegister />} />
            <Route path="/player/select-team" element={
              <ProtectedRoute requiredUserType="player">
                <UnifiedCompetitionSelection />
              </ProtectedRoute>
            } />
            <Route path="/player/dashboard" element={
              <ProtectedRoute requiredUserType="player">
                <PlayerDashboard />
              </ProtectedRoute>
            } />

            {/* ─── Judge Routes ───────────────────────────────────────────── */}
            <Route path="/judge" element={<Navigate to="/judge/login" replace />} />
            <Route path="/judge/login" element={<UnifiedLogin />} />
            <Route path="/judge/scoring" element={
              <ProtectedRoute requiredUserType="judge">
                <JudgeScoring />
              </ProtectedRoute>
            } />

            {/* ─── Catch All ──────────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
```

### Lazy Loading Strategy

**Benefits of Lazy Loading**:
- Reduces initial bundle size
- Faster initial page load
- Better performance on slow networks
- Code splitting by route

**Implementation Pattern**:
```javascript
// Lazy load component
const MyPage = lazy(() => import('./pages/role/MyPage'));

// Wrap in Suspense with fallback
<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/my-page" element={<MyPage />} />
  </Routes>
</Suspense>
```

**Preloading Strategy** (optional optimization):
```javascript
// Preload likely next pages on hover
const handleMouseEnter = () => {
  import('./pages/coach/CoachDashboard');
};

<Link to="/coach/dashboard" onMouseEnter={handleMouseEnter}>
  Dashboard
</Link>
```

### Protected Route Configuration

**ProtectedRoute Component** (already exists):
```javascript
// Web/src/components/ProtectedRoute.jsx
const ProtectedRoute = ({ children, requiredUserType }) => {
  const { user, userType } = useAuth();
  const location = useLocation();
  
  // Check if user is authenticated
  if (!user || !userType) {
    return <Navigate to={`/${requiredUserType}/login`} state={{ from: location }} replace />;
  }
  
  // Check if user has correct role
  if (userType !== requiredUserType) {
    toast.error('Access denied. Incorrect user type.');
    return <Navigate to="/" replace />;
  }
  
  return children;
};
```

**Usage Pattern**:
```javascript
<Route path="/admin/dashboard" element={
  <ProtectedRoute requiredUserType="admin">
    <AdminDashboard />
  </ProtectedRoute>
} />
```

**Multi-Role Protection** (if needed):
```javascript
const ProtectedRoute = ({ children, allowedUserTypes }) => {
  const { user, userType } = useAuth();
  
  if (!user || !userType) {
    return <Navigate to="/" replace />;
  }
  
  if (!allowedUserTypes.includes(userType)) {
    toast.error('Access denied.');
    return <Navigate to="/" replace />;
  }
  
  return children;
};

// Usage
<Route path="/scoring" element={
  <ProtectedRoute allowedUserTypes={['admin', 'judge']}>
    <ScoringPage />
  </ProtectedRoute>
} />
```

### Role-Based Navigation

**Navigation Guards**:
```javascript
// Redirect based on user role
const { user, userType } = useAuth();

useEffect(() => {
  if (user && userType) {
    const dashboardPaths = {
      admin: '/admin/dashboard',
      superadmin: '/superadmin/dashboard',
      coach: '/coach/dashboard',
      player: '/player/dashboard',
      judge: '/judge/scoring',
    };
    
    navigate(dashboardPaths[userType]);
  }
}, [user, userType]);
```

**Role-Specific Redirects**:
```javascript
// After login, redirect to appropriate page
const handleLoginSuccess = (userData, token, role) => {
  login(userData, token, role);
  
  const redirectPaths = {
    admin: '/admin/dashboard',
    superadmin: '/superadmin/dashboard',
    coach: userData.hasTeam ? '/coach/dashboard' : '/coach/create-team',
    player: userData.team ? '/player/dashboard' : '/player/select-team',
    judge: '/judge/scoring',
  };
  
  navigate(redirectPaths[role]);
};
```

### Route Parameters and Query Strings

**Tab-Based Navigation**:
```javascript
// Route with tab parameter
<Route path="/admin/dashboard/:tab" element={<UnifiedDashboard />} />

// Access in component
const { tab } = useParams();
const activeTab = tab || 'overview';

// Navigate to tab
navigate('/admin/dashboard/teams');
```

**Query String Parameters**:
```javascript
// Navigate with query params
navigate('/admin/teams?gender=Male&ageGroup=Under14');

// Access in component
const [searchParams] = useSearchParams();
const gender = searchParams.get('gender');
const ageGroup = searchParams.get('ageGroup');
```

**State Passing**:
```javascript
// Pass state through navigation
navigate('/coach/dashboard', { 
  state: { message: 'Team created successfully!' } 
});

// Access in component
const location = useLocation();
const message = location.state?.message;

useEffect(() => {
  if (message) {
    toast.success(message);
  }
}, [message]);
```

### Nested Routes (Future Enhancement)

If needed for more complex layouts:

```javascript
<Route path="/admin" element={<AdminLayout />}>
  <Route index element={<Navigate to="dashboard" replace />} />
  <Route path="dashboard" element={<AdminDashboard />} />
  <Route path="teams" element={<AdminTeams />} />
  <Route path="scores" element={<AdminScores />} />
  <Route path="judges" element={<AdminJudges />} />
</Route>

// AdminLayout.jsx
const AdminLayout = () => {
  return (
    <div>
      <AdminNav />
      <main>
        <Outlet /> {/* Renders child routes */}
      </main>
    </div>
  );
};
```

### Route Organization Best Practices

1. **Group by role** - Keep all routes for a role together
2. **Use redirects** - Redirect base paths to login (e.g., `/admin` → `/admin/login`)
3. **Protect routes** - Always wrap authenticated routes in ProtectedRoute
4. **Lazy load** - Use lazy loading for all page components
5. **Provide fallbacks** - Always provide Suspense fallback for lazy loaded routes
6. **Handle 404s** - Include catch-all route at the end
7. **Maintain consistency** - Use consistent naming patterns for routes
8. **Document routes** - Add comments to group related routes



## Performance Optimization

### Code Splitting Strategy

**Route-Based Code Splitting** (already implemented):
```javascript
// Each route loads its own bundle
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const CoachDashboard = lazy(() => import('./pages/coach/CoachDashboard'));

// Results in separate chunks:
// - admin-dashboard.chunk.js
// - coach-dashboard.chunk.js
```

**Component-Based Code Splitting**:
```javascript
// Split large components
const HeavyChart = lazy(() => import('./components/HeavyChart'));

const Dashboard = () => {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart data={data} />
      </Suspense>
    </div>
  );
};
```

**Vendor Code Splitting** (Vite configuration):
```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'form-vendor': ['react-hook-form'],
        },
      },
    },
  },
};
```

### Memoization Approach

**Component Memoization**:
```javascript
// Prevent re-renders when props haven't changed
const TeamCard = React.memo(({ team, onDelete }) => {
  return (
    <div className="team-card">
      <h3>{team.name}</h3>
      <button onClick={() => onDelete(team._id)}>Delete</button>
    </div>
  );
});

// Custom comparison function
const TeamCard = React.memo(({ team, onDelete }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Return true if props are equal (skip re-render)
  return prevProps.team._id === nextProps.team._id &&
         prevProps.team.name === nextProps.team.name;
});
```

**Value Memoization**:
```javascript
// Cache expensive calculations
const Dashboard = () => {
  const [teams, setTeams] = useState([]);
  const [filters, setFilters] = useState({ gender: 'all', ageGroup: 'all' });
  
  // Only recalculate when teams or filters change
  const filteredTeams = useMemo(() => {
    console.log('Filtering teams...'); // Only logs when dependencies change
    return teams.filter(team => {
      if (filters.gender !== 'all' && team.gender !== filters.gender) return false;
      if (filters.ageGroup !== 'all' && team.ageGroup !== filters.ageGroup) return false;
      return true;
    });
  }, [teams, filters]);
  
  const totalParticipants = useMemo(() => {
    return filteredTeams.reduce((sum, team) => sum + team.players.length, 0);
  }, [filteredTeams]);
  
  return (
    <div>
      <p>Total Participants: {totalParticipants}</p>
      <TeamsList teams={filteredTeams} />
    </div>
  );
};
```

**Callback Memoization**:
```javascript
// Prevent function recreation
const TeamsList = () => {
  const [teams, setTeams] = useState([]);
  
  // Without useCallback, this function is recreated on every render
  // causing child components to re-render unnecessarily
  const handleDeleteTeam = useCallback(async (teamId) => {
    await api.deleteTeam(teamId);
    setTeams(prev => prev.filter(t => t._id !== teamId));
  }, []); // Empty deps - function never changes
  
  const handleUpdateTeam = useCallback(async (teamId, updates) => {
    await api.updateTeam(teamId, updates);
    setTeams(prev => prev.map(t => t._id === teamId ? { ...t, ...updates } : t));
  }, []); // Empty deps - function never changes
  
  return (
    <div>
      {teams.map(team => (
        <TeamCard 
          key={team._id} 
          team={team} 
          onDelete={handleDeleteTeam}
          onUpdate={handleUpdateTeam}
        />
      ))}
    </div>
  );
};
```

### Bundle Size Optimization

**Current Bundle Analysis**:
```bash
# Build and analyze bundle
npm run build
npx vite-bundle-visualizer
```

**Optimization Targets**:
1. **Remove duplicate code**: Consolidate login/register/dashboard pages (estimated 30% reduction)
2. **Tree shaking**: Ensure unused exports are removed
3. **Lazy load heavy dependencies**: Charts, PDF viewers, etc.
4. **Optimize images**: Use WebP format, lazy load images
5. **Remove unused dependencies**: Audit package.json

**Expected Bundle Size Reduction**:
```
Before Refactoring:
- Total bundle: ~800 KB (gzipped)
- Pages code: ~350 KB
- Vendor code: ~450 KB

After Refactoring:
- Total bundle: ~650 KB (gzipped) - 18% reduction
- Pages code: ~245 KB - 30% reduction (unified components)
- Vendor code: ~405 KB - 10% reduction (better tree shaking)
```

**Import Optimization**:
```javascript
// Bad: Imports entire library
import _ from 'lodash';
const result = _.debounce(fn, 300);

// Good: Import only what you need
import debounce from 'lodash/debounce';
const result = debounce(fn, 300);

// Bad: Imports all icons
import * as Icons from 'lucide-react';
<Icons.User />

// Good: Import specific icons
import { User, Mail, Lock } from 'lucide-react';
<User />
```

### Lazy Loading Implementation

**Image Lazy Loading**:
```javascript
// Native lazy loading
<img src="/logo.png" alt="Logo" loading="lazy" />

// With Intersection Observer for more control
const LazyImage = ({ src, alt }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef();
  
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsLoaded(true);
        observer.disconnect();
      }
    });
    
    if (imgRef.current) {
      observer.observe(imgRef.current);
    }
    
    return () => observer.disconnect();
  }, []);
  
  return (
    <img 
      ref={imgRef}
      src={isLoaded ? src : '/placeholder.png'}
      alt={alt}
      loading="lazy"
    />
  );
};
```

**Component Lazy Loading with Preloading**:
```javascript
// Preload on hover
const NavLink = ({ to, children }) => {
  const handleMouseEnter = () => {
    // Preload the component
    import(`./pages/${to}`);
  };
  
  return (
    <Link to={to} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  );
};

// Preload on route change
const App = () => {
  const location = useLocation();
  
  useEffect(() => {
    // Preload likely next pages based on current route
    if (location.pathname === '/coach/login') {
      import('./pages/coach/CoachDashboard');
      import('./pages/coach/CoachCreateTeam');
    }
  }, [location]);
  
  return <Routes>...</Routes>;
};
```

**Data Lazy Loading (Pagination)**:
```javascript
const TeamsList = () => {
  const [teams, setTeams] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const loadMore = async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const response = await api.getTeams({ page, limit: 20 });
      setTeams(prev => [...prev, ...response.data.teams]);
      setHasMore(response.data.hasMore);
      setPage(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };
  
  // Infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        loadMore();
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, hasMore]);
  
  return (
    <div>
      {teams.map(team => <TeamCard key={team._id} team={team} />)}
      {loading && <LoadingSpinner />}
    </div>
  );
};
```

### Performance Monitoring

**Lighthouse Metrics Targets**:
```
Performance: 90+
Accessibility: 95+
Best Practices: 95+
SEO: 90+

Core Web Vitals:
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1
```

**Performance Measurement**:
```javascript
// Measure component render time
const MyComponent = () => {
  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      console.log(`MyComponent render time: ${endTime - startTime}ms`);
    };
  });
  
  return <div>Content</div>;
};

// Measure API call time
const fetchData = async () => {
  const startTime = performance.now();
  const response = await api.getData();
  const endTime = performance.now();
  
  logger.info(`API call took ${endTime - startTime}ms`);
  return response;
};
```

**React DevTools Profiler**:
```javascript
// Wrap components to profile
import { Profiler } from 'react';

const onRenderCallback = (
  id, // Component identifier
  phase, // "mount" or "update"
  actualDuration, // Time spent rendering
  baseDuration, // Estimated time without memoization
  startTime, // When render started
  commitTime, // When render committed
  interactions // Set of interactions
) => {
  console.log(`${id} ${phase} took ${actualDuration}ms`);
};

<Profiler id="Dashboard" onRender={onRenderCallback}>
  <Dashboard />
</Profiler>
```

### Optimization Checklist

**Before Refactoring**:
- [ ] Run Lighthouse audit and record baseline scores
- [ ] Measure bundle size with vite-bundle-visualizer
- [ ] Profile components with React DevTools
- [ ] Measure page load times

**During Refactoring**:
- [ ] Implement lazy loading for all routes
- [ ] Add React.memo to expensive components
- [ ] Use useMemo for expensive calculations
- [ ] Use useCallback for event handlers passed to children
- [ ] Optimize imports (tree shaking)
- [ ] Remove unused dependencies

**After Refactoring**:
- [ ] Run Lighthouse audit and compare scores
- [ ] Verify bundle size reduction (target: 30% reduction in pages code)
- [ ] Profile components to identify remaining bottlenecks
- [ ] Test on slow 3G network
- [ ] Test on low-end devices
- [ ] Monitor production performance metrics

**Continuous Monitoring**:
- [ ] Set up performance budgets in CI/CD
- [ ] Monitor Core Web Vitals in production
- [ ] Track bundle size changes in PRs
- [ ] Regular Lighthouse audits



## Testing Strategy

### Unit Test Structure

**Test Organization**:
```
Web/src/pages/
├── unified/
│   ├── UnifiedLogin.jsx
│   ├── UnifiedLogin.test.jsx
│   ├── UnifiedDashboard.jsx
│   ├── UnifiedDashboard.test.jsx
│   ├── UnifiedRegister.jsx
│   ├── UnifiedRegister.test.jsx
│   ├── UnifiedCompetitionSelection.jsx
│   └── UnifiedCompetitionSelection.test.jsx
├── admin/
│   ├── AdminTeams.jsx
│   └── AdminTeams.test.jsx
└── ...
```

**Unit Test Template**:
```javascript
// UnifiedLogin.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import UnifiedLogin from './UnifiedLogin';
import * as api from '../../services/api';

// Mock API calls
vi.mock('../../services/api');

// Mock router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/admin/login' }),
  };
});

describe('UnifiedLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Role Detection', () => {
    it('should detect admin role from /admin/login path', () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      expect(screen.getByText(/Admin Portal/i)).toBeInTheDocument();
    });
    
    it('should detect coach role from /coach/login path', () => {
      vi.mocked(useLocation).mockReturnValue({ pathname: '/coach/login' });
      
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      expect(screen.getByText(/Coach Portal/i)).toBeInTheDocument();
    });
  });
  
  describe('Form Validation', () => {
    it('should show error for empty email', async () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
    });
    
    it('should show error for invalid email format', async () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
      });
    });
  });
  
  describe('Authentication Flow', () => {
    it('should call admin API on successful login', async () => {
      const mockResponse = {
        data: {
          token: 'mock-token',
          admin: { _id: '1', name: 'Admin User', email: 'admin@test.com' },
        },
      };
      
      vi.mocked(api.adminAPI.login).mockResolvedValue(mockResponse);
      
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(api.adminAPI.login).toHaveBeenCalledWith({
          email: 'admin@test.com',
          password: 'password123',
        });
      });
    });
    
    it('should navigate to dashboard after successful login', async () => {
      const mockResponse = {
        data: {
          token: 'mock-token',
          admin: { _id: '1', name: 'Admin User', email: 'admin@test.com' },
        },
      };
      
      vi.mocked(api.adminAPI.login).mockResolvedValue(mockResponse);
      
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      // Fill form and submit
      // ...
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard');
      });
    });
    
    it('should show error message on failed login', async () => {
      vi.mocked(api.adminAPI.login).mockRejectedValue({
        response: { data: { message: 'Invalid credentials' } },
      });
      
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      // Fill form and submit
      // ...
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });
  });
  
  describe('Theme Application', () => {
    it('should apply admin theme colors', () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      const container = screen.getByRole('main');
      expect(container).toHaveStyle({ background: expect.stringContaining('#8B5CF6') });
    });
  });
  
  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });
    
    it('should support keyboard navigation', () => {
      render(
        <BrowserRouter>
          <UnifiedLogin />
        </BrowserRouter>
      );
      
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);
      
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      expect(document.activeElement).toBe(passwordInput);
      
      fireEvent.keyDown(passwordInput, { key: 'Tab' });
      expect(document.activeElement).toBe(submitButton);
    });
  });
});
```

### Integration Test Approach

**Integration Test Example**:
```javascript
// UnifiedLogin.integration.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from '../../App';
import { setupServer } from 'msw/node';
import { rest } from 'msw';

// Mock server for API calls
const server = setupServer(
  rest.post('/api/admin/login', (req, res, ctx) => {
    return res(
      ctx.json({
        token: 'mock-token',
        admin: { _id: '1', name: 'Admin User', email: 'admin@test.com' },
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Login Flow Integration', () => {
  it('should complete full login flow from login page to dashboard', async () => {
    // Start at login page
    window.history.pushState({}, '', '/admin/login');
    
    render(<App />);
    
    // Verify we're on login page
    expect(screen.getByText(/Admin Portal/i)).toBeInTheDocument();
    
    // Fill in credentials
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(emailInput, { target: { value: 'admin@test.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    // Wait for navigation to dashboard
    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });
    
    // Verify we're on dashboard
    expect(window.location.pathname).toBe('/admin/dashboard');
  });
  
  it('should handle authentication errors gracefully', async () => {
    // Override server to return error
    server.use(
      rest.post('/api/admin/login', (req, res, ctx) => {
        return res(
          ctx.status(401),
          ctx.json({ message: 'Invalid credentials' })
        );
      })
    );
    
    window.history.pushState({}, '', '/admin/login');
    render(<App />);
    
    // Fill in credentials
    // ...
    
    // Verify error message is shown
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
    
    // Verify we're still on login page
    expect(window.location.pathname).toBe('/admin/login');
  });
});
```

### Role-Based Rendering Tests

**Test Different Role Configurations**:
```javascript
// UnifiedDashboard.test.jsx
describe('UnifiedDashboard Role-Based Rendering', () => {
  it('should render admin-specific content for admin role', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/admin/dashboard' });
    
    render(
      <BrowserRouter>
        <UnifiedDashboard />
      </BrowserRouter>
    );
    
    expect(screen.getByText(/Competition Control/i)).toBeInTheDocument();
    expect(screen.getByText(/Judges Assignment Status/i)).toBeInTheDocument();
  });
  
  it('should render superadmin-specific content for superadmin role', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/superadmin/dashboard' });
    
    render(
      <BrowserRouter>
        <UnifiedDashboard routePrefix="/superadmin" />
      </BrowserRouter>
    );
    
    expect(screen.getByText(/System Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/All Competitions/i)).toBeInTheDocument();
  });
  
  it('should show different navigation tabs for admin vs superadmin', () => {
    // Admin tabs
    vi.mocked(useLocation).mockReturnValue({ pathname: '/admin/dashboard' });
    const { rerender } = render(
      <BrowserRouter>
        <UnifiedDashboard />
      </BrowserRouter>
    );
    
    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    expect(screen.queryByText(/Management/i)).not.toBeInTheDocument();
    
    // SuperAdmin tabs
    vi.mocked(useLocation).mockReturnValue({ pathname: '/superadmin/dashboard' });
    rerender(
      <BrowserRouter>
        <UnifiedDashboard routePrefix="/superadmin" />
      </BrowserRouter>
    );
    
    expect(screen.getByText(/Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Management/i)).toBeInTheDocument();
  });
});
```

### Visual Regression Testing

**Visual Regression Test Setup**:
```javascript
// unified/visual-regression.test.jsx
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import UnifiedLogin from './UnifiedLogin';

expect.extend({ toMatchImageSnapshot });

describe('UnifiedLogin Visual Regression', () => {
  it('should match admin login snapshot', async () => {
    const { container } = render(
      <BrowserRouter>
        <UnifiedLogin />
      </BrowserRouter>
    );
    
    // Wait for animations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(container).toMatchImageSnapshot({
      customSnapshotIdentifier: 'admin-login',
      failureThreshold: 0.01,
      failureThresholdType: 'percent',
    });
  });
  
  it('should match coach login snapshot', async () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/coach/login' });
    
    const { container } = render(
      <BrowserRouter>
        <UnifiedLogin />
      </BrowserRouter>
    );
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    expect(container).toMatchImageSnapshot({
      customSnapshotIdentifier: 'coach-login',
      failureThreshold: 0.01,
      failureThresholdType: 'percent',
    });
  });
});
```

### Test Coverage Targets

**Coverage Goals**:
```
Overall Coverage: 80%+
- Statements: 80%+
- Branches: 75%+
- Functions: 80%+
- Lines: 80%+

Critical Paths: 95%+
- Authentication flows
- Role detection logic
- Protected route guards
- API error handling
```

**Coverage Report**:
```bash
# Run tests with coverage
npm run test:coverage

# View coverage report
open coverage/index.html
```

**Coverage Configuration** (vitest.config.js):
```javascript
export default {
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.{js,jsx}',
        '**/*.config.{js,ts}',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
};
```

### Backward Compatibility Testing

**Test Redirect Wrappers**:
```javascript
// admin/AdminLogin.test.jsx
describe('AdminLogin Redirect Wrapper', () => {
  it('should redirect to UnifiedLogin', () => {
    const mockNavigate = vi.fn();
    vi.mock('react-router-dom', () => ({
      Navigate: ({ to }) => {
        mockNavigate(to);
        return null;
      },
    }));
    
    render(<AdminLogin />);
    
    expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
  });
  
  it('should show deprecation warning in development', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    process.env.NODE_ENV = 'development';
    
    render(<AdminLogin />);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('AdminLogin is deprecated')
    );
  });
});
```

**Test Index Re-Exports**:
```javascript
// pages/index.test.js
describe('Pages Index Re-Exports', () => {
  it('should export all page components', () => {
    const exports = require('./index');
    
    expect(exports.AdminDashboard).toBeDefined();
    expect(exports.CoachDashboard).toBeDefined();
    expect(exports.PlayerDashboard).toBeDefined();
    expect(exports.UnifiedLogin).toBeDefined();
    // ... test all exports
  });
  
  it('should show deprecation warning when imported', () => {
    const consoleSpy = vi.spyOn(console, 'warn');
    process.env.NODE_ENV = 'development';
    
    require('./index');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('deprecated')
    );
  });
});
```

### Test Execution Strategy

**Test Scripts** (package.json):
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:integration": "vitest --run --config vitest.integration.config.js",
    "test:visual": "vitest --run --config vitest.visual.config.js"
  }
}
```

**CI/CD Integration**:
```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Testing Checklist

**Unit Tests**:
- [ ] Test role detection logic
- [ ] Test form validation
- [ ] Test API integration
- [ ] Test error handling
- [ ] Test theme application
- [ ] Test accessibility features

**Integration Tests**:
- [ ] Test complete authentication flows
- [ ] Test navigation between pages
- [ ] Test protected route guards
- [ ] Test competition context integration

**Visual Regression Tests**:
- [ ] Test all role-specific login pages
- [ ] Test dashboard layouts
- [ ] Test mobile responsive views
- [ ] Test theme variations

**Backward Compatibility Tests**:
- [ ] Test redirect wrappers
- [ ] Test index re-exports
- [ ] Test deprecation warnings
- [ ] Test existing import paths

**Accessibility Tests**:
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Test focus management
- [ ] Test ARIA labels



## Error Handling

### Error Boundary Strategy

**Global Error Boundary** (already implemented in App.jsx):
```javascript
// Web/src/components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to monitoring service
    logger.error('ErrorBoundary caught error:', {
      error: error.toString(),
      errorInfo: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });
    
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center" 
          style={{ background: '#0A0A0A' }}>
          <div className="max-w-md text-center p-8">
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: '#EF444420', border: '1px solid #EF444440' }}>
              <AlertCircle className="w-8 h-8" style={{ color: '#EF4444' }} />
            </div>
            
            <h1 className="text-2xl font-black text-white mb-3">
              Something went wrong
            </h1>
            <p className="text-white/60 text-sm mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="text-left mb-6 p-4 rounded-lg" 
                style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.06)' }}>
                <summary className="text-white/80 text-xs font-bold cursor-pointer mb-2">
                  Error Details
                </summary>
                <pre className="text-white/40 text-xs overflow-auto">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={{ background: '#EF4444', color: '#fff' }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Page-Level Error Boundaries**:
```javascript
// Wrap individual pages for granular error handling
const AdminDashboard = () => {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
};

// Or wrap sections within a page
const DashboardContent = () => {
  return (
    <div>
      <ErrorBoundary>
        <StatsSection />
      </ErrorBoundary>
      
      <ErrorBoundary>
        <JudgesSection />
      </ErrorBoundary>
      
      <ErrorBoundary>
        <TeamsSection />
      </ErrorBoundary>
    </div>
  );
};
```

### API Error Handling

**Centralized API Error Handler**:
```javascript
// Web/src/services/api.js
const handleAPIError = (error, context = '') => {
  // Log error
  logger.error(`API Error ${context}:`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    url: error.config?.url,
  });
  
  // Handle specific error codes
  if (error.response) {
    switch (error.response.status) {
      case 401:
        // Unauthorized - clear auth and redirect to login
        secureStorage.clear();
        window.location.href = '/';
        toast.error('Session expired. Please login again.');
        break;
        
      case 403:
        // Forbidden - insufficient permissions
        toast.error('Access denied. You do not have permission to perform this action.');
        break;
        
      case 404:
        // Not found
        toast.error('Resource not found.');
        break;
        
      case 422:
        // Validation error
        const validationErrors = error.response.data.errors;
        if (validationErrors && Array.isArray(validationErrors)) {
          validationErrors.forEach(err => toast.error(err.message));
        } else {
          toast.error(error.response.data.message || 'Validation failed.');
        }
        break;
        
      case 429:
        // Rate limit exceeded
        toast.error('Too many requests. Please try again later.');
        break;
        
      case 500:
      case 502:
      case 503:
        // Server errors
        toast.error('Server error. Please try again later.');
        break;
        
      default:
        // Generic error
        toast.error(error.response.data.message || 'An error occurred.');
    }
  } else if (error.request) {
    // Network error - no response received
    toast.error('Network error. Please check your connection.');
  } else {
    // Other errors
    toast.error('An unexpected error occurred.');
  }
  
  // Re-throw for component-level handling if needed
  throw error;
};

// Usage in API calls
export const adminAPI = {
  getDashboard: async () => {
    try {
      const response = await axios.get('/api/admin/dashboard');
      return response;
    } catch (error) {
      handleAPIError(error, 'getDashboard');
    }
  },
};
```

**Component-Level Error Handling**:
```javascript
const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetchDashboardData();
  }, []);
  
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await adminAPI.getDashboard();
      setStats(response.data.stats);
    } catch (error) {
      // Error already handled by handleAPIError
      // Set local error state for UI feedback
      setError(error.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <LoadingSpinner />;
  
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-white/60 mb-4">{error}</p>
        <button 
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-saffron text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }
  
  return <DashboardContent stats={stats} />;
};
```

### Form Validation Error Handling

**Client-Side Validation** (react-hook-form):
```javascript
const UnifiedLogin = () => {
  const { register, handleSubmit, formState: { errors }, setError } = useForm();
  
  const onSubmit = async (data) => {
    try {
      // Client-side validation passed, attempt login
      await api.login(data);
    } catch (error) {
      // Server-side validation errors
      if (error.response?.status === 422) {
        const serverErrors = error.response.data.errors;
        
        // Map server errors to form fields
        serverErrors.forEach(err => {
          setError(err.field, {
            type: 'server',
            message: err.message,
          });
        });
      }
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register('email', {
          required: 'Email is required',
          pattern: {
            value: /^\S+@\S+$/i,
            message: 'Invalid email format',
          },
        })}
      />
      {errors.email && (
        <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
      )}
      
      <input
        type="password"
        {...register('password', {
          required: 'Password is required',
          minLength: {
            value: 8,
            message: 'Password must be at least 8 characters',
          },
        })}
      />
      {errors.password && (
        <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
      )}
      
      <button type="submit">Sign In</button>
    </form>
  );
};
```

### Network Error Handling

**Retry Logic**:
```javascript
const fetchWithRetry = async (fetchFn, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error;
      }
      
      // Wait before retrying
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
};

// Usage
const fetchDashboardData = async () => {
  try {
    const response = await fetchWithRetry(() => adminAPI.getDashboard());
    setStats(response.data.stats);
  } catch (error) {
    setError('Failed to load dashboard after multiple attempts');
  }
};
```

**Offline Detection**:
```javascript
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('No internet connection');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
};

// Usage in component
const MyPage = () => {
  const isOnline = useOnlineStatus();
  
  if (!isOnline) {
    return (
      <div className="text-center py-12">
        <WifiOff className="w-12 h-12 mx-auto mb-4 text-white/40" />
        <p className="text-white/60">No internet connection</p>
        <p className="text-white/40 text-sm">Please check your network settings</p>
      </div>
    );
  }
  
  return <PageContent />;
};
```

### Authentication Error Handling

**Token Expiration**:
```javascript
// Axios interceptor for handling expired tokens
axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      const currentPath = window.location.pathname;
      const role = currentPath.split('/')[1]; // Extract role from path
      
      // Clear auth data
      secureStorage.clear();
      
      // Redirect to appropriate login page
      window.location.href = `/${role}/login`;
      
      toast.error('Session expired. Please login again.');
    }
    
    return Promise.reject(error);
  }
);
```

**Permission Errors**:
```javascript
const ProtectedRoute = ({ children, requiredUserType, requiredPermissions = [] }) => {
  const { user, userType } = useAuth();
  const location = useLocation();
  
  // Check authentication
  if (!user || !userType) {
    return <Navigate to={`/${requiredUserType}/login`} state={{ from: location }} replace />;
  }
  
  // Check role
  if (userType !== requiredUserType) {
    toast.error('Access denied. Incorrect user type.');
    return <Navigate to="/" replace />;
  }
  
  // Check permissions (if specified)
  if (requiredPermissions.length > 0) {
    const hasPermission = requiredPermissions.every(permission => 
      user.permissions?.includes(permission)
    );
    
    if (!hasPermission) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-dark">
          <div className="text-center">
            <ShieldOff className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-white/60 mb-6">
              You do not have permission to access this page.
            </p>
            <button 
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-saffron text-white rounded-lg"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }
  
  return children;
};
```

### User-Friendly Error Messages

**Error Message Mapping**:
```javascript
const ERROR_MESSAGES = {
  // Network errors
  'Network Error': 'Unable to connect to the server. Please check your internet connection.',
  'ERR_NETWORK': 'Network error. Please check your connection and try again.',
  
  // Authentication errors
  'Invalid credentials': 'The email or password you entered is incorrect.',
  'Account locked': 'Your account has been locked due to multiple failed login attempts. Please try again later.',
  'Email not verified': 'Please verify your email address before logging in.',
  
  // Validation errors
  'Email already exists': 'An account with this email already exists. Please use a different email or login.',
  'Invalid email format': 'Please enter a valid email address.',
  'Password too weak': 'Password must be at least 8 characters and include uppercase, lowercase, and numbers.',
  
  // Resource errors
  'Team not found': 'The team you are looking for does not exist or has been deleted.',
  'Competition not found': 'The competition you are looking for does not exist or has ended.',
  
  // Permission errors
  'Insufficient permissions': 'You do not have permission to perform this action.',
  'Access denied': 'Access denied. Please contact your administrator.',
};

const getUserFriendlyMessage = (error) => {
  const errorMessage = error.response?.data?.message || error.message;
  return ERROR_MESSAGES[errorMessage] || errorMessage || 'An unexpected error occurred.';
};

// Usage
try {
  await api.createTeam(data);
} catch (error) {
  const friendlyMessage = getUserFriendlyMessage(error);
  toast.error(friendlyMessage);
}
```

### Error Logging

**Structured Error Logging**:
```javascript
// Web/src/utils/logger.js
export const logger = {
  error: (message, context = {}) => {
    const errorLog = {
      level: 'error',
      message,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      user: secureStorage.getItem('user') ? JSON.parse(secureStorage.getItem('user'))._id : null,
    };
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ERROR]', errorLog);
    }
    
    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      // Send to Sentry, LogRocket, or custom logging service
      // Example: Sentry.captureException(new Error(message), { extra: context });
    }
  },
  
  warn: (message, context = {}) => {
    // Similar implementation for warnings
  },
  
  info: (message, context = {}) => {
    // Similar implementation for info logs
  },
};
```

### Error Handling Checklist

**API Errors**:
- [ ] Handle 401 (Unauthorized) - redirect to login
- [ ] Handle 403 (Forbidden) - show access denied message
- [ ] Handle 404 (Not Found) - show resource not found message
- [ ] Handle 422 (Validation Error) - show field-specific errors
- [ ] Handle 429 (Rate Limit) - show rate limit message
- [ ] Handle 500+ (Server Error) - show generic error with retry option

**Network Errors**:
- [ ] Detect offline status
- [ ] Implement retry logic for transient failures
- [ ] Show connection status indicator
- [ ] Queue requests when offline (if applicable)

**Authentication Errors**:
- [ ] Handle token expiration
- [ ] Handle invalid credentials
- [ ] Handle account lockout
- [ ] Handle permission errors

**Form Errors**:
- [ ] Client-side validation
- [ ] Server-side validation
- [ ] Field-specific error messages
- [ ] Form-level error messages

**UI Errors**:
- [ ] Error boundaries for component crashes
- [ ] Loading states for async operations
- [ ] Empty states for no data
- [ ] Error states with retry options

**Logging**:
- [ ] Log all errors to console in development
- [ ] Send errors to monitoring service in production
- [ ] Include context (user, URL, timestamp)
- [ ] Sanitize sensitive data before logging



## Migration Plan

### Phase 1: File Renaming and Folder Organization (Sprint 1, Week 1)

**Objective**: Reorganize files into role-based folders and rename JudgeScoringNew

**Tasks**:
1. Create new folder structure
2. Move files to appropriate folders
3. Rename JudgeScoringNew to JudgeScoring
4. Create root-level index.js with re-exports
5. Update App.jsx imports

**Detailed Steps**:

**Step 1.1: Create Folder Structure**
```bash
cd Web/src/pages

# Create role-based folders
mkdir -p admin coach player judge superadmin public shared

# unified/ folder already exists
```

**Step 1.2: Move Admin Files**
```bash
# Move admin pages
mv AdminDashboard.jsx admin/
mv AdminLogin.jsx admin/
mv AdminTeams.jsx admin/
mv AdminScores.jsx admin/
mv AdminJudges.jsx admin/
mv AdminScoring.jsx admin/
mv AdminTransactions.jsx admin/
mv adminTheme.js admin/
```

**Step 1.3: Move SuperAdmin Files**
```bash
# Move superadmin pages
mv SuperAdminDashboard.jsx superadmin/
mv SuperAdminLogin.jsx superadmin/
mv SuperAdminManagement.jsx superadmin/
mv SuperAdminSystemStats.jsx superadmin/
```

**Step 1.4: Move Coach Files**
```bash
# Move coach pages
mv CoachLogin.jsx coach/
mv CoachRegister.jsx coach/
mv CoachDashboard.jsx coach/
mv CoachCreateTeam.jsx coach/
mv CoachSelectCompetition.jsx coach/
mv CoachPayment.jsx coach/
```

**Step 1.5: Move Player Files**
```bash
# Move player pages
mv PlayerLogin.jsx player/
mv PlayerRegister.jsx player/
mv PlayerDashboard.jsx player/
mv PlayerSelectTeam.jsx player/
```

**Step 1.6: Move Judge Files and Rename**
```bash
# Move and rename judge pages
mv JudgeLogin.jsx judge/
mv JudgeScoringNew.jsx judge/JudgeScoring.jsx
```

**Step 1.7: Move Public Files**
```bash
# Move public pages
mv Home.jsx public/
mv PublicScores.jsx public/
```

**Step 1.8: Move Shared Files**
```bash
# Move shared pages
mv ForgotPassword.jsx shared/
mv ResetPassword.jsx shared/
mv DesignTokenAuditPage.jsx shared/
```

**Step 1.9: Create Root Index**
```bash
# Create index.js with re-exports
touch index.js
```

**Step 1.10: Update App.jsx**
- Update all lazy import paths
- Update route components
- Test all routes

**Validation**:
- [ ] All files moved to correct folders
- [ ] JudgeScoringNew renamed to JudgeScoring
- [ ] index.js created with all re-exports
- [ ] App.jsx imports updated
- [ ] All routes still functional
- [ ] No broken imports

**Rollback Plan**:
- Git revert to previous commit
- All files remain in original locations

---

### Phase 2: Unified Component Creation (Sprint 1, Week 2)

**Objective**: Create UnifiedRegister and UnifiedCompetitionSelection components

**Tasks**:
1. Create UnifiedRegister component
2. Create UnifiedCompetitionSelection component
3. Update redirect wrappers
4. Update App.jsx routes
5. Write tests

**Detailed Steps**:

**Step 2.1: Create UnifiedRegister**
```bash
cd Web/src/pages/unified
touch UnifiedRegister.jsx
touch UnifiedRegister.test.jsx
```

**Implementation Checklist**:
- [ ] Role detection from route path
- [ ] ThemeProvider integration
- [ ] Role-specific form fields
- [ ] Form validation with react-hook-form
- [ ] API integration (coachAPI.register, playerAPI.register)
- [ ] Post-registration navigation
- [ ] Error handling
- [ ] Loading states
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Mobile responsive design

**Step 2.2: Create UnifiedCompetitionSelection**
```bash
cd Web/src/pages/unified
touch UnifiedCompetitionSelection.jsx
touch UnifiedCompetitionSelection.test.jsx
```

**Implementation Checklist**:
- [ ] Role detection from route path
- [ ] ThemeProvider integration
- [ ] Coach view: Competition selection
- [ ] Player view: Team selection
- [ ] API integration (coachAPI.getCompetitions, playerAPI.getAvailableTeams)
- [ ] Selection persistence in CompetitionContext
- [ ] Post-selection navigation
- [ ] Error handling
- [ ] Loading states
- [ ] Empty states
- [ ] Accessibility
- [ ] Mobile responsive design

**Step 2.3: Update Redirect Wrappers**

Create redirect wrappers in role folders:
```javascript
// coach/CoachRegister.jsx
export { default } from '../unified/UnifiedRegister';

// player/PlayerRegister.jsx
export { default } from '../unified/UnifiedRegister';

// coach/CoachSelectCompetition.jsx
export { default } from '../unified/UnifiedCompetitionSelection';

// player/PlayerSelectTeam.jsx
export { default } from '../unified/UnifiedCompetitionSelection';
```

**Step 2.4: Update App.jsx Routes**
```javascript
// Import unified components
const UnifiedRegister = lazy(() => import('./pages/unified/UnifiedRegister'));
const UnifiedCompetitionSelection = lazy(() => import('./pages/unified/UnifiedCompetitionSelection'));

// Update routes
<Route path="/coach/register" element={<UnifiedRegister />} />
<Route path="/player/register" element={<UnifiedRegister />} />
<Route path="/coach/select-competition" element={
  <ProtectedRoute requiredUserType="coach">
    <UnifiedCompetitionSelection />
  </ProtectedRoute>
} />
<Route path="/player/select-team" element={
  <ProtectedRoute requiredUserType="player">
    <UnifiedCompetitionSelection />
  </ProtectedRoute>
} />
```

**Step 2.5: Write Tests**
- Unit tests for role detection
- Unit tests for form validation
- Integration tests for registration flow
- Integration tests for selection flow
- Visual regression tests

**Validation**:
- [ ] UnifiedRegister works for coach and player
- [ ] UnifiedCompetitionSelection works for coach and player
- [ ] All registration flows functional
- [ ] All selection flows functional
- [ ] Tests passing with 80%+ coverage
- [ ] No regressions in existing functionality

**Rollback Plan**:
- Revert to old CoachRegister/PlayerRegister components
- Revert to old CoachSelectCompetition/PlayerSelectTeam components
- Update App.jsx routes back to old components

---

### Phase 3: Testing and Validation (Sprint 2, Week 1)

**Objective**: Comprehensive testing of all refactored components

**Tasks**:
1. Run full test suite
2. Manual testing of all flows
3. Performance testing
4. Accessibility testing
5. Cross-browser testing
6. Mobile device testing

**Testing Checklist**:

**Functional Testing**:
- [ ] All login flows (5 roles)
- [ ] All registration flows (coach, player)
- [ ] All dashboard views (admin, superadmin, coach, player, judge)
- [ ] Competition selection (coach)
- [ ] Team selection (player)
- [ ] Navigation between pages
- [ ] Protected routes
- [ ] Authentication persistence
- [ ] Logout functionality

**Integration Testing**:
- [ ] End-to-end authentication flows
- [ ] Competition context integration
- [ ] Real-time updates (socket.io)
- [ ] API error handling
- [ ] Network error handling

**Performance Testing**:
- [ ] Lighthouse audit (target: 90+ performance score)
- [ ] Bundle size analysis (target: 30% reduction)
- [ ] Page load times (target: < 2s)
- [ ] Time to interactive (target: < 3s)

**Accessibility Testing**:
- [ ] Keyboard navigation
- [ ] Screen reader compatibility (NVDA, JAWS)
- [ ] Color contrast (WCAG AA)
- [ ] Focus indicators
- [ ] ARIA labels
- [ ] Touch target sizes (44px minimum)

**Cross-Browser Testing**:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

**Mobile Device Testing**:
- [ ] iPhone (various sizes)
- [ ] Android phones (various sizes)
- [ ] iPad
- [ ] Android tablets
- [ ] Landscape orientation
- [ ] Portrait orientation

**Validation**:
- [ ] All tests passing
- [ ] No regressions identified
- [ ] Performance targets met
- [ ] Accessibility targets met
- [ ] Cross-browser compatibility confirmed
- [ ] Mobile responsiveness confirmed

**Issue Tracking**:
- Document any issues found
- Prioritize issues (critical, high, medium, low)
- Fix critical and high priority issues before Phase 4
- Create tickets for medium and low priority issues

---

### Phase 4: Cleanup and Documentation (Sprint 2, Week 2)

**Objective**: Remove temporary code and update documentation

**Tasks**:
1. Remove index.js re-exports
2. Remove deprecation warnings
3. Update documentation
4. Archive old code
5. Final validation

**Detailed Steps**:

**Step 4.1: Remove index.js**
```bash
cd Web/src/pages
rm index.js
```

**Step 4.2: Remove Deprecation Warnings**
- Remove console.warn statements from redirect wrappers
- Remove deprecation comments from code

**Step 4.3: Update Documentation**

Create/Update documentation files:
- [ ] README.md - New folder structure and conventions
- [ ] MIGRATION.md - Migration guide for future changes
- [ ] ARCHITECTURE.md - Architecture overview
- [ ] CONTRIBUTING.md - Contribution guidelines

**README.md Content**:
```markdown
# Pages Folder

This folder contains all page-level components organized by user role.

## Folder Structure

- `admin/` - Admin-specific pages
- `superadmin/` - SuperAdmin-specific pages
- `coach/` - Coach-specific pages
- `player/` - Player-specific pages
- `judge/` - Judge-specific pages
- `public/` - Public-facing pages
- `shared/` - Shared utility pages
- `unified/` - Cross-role unified components

## Unified Components

Unified components adapt to different user roles based on the route path:

- `UnifiedLogin` - Login for all roles
- `UnifiedDashboard` - Dashboard for Admin and SuperAdmin
- `UnifiedRegister` - Registration for Coach and Player
- `UnifiedCompetitionSelection` - Competition/Team selection for Coach and Player

## Adding New Pages

1. Determine the appropriate folder based on user role
2. Create the page component in that folder
3. Add lazy import in App.jsx
4. Add route in App.jsx
5. Wrap in ProtectedRoute if authentication required
6. Write tests

## Design System Integration

All pages should use the centralized design system:

- Import tokens from `../../styles/tokens.js`
- Use components from `../../components/design-system/`
- Wrap with ThemeProvider for role-specific theming
```

**Step 4.4: Archive Old Code**
```bash
# Create archive branch
git checkout -b archive/pre-refactoring
git push origin archive/pre-refactoring

# Return to main branch
git checkout main
```

**Step 4.5: Final Validation**
- [ ] Run full test suite
- [ ] Manual smoke testing
- [ ] Verify documentation is complete
- [ ] Verify no deprecated code remains
- [ ] Verify all imports are correct

**Validation**:
- [ ] index.js removed
- [ ] Deprecation warnings removed
- [ ] Documentation complete and accurate
- [ ] Old code archived
- [ ] All tests passing
- [ ] No broken functionality

---

### Migration Timeline

```
Sprint 1, Week 1 (5 days):
├─ Day 1: Create folder structure and move files
├─ Day 2: Rename JudgeScoringNew, create index.js
├─ Day 3: Update App.jsx imports
├─ Day 4: Testing and validation
└─ Day 5: Bug fixes and adjustments

Sprint 1, Week 2 (5 days):
├─ Day 1-2: Create UnifiedRegister component
├─ Day 3-4: Create UnifiedCompetitionSelection component
└─ Day 5: Update routes and write tests

Sprint 2, Week 1 (5 days):
├─ Day 1-2: Comprehensive functional testing
├─ Day 3: Performance and accessibility testing
├─ Day 4: Cross-browser and mobile testing
└─ Day 5: Bug fixes and issue resolution

Sprint 2, Week 2 (5 days):
├─ Day 1: Remove index.js and deprecation warnings
├─ Day 2-3: Update documentation
├─ Day 4: Final validation
└─ Day 5: Archive old code and deploy
```

### Risk Mitigation

**Risk 1: Breaking Changes**
- Mitigation: Comprehensive testing at each phase
- Mitigation: Backward compatibility through index.js (Phase 1-3)
- Mitigation: Rollback plan for each phase

**Risk 2: Performance Regression**
- Mitigation: Performance testing before and after
- Mitigation: Bundle size monitoring
- Mitigation: Lighthouse audits

**Risk 3: User Impact**
- Mitigation: Zero downtime deployment
- Mitigation: Feature flags for gradual rollout
- Mitigation: Monitoring and alerting

**Risk 4: Timeline Delays**
- Mitigation: Buffer time in each phase
- Mitigation: Prioritize critical path items
- Mitigation: Parallel work where possible

### Success Metrics

**Code Quality**:
- 30%+ reduction in page code
- 80%+ test coverage
- Zero critical bugs

**Performance**:
- Lighthouse score 90+
- Bundle size reduction 18%+
- Page load time < 2s

**User Experience**:
- Zero breaking changes
- Improved navigation (role-based folders)
- Consistent theming across roles

**Developer Experience**:
- Improved code organization
- Easier to add new pages
- Better documentation

