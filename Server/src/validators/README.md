# Request Validators

This directory contains validation schemas using `express-validator` for all API endpoints in the Mallakhamb Competition Management System.

## Overview

The validators provide:
- **Input validation**: Validate request body, query parameters, and URL parameters
- **Data sanitization**: Trim whitespace, escape HTML, normalize emails
- **Type checking**: Ensure correct data types (string, number, boolean, array)
- **Business rule validation**: Enforce domain-specific rules (age ranges, date ranges, enum values)
- **Security**: Prevent injection attacks through sanitization

## Validator Files

### common.validator.js
Reusable validation rules used across multiple validators:
- `objectId()` - Validate MongoDB ObjectId format
- `email()` - Validate and normalize email addresses
- `password()` - Validate password strength (min 8 chars, uppercase, lowercase, number)
- `pagination()` - Validate page and limit query parameters
- `dateRange()` - Validate start and end date pairs
- `date()` - Validate single date fields
- `enumValue()` - Validate enum/choice fields
- `string()` - Validate string fields with length constraints
- `number()` - Validate numeric fields with min/max constraints
- `boolean()` - Validate boolean fields
- `array()` - Validate array fields with length constraints

### auth.validator.js
Authentication and authorization endpoints:
- `login()` - Validate login credentials (email, password, userType)
- `registerPlayer()` - Validate player registration (firstName, lastName, email, dateOfBirth, password, gender)
- `registerCoach()` - Validate coach registration (name, email, password)
- `registerAdmin()` - Validate admin registration (name, email, password, role)
- `forgotPassword()` - Validate forgot password request (email)
- `verifyOTP()` - Validate OTP verification (email, 6-digit OTP)
- `resetPassword()` - Validate password reset with OTP (email, OTP, newPassword)
- `changePassword()` - Validate password change (currentPassword, newPassword, confirmPassword)

### player.validator.js
Player management endpoints:
- `createPlayer()` - Validate player creation (all required fields + optional team, ageGroup)
- `updatePlayer()` - Validate player updates (all fields optional)
- `getPlayerById()` - Validate player ID parameter
- `deletePlayer()` - Validate player ID parameter
- `assignTeam()` - Validate team assignment (playerId, teamId)

### coach.validator.js
Coach management endpoints:
- `createCoach()` - Validate coach creation (name, email, password, optional team)
- `updateCoach()` - Validate coach updates (all fields optional)
- `getCoachById()` - Validate coach ID parameter
- `deleteCoach()` - Validate coach ID parameter
- `assignTeam()` - Validate team assignment (coachId, teamId)

### competition.validator.js
Competition management endpoints:
- `createCompetition()` - Validate competition creation (name, level, competitionTypes, place, year, startDate, endDate, optional description, status, ageGroups)
- `updateCompetition()` - Validate competition updates (all fields optional)
- `getCompetitionById()` - Validate competition ID parameter
- `deleteCompetition()` - Validate competition ID parameter
- `registerTeam()` - Validate team registration (competitionId, teamId, coachId)
- `addPlayerToTeam()` - Validate adding player to competition team (competitionId, teamId, playerId, ageGroup, gender)
- `startAgeGroup()` - Validate starting an age group (competitionId, gender, ageGroup, competitionType)

### team.validator.js
Team management endpoints:
- `createTeam()` - Validate team creation (name, coachId, optional description)
- `updateTeam()` - Validate team updates (all fields optional)
- `getTeamById()` - Validate team ID parameter
- `deleteTeam()` - Validate team ID parameter
- `addPlayer()` - Validate adding player to team (teamId, playerId)
- `removePlayer()` - Validate removing player from team (teamId, playerId)
- `getTeamPlayers()` - Validate team ID parameter

### scoring.validator.js
Scoring endpoints:
- `submitScore()` - Validate score submission (competition, teamId, gender, ageGroup, competitionType, playerScores array with judge scores, deductions, etc.)
- `updateScore()` - Validate score updates (scoreId, optional fields)
- `getScoreById()` - Validate score ID parameter
- `getScoresByCompetition()` - Validate competition ID parameter
- `getScoresByTeam()` - Validate team ID parameter
- `deleteScore()` - Validate score ID parameter
- `lockScore()` - Validate score lock/unlock (scoreId, isLocked boolean)

## Usage

### In Route Definitions

