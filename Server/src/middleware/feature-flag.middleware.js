/**
 * Feature Flag Middleware
 * 
 * Checks feature flags before route execution and returns 404 if feature is disabled.
 * 
 * Requirements: 25.5
 */

const { NotFoundError } = require('../errors');

/**
 * Create feature flag middleware
 * @param {FeatureFlagService} featureFlagService - Feature flag service instance
 * @returns {Function} Express middleware factory
 */
function createFeatureFlagMiddleware(featureFlagService) {
  /**
   * Middleware factory that creates a feature flag checker for a specific flag
   * @param {string} flagName - Name of the feature flag to check
   * @returns {Function} Express middleware
   */
  return function requireFeatureFlag(flagName) {
    return (req, res, next) => {
      try {
        // Build evaluation context from request
        const context = {
          userId: req.user?._id?.toString() || req.user?.id,
          role: req.user?.role,
          user: req.user
        };

        // Check if feature is enabled
        const isEnabled = featureFlagService.isEnabled(flagName, context);

        if (!isEnabled) {
          // Return 404 to hide the existence of disabled features
          throw new NotFoundError('Resource');
        }

        // Feature is enabled, continue to route handler
        next();
      } catch (error) {
        next(error);
      }
    };
  };
}

/**
 * Middleware to attach feature flag checker to request object
 * Allows controllers to check flags programmatically
 * @param {FeatureFlagService} featureFlagService - Feature flag service instance
 * @returns {Function} Express middleware
 */
function attachFeatureFlagChecker(featureFlagService) {
  return (req, res, next) => {
    // Attach helper method to request object
    req.isFeatureEnabled = (flagName) => {
      const context = {
        userId: req.user?._id?.toString() || req.user?.id,
        role: req.user?.role,
        user: req.user
      };
      return featureFlagService.isEnabled(flagName, context);
    };

    next();
  };
}

module.exports = {
  createFeatureFlagMiddleware,
  attachFeatureFlagChecker
};
