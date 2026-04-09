# Requirements Document: Pages Folder Refactoring

## Introduction

This document specifies the requirements for refactoring the Web/src/pages folder in the Mallakhamb competition management platform. The current pages folder contains 29 page files with significant duplication across multiple user roles (Admin, SuperAdmin, Coach, Player, Judge). This refactoring will establish a modern, role-based folder structure, eliminate file naming inconsistencies, consolidate duplicated code, and implement modern React patterns while maintaining all existing functionality and backward compatibility.

The refactoring builds upon the existing global design system refactoring (`.kiro/specs/global-design-system-refactoring/`) and leverages the unified components already created in `Web/src/pages/unified/` (UnifiedLogin, UnifiedDashboard).

## Glossary

- **Pages_Folder**: The Web/src/pages directory containing all page-level React components
- **Role**: A user type in the system (Admin, SuperAdmin, Coach, Player, Judge, or Public)
- **Unified_Component**: A single component that adapts its behavior and styling based on the current user role
- **Route_Path**: The URL path defined in Web/src/App.jsx that maps to a page component
- **Protected_Route**: A route that requires authentication and role verification
- **Backward_Compatibility**: The ability for existing routes and imports to continue functioning during migration
- **File_Naming_Convention**: The standardized naming pattern for page files (PascalCase without unnecessary suffixes)
- **Folder_Organization**: The hierarchical structure grouping pages by role or feature
- **Code_Consolidation**: The process of merging similar pages into unified components
- **Migration_Strategy**: The phased approach to refactoring with minimal disruption
- **Redirect_Wrapper**: A temporary component that forwards to the new unified component for backward compatibility
- **Modern_React_Pattern**: Contemporary React development practices including hooks, composition, and separation of concerns

## Requirements

### Requirement 1: Standardize File Naming Conventions

**User Story:** As a developer, I want consistent file naming across all pages, so that I can quickly locate and understand the purpose of each file.

#### Acceptance Criteria

1. THE Pages_Folder SHALL rename JudgeScoringNew.jsx to JudgeScoring.jsx
2. THE Pages_Folder SHALL use PascalCase for all page component files
3. THE Pages_Folder SHALL remove unnecessary suffixes like "New", "Old", or version numbers from filenames
4. WHEN a file is renamed, THE Pages_Folder SHALL update all import statements in Web/src/App.jsx
5. WHEN a file is renamed, THE Pages_Folder SHALL update all lazy loading references
6. THE Pages_Folder SHALL maintain a naming pattern of {Role}{Feature}.jsx (e.g., CoachDashboard.jsx, AdminTeams.jsx)
7. FOR ALL renamed files, THE Pages_Folder SHALL ensure existing routes continue to function without breaking

### Requirement 2: Organize Pages by Role-Based Folder Structure

**User Story:** As a developer, I want pages organized by role, so that I can navigate the codebase more efficiently and understand the application structure.

#### Acceptance Criteria

1. THE Pages_Folder SHALL create subdirectories: admin/, coach/, player/, judge/, superadmin/, public/, and shared/
2. THE Pages_Folder SHALL move AdminDashboard.jsx, AdminTeams.jsx, AdminScoring.jsx, AdminJudges.jsx, AdminTransactions.jsx, and adminTheme.js to admin/
3. THE Pages_Folder SHALL move CoachDashboard.jsx, CoachCreateTeam.jsx, CoachSelectCompetition.jsx, CoachPayment.jsx to coach/
4. THE Pages_Folder SHALL move PlayerDashboard.jsx, PlayerSelectTeam.jsx to player/
5. THE Pages_Folder SHALL move JudgeScoring.jsx (renamed from JudgeScoringNew.jsx) to judge/
6. THE Pages_Folder SHALL move SuperAdminDashboard.jsx, SuperAdminManagement.jsx, SuperAdminSystemStats.jsx to superadmin/
7. THE Pages_Folder SHALL move Home.jsx, PublicScores.jsx to public/
8. THE Pages_Folder SHALL move ForgotPassword.jsx, ResetPassword.jsx, DesignTokenAuditPage.jsx to shared/
9. THE Pages_Folder SHALL keep unified/ folder at the root level for cross-role components
10. WHEN files are moved, THE Pages_Folder SHALL update all import paths in Web/src/App.jsx
11. FOR ALL moved files, THE Pages_Folder SHALL maintain backward compatibility through index.js re-exports at the root level

