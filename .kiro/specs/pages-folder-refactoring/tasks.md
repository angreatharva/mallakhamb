# Implementation Plan: Pages Folder Refactoring

## Overview

This implementation plan refactors the Web/src/pages folder to eliminate code duplication, establish role-based organization, and modernize React patterns. The refactoring consolidates 29 page files across 5 user roles (Admin, SuperAdmin, Coach, Player, Judge) into a clean, maintainable structure with unified components.

**Key Deliverables:**
- Role-based folder structure (admin/, coach/, player/, judge/, superadmin/, public/, shared/, unified/)
- File renaming (JudgeScoringNew → JudgeScoring)
- 2 new unified components (UnifiedRegister, UnifiedCompetitionSelection)
- Backward compatibility during migration
- 30%+ code reduction through consolidation
- 80%+ test coverage

**Timeline:** 2 sprints (4 weeks)

## Tasks

### Phase 1: File Renaming and Folder Organization (Sprint 1, Week 1)

- [x] 1. Set up folder structure and move files
  - [x] 1.1 Create role-based folder structure
    - Create directories: admin/, coach/, player/, judge/, superadmin/, public/, shared/
    - Verify unified/ folder exists
    - _Requirements: 2.1_

  - [x] 1.2 Move Admin pages to admin/ folder
    - Move AdminDashboard.jsx, AdminLogin.jsx, AdminTeams.jsx, AdminScores.jsx, AdminJudges.jsx, AdminScoring.jsx, AdminTransactions.jsx
    - Move adminTheme.js (will be deprecated)
    - _Requirements: 2.2_

  - [x] 1.3 Move SuperAdmin pages to superadmin/ folder
    - Move SuperAdminDashboard.jsx, SuperAdminLogin.jsx, SuperAdminManagement.jsx, SuperAdminSystemStats.jsx
    - _Requirements: 2.6_

  - [x] 1.4 Move Coach pages to coach/ folder
    - Move CoachDashboard.jsx, CoachCreateTeam.jsx, CoachSelectCompetition.jsx, CoachPayment.jsx, CoachLogin.jsx, CoachRegister.jsx
    - _Requirements: 2.3_

  - [x] 1.5 Move Player pages to player/ folder
    - Move PlayerDashboard.jsx, PlayerSelectTeam.jsx, PlayerLogin.jsx, PlayerRegister.jsx
    - _Requirements: 2.4_

  - [x] 1.6 Move Judge pages to judge/ folder and rename JudgeScoringNew
    - Move JudgeLogin.jsx to judge/
    - Rename JudgeScoringNew.jsx to judge/JudgeScoring.jsx
    - _Requirements: 1.1, 1.4, 2.5_

  - [x] 1.7 Move Public pages to public/ folder
    - Move Home.jsx, PublicScores.jsx
    - _Requirements: 2.7_

  - [x] 1.8 Move Shared pages to shared/ folder
    - Move ForgotPassword.jsx, ResetPassword.jsx, DesignTokenAuditPage.jsx
    - _Requirements: 2.8_

- [x] 2. Establish backward compatibility
  - [x] 2.1 Create root-level index.js with re-exports
    - Export all moved components from their new locations
    - Add deprecation warning for development mode
    - Include comment explaining temporary nature (2 sprints)
    - _Requirements: 2.11, 9.2, 9.3_

  - [x] 2.2 Verify all exports are correct
    - Test importing each component from index.js
    - Verify no missing exports
    - _Requirements: 9.2_

- [x] 3. Update routing configuration
  - [x] 3.1 Update App.jsx lazy imports
    - Update all import paths to use new folder structure
    - Update JudgeScoringNew references to JudgeScoring
    - Maintain consistent import grouping by role
    - _Requirements: 1.4, 1.5, 2.10, 10.1, 10.2_

  - [x] 3.2 Verify all routes still function
    - Test each route manually
    - Verify lazy loading works correctly
    - Verify protected routes still enforce authentication
    - _Requirements: 1.7, 9.4, 10.3, 10.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite
  - Verify no broken imports
  - Test all navigation flows
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Unified Component Creation (Sprint 1, Week 2)

