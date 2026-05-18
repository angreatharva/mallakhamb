# Authentication Services

This directory contains all authentication and authorization services for the Mallakhamb Competition Management System.

## Services

### 1. TokenService (`token.service.js`)

Handles JWT token operations.

**Methods:**
- `generateToken(userId, userType, competitionId?)` - Generate JWT token
- `verifyToken(token)` - Verify and decode JWT token
- `refreshToken(token)` - Refresh an existing token
- `decodeToken(token)` - Decode token without verification (for debugging)

**Requirements:** 1.5, 1.8

**Usage:**
```javascript
const tokenService = container.resolve('tokenService');

// Generate token
const token = tokenService.generateToken('user123', 'player');

// Verify token
const decoded = tokenService.verifyToken(token);
// { userId: 'user123', userType: 'player', iat: ..., exp: ... }

// Refresh token
const newToken = tokenService.refreshToken(token);
```

### 2. OTPService (`otp.service.js`)

Handles OTP generation, validation, and email sending.

**Methods:**
- `generateOTPCode()` - Generate random OTP code
- `generateAndSendOTP(user, userType)` - Generate and send OTP to user
- `verifyOTP(user, otp, userType)` - Verify OTP code
- `clearOTP(userId, userType)` - Clear OTP from user document

**Requirements:** 1.5, 1.8

**Usage:**
```javascript
const otpService = container.resolve('otpService');

// Generate and send OTP
await otpService.generateAndSendOTP(user, 'player');

// Verify OTP
const isValid = await otpService.verifyOTP(user, '123456', 'player');

// Clear OTP
await otpService.clearOTP('user123', 'player');
```

### 3. AuthenticationService (`authentication.service.js`)

Handles user authentication operations including login, registration, and password reset.

**Methods:**
- `login(email, password, userType)` - Authenticate user
- `register(userData, userType)` - Register new user
- `forgotPassword(email)` - Initiate password reset
- `verifyOTP(email, otp)` - Verify OTP for password reset
- `resetPasswordWithOTP(email, otp, newPassword)` - Reset password with OTP
- `setCompetitionContext(userId, userType, competitionId)` - Set competition context
- `findUserByType(email, userType)` - Find user by email and type
- `findUserAcrossTypes(email)` - Find user across all types

**Requirements:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8

**Usage:**
```javascript
const authService = container.resolve('authenticationService');

// Login
const { user, token } = await authService.login(
  'player@example.com',
  'password123',
  'player'
);

// Register
const { user, token } = await authService.register(
  {
    email: 'newplayer@example.com',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '2000-01-01',
    gender: 'Male'
  },
  'player'
);

// Forgot password
await authService.forgotPassword('player@example.com');

// Verify OTP
const isValid = await authService.verifyOTP('player@example.com', '123456');

// Reset password
await authService.resetPasswordWithOTP(
  'player@example.com',
  '123456',
  'newpassword123'
);

// Set competition context
const { token, competition } = await authService.setCompetitionContext(
  'user123',
  'admin',
  'comp123'
);
```

### 4. AuthorizationService (`authorization.service.js`)

Handles authorization checks including role-based access control and resource ownership.

**Methods:**
- `checkRole(userId, userType, requiredRoles)` - Check if user has required role
- `checkMinimumRole(userId, userType, minimumRole)` - Check minimum role level
- `checkCompetitionAccess(userId, userType, competitionId)` - Check competition access
- `checkResourceOwnership(userId, resourceOwnerId)` - Check resource ownership
- `checkResourceAccess(userId, userType, resourceOwnerId, allowedRoles)` - Check resource access

**Requirements:** 1.2, 1.8

**Usage:**
```javascript
const authzService = container.resolve('authorizationService');

// Check role
await authzService.checkRole('user123', 'admin', 'admin');
await authzService.checkRole('user123', 'admin', ['admin', 'super_admin']);

// Check minimum role
await authzService.checkMinimumRole('user123', 'admin', 'coach');

// Check competition access
await authzService.checkCompetitionAccess('user123', 'admin', 'comp123');

// Check resource ownership
await authzService.checkResourceOwnership('user123', 'user123');

// Check resource access (owner or privileged role)
await authzService.checkResourceAccess(
  'user123',
  'admin',
  'resource-owner-id',
  ['admin', 'super_admin']
);
```

## Role Hierarchy

The authorization service uses the following role hierarchy (higher number = more permissions):

1. `player` - Level 1
2. `coach` - Level 2
3. `judge` - Level 3
4. `admin` - Level 4
5. `super_admin` - Level 5

## Error Handling

All services throw domain-specific errors:

- `AuthenticationError` - Invalid credentials, expired tokens
- `AuthorizationError` - Insufficient permissions
- `ValidationError` - Invalid OTP, validation failures
- `ConflictError` - Duplicate email during registration
- `NotFoundError` - Resource not found

## Testing

All services have comprehensive unit tests:

- `token.service.test.js` - 71 tests
- `otp.service.test.js` - 71 tests
- `authentication.service.test.js` - 71 tests
- `authorization.service.test.js` - 71 tests

Run tests:
```bash
npm test -- src/services/auth
```

## Dependencies

- **ConfigManager** - Configuration management
- **Logger** - Structured logging
- **Repositories** - Data access (Player, Coach, Admin, Judge, Competition)
- **jsonwebtoken** - JWT token operations
- **bcryptjs** - Password hashing (used by models)

## Integration with DI Container

Register services in the DI container:

```javascript
const container = require('./infrastructure/di-container');
const configManager = require('./config/config-manager');
const Logger = require('./infrastructure/logger');
const { 
  TokenService, 
  OTPService, 
  AuthenticationService, 
  AuthorizationService 
} = require('./services/auth');

// Register dependencies
container.register('configManager', () => configManager, 'singleton');
container.register('logger', (c) => new Logger(c.resolve('configManager')), 'singleton');

// Register repositories (already registered)
// ...

// Register auth services
container.register('tokenService', (c) => 
  new TokenService(
    c.resolve('configManager'),
    c.resolve('logger')
  ), 'singleton');

container.register('otpService', (c) => 
  new OTPService(
    c.resolve('configManager'),
    c.resolve('logger'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository')
  ), 'singleton');

container.register('authenticationService', (c) => 
  new AuthenticationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('tokenService'),
    c.resolve('otpService'),
    c.resolve('logger')
  ), 'singleton');

container.register('authorizationService', (c) => 
  new AuthorizationService(
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('adminRepository'),
    c.resolve('judgeRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
```

## Security Considerations

1. **Password Hashing** - Passwords are hashed by model pre-save hooks using bcrypt with 12 rounds
2. **OTP Expiration** - OTPs expire after configured time (default: 10 minutes)
3. **Token Expiration** - JWT tokens expire after configured time (default: 24 hours)
4. **Email Normalization** - All emails are normalized to lowercase
5. **Sensitive Data Logging** - Logger automatically redacts passwords, tokens, and OTPs
6. **Security Best Practice** - Password reset doesn't reveal if email exists

## Future Enhancements

1. **Email Service Integration** - Currently OTP sending is stubbed, needs email service
2. **Rate Limiting** - Add rate limiting for login attempts and OTP generation
3. **Account Lockout** - Implement account lockout after failed login attempts
4. **Token Blacklist** - Implement token invalidation/blacklist for logout
5. **Multi-Factor Authentication** - Add support for additional authentication factors
6. **Audit Logging** - Enhanced audit logging for security events