### Requirement 3: Consolidate Login Pages into Unified Component

**User Story:** As a developer, I want a single login component for all roles, so that I can eliminate 85% code duplication across 5 login pages.

#### Acceptance Criteria

1. THE Pages_Folder SHALL verify that AdminLogin.jsx, CoachLogin.jsx, PlayerLogin.jsx, SuperAdminLogin.jsx, and JudgeLogin.jsx all redirect to unified/UnifiedLogin.jsx
2. THE Pages_Folder SHALL move login redirect wrappers to their respective role folders (admin/AdminLogin.jsx, coach/CoachLogin.jsx, etc.)
3. THE Pages_Folder SHALL ensure UnifiedLogin.jsx detects the user role from the route path
4. THE Pages_Folder SHALL ensure UnifiedLogin.jsx applies role-specific theming from the design system
5. WHEN a user accesses /admin/login, THE UnifiedLogin SHALL display admin-themed login interface
6. WHEN a user accesses /coach/login, THE UnifiedLogin SHALL display coach-themed login interface
7. THE Pages_Folder SHALL maintain all existing authentication flows without regression
8. FOR ALL login pages, THE Pages_Folder SHALL preserve existing validation and error handling behavior

### Requirement 4: Consolidate Register Pages into Unified Component

**User Story:** As a developer, I want a single registration component for applicable roles, so that I can eliminate code duplication between CoachRegister.jsx and PlayerRegister.jsx.

#### Acceptance Criteria

1. THE Pages_Folder SHALL create unified/UnifiedRegister.jsx that replaces CoachRegister.jsx and PlayerRegister.jsx
2. THE UnifiedRegister SHALL detect the user role from the route path (/coach/register or /player/register)
3. THE UnifiedRegister SHALL apply role-specific theming (green for Coach, saffron for Player)
4. THE UnifiedRegister SHALL maintain all existing form fields and validation rules
5. WHEN a user registers as a coach, THE UnifiedRegister SHALL include coach-specific fields
6. WHEN a user registers as a player, THE UnifiedRegister SHALL include player-specific fields
7. THE Pages_Folder SHALL create redirect wrappers (coach/CoachRegister.jsx, player/PlayerRegister.jsx) for backward compatibility
8. FOR ALL registration flows, THE UnifiedRegister SHALL preserve existing API integration and error handling

### Requirement 5: Consolidate Dashboard Pages into Unified Component

**User Story:** As a developer, I want unified dashboard components, so that I can eliminate 70% code duplication between Admin and SuperAdmin dashboards.

#### Acceptance Criteria

1. THE Pages_Folder SHALL verify that AdminDashboard.jsx and SuperAdminDashboard.jsx redirect to unified/UnifiedDashboard.jsx
2. THE Pages_Folder SHALL move dashboard redirect wrappers to admin/AdminDashboard.jsx and superadmin/SuperAdminDashboard.jsx
3. WHEN UnifiedDashboard renders for SuperAdmin, THE UnifiedDashboard SHALL display system-wide statistics
4. WHEN UnifiedDashboard renders for Admin, THE UnifiedDashboard SHALL display competition-specific statistics
5. THE UnifiedDashboard SHALL integrate existing shared components (AdminTeams, AdminScores, AdminJudges, AdminTransactions)
6. THE UnifiedDashboard SHALL maintain all existing real-time update functionality via socket.io
7. THE Pages_Folder SHALL keep CoachDashboard.jsx and PlayerDashboard.jsx as separate components due to unique functionality
8. FOR ALL dashboard views, THE UnifiedDashboard SHALL ensure mobile-responsive layouts

### Requirement 6: Create Unified Competition Selection Component

**User Story:** As a developer, I want a single competition selection component, so that I can eliminate duplication between CoachSelectCompetition.jsx and PlayerSelectTeam.jsx.

#### Acceptance Criteria