- [x] 5. Create UnifiedRegister component
  - [x] 5.1 Implement UnifiedRegister core structure
    - Create Web/src/pages/unified/UnifiedRegister.jsx
    - Implement role detection from route path (detectRoleFromPath)
    - Wrap with ThemeProvider for role-specific theming
    - _Requirements: 4.1, 4.2, 4.3, 7.1_

  - [x] 5.2 Implement role-specific form fields
    - Define coach registration fields (name, email, phone, organization, password)
    - Define player registration fields (name, email, phone, dateOfBirth, gender, password)
    - Implement conditional field rendering based on role
    - _Requirements: 4.4, 4.5, 4.6_

  - [x] 5.3 Implement form validation and submission
    - Set up react-hook-form with validation rules
    - Implement password confirmation validation
    - Integrate with coachAPI.register and playerAPI.register
    - Handle success and error states
    - Implement post-registration navigation (coach → create-team, player → select-team)
    - _Requirements: 4.4, 4.8_

  - [x] 5.4 Integrate design system components
    - Use ThemedInput for form fields
    - Use ThemedButton for submit button
    - Use background components (HexMesh for coach, RadialBurst for player)
    - Apply role-specific ornaments
    - _Requirements: 8.2, 8.4, 8.7_

  - [x] 5.5 Implement accessibility features
    - Add ARIA labels to all form inputs
    - Ensure keyboard navigation works
    - Add focus indicators
    - Announce errors to screen readers
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [x] 5.6 Implement mobile responsive design
    - Create mobile-friendly layout
    - Ensure touch targets are 44px minimum
    - Test on various screen sizes
    - _Requirements: 17.2, 17.3, 17.8_

  - [x] 5.7 Write unit tests for UnifiedRegister
    - Test role detection for coach and player paths
    - Test form validation (required fields, email format, password strength)
    - Test API integration (mock coachAPI and playerAPI)
    - Test navigation after successful registration
    - Test error handling
    - _Requirements: 13.1, 13.5_

- [x] 6. Create UnifiedCompetitionSelection component
  - [x] 6.1 Implement UnifiedCompetitionSelection core structure
    - Create Web/src/pages/unified/UnifiedCompetitionSelection.jsx
    - Implement role detection from route path
    - Wrap with ThemeProvider for role-specific theming
    - _Requirements: 6.1, 6.2, 6.5, 7.1_

  - [x] 6.2 Implement coach competition selection view
    - Fetch available competitions from coachAPI
    - Display competitions in grid layout using GlassCard
    - Show competition details (name, location, dates, status)
    - Implement competition selection handler
    - Store selection in CompetitionContext
    - Navigate to /coach/dashboard after selection
    - _Requirements: 6.3, 6.6_

  - [x] 6.3 Implement player team selection view
    - Fetch available teams from playerAPI
    - Display teams in grid layout using GlassCard
    - Show team details (name, coach, competition, member count, gender)
    - Implement team join handler
    - Update user data with team assignment
    - Navigate to /player/dashboard after joining
    - _Requirements: 6.4, 6.6_

  - [x] 6.4 Implement loading and empty states
    - Add loading spinner while fetching data
    - Add empty state message when no competitions/teams available
    - Handle API errors gracefully
    - _Requirements: 16.7_

  - [x] 6.5 Integrate design system components
    - Use GlassCard for competition/team cards
    - Use role-specific colors for hover states
    - Use background components
    - _Requirements: 8.2, 8.4_

  - [x] 6.6 Implement accessibility features
    - Add ARIA labels to interactive elements
    - Ensure keyboard navigation works
    - Add focus indicators
    - _Requirements: 12.2, 12.3, 12.4_

  - [x] 6.7 Write unit tests for UnifiedCompetitionSelection
    - Test role detection for coach and player paths
    - Test data fetching (mock APIs)
    - Test selection/join handlers
    - Test navigation after selection
    - Test error handling
    - _Requirements: 13.1, 13.5_