```javascript
const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const authValidator = require('../validators/auth.validator');

// Apply validators as middleware
router.post('/login', 
  authValidator.login(),
  (req, res, next) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Proceed with controller logic
    next();
  },
  authController.login
);
```

### With Validation Middleware

Create a reusable validation middleware:

```javascript
// middleware/validation.middleware.js
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details: errors.array()
    });
  }
  next();
};

module.exports = validate;
```

Then use it in routes:

```javascript
const validate = require('../middleware/validation.middleware');
const playerValidator = require('../validators/player.validator');

router.post('/players', 
  playerValidator.createPlayer(),
  validate,
  playerController.createPlayer
);
```

## Validation Rules

### Email Validation
- Must be valid email format
- Automatically normalized (lowercased)
- Whitespace trimmed

### Password Validation
- Minimum 8 characters
- Must contain at least one uppercase letter
- Must contain at least one lowercase letter
- Must contain at least one number

### ObjectId Validation
- Must be valid MongoDB ObjectId format (24 hex characters)
- Whitespace trimmed

### Date Validation
- Must be ISO 8601 format (YYYY-MM-DD or full ISO string)
- Automatically converted to Date object
- Date ranges validated (end date must be after start date)

### Enum Validation
- Must match one of the allowed values
- Case-sensitive

### Age Group Validation
Valid age groups: `Under10`, `Under12`, `Under14`, `Under16`, `Under18`, `Above16`, `Above18`

### Gender Validation
Valid genders: `Male`, `Female`

### Competition Type Validation
Valid types: `competition_1`, `competition_2`, `competition_3`

### Competition Level Validation
Valid levels: `district`, `state`, `national`, `international`

### User Type Validation
Valid types: `player`, `coach`, `admin`, `judge`

## Error Response Format

When validation fails, the response follows this format:

```json
{
  "error": "ValidationError",
  "message": "Request validation failed",
  "details": [
    {
      "type": "field",
      "value": "invalid-value",
      "msg": "Error message describing the issue",
      "path": "fieldName",
      "location": "body"
    }
  ]
}
```

## Testing

All validators have comprehensive unit tests in `*.test.js` files:
- Test valid inputs (should pass)
- Test invalid inputs (should fail with appropriate error messages)
- Test edge cases (empty values, boundary values, special characters)
- Test sanitization (trimming, escaping, normalization)

Run validator tests:
```bash
npm test -- src/validators
```

## Security Features

1. **Input Sanitization**: All string inputs are trimmed and escaped to prevent XSS attacks
2. **Email Normalization**: Emails are lowercased and normalized to prevent duplicate accounts
3. **Password Strength**: Enforces strong password requirements
4. **ObjectId Validation**: Prevents invalid MongoDB queries
5. **Length Limits**: Enforces maximum lengths to prevent DoS attacks
6. **Type Checking**: Ensures correct data types to prevent type coercion vulnerabilities

## Requirements Coverage

This implementation satisfies:
- **Requirement 11.1**: Validation schemas using express-validator
- **Requirement 11.2**: Validation of request body, query, and params
- **Requirement 11.3**: 400 status with detailed error messages on validation failure
- **Requirement 11.4**: Input sanitization to prevent injection attacks
- **Requirement 11.5**: Validation of data types, formats, ranges, and business rules
- **Requirement 11.6**: Reusable validation rules (common.validator.js)
- **Requirement 11.7**: Validation of nested objects and arrays
- **Requirement 11.8**: Clear and actionable error messages
- **Requirement 15.1**: Unit tests for validation rules
- **Requirement 15.6**: Tests for error messages and sanitization

## Best Practices

1. **Always validate at the route level**: Apply validators before controller logic
2. **Use common validators**: Reuse validation rules from common.validator.js
3. **Provide clear error messages**: Help users understand what went wrong
4. **Sanitize all inputs**: Use trim(), escape(), normalizeEmail(), etc.
5. **Validate business rules**: Don't just check types, validate domain logic
6. **Test thoroughly**: Write tests for both valid and invalid inputs
7. **Keep validators focused**: One validator per endpoint or logical group
8. **Document custom validation**: Add comments for complex validation logic

## Future Enhancements

- Add custom error messages for specific use cases
- Implement conditional validation based on user roles
- Add rate limiting validation for sensitive endpoints
- Implement request size validation
- Add support for file upload validation
- Create validation schemas for Socket.IO events