1. THE Pages_Folder SHALL create unified/UnifiedCompetitionSelection.jsx
2. THE UnifiedCompetitionSelection SHALL detect the user role from the route path
3. WHEN a coach accesses the component, THE UnifiedCompetitionSelection SHALL display competition selection interface
4. WHEN a player accesses the component, THE UnifiedCompetitionSelection SHALL display team selection interface
5. THE UnifiedCompetitionSelection SHALL apply role-specific theming (green for Coach, saffron for Player)
6. THE UnifiedCompetitionSelection SHALL maintain all existing API integration for fetching competitions and teams
7. THE Pages_Folder SHALL create redirect wrappers for backward compatibility
8. FOR ALL selection flows, THE UnifiedCompetitionSelection SHALL preserve existing navigation logic

### Requirement 7: Implement Modern React Patterns

**User Story:** As a developer, I want pages to use modern React patterns, so that the codebase is maintainable and follows current best practices.

#### Acceptance Criteria

1. THE Pages_Folder SHALL use custom hooks for shared logic (useAuth, useCompetition, useTheme)
2. THE Pages_Folder SHALL implement proper component composition with smaller, focused components
3. THE Pages_Folder SHALL use React.memo for expensive component renders
4. THE Pages_Folder SHALL implement proper error boundaries for each major page section
5. WHEN a page has complex state logic, THE Pages_Folder SHALL use useReducer instead of multiple useState calls
6. THE Pages_Folder SHALL extract business logic into separate utility functions
7. THE Pages_Folder SHALL use TypeScript-compatible JSDoc comments for prop types
8. FOR ALL components, THE Pages_Folder SHALL follow the single responsibility principle

### Requirement 8: Integrate with Global Design System

**User Story:** As a developer, I want pages to use the centralized design system, so that styling is consistent and maintainable.

#### Acceptance Criteria

1. THE Pages_Folder SHALL import design tokens from Web/src/styles/tokens.js instead of local definitions
2. THE Pages_Folder SHALL use components from Web/src/components/design-system/ instead of inline implementations
3. THE Pages_Folder SHALL remove local COLORS, ADMIN_COLORS, and similar token definitions
4. THE Pages_Folder SHALL use ThemedInput, ThemedButton, GlassCard, and DarkCard components from the design system
5. WHEN a page needs role-specific styling, THE Pages_Folder SHALL use the useTheme hook
6. THE Pages_Folder SHALL use centralized animation utilities (FadeIn, useReducedMotion) from the design system
7. THE Pages_Folder SHALL use background decoration components (HexGrid, RadialBurst) from the design system
8. FOR ALL pages, THE Pages_Folder SHALL ensure WCAG AA compliant color contrast ratios

### Requirement 9: Establish Backward Compatibility Strategy

**User Story:** As a developer, I want a safe migration path, so that I can refactor incrementally without breaking existing functionality.

#### Acceptance Criteria

1. THE Pages_Folder SHALL maintain redirect wrapper files at original locations for 2 sprints
2. THE Pages_Folder SHALL create index.js files at the root level that re-export moved components
3. WHEN old import paths are used, THE Pages_Folder SHALL provide deprecation warnings in development mode
4. THE Pages_Folder SHALL ensure all existing routes in Web/src/App.jsx continue to function
5. THE Pages_Folder SHALL maintain all existing lazy loading behavior
6. THE Pages_Folder SHALL ensure all existing tests continue to pass without modification
7. IF a migration introduces a regression, THEN THE Pages_Folder SHALL provide a rollback mechanism
8. FOR ALL refactored pages, THE Pages_Folder SHALL maintain identical user-facing behavior

### Requirement 10: Update Routing Configuration

**User Story:** As a developer, I want updated routing configuration, so that all routes point to the correct refactored components.

#### Acceptance Criteria

1. THE Pages_Folder SHALL update Web/src/App.jsx to import from new folder locations
2. THE Pages_Folder SHALL update lazy loading imports to use new paths
3. THE Pages_Folder SHALL ensure all Protected_Route components reference correct paths
4. WHEN a route is accessed, THE Pages_Folder SHALL load the correct component from the new location
5. THE Pages_Folder SHALL maintain all existing route parameters and query strings
6. THE Pages_Folder SHALL ensure all redirect logic continues to function
7. THE Pages_Folder SHALL update RouteContext.Provider usage for SuperAdmin routes
8. FOR ALL routes, THE Pages_Folder SHALL ensure proper authentication and role verification

### Requirement 11: Optimize Bundle Size and Performance

**User Story:** As a developer, I want the refactored pages to have better performance, so that users experience faster load times.

#### Acceptance Criteria

