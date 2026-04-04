# Implementation Plan: Global Design System Refactoring

## Overview

This implementation plan refactors the Mallakhamb competition management platform's frontend to eliminate design token duplication and establish a unified design system. The refactoring will centralize design tokens, create a reusable component library, implement a theme provider system, and consolidate duplicate pages into unified components. This will reduce the codebase by approximately 1,400 lines (40%) while maintaining all existing functionality.

## Tasks

- [x] 1. Enhance design tokens and create foundation utilities
  - [x] 1.1 Enhance Web/src/styles/tokens.js with role-specific colors
    - Add role colors for admin, superadmin, coach, player, judge, and public
    - Ensure all colors meet WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
    - Add helper functions: getStatusColor(), getRoleColor(), getStatusBg()
    - Maintain backward compatibility with existing COLORS and ADMIN_COLORS exports
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  
  - [x] 1.2 Write unit tests for token helper functions
    - Test getStatusColor() returns correct color for each status
    - Test getRoleColor() returns correct color for each role
    - Test getStatusBg() returns color with correct opacity
    - Test fallback behavior for unknown values
    - _Requirements: 12.1_

- [x] 2. Create animation utilities and components
  - [x] 2.1 Implement useReducedMotion hook
    - Create Web/src/components/design-system/animations/useReducedMotion.js
    - Check window.matchMedia('(prefers-reduced-motion: reduce)')
    - Listen for changes to user preference
    - Return boolean indicating if motion should be reduced
    - _Requirements: 2.1, 2.5_
  
  - [x] 2.2 Create FadeIn animation component
    - Create Web/src/components/design-system/animations/FadeIn.jsx
    - Support configurable delay and direction (up, down, left, right)
    - Use Intersection Observer for scroll-triggered animations
    - Respect prefers-reduced-motion setting
    - _Requirements: 2.2, 2.5, 2.7_
  
  - [x] 2.3 Create animation utilities and exports
    - Export animation easing constants (EASE_OUT, EASE_SPRING)
    - Create index.js barrel export for animations
    - _Requirements: 2.6_
  
  - [x] 2.4 Write unit tests for animation utilities
    - Test useReducedMotion detects user preference correctly
    - Test FadeIn respects reduced motion setting
    - Test FadeIn animation runs once per element (idempotence)
    - _Requirements: 2.7, 12.1_

- [x] 3. Build theme provider system
  - [x] 3.1 Create ThemeProvider component
    - Create Web/src/components/design-system/theme/ThemeProvider.jsx
    - Auto-detect role from route path using useLocation()
    - Provide theme configuration via React Context
    - Support manual role override via prop
    - Memoize theme object to prevent unnecessary re-renders
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 3.2 Create useTheme hook
    - Create Web/src/components/design-system/theme/useTheme.js
    - Access theme context and return theme values
    - Throw descriptive error if used outside ThemeProvider (development only)
    - Return default theme in production if context missing
    - _Requirements: 5.6, 5.7_
  
  - [x] 3.3 Create theme utilities
    - Create Web/src/utils/theme.js with theme detection helpers
    - Implement role detection from route path
    - Create barrel export index.js for theme module
    - _Requirements: 5.1_
  
  - [x] 3.4 Write integration tests for theme system
    - Test ThemeProvider provides correct theme to nested components
    - Test theme changes propagate to all themed components
    - Test role detection from route path
    - Test useTheme hook throws error when used outside provider
    - _Requirements: 12.3_

