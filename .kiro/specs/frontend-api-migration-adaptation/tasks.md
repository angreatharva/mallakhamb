# Implementation Plan: Frontend API Migration Adaptation

## Overview

This implementation plan adapts the Mallakhamb Web frontend to support new backend API changes including admin authentication, judge login updates, public API endpoints, Socket.IO authorization, enhanced score saving with automatic calculation, and super admin player management. The implementation uses TypeScript/JavaScript with React and follows the existing project patterns.

## Tasks

- [x] 1. Update API Service Layer with new authentication endpoints
  - [x] 1.1 Add admin register and login methods to adminAPI
    - Add `register(data)` method that posts to `/api/admin/register`
    - Add `login(data)` method that posts to `/api/admin/login`
    - Ensure both methods return `{token, admin}` structure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x] 1.2 Update judge login endpoint to use username
    - Modify judge login to accept `username` instead of `email`
    - Update endpoint to POST to `/api/judge/login` with username field
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 1.3 Add public API methods for unauthenticated access
    - Add `getCompetitions()` to judgeAPI using publicApi instance
    - Add `getJudges(params)` to judgeAPI using publicApi instance
    - Add `getSubmittedTeams(params)` to judgeAPI using publicApi instance
    - Add `saveScore(data)` to judgeAPI using publicApi instance
    - Ensure publicApi instance does not include auth interceptors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_
  
  - [x] 1.4 Add super admin player management method
    - Add `addPlayerToTeam(data)` method to superAdminAPI
    - Method should POST to `/api/superadmin/players/add`
    - Accept all required fields: firstName, lastName, email, dateOfBirth, gender, teamId, competitionId, password
    - _Requirements: 6.1, 6.2_
  
  - [x] 1.5 Update super admin route prefixes to /api/superadmin
    - Update all superAdminAPI methods to use `/api/superadmin` prefix
    - Verify getDashboard, getSystemStats, and all other methods use new prefix
    - _Requirements: 7.1, 7.2_
  
  - [x] 1.6 Write unit tests for new API service methods
    - Test admin register/login methods
    - Test judge login with username
    - Test public API methods without auth
    - Test super admin addPlayerToTeam method
    - Mock axios responses and verify request payloads

- [x] 2. Create Admin Registration Component
  - [x] 2.1 Create AdminRegister.jsx component with form structure
    - Create component at `Web/src/pages/admin/AdminRegister.jsx`
    - Add form fields: name, email, password, confirmPassword
    - Use react-hook-form for form management
    - Add password visibility toggles
    - _Requirements: 12.1, 12.2_
  
  - [x] 2.2 Implement form validation for admin registration
    - Validate password minimum 12 characters
    - Validate password and confirmPassword match
    - Validate email format
    - Display password requirements to user
    - Show field-specific error messages
    - _Requirements: 1.7, 12.3, 12.4_
  
  - [x] 2.3 Implement registration submission and error handling
    - Call adminAPI.register on form submit
    - Handle successful registration with redirect to dashboard
    - Handle duplicate email error with specific message
    - Handle rate limiting errors (429 status)
    - Store token and admin profile on success
    - _Requirements: 1.8, 1.9, 12.5, 12.6_
  
  - [x] 2.4 Add navigation link to admin login page
    - Add link to AdminLogin page for existing users
    - Style component to match existing admin pages
    - _Requirements: 12.7_
  
  - [x] 2.5 Write unit tests for AdminRegister component
    - Test form validation rules
    - Test password matching logic
    - Test error message display
    - Test successful registration flow

- [x] 3. Update UnifiedLogin Component for judge username and admin lockout
  - [x] 3.1 Modify judge login to use username field
    - Replace email field with username field for judge role
    - Update validation schema to accept username
    - Convert username to lowercase before submission
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 3.2 Extract and store competition context from judge profile
    - Extract competition ID from judge.competition.id in response
    - Store competition ID in secure storage as 'judge_competition_id'
    - Store full judge profile including competition details
    - Display assigned competition details after successful login
    - _Requirements: 2.4, 2.5, 2.6_
  
  - [x] 3.3 Implement account lockout error handling for admin login
    - Detect account lockout errors from backend response
    - Display lockout message with 15-minute duration
    - Show countdown timer for lockout period
    - _Requirements: 1.8_
  
  - [x] 3.4 Implement rate limiting error handling
    - Detect 429 status code responses
    - Display rate limiting message with wait time
    - Disable form submission during rate limit period
    - _Requirements: 1.9, 9.3_
  
  - [x] 3.5 Write unit tests for UnifiedLogin updates
    - Test username field for judge role
    - Test competition context extraction
    - Test account lockout message display
    - Test rate limiting error handling

