# Feature Flag System

The Feature Flag System provides a flexible way to control feature availability in the Mallakhamb Competition Management System. It supports boolean flags, percentage-based rollouts, user-specific flags, and role-specific flags.

## Features

- **Boolean Flags**: Simple on/off switches for features
- **Percentage-Based Rollout**: Gradually roll out features to a percentage of users
- **User-Specific Flags**: Enable/disable features for specific users
- **Role-Specific Flags**: Enable/disable features for specific roles
- **User/Role Exclusions**: Explicitly exclude users or roles from features
- **Dynamic Updates**: Update flags without server restart
- **Audit Logging**: All flag evaluations are logged for audit purposes
- **Consistent Hashing**: Same user always gets same result for percentage rollouts

## Configuration

Feature flags are configured in the environment configuration under `features.flags`:

```javascript
// .env or config
FEATURES_FLAGS={
  "new-dashboard": true,
  "beta-scoring": 50,
  "admin-analytics": {
    "enabled": true,
    "roles": ["admin", "superadmin"]
  },
  "experimental-feature": {
    "enabled": true,
    "type": "percentage",
    "percentage": 25,
    "users": ["vip-user-1", "vip-user-2"],
    "excludeRoles": ["judge"]
  }
}
```

### Flag Configuration Options

#### Simple Boolean Flag
```javascript
"feature-name": true  // or false
```

#### Percentage-Based Rollout
```javascript
"feature-name": 50  // Enable for 50% of users
```

#### Complex Flag Configuration
```javascript
"feature-name": {
  "enabled": true,              // Global enable/disable
  "type": "percentage",         // "boolean" or "percentage"
  "percentage": 25,             // 0-100 (for percentage type)
  "users": ["user1", "user2"],  // Specific users to enable
  "roles": ["admin", "coach"],  // Specific roles to enable
  "excludeUsers": ["user3"],    // Users to explicitly exclude
  "excludeRoles": ["judge"]     // Roles to explicitly exclude
}
```

## Usage

### In Routes (Middleware)

Use the feature flag middleware to protect entire routes:

```javascript
const { createFeatureFlagMiddleware } = require('../middleware');
const container = require('../infrastructure/di-container');

const featureFlagService = container.resolve('featureFlagService');
const requireFeatureFlag = createFeatureFlagMiddleware(featureFlagService);

// Protect a route with a feature flag
router.get(
  '/new-dashboard',
  requireFeatureFlag('new-dashboard'),
  dashboardController.getNewDashboard
);

// Multiple middleware
router.post(
  '/beta-feature',
  authMiddleware,
  requireFeatureFlag('beta-feature'),
  controller.betaAction
);
```

### In Controllers (Programmatic)

Use the attached helper method to check flags in controller logic:

```javascript
// First, attach the feature flag checker middleware to your app
const { attachFeatureFlagChecker } = require('../middleware');
app.use(attachFeatureFlagChecker(featureFlagService));

// Then in your controller
async function getCompetitions(req, res) {
  const competitions = await competitionService.getAll();
  
  // Check feature flag programmatically
  if (req.isFeatureEnabled('enhanced-filtering')) {
    // Apply enhanced filtering
    competitions = applyEnhancedFilters(competitions, req.query);
  }
  
  res.json(competitions);
}
```

### In Services (Direct)

Inject the feature flag service into your service:

```javascript
class CompetitionService {
  constructor(competitionRepository, featureFlagService, logger) {
    this.competitionRepository = competitionRepository;
    this.featureFlagService = featureFlagService;
    this.logger = logger;
  }
  
  async getCompetitions(userId, role) {
    let competitions = await this.competitionRepository.findAll();
    
    // Check feature flag with context
    if (this.featureFlagService.isEnabled('new-scoring-algorithm', { userId, role })) {
      competitions = this.applyNewScoringAlgorithm(competitions);
    }
    
    return competitions;
  }
}
```

## API Reference

### FeatureFlagService

#### `isEnabled(flagName, context)`

Check if a feature is enabled for a user.

**Parameters:**
- `flagName` (string): Name of the feature flag
- `context` (object): Evaluation context
  - `userId` (string, optional): User ID
  - `role` (string, optional): User role
  - `user` (object, optional): Full user object

**Returns:** `boolean` - True if feature is enabled

**Example:**
```javascript
const isEnabled = featureFlagService.isEnabled('new-feature', {
  userId: 'user123',
  role: 'admin'
});
```

#### `getAllFlags()`

Get all feature flags.

**Returns:** `Array<Object>` - Array of flag configurations

#### `getFlag(flagName)`

Get specific flag configuration.

**Parameters:**
- `flagName` (string): Name of the feature flag

**Returns:** `Object|null` - Flag configuration or null

#### `updateFlag(flagName, config)`

Update a feature flag dynamically (without server restart).

**Parameters:**
- `flagName` (string): Name of the feature flag
- `config` (boolean|number|object): New flag configuration

**Example:**
```javascript
// Enable a flag
featureFlagService.updateFlag('new-feature', true);

// Update percentage
featureFlagService.updateFlag('beta-feature', 75);

// Update complex configuration
featureFlagService.updateFlag('admin-feature', {
  enabled: true,
  roles: ['admin', 'superadmin']
});
```

#### `removeFlag(flagName)`

Remove a feature flag.

**Parameters:**
- `flagName` (string): Name of the feature flag

**Returns:** `boolean` - True if flag was removed

#### `reload()`

Reload flags from configuration.