- [x] 4. Checkpoint - Verify foundation is working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Build form components
  - [ ] 5.1 Create ThemedInput component
    - Create Web/src/components/design-system/forms/ThemedInput.jsx
    - Support icon placement (left side)
    - Support rightElement slot for password toggle, etc.
    - Implement error state styling with accessible color contrast
    - Apply role-specific focus styling with 3:1 contrast ratio
    - Ensure minimum 44px touch target height
    - Support disabled and readonly states
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.8, 3.9_
  
  - [ ] 5.2 Create ThemedSelect component
    - Create Web/src/components/design-system/forms/ThemedSelect.jsx
    - Apply consistent theming with ThemedInput
    - Support disabled and readonly states
    - Ensure minimum 44px touch target height
    - _Requirements: 3.2, 3.8, 3.9_
  
  - [ ] 5.3 Create ThemedTextarea component
    - Create Web/src/components/design-system/forms/ThemedTextarea.jsx
    - Apply consistent theming with ThemedInput
    - Support disabled and readonly states
    - _Requirements: 3.3, 3.9_
  
  - [ ] 5.4 Create ThemedButton component
    - Create Web/src/components/design-system/forms/ThemedButton.jsx
    - Implement variants: solid, outline, ghost
    - Support sizes: sm, md, lg
    - Support loading state with spinner
    - Support icon prop
    - Ensure minimum 44px touch target
    - _Requirements: 3.4, 3.8_
  
  - [ ] 5.5 Create forms barrel export
    - Create Web/src/components/design-system/forms/index.js
    - Export all form components
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 5.6 Write component tests for form components
    - Test ThemedInput renders with icon when provided
    - Test ThemedInput applies error styling when error prop is true
    - Test ThemedButton renders all variants correctly
    - Test all form components support disabled state
    - Test touch target sizes meet 44px minimum
    - _Requirements: 12.2, 11.1_

- [ ] 6. Build card components
  - [ ] 6.1 Create GlassCard component
    - Create Web/src/components/design-system/cards/GlassCard.jsx
    - Implement glassmorphism styling with backdrop blur
    - Apply consistent border radius and shadows
    - Support custom className and style props
    - Ensure responsive behavior on mobile devices
    - _Requirements: 4.1, 4.5, 4.6, 4.7_
  
  - [ ] 6.2 Create DarkCard component
    - Create Web/src/components/design-system/cards/DarkCard.jsx
    - Implement dark glassmorphism background
    - Add subtle border with role-specific accent on hover
    - Support optional hover animation
    - Support custom className and style props
    - _Requirements: 4.2, 4.5, 4.6, 4.7_
  
  - [ ] 6.3 Create StatCard component
    - Create Web/src/components/design-system/cards/StatCard.jsx
    - Support icon, label, value, color, delay, and subtitle props
    - Apply consistent styling with other cards
    - _Requirements: 4.3, 4.5, 4.7_
  
  - [ ] 6.4 Create TiltCard component
    - Create Web/src/components/design-system/cards/TiltCard.jsx
    - Implement 3D tilt effects using framer-motion or CSS transforms
    - Respect prefers-reduced-motion setting
    - Support custom className and style props
    - _Requirements: 4.4, 4.6, 4.7_
  
  - [ ] 6.5 Create cards barrel export
    - Create Web/src/components/design-system/cards/index.js
    - Export all card components
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ]* 6.6 Write component tests for card components
    - Test DarkCard applies hover styles when hover prop is true
    - Test TiltCard respects prefers-reduced-motion
    - Test all cards support custom className and style props
    - Test responsive behavior on mobile viewports
    - _Requirements: 12.2, 15.3_

- [ ] 7. Build background decoration components
  - [ ] 7.1 Create HexGrid component
    - Create Web/src/components/design-system/backgrounds/HexGrid.jsx
    - Implement SVG-based hexagonal pattern
    - Support configurable color and opacity
    - Render static when prefers-reduced-motion is enabled
    - Position absolutely, make non-interactive
    - _Requirements: 8.1, 8.6, 8.7, 8.8_
  
  - [ ] 7.2 Create RadialBurst component
    - Create Web/src/components/design-system/backgrounds/RadialBurst.jsx
    - Support position prop (top-left, top-right, bottom-left, bottom-right, center)
    - Support size prop (sm, md, lg)
    - Support configurable color and opacity
    - Respect prefers-reduced-motion setting
    - _Requirements: 8.2, 8.6, 8.7, 8.8_
  
  - [ ] 7.3 Create DiagonalBurst component
    - Create Web/src/components/design-system/backgrounds/DiagonalBurst.jsx
    - Implement diagonal gradient effects
    - Support configurable color and opacity
    - Respect prefers-reduced-motion setting
    - _Requirements: 8.3, 8.6, 8.7, 8.8_
  
  - [ ] 7.4 Create HexMesh component
    - Create Web/src/components/design-system/backgrounds/HexMesh.jsx
    - Implement mesh pattern for backgrounds
    - Support configurable color and opacity
    - Respect prefers-reduced-motion setting
    - _Requirements: 8.4, 8.6, 8.7, 8.8_
  
  - [ ] 7.5 Create Constellation component
    - Create Web/src/components/design-system/backgrounds/Constellation.jsx
    - Implement star field effects with connected dots
    - Support configurable color and opacity
    - Respect prefers-reduced-motion setting
    - _Requirements: 8.5, 8.6, 8.7, 8.8_
  
  - [ ] 7.6 Create backgrounds barrel export
    - Create Web/src/components/design-system/backgrounds/index.js
    - Export all background decoration components
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [ ]* 7.7 Write component tests for background decorations
    - Test all decorations respect prefers-reduced-motion
    - Test configurable color and opacity props work correctly
    - Test decorations do not interfere with content readability
    - _Requirements: 8.6, 8.8, 12.2_

