# Requirements Document: Frontend API Migration Adaptation

## Introduction

This document specifies the requirements for adapting the Mallakhamb Web frontend to support the new API changes documented in the "Old-Config Migration Updates" section of the Server API documentation. The migration includes new admin authentication endpoints, updated judge login, public routes, Socket.IO authorization changes, enhanced score saving, and super admin player management.

## Glossary

- **Frontend**: The Web application located in `Web/` directory
- **API_Service**: The API service layer in `Web/src/services/api.js`
- **Admin_Login_Page**: The admin login page component at `Web/src/pages/admin/AdminLogin.jsx`
- **Admin_Register_Page**: A new admin registration page component (to be created)
- **Judge_Login_Page**: The judge login page component at `Web/src/pages/judge/JudgeLogin.jsx`
- **Public_API**: The public API endpoints accessible without authentication
- **Scoring_Socket**: The Socket.IO connection for real-time scoring updates
- **Score_Save_Handler**: The component or service that handles score submission
- **Super_Admin_Player_Form**: A form component for adding players directly to teams (to be created)
- **Backend_API**: The server API endpoints documented in `Server/API_DOCUMENTATION.md`
- **Token**: JWT authentication token stored in secure storage
- **Competition_Context**: The competition ID associated with a user session
- **HMAC_Signature**: Hash-based message authentication code for webhook verification
- **Razorpay_Webhook**: Payment gateway webhook handler endpoint

## Requirements

### Requirement 1: Admin Authentication Support

**User Story:** As an admin, I want to register and login with email/password, so that I can access the admin dashboard securely.

#### Acceptance Criteria

1. THE API_Service SHALL provide a `register` method under `adminAPI` that accepts name, email, and password
2. THE API_Service SHALL provide a `login` method under `adminAPI` that accepts email and password
3. WHEN an admin registers with valid credentials, THE API_Service SHALL send a POST request to `/api/admin/register`
4. WHEN an admin logs in with valid credentials, THE API_Service SHALL send a POST request to `/api/admin/login`
5. WHEN the Backend_API returns a successful registration response, THE API_Service SHALL return the token and admin profile
6. WHEN the Backend_API returns a successful login response, THE API_Service SHALL return the token and admin profile
7. THE Admin_Register_Page SHALL validate that passwords are at least 12 characters long before submission
8. WHEN the Backend_API returns an account lockout error, THE Admin_Login_Page SHALL display a message indicating the account is locked for 15 minutes
9. THE Admin_Login_Page SHALL display rate limiting errors when the Backend_API returns a 429 status code

### Requirement 2: Judge Login by Username

**User Story:** As a judge, I want to login using my username instead of email, so that I can access the scoring interface quickly.

#### Acceptance Criteria

1. THE Judge_Login_Page SHALL accept a username field instead of an email field
2. WHEN a judge submits login credentials, THE API_Service SHALL send username and password to `/api/judge/login`
3. THE Judge_Login_Page SHALL validate that the username field is not empty before submission
4. WHEN the Backend_API returns a successful judge login response, THE API_Service SHALL extract and store the competition context from the judge profile
5. WHEN the Backend_API returns a successful judge login response, THE Judge_Login_Page SHALL display the assigned competition details
6. THE API_Service SHALL include the competition ID from the judge profile in subsequent authenticated requests

### Requirement 3: Public API Endpoints

**User Story:** As a public user, I want to view competitions, teams, scores, and judges without authentication, so that I can follow competition progress.

#### Acceptance Criteria

1. THE API_Service SHALL provide a `getCompetitions` method under `judgeAPI` that sends GET requests to `/api/public/competitions`
2. THE API_Service SHALL provide a `getJudges` method under `judgeAPI` that sends GET requests to `/api/public/judges` with optional query parameters
3. THE API_Service SHALL provide a `getSubmittedTeams` method under `judgeAPI` that sends GET requests to `/api/public/submitted-teams` with optional query parameters
4. THE API_Service SHALL provide a `saveScore` method under `judgeAPI` that sends POST requests to `/api/public/save-score`
5. THE API_Service SHALL provide a `getTeams` method under `publicAPI` that sends GET requests to `/api/public/teams`
6. THE API_Service SHALL provide a `getScores` method under `publicAPI` that sends GET requests to `/api/public/scores` with optional query parameters
7. WHEN making requests to public endpoints, THE API_Service SHALL NOT require authentication tokens
8. WHEN making requests to public endpoints, THE API_Service SHALL use the `publicApi` axios instance without auth interceptors