1. THE Pages_Folder SHALL reduce total page code by at least 30% through consolidation
2. THE Pages_Folder SHALL implement code splitting for role-specific features
3. THE Pages_Folder SHALL use React.lazy for all page components
4. THE Pages_Folder SHALL implement Suspense boundaries with appropriate loading states
5. WHEN a user navigates between pages, THE Pages_Folder SHALL preload likely next pages
6. THE Pages_Folder SHALL minimize re-renders through proper memoization
7. THE Pages_Folder SHALL ensure bundle size does not increase compared to current implementation
8. FOR ALL performance metrics, THE Pages_Folder SHALL maintain or improve Lighthouse scores

### Requirement 12: Ensure Accessibility Compliance

**User Story:** As a user with accessibility needs, I want all pages to be fully accessible, so that I can use the platform with assistive technologies.

#### Acceptance Criteria

1. THE Pages_Folder SHALL ensure all interactive elements have minimum 44px touch targets
2. THE Pages_Folder SHALL provide ARIA labels for all icon-only buttons
3. THE Pages_Folder SHALL ensure keyboard navigation works for all interactive elements
4. THE Pages_Folder SHALL provide focus indicators with sufficient contrast (3:1 ratio)
5. WHEN an error occurs, THE Pages_Folder SHALL announce errors to screen readers using ARIA live regions
6. THE Pages_Folder SHALL ensure all text has WCAG AA compliant contrast ratios (4.5:1 for normal text, 3:1 for large text)
7. THE Pages_Folder SHALL support prefers-reduced-motion for users with motion sensitivity
8. FOR ALL forms, THE Pages_Folder SHALL associate labels with inputs using proper HTML semantics

### Requirement 13: Create Comprehensive Testing Suite

**User Story:** As a developer, I want comprehensive tests for refactored pages, so that I can confidently make changes without introducing regressions.

#### Acceptance Criteria

1. THE Pages_Folder SHALL provide unit tests for all unified components
2. THE Pages_Folder SHALL provide integration tests for authentication flows
3. THE Pages_Folder SHALL provide integration tests for role-based rendering
4. THE Pages_Folder SHALL provide visual regression tests for themed pages
5. WHEN a unified component renders with different roles, THE Pages_Folder SHALL verify correct content is displayed
6. THE Pages_Folder SHALL achieve at least 80% code coverage for new unified components
7. THE Pages_Folder SHALL ensure all existing page tests continue to pass
8. FOR ALL refactored pages, THE Pages_Folder SHALL test backward compatibility through redirect wrappers

### Requirement 14: Document Refactoring and Migration Guide

**User Story:** As a developer, I want comprehensive documentation for the refactored pages, so that I can quickly understand the new structure and migration path.

#### Acceptance Criteria

1. THE Pages_Folder SHALL provide a README.md documenting the new folder structure
2. THE Pages_Folder SHALL provide a MIGRATION.md guide for updating imports and routes
3. THE Pages_Folder SHALL document all unified components and their role detection logic
4. THE Pages_Folder SHALL provide examples of how to add new role-specific pages
5. THE Pages_Folder SHALL document the backward compatibility strategy and deprecation timeline
6. THE Pages_Folder SHALL provide a checklist for migrating from old to new structure
7. THE Pages_Folder SHALL document integration with the global design system
8. FOR ALL unified components, THE Pages_Folder SHALL provide usage examples and prop documentation

### Requirement 15: Validate Code Quality and Consistency

**User Story:** As a developer, I want consistent code quality across all pages, so that the codebase is maintainable and follows team standards.

#### Acceptance Criteria

1. THE Pages_Folder SHALL pass all ESLint rules including custom design system rules
2. THE Pages_Folder SHALL use consistent import ordering (React, third-party, local components, utilities, styles)
3. THE Pages_Folder SHALL use consistent error handling patterns across all pages
4. THE Pages_Folder SHALL use consistent loading state patterns across all pages
5. WHEN a page makes API calls, THE Pages_Folder SHALL use the centralized API service layer
6. THE Pages_Folder SHALL use consistent prop naming conventions
7. THE Pages_Folder SHALL ensure all components have proper JSDoc comments
8. FOR ALL pages, THE Pages_Folder SHALL follow the established code style guide

### Requirement 16: Handle Edge Cases and Error States