- [ ] 8. Build ornament components
  - [ ] 8.1 Create ShieldOrnament component
    - Create Web/src/components/design-system/ornaments/ShieldOrnament.jsx
    - Implement shield icon with role-specific styling
    - Support configurable size and color
    - _Requirements: 6.3_
  
  - [ ] 8.2 Create CoachOrnament component
    - Create Web/src/components/design-system/ornaments/CoachOrnament.jsx
    - Implement coach-specific icon with styling
    - Support configurable size and color
    - _Requirements: 6.3_
  
  - [ ] 8.3 Create GradientText component
    - Create Web/src/components/design-system/ornaments/GradientText.jsx
    - Implement gradient text animation
    - Support configurable gradient colors
    - Respect prefers-reduced-motion setting
    - _Requirements: 2.4, 2.5_
  
  - [ ] 8.4 Create ornaments barrel export
    - Create Web/src/components/design-system/ornaments/index.js
    - Export all ornament components
    - _Requirements: 6.3_

- [ ] 9. Checkpoint - Verify component library is complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Create UnifiedLogin component
  - [ ] 10.1 Implement UnifiedLogin component structure
    - Create Web/src/pages/unified/UnifiedLogin.jsx
    - Detect user role from route path using regex
    - Integrate with ThemeProvider for role-specific theming
    - Use ThemedInput, ThemedButton from component library
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 10.2 Implement login form logic
    - Integrate form validation using react-hook-form
    - Implement rate limiting (5 attempts per 60 seconds)
    - Add error handling and toast notifications
    - Add password visibility toggle
    - Add forgot password link
    - _Requirements: 6.4, 6.6_
  
  - [ ] 10.3 Add role-specific visual elements
    - Render role-specific background decoration (HexGrid, HexMesh, etc.)
    - Render role-specific ornament icon (Shield, UserCheck, etc.)
    - Apply role-specific color scheme from theme context
    - _Requirements: 6.3_
  
  - [ ] 10.4 Implement post-login navigation
    - Handle competition selection after successful login
    - Navigate to role-specific dashboard
    - Maintain all existing authentication flows
    - _Requirements: 6.4, 6.5_
  
  - [ ] 10.5 Create redirect wrappers for old login pages
    - Update Web/src/pages/AdminLogin.jsx to redirect to UnifiedLogin
    - Update Web/src/pages/SuperAdminLogin.jsx to redirect to UnifiedLogin
    - Update Web/src/pages/CoachLogin.jsx to redirect to UnifiedLogin
    - Update Web/src/pages/PlayerLogin.jsx to redirect to UnifiedLogin
    - Update Web/src/pages/JudgeLogin.jsx to redirect to UnifiedLogin
    - Maintain backward compatibility during transition
    - _Requirements: 6.7, 9.2, 9.3_
  
  - [ ]* 10.6 Write integration tests for UnifiedLogin
    - Test role detection from route path
    - Test role-specific theming is applied correctly
    - Test all authentication flows work without regression
    - Test error handling and validation
    - _Requirements: 6.4, 6.8, 12.5_