- [x] 7. Create redirect wrappers for backward compatibility
  - [x] 7.1 Create redirect wrappers for registration pages
    - Create coach/CoachRegister.jsx that exports UnifiedRegister
    - Create player/PlayerRegister.jsx that exports UnifiedRegister
    - _Requirements: 4.7, 9.1_

  - [x] 7.2 Create redirect wrappers for selection pages
    - Create coach/CoachSelectCompetition.jsx that exports UnifiedCompetitionSelection
    - Create player/PlayerSelectTeam.jsx that exports UnifiedCompetitionSelection
    - _Requirements: 6.7, 9.1_

  - [x] 7.3 Update root-level index.js
    - Add exports for new unified components
    - Add exports for redirect wrappers
    - _Requirements: 9.2_

- [x] 8. Update App.jsx routes for unified components
  - [x] 8.1 Import new unified components
    - Add lazy imports for UnifiedRegister and UnifiedCompetitionSelection
    - _Requirements: 10.1, 10.2_

  - [x] 8.2 Update registration routes
    - Update /coach/register to use UnifiedRegister
    - Update /player/register to use UnifiedRegister
    - _Requirements: 10.3_

  - [x] 8.3 Update selection routes
    - Update /coach/select-competition to use UnifiedCompetitionSelection with ProtectedRoute
    - Update /player/select-team to use UnifiedCompetitionSelection with ProtectedRoute
    - _Requirements: 10.3, 10.7_

  - [x] 8.4 Verify all routes function correctly
    - Test registration flows for coach and player
    - Test selection flows for coach and player
    - Verify protected routes enforce authentication
    - _Requirements: 9.4, 10.4_

- [x] 9. Checkpoint - Ensure all tests pass
  - Run full test suite
  - Test all unified component flows
  - Verify backward compatibility
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Testing and Validation (Sprint 2, Week 1)

- [ ] 10. Comprehensive functional testing
  - [ ] 10.1 Test all authentication flows
    - Test login for all 5 roles (admin, superadmin, coach, player, judge)
    - Test registration for coach and player
    - Test logout functionality
    - Verify token persistence across page refreshes
    - _Requirements: 3.7, 9.6_

  - [ ] 10.2 Test all dashboard views
    - Test admin dashboard with competition context
    - Test superadmin dashboard with system stats
    - Test coach dashboard with team management
    - Test player dashboard with personal info
    - Test judge scoring interface
    - _Requirements: 5.8, 9.8_

  - [ ] 10.3 Test navigation flows
    - Test navigation between pages within each role
    - Test protected route guards
    - Test redirect logic after login
    - Test back button functionality
    - _Requirements: 10.5, 10.6_

  - [ ] 10.4 Test competition context integration
    - Test competition selection for admin
    - Test competition selection for coach
    - Test team selection for player
    - Verify competition persistence across navigation
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [ ] 10.5 Test real-time functionality
    - Test socket.io connections for judge scoring
    - Test real-time updates in admin dashboard
    - Test connection/disconnection handling
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [ ] 11. Performance testing
  - [ ] 11.1 Run Lighthouse audits
    - Run audit on all major pages
    - Verify performance score 90+
    - Verify accessibility score 95+
    - Document baseline vs. refactored scores
    - _Requirements: 11.8_

  - [ ] 11.2 Analyze bundle size
    - Run build and analyze with vite-bundle-visualizer
    - Verify 30%+ reduction in pages code
    - Verify no increase in total bundle size
    - Document size comparison
    - _Requirements: 11.1, 11.7_

  - [ ] 11.3 Test lazy loading
    - Verify all routes use lazy loading
    - Test Suspense fallbacks display correctly
    - Verify code splitting is working
    - _Requirements: 11.3, 11.4_

  - [ ] 11.4 Test memoization effectiveness
    - Profile components with React DevTools
    - Verify React.memo prevents unnecessary re-renders
    - Verify useMemo caches expensive calculations
    - _Requirements: 11.6_

