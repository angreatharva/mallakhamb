# Feature Flags - Quick Start Guide

Get started with feature flags in 5 minutes!

## Step 1: Configure Feature Flags

Add feature flags to your `.env` file:

```bash
FEATURES_FLAGS='{"new-dashboard":true,"beta-scoring":25}'
```

Or use the config manager directly (for development):

```javascript
// In your config
features: {
  flags: {
    'new-dashboard': true,
    'beta-scoring': 25,
    'admin-only-feature': {
      enabled: true,
      roles: ['admin', 'superadmin']
    }
  }
}
```

## Step 2: Protect a Route

```javascript
const { createFeatureFlagMiddleware } = require('../middleware');
const container = require('../infrastructure/di-container');

// Get the feature flag service from DI container
const featureFlagService = container.resolve('featureFlagService');
const requireFeatureFlag = createFeatureFlagMiddleware(featureFlagService);

// Use in your routes
router.get(
  '/api/new-dashboard',
  authMiddleware,                      // Authenticate first
  requireFeatureFlag('new-dashboard'), // Then check feature flag
  dashboardController.getNewDashboard  // Then handle request
);
```

## Step 3: Check Flags in Controllers (Optional)

If you need conditional logic based on flags:

```javascript
// In your app.js or server.js, add this middleware globally
const { attachFeatureFlagChecker } = require('./middleware');
app.use(attachFeatureFlagChecker(featureFlagService));

// Then in your controller
async function getCompetitions(req, res) {
  let competitions = await competitionService.getAll();
  
  // Check if enhanced filtering is enabled for this user
  if (req.isFeatureEnabled('enhanced-filtering')) {
    competitions = applyEnhancedFilters(competitions, req.query);
  }
  
  res.json(competitions);
}
```

## Step 4: Use in Services (Optional)

For business logic that needs feature flags:

```javascript
class CompetitionService {
  constructor(competitionRepository, featureFlagService, logger) {
    this.competitionRepository = competitionRepository;
    this.featureFlagService = featureFlagService;
    this.logger = logger;
  }
  
  async calculateScores(competitionId, userId, role) {
    const scores = await this.scoreRepository.findByCompetition(competitionId);
    
    // Use new algorithm if flag is enabled for this user
    if (this.featureFlagService.isEnabled('new-scoring-algorithm', { userId, role })) {
      return this.calculateWithNewAlgorithm(scores);
    }
    
    return this.calculateWithOldAlgorithm(scores);
  }
}

// Register in bootstrap.js
container.register('competitionService', (c) => new CompetitionService(
  c.resolve('competitionRepository'),
  c.resolve('featureFlagService'),  // Inject feature flag service
  c.resolve('logger')
), 'singleton');
```

## Common Patterns

### Pattern 1: Simple On/Off Switch

```javascript
// Config
"new-feature": true

// Usage
router.get('/new-feature', requireFeatureFlag('new-feature'), handler);
```

### Pattern 2: Gradual Rollout

```javascript
// Config - Start with 10%, increase weekly
"beta-feature": 10

// Usage (same as above)
router.get('/beta-feature', requireFeatureFlag('beta-feature'), handler);

// Update percentage in config as you gain confidence
// Week 1: 10%
// Week 2: 25%
// Week 3: 50%
// Week 4: 100%
```

### Pattern 3: Admin-Only Feature

```javascript
// Config
"admin-analytics": {
  "enabled": true,
  "roles": ["admin", "superadmin"]
}

// Usage
router.get('/admin/analytics', 
  authMiddleware,
  requireFeatureFlag('admin-analytics'),
  analyticsController.getReport
);
```

### Pattern 4: Beta Testing with Specific Users

```javascript
// Config
"experimental-ui": {
  "enabled": false,  // Disabled for everyone
  "users": ["beta-tester-1", "beta-tester-2", "developer-1"]
}

// Usage
router.get('/experimental-ui', requireFeatureFlag('experimental-ui'), handler);
```

### Pattern 5: Conditional Logic in Controller

```javascript
// Config
"enhanced-search": 50  // 50% of users

// Usage
async function search(req, res) {
  const query = req.query.q;
  
  let results;
  if (req.isFeatureEnabled('enhanced-search')) {
    results = await searchService.enhancedSearch(query);
  } else {
    results = await searchService.basicSearch(query);
  }
  
  res.json(results);
}
```

## Testing Your Flags

### Test with Specific User

```javascript
// In your test
const userId = 'test-user-123';
const role = 'player';

const isEnabled = featureFlagService.isEnabled('my-feature', { userId, role });
expect(isEnabled).toBe(true);
```

### Test Route Protection

```javascript
// In your integration test
const response = await request(app)
  .get('/api/disabled-feature')
  .set('Authorization', `Bearer ${token}`);

expect(response.status).toBe(404);  // Feature is disabled
```

## Updating Flags Dynamically

```javascript
// Update a flag without restarting the server
featureFlagService.updateFlag('my-feature', true);

// Update percentage
featureFlagService.updateFlag('beta-feature', 75);

// Update complex config
featureFlagService.updateFlag('admin-feature', {
  enabled: true,
  roles: ['admin', 'superadmin'],
  excludeUsers: ['suspended-admin']
});
```

## Monitoring

Check logs to see flag evaluations:

```bash
# In your logs
{
  "level": "debug",
  "message": "Feature flag evaluated",
  "flag": "new-feature",
  "enabled": true,
  "reason": "globally_enabled",
  "userId": "user123",
  "role": "player"
}
```

## Best Practices

1. **Use descriptive names**: `enhanced-scoring-algorithm` not `feature1`
2. **Start small**: Begin with 5-10% rollout, increase gradually
3. **Document flags**: Keep a registry of active flags and their purpose
4. **Clean up**: Remove flags once features are stable and at 100%
5. **Test thoroughly**: Test with flags on and off
6. **Monitor logs**: Watch for unexpected flag evaluations

## Troubleshooting

### Flag not working?

1. Check if flag exists: `featureFlagService.hasFlag('my-feature')`
2. Check flag config: `featureFlagService.getFlag('my-feature')`
3. Check logs for evaluation results
4. Verify user ID and role are being passed correctly

### Percentage not working as expected?

- Ensure userId is being passed to `isEnabled()`
- Remember: same user always gets same result (by design)
- Test with multiple different users

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [example-config.js](./example-config.js) for more configuration examples
- Review [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for technical details

## Need Help?

- Check the logs for feature flag evaluations
- Review the test files for usage examples
- Read the comprehensive README.md

Happy feature flagging! 🚀