- [ ] 11. Create UnifiedDashboard component
  - [ ] 11.1 Implement UnifiedDashboard component structure
    - Create Web/src/pages/unified/UnifiedDashboard.jsx
    - Detect role (admin vs superadmin) from route or context
    - Integrate with ThemeProvider for role-specific theming
    - Use DarkCard, StatCard from component library
    - _Requirements: 7.1, 7.5_
  
  - [ ] 11.2 Implement SuperAdmin-specific dashboard view
    - Display system overview statistics
    - Add competition filter dropdown
    - Show navigation tabs: overview, management, teams, scores, judges, transactions
    - _Requirements: 7.2, 7.4_
  
  - [ ] 11.3 Implement Admin-specific dashboard view
    - Display competition-specific statistics only
    - Show navigation tabs: dashboard, teams, scores, judges, transactions
    - _Requirements: 7.3, 7.4_
  
  - [ ] 11.4 Integrate shared dashboard components
    - Integrate AdminTeams component
    - Integrate AdminScores component
    - Integrate AdminJudges component
    - Integrate AdminTransactions component
    - Ensure tab switching updates active view without page reload
    - _Requirements: 7.5, 7.6_
  
  - [ ] 11.5 Maintain real-time updates
    - Preserve existing socket.io integration for real-time updates
    - Ensure statistics update reactively
    - _Requirements: 7.7_
  
  - [ ] 11.6 Ensure mobile responsiveness
    - Test dashboard on mobile, tablet, and desktop viewports
    - Adjust layouts for smaller screens
    - Ensure touch targets meet 44px minimum
    - _Requirements: 7.8, 15.3, 15.4_
  
  - [ ] 11.7 Create redirect wrappers for old dashboard pages
    - Update Web/src/pages/AdminDashboard.jsx to redirect to UnifiedDashboard
    - Update Web/src/pages/SuperAdminDashboard.jsx to redirect to UnifiedDashboard
    - Maintain backward compatibility during transition
    - _Requirements: 9.2, 9.3_
  
  - [ ]* 11.8 Write integration tests for UnifiedDashboard
    - Test SuperAdmin view shows system overview
    - Test Admin view shows competition-specific stats only
    - Test tab switching works correctly
    - Test real-time updates continue to function
    - Test responsive behavior on different viewports
    - _Requirements: 7.2, 7.3, 7.6, 7.7, 12.5_

- [ ] 12. Checkpoint - Verify unified pages are working
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Implement responsive design integration
  - [ ] 13.1 Integrate component library with useResponsive hook
    - Update all components to use existing useResponsive hook
    - Implement responsive prop values for spacing and sizing
    - _Requirements: 15.1, 15.5_
  
  - [ ] 13.2 Ensure mobile-friendly modals and dialogs
    - Test all modals on mobile viewports
    - Adjust sizing and positioning for mobile
    - _Requirements: 15.6_
  
  - [ ]* 13.3 Write responsive design tests
    - Test components on mobile, tablet, and desktop viewports
    - Test touch targets meet 44px minimum on mobile
    - Test font sizes scale appropriately
    - _Requirements: 15.3, 15.4, 15.7_

- [ ] 14. Implement accessibility features
  - [ ] 14.1 Add ARIA labels to icon-only buttons
    - Audit all icon-only buttons in component library
    - Add aria-label attributes
    - Add aria-hidden to decorative icons
    - _Requirements: 11.2_
  
  - [ ] 14.2 Ensure keyboard navigation
    - Test keyboard navigation for all interactive components
    - Verify focus order follows logical reading order
    - Add skip links for main content where needed
    - _Requirements: 11.3_
  
  - [ ] 14.3 Implement error announcements for screen readers
    - Add ARIA live regions for dynamic error messages
    - Ensure form validation errors are announced
    - _Requirements: 11.5_
  
  - [ ]* 14.4 Run accessibility tests
    - Run jest-axe tests on all components
    - Test with screen readers (NVDA, JAWS, VoiceOver)
    - Verify color contrast ratios meet WCAG AA standards
    - Verify focus indicators have 3:1 contrast ratio
    - Test keyboard navigation for all interactive components
    - _Requirements: 11.1, 11.3, 11.4, 11.6, 11.7, 11.8_