### Requirement 4: Socket.IO Authorization Updates

**User Story:** As a system administrator, I want to restrict scoring room access to authorized users only, so that score integrity is maintained.

#### Acceptance Criteria

1. WHEN a user attempts to join a scoring room, THE Scoring_Socket SHALL verify the user role is judge, admin, or superadmin
2. WHEN a coach or player attempts to join a scoring room, THE Scoring_Socket SHALL emit an error event with message "Not authorized to join this room"
3. WHEN a non-judge user attempts to emit a score update event, THE Scoring_Socket SHALL reject the update with message "Only judges can update scores"
4. WHEN a user without proper authorization attempts to save scores, THE Scoring_Socket SHALL emit an error event with message "Unauthorized to save scores"
5. THE Scoring_Socket SHALL extract user role from the Token before authorizing room access
6. WHEN authorization fails, THE Frontend SHALL display an appropriate error message to the user

### Requirement 5: Enhanced Score Saving with Automatic Calculation

**User Story:** As an admin, I want scores to be automatically calculated when saved, so that I don't need to manually compute execution averages and final scores.

#### Acceptance Criteria

1. WHEN an admin saves scores, THE Score_Save_Handler SHALL send all required fields to `/api/admin/scores/save` including teamId, gender, ageGroup, and playerScores
2. WHEN the Backend_API returns calculated scores, THE Score_Save_Handler SHALL extract executionAverage, baseScore, baseScoreApplied, toleranceUsed, averageMarks, and finalScore for each player
3. THE Score_Save_Handler SHALL display the calculated execution averages to the admin after successful save
4. THE Score_Save_Handler SHALL display the calculated final scores to the admin after successful save
5. WHEN the Backend_API returns tolerance information, THE Score_Save_Handler SHALL indicate which scores used base score tolerance
6. THE Score_Save_Handler SHALL display the score lock status returned by the Backend_API
7. WHEN score calculation fails, THE Score_Save_Handler SHALL display the error message returned by the Backend_API

### Requirement 6: Super Admin Player Management

**User Story:** As a super admin, I want to add players directly to teams, so that I can manage team rosters efficiently.

#### Acceptance Criteria

1. THE API_Service SHALL provide an `addPlayerToTeam` method under `superAdminAPI` that sends POST requests to `/api/superadmin/players/add`
2. WHEN a super admin adds a player, THE Super_Admin_Player_Form SHALL collect firstName, lastName, email, dateOfBirth, gender, teamId, competitionId, and password
3. THE Super_Admin_Player_Form SHALL validate that all required fields are provided before submission
4. THE Super_Admin_Player_Form SHALL validate that the password is at least 12 characters long
5. THE Super_Admin_Player_Form SHALL validate that the email format is valid
6. WHEN the Backend_API returns a successful player creation response, THE Super_Admin_Player_Form SHALL display the created player details
7. WHEN the Backend_API returns an error indicating email already exists, THE Super_Admin_Player_Form SHALL display a message "Player email already exists"
8. WHEN the Backend_API returns an error indicating team not found, THE Super_Admin_Player_Form SHALL display a message "Team not found in the specified competition"

### Requirement 7: Super Admin Route Alias Support

**User Story:** As a frontend developer, I want to use the `/api/superadmin` route prefix, so that the API paths are consistent with modern naming conventions.

#### Acceptance Criteria

1. THE API_Service SHALL use `/api/superadmin` as the base path for all super admin endpoints
2. WHEN the API_Service sends requests to super admin endpoints, THE requests SHALL use the `/api/superadmin` prefix
3. THE API_Service SHALL maintain backward compatibility by supporting both `/api/superadmin` and `/api/super-admin` prefixes
4. WHEN the Backend_API responds to `/api/superadmin` requests, THE API_Service SHALL process responses identically to `/api/super-admin` responses