- [x] 4. Checkpoint - Verify authentication flows
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update API request interceptor for competition context
  - [x] 5.1 Add competition context header to authenticated requests
    - Extract competition ID from token using getCompetitionIdFromToken
    - Add 'x-competition-id' header to all authenticated requests
    - Ensure header is included for judge, admin, and superadmin requests
    - _Requirements: 10.2, 10.5_
  
  - [x] 5.2 Update token expiry validation in request interceptor
    - Check token expiry before making requests
    - Clear expired tokens from secure storage
    - Redirect to appropriate login page on expiry
    - _Requirements: 10.3, 10.7_
  
  - [x] 5.3 Write integration tests for request interceptor
    - Test competition context header injection
    - Test token expiry handling
    - Test redirect behavior on expired token

- [x] 6. Update Socket.IO connection and authorization handling
  - [x] 6.1 Add authorization error listeners to socket connection
    - Listen for 'connect_error' event
    - Detect authorization errors in error message
    - Display "Not authorized to access scoring room" message
    - Redirect to dashboard on authorization failure
    - _Requirements: 4.6_
  
  - [x] 6.2 Implement room join authorization error handling
    - Listen for 'error' event after joining scoring room
    - Detect "Not authorized to join this room" message
    - Display appropriate error message to user
    - Redirect to scores page on room join failure
    - _Requirements: 4.2_
  
  - [x] 6.3 Add score update authorization error handling
    - Listen for 'score_update_error' event
    - Detect "Only judges can update scores" message
    - Display error message for non-judge users
    - _Requirements: 4.3_
  
  - [x] 6.4 Add scores saved authorization error handling
    - Listen for 'scores_saved_error' event
    - Detect "Unauthorized to save scores" message
    - Display appropriate error message
    - _Requirements: 4.4_
  
  - [x] 6.5 Write integration tests for Socket.IO authorization
    - Test connection error handling
    - Test room join authorization
    - Test score update authorization
    - Test scores saved authorization

- [x] 7. Update AdminScoring component for automatic score calculation
  - [x] 7.1 Update score save handler to process calculated scores
    - Modify handleSaveScores to extract calculated fields from response
    - Extract scoreId, isLocked, and playerScores array
    - Update local state with calculated values
    - Store executionAverage, baseScore, baseScoreApplied, toleranceUsed, averageMarks, finalScore
    - _Requirements: 5.1, 5.2_
  
  - [x] 7.2 Create ScoreCalculationDisplay component
    - Create component to display score breakdown
    - Show execution average
    - Show base score when applied
    - Show tolerance information when base score used
    - Show average marks
    - Show deductions
    - Highlight final score
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [x] 7.3 Integrate calculated scores into AdminScoring UI
    - Display calculated scores after successful save
    - Show lock status indicator
    - Display toast notifications for base score tolerance usage
    - Show calculation summary for each player
    - _Requirements: 5.6_
  
  - [x] 7.4 Implement error handling for score calculation failures
    - Display error messages from backend
    - Handle calculation errors gracefully
    - Log errors for debugging
    - _Requirements: 5.7_
  
  - [x] 7.5 Write unit tests for score calculation display
    - Test ScoreCalculationDisplay component rendering
    - Test calculated score extraction
    - Test error handling
    - Test lock status display