**User Story:** As a user, I want pages to handle errors gracefully, so that I understand what went wrong and how to proceed.

#### Acceptance Criteria

1. THE Pages_Folder SHALL display user-friendly error messages for all API failures
2. THE Pages_Folder SHALL provide retry mechanisms for failed operations
3. THE Pages_Folder SHALL handle network disconnections gracefully
4. WHEN authentication expires, THE Pages_Folder SHALL redirect to the appropriate login page
5. WHEN a user lacks permissions, THE Pages_Folder SHALL display an appropriate access denied message
6. THE Pages_Folder SHALL handle missing or invalid route parameters
7. THE Pages_Folder SHALL provide loading states for all asynchronous operations
8. FOR ALL error states, THE Pages_Folder SHALL log errors for debugging while showing user-friendly messages

### Requirement 17: Support Mobile and Responsive Design

**User Story:** As a user on mobile devices, I want all pages to work seamlessly on all screen sizes, so that I can access all features on my device.

#### Acceptance Criteria

1. THE Pages_Folder SHALL use the existing useResponsive hook for responsive behavior
2. THE Pages_Folder SHALL ensure all pages are mobile-friendly with appropriate touch targets
3. THE Pages_Folder SHALL use responsive grid layouts that adapt to screen size
4. WHEN the viewport is mobile, THE Pages_Folder SHALL adjust navigation and layout appropriately
5. THE Pages_Folder SHALL ensure modals and dialogs are mobile-friendly
6. THE Pages_Folder SHALL test all pages on mobile, tablet, and desktop viewports
7. THE Pages_Folder SHALL ensure horizontal scrolling is avoided on mobile devices
8. FOR ALL interactive elements, THE Pages_Folder SHALL ensure minimum 44px touch targets on mobile

### Requirement 18: Maintain Real-Time Functionality

**User Story:** As a user, I want real-time updates to continue working, so that I see live data without manual refresh.

#### Acceptance Criteria

1. THE Pages_Folder SHALL maintain all existing socket.io connections for real-time updates
2. THE Pages_Folder SHALL ensure JudgeScoring.jsx maintains live scoring updates
3. THE Pages_Folder SHALL ensure AdminDashboard maintains real-time statistics updates
4. WHEN a score is submitted, THE Pages_Folder SHALL broadcast updates to all connected clients
5. THE Pages_Folder SHALL handle socket disconnections and reconnections gracefully
6. THE Pages_Folder SHALL display connection status indicators where appropriate
7. THE Pages_Folder SHALL clean up socket connections when components unmount
8. FOR ALL real-time features, THE Pages_Folder SHALL ensure data consistency across clients

### Requirement 19: Preserve Competition Context Integration

**User Story:** As a user, I want competition context to work seamlessly across pages, so that I don't lose my selected competition when navigating.

#### Acceptance Criteria

1. THE Pages_Folder SHALL maintain integration with CompetitionProvider context
2. THE Pages_Folder SHALL ensure CompetitionDisplay component works on all relevant pages
3. THE Pages_Folder SHALL preserve competition selection across page navigation
4. WHEN a user selects a competition, THE Pages_Folder SHALL persist the selection in secure storage
5. THE Pages_Folder SHALL ensure competition context is available to all role-specific pages
6. THE Pages_Folder SHALL handle cases where no competition is selected
7. THE Pages_Folder SHALL provide competition selection prompts where appropriate
8. FOR ALL pages using competition context, THE Pages_Folder SHALL ensure proper provider wrapping

### Requirement 20: Clean Up Deprecated Code

**User Story:** As a developer, I want deprecated code removed after migration, so that the codebase remains clean and maintainable.

#### Acceptance Criteria

1. THE Pages_Folder SHALL remove redirect wrapper files after 2 sprints
2. THE Pages_Folder SHALL remove root-level index.js re-export files after 2 sprints
3. THE Pages_Folder SHALL remove deprecation warnings after migration is complete
4. THE Pages_Folder SHALL remove unused imports and dependencies
5. WHEN all consumers have migrated, THE Pages_Folder SHALL remove backward compatibility code
6. THE Pages_Folder SHALL update documentation to reflect final structure
7. THE Pages_Folder SHALL ensure no dead code remains in the pages folder
8. FOR ALL cleanup activities, THE Pages_Folder SHALL verify no functionality is broken
