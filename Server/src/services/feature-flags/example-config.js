/**
 * Feature Flags Example Configuration
 * 
 * This file demonstrates various feature flag configurations.
 * Copy these examples to your environment configuration.
 */

module.exports = {
  // Simple boolean flags
  'new-dashboard': true,
  'legacy-api': false,
  
  // Percentage-based rollout (0-100)
  'beta-scoring-algorithm': 25,  // Enable for 25% of users
  'enhanced-analytics': 50,       // Enable for 50% of users
  'experimental-ui': 10,          // Enable for 10% of users
  
  // Role-specific flags
  'admin-bulk-export': {
    enabled: true,
    roles: ['admin', 'superadmin']
  },
  
  'judge-advanced-scoring': {
    enabled: true,
    roles: ['judge', 'admin']
  },
  
  'coach-team-analytics': {
    enabled: true,
    roles: ['coach', 'admin']
  },
  
  // User-specific flags (for beta testing)
  'vip-features': {
    enabled: false,  // Disabled globally
    users: ['user-id-1', 'user-id-2', 'user-id-3']
  },
  
  // Percentage rollout with user overrides
  'gradual-rollout-feature': {
    enabled: true,
    type: 'percentage',
    percentage: 30,  // 30% of users
    users: ['vip-user-1', 'vip-user-2'],  // Always enabled for these users
    excludeUsers: ['blocked-user-1']       // Never enabled for these users
  },
  
  // Complex configuration with exclusions
  'mobile-app-integration': {
    enabled: true,
    type: 'percentage',
    percentage: 50,
    roles: ['player', 'coach'],  // Always enabled for these roles
    excludeRoles: ['judge'],     // Never enabled for judges
    users: ['beta-tester-1'],    // Always enabled for beta testers
    excludeUsers: ['user-123']   // Explicitly excluded
  },
  
  // Feature with role restrictions
  'competition-management': {
    enabled: true,
    roles: ['admin', 'superadmin'],
    excludeUsers: ['suspended-admin-1']
  },
  
  // Gradual rollout plan (update percentage over time)
  'new-payment-flow': {
    enabled: true,
    type: 'percentage',
    percentage: 5,  // Week 1: 5%
    // Week 2: Update to 25%
    // Week 3: Update to 50%
    // Week 4: Update to 100%
    users: ['internal-tester-1', 'internal-tester-2']  // Always enabled for internal testers
  },
  
  // Feature flag for A/B testing
  'ab-test-new-ui': {
    enabled: true,
    type: 'percentage',
    percentage: 50  // 50% get new UI, 50% get old UI
  },
  
  // Emergency kill switch (can be disabled quickly)
  'problematic-feature': {
    enabled: false  // Disabled due to issues, can re-enable when fixed
  },
  
  // Feature with multiple conditions
  'advanced-reporting': {
    enabled: true,
    roles: ['admin', 'coach'],
    excludeUsers: ['demo-user-1', 'demo-user-2']  // Exclude demo accounts
  }
};

/**
 * Usage in .env file:
 * 
 * FEATURES_FLAGS={"new-dashboard":true,"beta-scoring":25,"admin-analytics":{"enabled":true,"roles":["admin","superadmin"]}}
 * 
 * Or in config-manager.js:
 * 
 * features: {
 *   flags: {
 *     'new-dashboard': true,
 *     'beta-scoring': 25,
 *     'admin-analytics': {
 *       enabled: true,
 *       roles: ['admin', 'superadmin']
 *     }
 *   }
 * }
 */

/**
 * Rollout Strategy Example:
 * 
 * Phase 1: Internal Testing (Week 1)
 * {
 *   enabled: false,
 *   users: ['dev-1', 'dev-2', 'qa-1', 'qa-2']
 * }
 * 
 * Phase 2: Beta Testing (Week 2)
 * {
 *   enabled: true,
 *   type: 'percentage',
 *   percentage: 5,
 *   users: ['dev-1', 'dev-2', 'qa-1', 'qa-2']
 * }
 * 
 * Phase 3: Gradual Rollout (Week 3-4)
 * {
 *   enabled: true,
 *   type: 'percentage',
 *   percentage: 25  // Increase weekly: 25% -> 50% -> 75%
 * }
 * 
 * Phase 4: Full Rollout (Week 5)
 * {
 *   enabled: true,
 *   type: 'percentage',
 *   percentage: 100
 * }
 * 
 * Phase 5: Cleanup (Week 6)
 * Remove flag from configuration and code
 */