- [x] 8. Checkpoint - Verify scoring functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create Super Admin Player Management Components
  - [x] 9.1 Create AddPlayerForm component
    - Create component at `Web/src/components/superadmin/AddPlayerForm.jsx`
    - Add form fields: firstName, lastName, email, dateOfBirth, gender, teamId, competitionId, password, confirmPassword
    - Use react-hook-form for form management
    - Add dropdowns for gender, team, and competition selection
    - _Requirements: 6.2_
  
  - [x] 9.2 Implement form validation for player addition
    - Validate all required fields are provided
    - Validate password minimum 12 characters
    - Validate password and confirmPassword match
    - Validate email format
    - Validate dateOfBirth format
    - _Requirements: 6.3, 6.4, 6.5_
  
  - [x] 9.3 Implement player addition submission and error handling
    - Call superAdminAPI.addPlayerToTeam on form submit
    - Handle successful player creation with success message
    - Handle "email already exists" error with specific message
    - Handle "team not found" error with specific message
    - Display created player details on success
    - _Requirements: 6.6, 6.7, 6.8_
  
  - [x] 9.4 Integrate AddPlayerForm into SuperAdminManagement page
    - Add AddPlayerForm to SuperAdminManagement.jsx
    - Fetch teams and competitions for dropdown options
    - Refresh team roster after successful player addition
    - _Requirements: 6.1_
  
  - [x] 9.5 Write unit tests for AddPlayerForm component
    - Test form validation rules
    - Test password matching logic
    - Test error message display
    - Test successful player addition flow

- [x] 10. Update error handling and user feedback across all components
  - [x] 10.1 Implement centralized error handler utility
    - Create handleAPIError utility function
    - Handle 400 validation errors with field-specific messages
    - Handle 401 authentication errors with redirect
    - Handle 403 authorization errors with appropriate messages
    - Handle 429 rate limiting errors with wait time
    - Handle 500 server errors with generic message
    - Handle network errors with connection message
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  
  - [x] 10.2 Create AccountLockoutMessage component
    - Create component to display lockout countdown
    - Show remaining time in MM:SS format
    - Update countdown every second
    - Display "Account unlocked" when time expires
    - _Requirements: 9.5_
  
  - [x] 10.3 Update response interceptor for competition context errors
    - Detect 403 errors with competition context message
    - Redirect non-superadmin users to competition selection
    - Avoid redirecting superadmin users on competition errors
    - _Requirements: 9.2_
  
  - [x] 10.4 Write unit tests for error handling utilities
    - Test handleAPIError for all error types
    - Test AccountLockoutMessage countdown logic
    - Test response interceptor competition context handling

- [x] 11. Update PublicScores component to use new public API
  - [x] 11.1 Update PublicScores to use publicAPI methods
    - Replace authenticated API calls with publicAPI.getScores
    - Remove authentication requirements
    - Ensure component works without login
    - _Requirements: 3.5, 3.6, 3.7_
  
  - [x] 11.2 Verify public endpoints do not require authentication
    - Test PublicScores page without login
    - Verify no auth tokens are sent
    - Verify no 401 errors occur
    - _Requirements: 3.7, 3.8_
  
  - [x] 11.3 Write integration tests for public scores
    - Test PublicScores component without authentication
    - Test score filtering and display
    - Test error handling for public endpoints

- [x] 12. Final integration and testing
  - [x] 12.1 Verify all authentication flows work end-to-end
    - Test admin registration → login → dashboard
    - Test judge login with username → scoring page
    - Test token storage and retrieval
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  
  - [x] 12.2 Verify Socket.IO authorization works correctly
    - Test authorized users can join scoring rooms
    - Test unauthorized users are rejected
    - Test error messages display correctly
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  
  - [x] 12.3 Verify score calculation display works correctly
    - Test calculated scores display after save
    - Test tolerance information displays
    - Test lock status displays
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [x] 12.4 Verify super admin player management works correctly
    - Test player addition with all fields
    - Test validation errors display
    - Test success message and roster refresh
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_
  
  - [x] 12.5 Verify backward compatibility
    - Test existing player, coach, team, auth endpoints still work
    - Test existing components function without modification
    - Test cache invalidation patterns work
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  
  - [x] 12.6 Run full test suite
    - Run all unit tests
    - Run all integration tests
    - Verify test coverage meets requirements
    - Fix any failing tests

- [x] 13. Final checkpoint - Complete verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The implementation uses TypeScript/JavaScript with React
- All API changes maintain backward compatibility
- Focus on clear error messages and user feedback
- Socket.IO authorization is critical for security
- Automatic score calculation improves admin workflow
- Public API endpoints enable unauthenticated access to competition data
