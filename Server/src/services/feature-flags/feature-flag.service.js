/**
 * Feature Flag Service
 * 
 * Controls feature availability with support for boolean flags, percentage-based rollouts,
 * user-specific flags, and role-specific flags.
 * 
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.7
 */

class FeatureFlagService {
  /**
   * Create a feature flag service
   * @param {Object} config - Configuration manager
   * @param {Logger} logger - Logger instance
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.flags = new Map();
    this.loadFlags();
  }

  /**
   * Load feature flags from configuration
   * @private
   */
  loadFlags() {
    try {
      const flagsConfig = this.config.get('features.flags') || {};
      
      // Convert config object to Map for efficient lookups
      Object.entries(flagsConfig).forEach(([name, config]) => {
        this.flags.set(name, this.normalizeFlag(name, config));
      });

      this.logger.info('Feature flags loaded', { 
        count: this.flags.size,
        flags: Array.from(this.flags.keys())
      });
    } catch (error) {
      this.logger.error('Failed to load feature flags', { error });
      // Continue with empty flags rather than crashing
    }
  }

  /**
   * Normalize flag configuration to standard format
   * @param {string} name - Flag name
   * @param {*} config - Flag configuration (boolean, object, or number)
   * @returns {Object} Normalized flag configuration
   * @private
   */
  normalizeFlag(name, config) {
    // Handle simple boolean flags
    if (typeof config === 'boolean') {
      return {
        name,
        enabled: config,
        type: 'boolean'
      };
    }

    // Handle percentage-based rollout (number between 0-100)
    if (typeof config === 'number') {
      return {
        name,
        enabled: true,
        type: 'percentage',
        percentage: Math.max(0, Math.min(100, config))
      };
    }

    // Handle complex flag configuration
    if (typeof config === 'object' && config !== null) {
      return {
        name,
        enabled: config.enabled !== false,
        type: config.type || 'boolean',
        percentage: config.percentage,
        users: config.users ? new Set(config.users) : null,
        roles: config.roles ? new Set(config.roles) : null,
        excludeUsers: config.excludeUsers ? new Set(config.excludeUsers) : null,
        excludeRoles: config.excludeRoles ? new Set(config.excludeRoles) : null
      };
    }

    // Default to disabled
    return {
      name,
      enabled: false,
      type: 'boolean'
    };
  }

  /**
   * Check if a feature is enabled for a user
   * @param {string} flagName - Feature flag name
   * @param {Object} context - Evaluation context
   * @param {string} context.userId - User ID (optional)
   * @param {string} context.role - User role (optional)
   * @param {Object} context.user - Full user object (optional)
   * @returns {boolean} True if feature is enabled
   */
  isEnabled(flagName, context = {}) {
    const flag = this.flags.get(flagName);

    // If flag doesn't exist, default to disabled
    if (!flag) {
      this.logEvaluation(flagName, false, 'flag_not_found', context);
      return false;
    }

    // If flag is globally disabled, return false
    if (!flag.enabled) {
      this.logEvaluation(flagName, false, 'globally_disabled', context);
      return false;
    }

    const userId = context.userId || context.user?._id?.toString();
    const role = context.role || context.user?.role;

    // Check user exclusions first (highest priority)
    if (flag.excludeUsers && userId && flag.excludeUsers.has(userId)) {
      this.logEvaluation(flagName, false, 'user_excluded', context);
      return false;
    }

    // Check role exclusions
    if (flag.excludeRoles && role && flag.excludeRoles.has(role)) {
      this.logEvaluation(flagName, false, 'role_excluded', context);
      return false;
    }

    // Check user-specific enablement (overrides percentage)
    if (flag.users && userId && flag.users.has(userId)) {
      this.logEvaluation(flagName, true, 'user_enabled', context);
      return true;
    }

    // Check role-specific enablement (overrides percentage)
    if (flag.roles && role && flag.roles.has(role)) {
      this.logEvaluation(flagName, true, 'role_enabled', context);
      return true;
    }

    // Handle percentage-based rollout
    if (flag.type === 'percentage' && flag.percentage !== undefined) {
      const enabled = this.evaluatePercentage(flagName, userId, flag.percentage);
      this.logEvaluation(flagName, enabled, 'percentage_rollout', context);
      return enabled;
    }

    // Default boolean flag
    this.logEvaluation(flagName, true, 'globally_enabled', context);
    return true;
  }

