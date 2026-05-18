# User Services

This directory contains service layer implementations for user management operations across all user types (Players, Coaches, and Admins).

## Overview

The user services follow a hierarchical structure:
- **UserService**: Base class providing common user operations
- **PlayerService**: Player-specific operations extending UserService
- **CoachService**: Coach-specific operations extending UserService
- **AdminService**: Admin-specific operations extending UserService

## Architecture

All services follow these principles:
- **Dependency Injection**: Services receive repositories and logger through constructor
- **Error Handling**: Services throw domain-specific errors (NotFoundError, ValidationError, etc.)
- **Logging**: All operations are logged with appropriate context
- **Security**: Passwords and sensitive fields are always removed from responses
- **Business Logic**: Services encapsulate all business rules and validation

## Services

### UserService (Base Class)

Base service providing common operations for all user types.

**Constructor:**
```javascript
new UserService(repository, logger, userType)
```

**Methods:**
- `getProfile(userId)` - Get user profile without password
- `updateProfile(userId, updates)` - Update user profile with validation
- `changePassword(userId, currentPassword, newPassword)` - Change user password
- `activateAccount(userId)` - Activate user account
- `deactivateAccount(userId)` - Deactivate user account

**Example:**
```javascript
const userService = new UserService(playerRepository, logger, 'player');
const profile = await userService.getProfile('player123');
```

### PlayerService

Service for player-specific operations.

**Constructor:**
```javascript
new PlayerService(playerRepository, teamRepository, logger)
```

**Methods:**
- `getProfile(playerId)` - Get player profile with team information
- `assignToTeam(playerId, teamId)` - Assign player to a team with validation
- `removeFromTeam(playerId)` - Remove player from team
- `getPlayersByAgeGroupAndGender(ageGroup, gender)` - Get players by criteria
- `getPlayersByTeam(teamId)` - Get all players in a team
- `getActivePlayers(options)` - Get all active players

**Business Rules:**
- Players can only be assigned to one team at a time
- Player age group must match team age group
- Player gender must match team gender

**Example:**
```javascript
const playerService = new PlayerService(playerRepository, teamRepository, logger);

// Assign player to team
await playerService.assignToTeam('player123', 'team456');

// Get players by age group and gender
const players = await playerService.getPlayersByAgeGroupAndGender('Under12', 'Male');
```

### CoachService

Service for coach-specific operations.

**Constructor:**
```javascript
new CoachService(coachRepository, teamRepository, logger)
```

**Methods:**
- `getProfile(coachId)` - Get coach profile with team information
- `assignToTeam(coachId, teamId)` - Assign coach to a team
- `removeFromTeam(coachId)` - Remove coach from team
- `getTeam(coachId)` - Get coach's team with players
- `getActiveCoaches(options)` - Get all active coaches

**Business Rules:**
- Coaches can only be assigned to one team at a time
- Teams can only have one coach

**Example:**
```javascript
const coachService = new CoachService(coachRepository, teamRepository, logger);

// Assign coach to team
await coachService.assignToTeam('coach123', 'team456');

// Get coach's team with players
const team = await coachService.getTeam('coach123');
```

### AdminService

Service for admin-specific operations and user management.

**Constructor:**
```javascript
new AdminService(adminRepository, playerRepository, coachRepository, competitionRepository, logger)
```

**Methods:**
- `getProfile(adminId)` - Get admin profile with competitions
- `assignCompetition(adminId, competitionId)` - Assign competition to admin
- `removeCompetition(adminId, competitionId)` - Remove competition from admin
- `hasAccessToCompetition(adminId, competitionId)` - Check admin access to competition
- `getAllUsers(adminId, filters, page, limit)` - Get all users with pagination
- `activateUser(adminId, userId, userType)` - Activate user account
- `deactivateUser(adminId, userId, userType)` - Deactivate user account
- `getAdminsByRole(role)` - Get admins by role

**Business Rules:**
- Super admins have access to all competitions
- Regular admins only have access to assigned competitions
- Admins can manage (activate/deactivate) players and coaches

**Example:**
```javascript
const adminService = new AdminService(
  adminRepository,
  playerRepository,
  coachRepository,
  competitionRepository,
  logger
);

// Assign competition to admin
await adminService.assignCompetition('admin123', 'comp456');

// Check access
const hasAccess = await adminService.hasAccessToCompetition('admin123', 'comp456');

// Get all users
const { users, total, pages } = await adminService.getAllUsers('admin123', {}, 1, 10);

// Activate a player
await adminService.activateUser('admin123', 'player123', 'player');
```

## Error Handling

All services throw domain-specific errors:

- **NotFoundError**: When user, team, or competition is not found
- **ValidationError**: When business rules are violated
- **ConflictError**: When email is already taken
- **AuthenticationError**: When password verification fails

**Example:**
```javascript
try {
  await playerService.assignToTeam('player123', 'team456');
} catch (error) {
  if (error instanceof NotFoundError) {
    // Handle not found
  } else if (error instanceof ValidationError) {
    // Handle validation error (e.g., age group mismatch)
  }
}
```

## Testing

All services have comprehensive unit tests covering:
- Successful operations
- Error conditions
- Business rule validation
- Password removal from responses
- Logging verification

Run tests:
```bash
npm test -- src/services/user
```

## Integration with DI Container

Services should be registered in the DI container:

```javascript
// Register repositories first
container.register('playerRepository', (c) => 
  new PlayerRepository(c.resolve('logger')), 'singleton');
container.register('coachRepository', (c) => 
  new CoachRepository(c.resolve('logger')), 'singleton');
container.register('adminRepository', (c) => 
  new AdminRepository(c.resolve('logger')), 'singleton');
container.register('teamRepository', (c) => 
  new TeamRepository(c.resolve('logger')), 'singleton');
container.register('competitionRepository', (c) => 
  new CompetitionRepository(c.resolve('logger')), 'singleton');

// Register services
container.register('playerService', (c) => 
  new PlayerService(
    c.resolve('playerRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger')
  ), 'singleton');

container.register('coachService', (c) => 
  new CoachService(
    c.resolve('coachRepository'),
    c.resolve('teamRepository'),
    c.resolve('logger')
  ), 'singleton');

container.register('adminService', (c) => 
  new AdminService(
    c.resolve('adminRepository'),
    c.resolve('playerRepository'),
    c.resolve('coachRepository'),
    c.resolve('competitionRepository'),
    c.resolve('logger')
  ), 'singleton');
```

## Requirements Fulfilled

- **Requirement 1.5**: Service layer separates business logic from HTTP handling
- **Requirement 1.8**: Services validate business rules before delegating to repositories
- **Requirement 15.1**: UserService base class with common operations
- **Requirement 15.2**: PlayerService with player-specific operations
- **Requirement 15.3**: CoachService with coach-specific operations
- **Requirement 15.4**: AdminService with admin-specific operations
- **Requirement 15.5**: Comprehensive unit tests for all services
- **Requirement 15.6**: 80%+ code coverage achieved

## Next Steps

These services will be used by controllers in Phase 4 of the refactoring. Controllers will:
1. Validate request input
2. Delegate business logic to services
3. Format service responses for HTTP
4. Handle errors and return appropriate status codes