#### `hasFlag(flagName)`

Check if flag exists.

**Parameters:**
- `flagName` (string): Name of the feature flag

**Returns:** `boolean` - True if flag exists

## Evaluation Priority

Feature flags are evaluated in the following priority order (highest to lowest):

1. **Global Disabled**: If `enabled: false`, feature is disabled for everyone
2. **User Exclusion**: If user is in `excludeUsers`, feature is disabled
3. **Role Exclusion**: If user's role is in `excludeRoles`, feature is disabled
4. **User Inclusion**: If user is in `users`, feature is enabled
5. **Role Inclusion**: If user's role is in `roles`, feature is enabled
6. **Percentage Rollout**: If percentage-based, use consistent hashing
7. **Global Enabled**: If `enabled: true`, feature is enabled for everyone

## Percentage Rollout

Percentage-based rollouts use consistent hashing to ensure the same user always gets the same result. This is important for:

- **User Experience**: Users don't see features appearing and disappearing
- **Testing**: Easier to test and debug when behavior is consistent
- **Analytics**: More accurate metrics when user experience is stable

The hash is calculated based on `flagName:userId`, so:
- Same user + same flag = always same result
- Different users = distributed across percentage
- Different flags = independent distributions

## Best Practices

### 1. Use Descriptive Flag Names

```javascript
// Good
"enhanced-scoring-algorithm"
"mobile-app-integration"
"admin-bulk-export"

// Bad
"feature1"
"new-thing"
"test"
```

### 2. Start with Low Percentages

When rolling out new features, start with a small percentage and gradually increase:

```javascript
// Week 1: 5% rollout
"new-feature": 5

// Week 2: 25% rollout
"new-feature": 25

// Week 3: 50% rollout
"new-feature": 50

// Week 4: 100% rollout
"new-feature": 100
```

### 3. Use Role-Based Flags for Admin Features

```javascript
"admin-analytics": {
  "enabled": true,
  "roles": ["admin", "superadmin"]
}
```

### 4. Test with Specific Users First

```javascript
"experimental-feature": {
  "enabled": false,  // Disabled globally
  "users": ["tester1", "tester2", "developer1"]
}
```

### 5. Clean Up Old Flags

Remove feature flags once features are fully rolled out and stable:

```javascript
// After feature is stable and enabled for everyone
featureFlagService.removeFlag('old-feature-name');
```

### 6. Document Flag Purpose

Keep a registry of active flags and their purpose:

```javascript
// Feature Flags Registry
// 
// new-dashboard (boolean): New dashboard UI redesign
//   - Added: 2024-01-15
//   - Owner: Frontend Team
//   - Remove after: 2024-03-01
//
// beta-scoring (percentage): New scoring algorithm
//   - Added: 2024-02-01
//   - Owner: Backend Team
//   - Target: 100% by 2024-04-01
```

## Monitoring

All feature flag evaluations are logged at DEBUG level:

```javascript
{
  "level": "debug",
  "message": "Feature flag evaluated",
  "flag": "new-feature",
  "enabled": true,
  "reason": "user_enabled",
  "userId": "user123",
  "role": "admin"
}
```

Monitor these logs to:
- Track feature adoption
- Identify issues with specific flags
- Audit feature access
- Debug unexpected behavior

## Testing

### Unit Tests

```javascript
describe('Feature Flag Tests', () => {
  it('should enable feature for specific user', () => {
    const isEnabled = featureFlagService.isEnabled('vip-feature', {
      userId: 'vip-user'
    });
    expect(isEnabled).toBe(true);
  });
  
  it('should respect percentage rollout', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(
        featureFlagService.isEnabled('50-percent-feature', {
          userId: `user${i}`
        })
      );
    }
    const enabledCount = results.filter(r => r).length;
    expect(enabledCount).toBeGreaterThan(40);
    expect(enabledCount).toBeLessThan(60);
  });
});
```

### Integration Tests

```javascript
describe('Feature Flag Middleware', () => {
  it('should block access when feature disabled', async () => {
    const response = await request(app)
      .get('/api/disabled-feature')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(404);
  });
  
  it('should allow access when feature enabled', async () => {
    const response = await request(app)
      .get('/api/enabled-feature')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
  });
});
```

## Troubleshooting

### Feature not working for specific user

1. Check if flag exists: `featureFlagService.hasFlag('feature-name')`
2. Check flag configuration: `featureFlagService.getFlag('feature-name')`
3. Check evaluation logs for the user
4. Verify user ID and role are being passed correctly

### Percentage rollout not working as expected

1. Ensure userId is being passed to `isEnabled()`
2. Check that percentage is between 0-100
3. Test with multiple users to verify distribution
4. Remember: same user always gets same result (by design)

### Flag changes not taking effect

1. Check if flag was updated: `featureFlagService.getFlag('feature-name')`
2. Try reloading flags: `featureFlagService.reload()`
3. Verify configuration is correct
4. Check logs for errors during flag loading

## Requirements Satisfied

- **25.1**: Feature flag system for controlling feature availability ✓
- **25.2**: Boolean flags and percentage-based rollouts ✓
- **25.3**: User-specific and role-specific feature flags ✓
- **25.4**: Load feature flags from configuration ✓
- **25.5**: Middleware for checking feature flags before route execution ✓
- **25.6**: Service methods for checking feature flags in business logic ✓
- **25.7**: Log feature flag evaluations for audit ✓
- **25.8**: Dynamic flag updates without server restart ✓