  /**
   * Evaluate percentage-based rollout
   * Uses consistent hashing to ensure same user always gets same result
   * @param {string} flagName - Flag name
   * @param {string} userId - User ID
   * @param {number} percentage - Percentage (0-100)
   * @returns {boolean} True if user is in rollout percentage
   * @private
   */
  evaluatePercentage(flagName, userId, percentage) {
    // If no userId, use random evaluation (not recommended for production)
    if (!userId) {
      return Math.random() * 100 < percentage;
    }

    // Use consistent hashing based on flagName + userId
    const hash = this.hashString(`${flagName}:${userId}`);
    const bucket = hash % 100;
    return bucket < percentage;
  }

  /**
   * Simple string hash function for consistent percentage evaluation
   * @param {string} str - String to hash
   * @returns {number} Hash value
   * @private
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Log feature flag evaluation for audit
   * @param {string} flagName - Flag name
   * @param {boolean} result - Evaluation result
   * @param {string} reason - Reason for result
   * @param {Object} context - Evaluation context
   * @private
   */
  logEvaluation(flagName, result, reason, context) {
    this.logger.debug('Feature flag evaluated', {
      flag: flagName,
      enabled: result,
      reason,
      userId: context.userId || context.user?._id?.toString(),
      role: context.role || context.user?.role
    });
  }

  /**
   * Get all feature flags
   * @returns {Array<Object>} Array of flag configurations
   */
  getAllFlags() {
    return Array.from(this.flags.values()).map(flag => ({
      name: flag.name,
      enabled: flag.enabled,
      type: flag.type,
      percentage: flag.percentage,
      hasUserList: flag.users ? flag.users.size > 0 : false,
      hasRoleList: flag.roles ? flag.roles.size > 0 : false
    }));
  }

  /**
   * Get specific flag configuration
   * @param {string} flagName - Flag name
   * @returns {Object|null} Flag configuration or null
   */
  getFlag(flagName) {
    const flag = this.flags.get(flagName);
    if (!flag) return null;

    return {
      name: flag.name,
      enabled: flag.enabled,
      type: flag.type,
      percentage: flag.percentage,
      users: flag.users ? Array.from(flag.users) : [],
      roles: flag.roles ? Array.from(flag.roles) : [],
      excludeUsers: flag.excludeUsers ? Array.from(flag.excludeUsers) : [],
      excludeRoles: flag.excludeRoles ? Array.from(flag.excludeRoles) : []
    };
  }

  /**
   * Update a feature flag dynamically (without server restart)
   * Requirements: 25.8
   * @param {string} flagName - Flag name
   * @param {*} config - New flag configuration
   */
  updateFlag(flagName, config) {
    const normalizedFlag = this.normalizeFlag(flagName, config);
    this.flags.set(flagName, normalizedFlag);

    this.logger.info('Feature flag updated', {
      flag: flagName,
      config: normalizedFlag
    });
  }

  /**
   * Remove a feature flag
   * @param {string} flagName - Flag name
   * @returns {boolean} True if flag was removed
   */
  removeFlag(flagName) {
    const existed = this.flags.has(flagName);
    this.flags.delete(flagName);

    if (existed) {
      this.logger.info('Feature flag removed', { flag: flagName });
    }

    return existed;
  }

  /**
   * Reload flags from configuration
   * Useful for dynamic updates without restart
   */
  reload() {
    this.flags.clear();
    this.loadFlags();
    this.logger.info('Feature flags reloaded');
  }

  /**
   * Check if flag exists
   * @param {string} flagName - Flag name
   * @returns {boolean} True if flag exists
   */
  hasFlag(flagName) {
    return this.flags.has(flagName);
  }
}

module.exports = FeatureFlagService;