- [ ] 12. Accessibility testing
  - [ ] 12.1 Test keyboard navigation
    - Verify Tab key navigates through all interactive elements
    - Verify Enter/Space activates buttons
    - Verify Escape closes modals
    - Test on all major pages
    - _Requirements: 12.3_

  - [ ] 12.2 Test screen reader compatibility
    - Test with NVDA or JAWS
    - Verify all images have alt text
    - Verify all buttons have labels
    - Verify form errors are announced
    - _Requirements: 12.5_

  - [ ] 12.3 Test color contrast
    - Verify all text meets WCAG AA (4.5:1 for normal, 3:1 for large)
    - Verify focus indicators meet 3:1 contrast
    - Test with color contrast analyzer
    - _Requirements: 8.8, 12.6_

  - [ ] 12.4 Test touch targets
    - Verify all interactive elements are 44px minimum
    - Test on mobile devices
    - _Requirements: 12.1, 17.8_

  - [ ] 12.5 Test reduced motion support
    - Enable prefers-reduced-motion in browser
    - Verify animations are disabled or reduced
    - Test useReducedMotion hook
    - _Requirements: 12.7_

- [ ] 13. Cross-browser and mobile testing
  - [ ] 13.1 Test on desktop browsers
    - Test on Chrome (latest)
    - Test on Firefox (latest)
    - Test on Safari (latest)
    - Test on Edge (latest)
    - _Requirements: 17.6_

  - [ ] 13.2 Test on mobile browsers
    - Test on Mobile Safari (iOS)
    - Test on Chrome Mobile (Android)
    - Test on various screen sizes
    - _Requirements: 17.6_

  - [ ] 13.3 Test responsive design
    - Test mobile layout (< 768px)
    - Test tablet layout (768px - 1024px)
    - Test desktop layout (> 1024px)
    - Test landscape and portrait orientations
    - _Requirements: 17.1, 17.3, 17.4, 17.5_

- [ ] 14. Integration testing
  - [ ] 14.1 Write integration tests for authentication flows
    - Test complete login flow from login page to dashboard
    - Test registration flow from register page to dashboard
    - Test logout flow
    - _Requirements: 13.2_

  - [ ] 14.2 Write integration tests for role-based rendering
    - Test UnifiedLogin renders correctly for all roles
    - Test UnifiedDashboard renders correctly for admin and superadmin
    - Test UnifiedRegister renders correctly for coach and player
    - Test UnifiedCompetitionSelection renders correctly for coach and player
    - _Requirements: 13.3_

  - [ ] 14.3 Write visual regression tests
    - Create snapshots for all unified components with different roles
    - Test theme variations
    - Test mobile vs desktop layouts
    - _Requirements: 13.4_

  - [ ] 14.4 Write backward compatibility tests
    - Test redirect wrappers forward to unified components
    - Test index.js re-exports work correctly
    - Test deprecation warnings appear in development
    - _Requirements: 13.8_

- [ ] 15. Checkpoint - Ensure all tests pass
  - Run full test suite including new integration tests
  - Verify 80%+ code coverage
  - Document any issues found
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Cleanup and Documentation (Sprint 2, Week 2)

- [ ] 16. Remove backward compatibility code
  - [ ] 16.1 Remove root-level index.js
    - Delete Web/src/pages/index.js
    - Verify no imports reference this file
    - _Requirements: 20.2_

  - [ ] 16.2 Remove deprecation warnings
    - Remove console.warn statements from redirect wrappers
    - Remove deprecation comments
    - _Requirements: 20.3_

  - [ ] 16.3 Clean up redirect wrappers (optional)
    - Evaluate if redirect wrappers are still needed
    - Remove if all consumers have migrated
    - _Requirements: 20.1_

  - [ ] 16.4 Remove unused imports and dependencies
    - Run linter to find unused imports
    - Remove unused dependencies from package.json
    - _Requirements: 20.4_

  - [ ] 16.5 Remove deprecated adminTheme.js
    - Delete admin/adminTheme.js
    - Verify no components reference this file
    - _Requirements: 8.3_