- [ ] 15. Optimize performance and bundle size
  - [ ] 15.1 Implement code splitting
    - Lazy load role-specific components using React.lazy()
    - Split background decorations into separate chunks
    - Lazy load non-critical components
    - _Requirements: 10.2, 10.4_
  
  - [ ] 15.2 Implement memoization
    - Use React.memo for expensive component renders
    - Memoize theme context value
    - Memoize color calculations
    - _Requirements: 10.3_
  
  - [ ] 15.3 Optimize CSS-in-JS
    - Use static tokens instead of runtime calculations
    - Extract common styles into shared objects
    - Avoid inline style objects in render
    - _Requirements: 10.5_
  
  - [ ]* 15.4 Run performance tests
    - Measure bundle size reduction (target: 1,400 lines / 40%)
    - Run Lighthouse performance tests (target: score ≥ 90)
    - Measure First Contentful Paint (target: < 1.5s)
    - Measure Time to Interactive (target: < 3.5s)
    - Verify bundle size does not increase
    - _Requirements: 10.1, 10.6, 10.7_

- [ ] 16. Create migration documentation
  - [ ] 16.1 Create migration guide
    - Create Web/src/components/design-system/MIGRATION.md
    - Document import path updates
    - Document component API changes
    - Provide code examples (before/after)
    - Document common migration patterns
    - Add troubleshooting guide
    - _Requirements: 9.4, 13.4_
  
  - [ ] 16.2 Create design system README
    - Create Web/src/components/design-system/README.md
    - Document design system philosophy
    - Document token structure and usage
    - Create component catalog with examples
    - Document theme system guide
    - Document accessibility guidelines
    - Add contributing guidelines
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.7_
  
  - [ ] 16.3 Add deprecation warnings
    - Add console warnings for deprecated COLORS export
    - Add console warnings for deprecated ADMIN_COLORS export
    - Add console warnings for deprecated EASE_OUT, EASE_SPRING exports
    - Only show warnings in development mode
    - _Requirements: 9.2_
  
  - [ ]* 16.4 Create Storybook stories
    - Set up Storybook configuration
    - Create stories for all form components
    - Create stories for all card components
    - Create stories for all background decorations
    - Create stories showing theme variations
    - _Requirements: 13.6_

- [ ] 17. Implement design token validation
  - [ ] 17.1 Create linting rules for design tokens
    - Create ESLint rule to flag hardcoded color values
    - Create ESLint rule to flag hardcoded spacing values
    - Add warnings in development mode for non-standard colors
    - _Requirements: 14.1, 14.2, 14.4_
  
  - [ ]* 17.2 Create visual audit tool
    - Create tool to display all colors used in application
    - Create color palette visualization for design review
    - Document intended use case for each token
    - _Requirements: 14.3, 14.5, 14.6, 14.7_

- [ ] 18. Final integration and testing
  - [ ] 18.1 Update imports across codebase
    - Search for old import paths and update to new paths
    - Update all pages to use new component library
    - Verify no broken imports remain
    - _Requirements: 9.1_
  
  - [ ] 18.2 Run full test suite
    - Run all unit tests
    - Run all component tests
    - Run all integration tests
    - Ensure all existing functionality tests pass
    - _Requirements: 9.5, 12.7_
  
  - [ ]* 18.3 Run visual regression tests
    - Create snapshot tests for themed components
    - Create screenshot tests for login pages (all roles)
    - Create screenshot tests for dashboard pages
    - Compare screenshots to ensure visual consistency
    - _Requirements: 12.4_
  
  - [ ] 18.4 Verify backward compatibility
    - Test that old import paths still work with warnings
    - Test that deprecated functions still work
    - Verify existing pages continue to function
    - _Requirements: 9.1, 9.2, 9.5_

- [ ] 19. Final checkpoint - Production readiness
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The refactoring maintains all existing functionality while reducing code duplication by 40%
- All components are designed with accessibility (WCAG AA) and responsive design in mind
- Migration is designed to be gradual with backward compatibility maintained for 2 sprints