### Requirement 8: Razorpay Webhook Integration

**User Story:** As a system, I want to handle Razorpay payment webhooks securely, so that payment status updates are processed correctly.

#### Acceptance Criteria

1. THE Backend_API SHALL verify HMAC_Signature for all incoming Razorpay webhook requests
2. WHEN a `payment.captured` event is received, THE Backend_API SHALL update the team payment status to 'completed'
3. WHEN a `payment.failed` event is received, THE Backend_API SHALL update the team payment status to 'failed'
4. WHEN an invalid HMAC_Signature is received, THE Backend_API SHALL return a 400 status code
5. WHEN an unknown webhook event is received, THE Backend_API SHALL return a 200 status code with message "Webhook event ignored"
6. THE Backend_API SHALL use timing-safe comparison for HMAC_Signature verification
7. THE Frontend SHALL NOT directly interact with the Razorpay_Webhook endpoint (backend-only endpoint)

### Requirement 9: Error Handling and User Feedback

**User Story:** As a user, I want to see clear error messages when API requests fail, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN the Backend_API returns a 401 status code, THE Frontend SHALL redirect the user to the appropriate login page
2. WHEN the Backend_API returns a 403 status code with competition context error, THE Frontend SHALL redirect non-superadmin users to competition selection
3. WHEN the Backend_API returns a 429 status code, THE Frontend SHALL display a rate limiting message
4. WHEN the Backend_API returns a validation error, THE Frontend SHALL display the specific field errors returned
5. WHEN the Backend_API returns an account lockout error, THE Frontend SHALL display the lockout duration
6. WHEN a network error occurs, THE Frontend SHALL display a generic error message indicating connection failure
7. THE Frontend SHALL log all API errors to the browser console for debugging purposes

### Requirement 10: Token and Competition Context Management

**User Story:** As a user, I want my authentication token and competition context to be managed automatically, so that I don't need to manually select my competition for every request.

#### Acceptance Criteria

1. WHEN a user logs in successfully, THE API_Service SHALL store the Token in secure storage
2. WHEN a Token contains competition context, THE API_Service SHALL extract and include the competition ID in the `x-competition-id` header for all authenticated requests
3. WHEN a Token is expired, THE API_Service SHALL remove the Token from secure storage and redirect to login
4. WHEN a user logs out, THE API_Service SHALL remove the Token and competition context from secure storage
5. WHEN a judge logs in, THE API_Service SHALL extract the competition ID from the judge profile and store it with the Token
6. WHEN an admin or super admin changes competition context, THE API_Service SHALL update the stored competition ID
7. THE API_Service SHALL validate Token expiry before making authenticated requests

### Requirement 11: Backward Compatibility

**User Story:** As a system maintainer, I want the frontend to remain compatible with existing API endpoints, so that the migration does not break existing functionality.

#### Acceptance Criteria

1. THE API_Service SHALL maintain all existing API methods for player, coach, team, and auth endpoints
2. WHEN the Backend_API supports both old and new route prefixes, THE API_Service SHALL use the new prefixes by default
3. THE API_Service SHALL NOT remove any existing API methods during the migration
4. WHEN existing components use legacy API methods, THE Frontend SHALL continue to function without modification
5. THE API_Service SHALL maintain the existing axios interceptor logic for token management and error handling
6. THE API_Service SHALL maintain the existing cache invalidation patterns for POST, PUT, and DELETE requests

### Requirement 12: Admin Registration Page

**User Story:** As a new admin, I want to register an account through a web form, so that I can access the admin dashboard.

#### Acceptance Criteria

1. THE Admin_Register_Page SHALL provide input fields for name, email, and password
2. THE Admin_Register_Page SHALL provide a password confirmation field
3. THE Admin_Register_Page SHALL validate that password and password confirmation match before submission
4. THE Admin_Register_Page SHALL display password requirements (minimum 12 characters) to the user
5. WHEN registration is successful, THE Admin_Register_Page SHALL redirect to the admin dashboard
6. WHEN registration fails due to duplicate email, THE Admin_Register_Page SHALL display a message "Email already registered"
7. THE Admin_Register_Page SHALL provide a link to the admin login page for existing users