- [ ] 17. Update documentation
  - [ ] 17.1 Create README.md for pages folder
    - Document new folder structure
    - Document unified components and their usage
    - Document how to add new pages
    - Document design system integration
    - _Requirements: 14.1, 14.3_

  - [ ] 17.2 Create MIGRATION.md guide
    - Document migration process
    - Provide import path update examples
    - Document backward compatibility strategy
    - Provide checklist for future migrations
    - _Requirements: 14.2, 14.5, 14.6_

  - [ ] 17.3 Update ARCHITECTURE.md
    - Document role-based architecture
    - Document unified component patterns
    - Document routing configuration
    - Document performance optimizations
    - _Requirements: 14.3_

  - [ ] 17.4 Document unified components
    - Add JSDoc comments to all unified components
    - Document props and usage examples
    - Document role detection logic
    - _Requirements: 14.8, 15.7_

  - [ ] 17.5 Update design system integration docs
    - Document token usage patterns
    - Document component import patterns
    - Document theme provider usage
    - _Requirements: 14.7_

- [ ] 18. Code quality validation
  - [ ] 18.1 Run ESLint and fix issues
    - Run ESLint on all refactored files
    - Fix any linting errors
    - Verify custom design system rules pass
    - _Requirements: 15.1_

  - [ ] 18.2 Verify consistent code style
    - Check import ordering (React, third-party, local, utilities, styles)
    - Check consistent error handling patterns
    - Check consistent loading state patterns
    - Check consistent prop naming
    - _Requirements: 15.2, 15.3, 15.4, 15.6_

  - [ ] 18.3 Verify API service layer usage
    - Ensure all API calls use centralized service layer
    - Verify consistent error handling
    - _Requirements: 15.5_

  - [ ] 18.4 Add JSDoc comments
    - Add JSDoc comments to all components
    - Document props, return values, and usage
    - _Requirements: 15.7_

- [ ] 19. Final validation
  - [ ] 19.1 Run full test suite
    - Run all unit tests
    - Run all integration tests
    - Verify 80%+ code coverage
    - _Requirements: 13.6_

  - [ ] 19.2 Manual smoke testing
    - Test all authentication flows
    - Test all dashboard views
    - Test all navigation flows
    - Test on multiple browsers and devices
    - _Requirements: 9.8_

  - [ ] 19.3 Verify performance targets
    - Verify Lighthouse scores meet targets
    - Verify bundle size reduction achieved
    - Verify page load times < 2s
    - _Requirements: 11.1, 11.7, 11.8_

  - [ ] 19.4 Verify accessibility compliance
    - Verify WCAG AA compliance
    - Verify keyboard navigation works
    - Verify screen reader compatibility
    - _Requirements: 12.6, 12.7, 12.8_

  - [ ] 19.5 Verify no regressions
    - Compare functionality before and after refactoring
    - Verify all existing features still work
    - Verify no breaking changes
    - _Requirements: 9.7, 9.8_

- [ ] 20. Archive and deploy
  - [ ] 20.1 Create archive branch
    - Create archive/pre-refactoring branch
    - Push to remote repository
    - _Requirements: 20.6_

  - [ ] 20.2 Update changelog
    - Document all changes made
    - Document breaking changes (if any)
    - Document migration steps
    - _Requirements: 14.2_

  - [ ] 20.3 Final checkpoint
    - Verify all documentation is complete
    - Verify all tests pass
    - Verify no deprecated code remains
    - Get approval for deployment
    - _Requirements: 20.7_

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at the end of each phase
- The refactoring maintains backward compatibility through Phase 3, with cleanup in Phase 4
- All unified components use role detection from route paths for consistent behavior
- Design system integration is a key focus throughout all phases
- Testing is comprehensive with unit, integration, visual regression, and accessibility tests
- Performance targets: 30% code reduction, 80%+ test coverage, Lighthouse 90+, bundle size reduction 18%+

## Success Metrics

**Code Quality:**
- 30%+ reduction in page code through consolidation
- 80%+ test coverage for all refactored components
- Zero critical bugs in production

**Performance:**
- Lighthouse performance score 90+
- Bundle size reduction 18%+
- Page load time < 2 seconds

**User Experience:**
- Zero breaking changes during migration
- Improved navigation with role-based folders
- Consistent theming across all roles

**Developer Experience:**
- Improved code organization and maintainability
- Easier to add new pages with clear patterns
- Comprehensive documentation for future development
